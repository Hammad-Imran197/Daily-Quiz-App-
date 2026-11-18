// Quiz generation (Gemini free tier if key present, else built-in bank),
// attempt grading, and the daily reminder scheduler.
const store = require('./store');
const { dailyQuestions, fieldMeta } = require('./question-bank');
const push = require('./push');
const { getUsers, saveUsers } = require('./auth');

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hhmm(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sanitizeQuestions(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list) {
    if (!item || typeof item.q !== 'string' || !Array.isArray(item.o) || item.o.length !== 4) continue;
    const c = Number(item.c);
    if (!Number.isInteger(c) || c < 0 || c > 3) continue;
    const e = typeof item.e === 'string' && item.e.trim() ? item.e.trim() : 'Review this topic in your course materials.';
    const o = item.o.map((x) => String(x).slice(0, 200));
    out.push({ q: String(item.q).slice(0, 500), o, c, e: e.slice(0, 700) });
    if (out.length >= 10) break;
  }
  return out.length >= 5 ? out : null;
}

async function generateWithAI(fieldId, dateStr) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const meta = fieldMeta(fieldId);
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const prompt =
    `You are a quiz writer. Create exactly 7 multiple-choice questions about "${meta.label}" ` +
    `(${meta.blurb}) for a learner who wants to study a little every day. Mix difficulty: some easy recall, some applied reasoning. ` +
    `Today is ${dateStr}. Avoid repeating obvious facts; make distractors plausible. ` +
    `Return ONLY a JSON array of 7 objects, each: {"q":"question","o":["A","B","C","D"],"c":0-3,"e":"a clear 1-3 sentence explanation of why the correct answer is right (and why the common wrong answer is wrong, when useful)"}. ` +
    `No markdown, no commentary.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.95, responseMimeType: 'application/json' }
        }),
        signal: controller.signal
      }
    );
    if (!res.ok) {
      console.error(`[quiz] AI request failed: ${res.status}`);
      return null;
    }
    const json = await res.json();
    const text = json && json.candidates && json.candidates[0] && json.candidates[0].content
      ? json.candidates[0].content.parts.map((p) => p.text || '').join('')
      : '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return sanitizeQuestions(parsed);
  } catch (err) {
    console.error('[quiz] AI generation error:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const inflight = new Map();

// Returns { source, generatedAt, questions } for a field on a date (generates once)
async function ensureQuiz(dateStr, fieldId) {
  const key = `${dateStr}|${fieldId}`;
  if (inflight.has(key)) return inflight.get(key);
  const work = (async () => {
    const data = store.loadQuizDate(dateStr);
    if (data.quizzes && data.quizzes[fieldId]) return data.quizzes[fieldId];

    let source = 'bank';
    let questions = null;
    try {
      questions = await generateWithAI(fieldId, dateStr);
      if (questions) source = 'ai';
    } catch (err) {
      console.error('[quiz] AI path failed:', err.message);
    }
    if (!questions) questions = dailyQuestions(fieldId, dateStr);

    const entry = { source, generatedAt: new Date().toISOString(), questions };
    data.quizzes = data.quizzes || {};
    data.quizzes[fieldId] = entry;
    data.generatedAt = data.generatedAt || entry.generatedAt;
    store.saveQuizDate(dateStr, data);
    console.log(`[quiz] generated ${questions.length} ${source} questions for ${fieldId} (${dateStr})`);
    return entry;
  })().finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

function getAttempt(userId, dateStr, fieldId) {
  const attempts = store.load('attempts', {});
  return attempts[`${userId}|${dateStr}|${fieldId}`] || null;
}

function saveAttempt(userId, dateStr, fieldId, attempt) {
  const attempts = store.load('attempts', {});
  attempts[`${userId}|${dateStr}|${fieldId}`] = attempt;
  // prune attempts older than 60 days
  const cutoff = new Date(Date.now() - 60 * 86400000);
  for (const k of Object.keys(attempts)) {
    const d = k.split('|')[1];
    if (d && new Date(d) < cutoff) delete attempts[k];
  }
  store.save('attempts', attempts);
}

// Quiz WITHOUT answers, for the client.
// If the user already attempted today, include full graded results (with explanations).
async function getTodayQuiz(user) {
  const date = todayStr();
  const entry = await ensureQuiz(date, user.field);
  const attempt = getAttempt(user.id, date, user.field);
  let results = null;
  if (attempt && Array.isArray(attempt.answers) && attempt.answers.length === entry.questions.length) {
    const graded = entry.questions.map((q, i) => ({
      q: q.q,
      o: q.o,
      your: attempt.answers[i],
      correct: q.c,
      ok: attempt.answers[i] === q.c,
      e: q.e
    }));
    // Same shape as the submit response so the review screen renders identically after a reload
    results = { date, score: attempt.score, total: attempt.total, source: entry.source, results: graded };
  }
  return {
    date,
    field: user.field,
    label: fieldMeta(user.field).label,
    emoji: fieldMeta(user.field).emoji,
    source: entry.source,
    generatedAt: entry.generatedAt,
    questions: entry.questions.map((q) => ({ q: q.q, o: q.o })),
    attempt: attempt ? { answers: attempt.answers, score: attempt.score, total: attempt.total } : null,
    results
  };
}

// Grade a submission, store it, and return full results with explanations
async function submitQuiz(user, answers) {
  const date = todayStr();
  const entry = await ensureQuiz(date, user.field);
  if (!Array.isArray(answers) || answers.length !== entry.questions.length) {
    const err = new Error('Please answer every question');
    err.status = 400;
    throw err;
  }
  const clean = answers.map((a) => Number(a));
  if (clean.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) {
    const err = new Error('Invalid answer values');
    err.status = 400;
    throw err;
  }

  let score = 0;
  const results = entry.questions.map((q, i) => {
    const ok = clean[i] === q.c;
    if (ok) score += 1;
    return { q: q.q, o: q.o, your: clean[i], correct: q.c, ok, e: q.e };
  });

  saveAttempt(user.id, date, user.field, { field: user.field, answers: clean, score, total: results.length, at: new Date().toISOString() });
  return { date, score, total: results.length, source: entry.source, results };
}

// ---- Daily reminder scheduler ----
let timer = null;

async function tick() {
  const now = new Date();
  const date = todayStr(now);
  const time = hhmm(now);
  const users = getUsers();
  let dirty = false;

  for (const user of users) {
    if (!user.notificationsOn) continue;
    if (!Array.isArray(user.push) || !user.push.length) continue;
    if (user.lastNotified === date) continue;
    const notifyTime = user.notifyTime || '08:00';
    if (time < notifyTime) continue; // not yet today

    try {
      const meta = fieldMeta(user.field);
      const entry = await ensureQuiz(date, user.field);
      await push.sendToUser(user, {
        title: `${meta.emoji} Your daily ${meta.label} quiz is ready!`,
        body: `${entry.questions.length} fresh questions with full explanations — tap to start learning.`,
        url: '/#quiz',
        tag: `quiz-${date}`
      });
      user.lastNotified = date;
      dirty = true;
      console.log(`[scheduler] notified ${user.email} about ${user.field} quiz`);
    } catch (err) {
      console.error('[scheduler] failed for', user.email, err.message);
    }
  }
  if (dirty) saveUsers(users);
}

function startScheduler() {
  if (timer) return;
  tick(); // catch up on startup
  timer = setInterval(tick, 30000);
}

module.exports = { todayStr, ensureQuiz, getTodayQuiz, submitQuiz, startScheduler, getAttempt };
