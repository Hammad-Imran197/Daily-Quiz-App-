'use strict';
/* Daily Quiz — frontend SPA */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  user: null,
  fields: [],
  mode: 'login',
  authField: null,
  view: 'home',
  quiz: null,
  courses: null,
  jobs: null,
  startups: null,
  oppTab: 'jobs'
};

const VIEW_META = {
  home: { title: 'Daily Quiz', emoji: '🧠' },
  quiz: { title: 'Today’s Quiz', emoji: '📝' },
  learn: { title: 'Learn', emoji: '📚' },
  opps: { title: 'Jobs & Startups', emoji: '💼' },
  settings: { title: 'Settings', emoji: '⚙️' }
};

/* ---------- helpers ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let toastTimer = null;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = isErr ? 'err' : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function fieldMeta(id) {
  return state.fields.find((f) => f.id === id) || state.fields[0] || { id, label: id, emoji: '🧠', blurb: '' };
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- auth ---------- */
function renderAuthFields() {
  const wrap = $('#auth-field-chips');
  wrap.innerHTML = state.fields.map((f) =>
    `<button type="button" class="chip${state.authField === f.id ? ' active' : ''}" data-field="${esc(f.id)}">${f.emoji} ${esc(f.label)}</button>`
  ).join('');
  $$('#auth-field-chips .chip').forEach((b) => b.addEventListener('click', () => {
    state.authField = b.dataset.field;
    renderAuthFields();
  }));
}

function setMode(mode) {
  state.mode = mode;
  $('#tab-login').classList.toggle('active', mode === 'login');
  $('#tab-register').classList.toggle('active', mode === 'register');
  $('#auth-name').hidden = mode !== 'register';
  $('#auth-field-wrap').hidden = mode !== 'register';
  $('#auth-submit').textContent = mode === 'login' ? 'Log in' : 'Create account';
  $('#auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#auth-error').hidden = true;
}

function showAuth() {
  $('#auth-screen').hidden = false;
  $('#main-screen').hidden = true;
  renderAuthFields();
}

$('#tab-login').addEventListener('click', () => setMode('login'));
$('#tab-register').addEventListener('click', () => setMode('register'));

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#auth-error');
  errEl.hidden = true;
  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    const payload = {
      email: $('#auth-email').value.trim(),
      password: $('#auth-password').value
    };
    if (state.mode === 'register') {
      payload.name = $('#auth-name').value.trim();
      payload.field = state.authField || (state.fields[0] && state.fields[0].id);
    }
    const res = await api(`/api/auth/${state.mode}`, { method: 'POST', body: payload });
    state.user = res.user;
    clearCaches();
    showMain();
    toast(state.mode === 'register' ? `Welcome, ${state.user.name}! 🎉` : `Welcome back, ${state.user.name}!`);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

function clearCaches() {
  state.quiz = null;
  state.courses = null;
  state.jobs = null;
  state.startups = null;
}

/* ---------- navigation ---------- */
function showMain() {
  $('#auth-screen').hidden = true;
  $('#main-screen').hidden = false;
  $('#topbar-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const hash = (location.hash || '#home').slice(1);
  setView(VIEW_META[hash] ? hash : 'home');
}

function setView(view) {
  if (!VIEW_META[view]) view = 'home';
  state.view = view;
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#topbar-title').textContent = VIEW_META[view].title;
  $('#topbar-emoji').textContent = VIEW_META[view].emoji;
  if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0 });
  onEnter(view);
}

$$('.nav-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
window.addEventListener('hashchange', () => {
  const v = (location.hash || '#home').slice(1);
  if (VIEW_META[v] && v !== state.view) setView(v);
});

function onEnter(view) {
  if (view === 'home') renderHome();
  else if (view === 'quiz') loadQuiz(true);
  else if (view === 'learn') loadCourses();
  else if (view === 'opps') renderOpps();
  else if (view === 'settings') renderSettings();
}

/* ---------- home ---------- */
async function renderHome() {
  const u = state.user;
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('#home-greeting').textContent = `${part}, ${u.name} 👋`;
  $('#home-sub').textContent = 'A little practice every day goes a long way.';

  // field chips
  $('#home-fields').innerHTML = state.fields.map((f) =>
    `<button type="button" class="chip${u.field === f.id ? ' active' : ''}" data-field="${esc(f.id)}">${f.emoji} ${esc(f.label)}</button>`
  ).join('');
  $$('#home-fields .chip').forEach((b) => b.addEventListener('click', () => switchField(b.dataset.field)));

  renderReminderCard();

  // hero: today's quiz status
  const hero = $('#home-hero');
  try {
    const quiz = await getQuiz();
    if (state.view !== 'home') return;
    const f = fieldMeta(quiz.field);
    const attempted = !!(quiz.results || quiz.attempt);
    const score = quiz.results ? `${quiz.results.score}/${quiz.results.total}` : quiz.attempt ? `${quiz.attempt.score}/${quiz.attempt.total}` : null;
    hero.innerHTML = `
      <div class="hero-top">
        <span class="hero-emoji">${f.emoji}</span>
        <div>
          <div class="hero-field">Today’s ${esc(quiz.label)} quiz</div>
          <div class="hero-meta">${quiz.questions.length} questions · fresh every day</div>
        </div>
      </div>
      <span class="badge${attempted ? '' : ' pending'}">${attempted ? '✅ Completed today' : '🔔 Quiz ready'}</span>
      ${score ? `<div class="score-pill">Your score: ${esc(score)}</div>` : `<div class="hero-status muted">Answers come with full explanations so you learn as you go.</div>`}
      <button class="btn primary block" id="hero-cta" type="button">${attempted ? 'Review explanations' : 'Start quiz →'}</button>`;
    $('#hero-cta').addEventListener('click', () => setView('quiz'));
  } catch (err) {
    hero.innerHTML = `<div class="empty"><span class="big">😅</span>Couldn’t load today’s quiz.<br /><button class="btn ghost small" style="margin-top:10px" id="hero-retry">Retry</button></div>`;
    const retry = $('#hero-retry');
    if (retry) retry.addEventListener('click', renderHome);
  }
}

function renderReminderCard() {
  const el = $('#home-reminder');
  const u = state.user;
  const on = u.notificationsOn && u.hasPush;
  if (on) {
    el.hidden = false;
    el.innerHTML = `<span class="r-ico">🔔</span><div class="r-text"><b>Daily reminder at ${esc(u.notifyTime)}</b><span class="muted tiny">We’ll ping you when the quiz is generated.</span></div><button class="btn ghost small" id="rem-edit" type="button">Change</button>`;
    $('#rem-edit').addEventListener('click', () => setView('settings'));
  } else {
    el.hidden = false;
    el.innerHTML = `<span class="r-ico">🔔</span><div class="r-text"><b>Never miss a quiz</b><span class="muted tiny">Get a push notification every day.</span></div><button class="btn primary small" id="rem-enable" type="button">Enable</button>`;
    $('#rem-enable').addEventListener('click', enablePush);
  }
}

async function switchField(fieldId) {
  if (fieldId === state.user.field) return;
  try {
    const res = await api('/api/profile', { method: 'PATCH', body: { field: fieldId } });
    state.user = res.user;
    clearCaches();
    toast(`Switched to ${fieldMeta(fieldId).label} ${fieldMeta(fieldId).emoji}`);
    renderHome();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------- quiz ---------- */
// Defensive: if `results` ever arrives as a bare array (legacy/cached response),
// wrap it into the object shape renderResultsHTML expects, so marks + summary always load.
function normalizeQuiz(q) {
  if (q && Array.isArray(q.results)) {
    const graded = q.results;
    q.results = {
      date: q.date,
      score: q.attempt ? q.attempt.score : graded.filter((r) => r.ok).length,
      total: (q.attempt && q.attempt.total) || graded.length,
      source: q.source,
      results: graded
    };
  }
  return q;
}

async function getQuiz(force) {
  if (!state.quiz || force) state.quiz = normalizeQuiz(await api('/api/quiz/today'));
  return state.quiz;
}

async function loadQuiz(force) {
  const box = $('#quiz-container');
  if (!state.quiz || force || state.quiz.date !== todayLocal()) {
    box.innerHTML = '<div class="skeleton sk-lg"></div><div class="skeleton"></div>';
    try {
      state.quiz = normalizeQuiz(await api('/api/quiz/today'));
    } catch (err) {
      box.innerHTML = `<div class="empty"><span class="big">😅</span>${esc(err.message)}</div>`;
      return;
    }
  }
  if (state.view !== 'quiz') return;
  renderQuiz();
}

function renderQuiz() {
  const quiz = state.quiz;
  const box = $('#quiz-container');
  const src = quiz.source === 'ai'
    ? '<span class="src-badge">✨ AI-generated</span>'
    : '<span class="src-badge bank">📘 Question bank</span>';
  const head = `
    <div class="quiz-head">
      <span class="q-date">${esc(quiz.label)} · ${new Date(quiz.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      ${src}
    </div>`;

  if (quiz.results) {
    box.innerHTML = head + renderResultsHTML(quiz.results);
    return;
  }

  box.innerHTML = head + `
    <form id="quiz-form">
      ${quiz.questions.map((q, i) => `
        <div class="q-card">
          <div class="q-num">QUESTION ${i + 1} / ${quiz.questions.length}</div>
          <div class="q-text">${esc(q.q)}</div>
          <div class="opts">
            ${q.o.map((opt, j) => `
              <label class="opt">
                <input type="radio" name="q${i}" value="${j}" />
                <span>${esc(opt)}</span>
              </label>`).join('')}
          </div>
        </div>`).join('')}
      <button class="btn primary block" type="submit">Submit answers ✓</button>
    </form>`;

  $$('#quiz-form .opt').forEach((label) => {
    label.addEventListener('change', () => {
      const name = label.querySelector('input').name;
      $$(`#quiz-form input[name="${name}"]`).forEach((inp) => {
        inp.closest('.opt').classList.toggle('selected', inp.checked);
      });
    });
  });

  $('#quiz-form').addEventListener('submit', submitQuiz);
}

async function submitQuiz(e) {
  e.preventDefault();
  const quiz = state.quiz;
  const answers = quiz.questions.map((_, i) => {
    const checked = $(`#quiz-form input[name="q${i}"]:checked`);
    return checked ? Number(checked.value) : -1;
  });
  if (answers.some((a) => a < 0)) {
    toast('Please answer every question first', true);
    const firstUnanswered = answers.findIndex((a) => a < 0);
    const card = $$('#quiz-form .q-card')[firstUnanswered];
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const btn = $('#quiz-form button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Grading…';
  try {
    const res = await api('/api/quiz/submit', { method: 'POST', body: { answers } });
    state.quiz.results = res;
    renderQuiz();
    $('#quiz-container').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
    btn.textContent = 'Submit answers ✓';
  }
}

function renderResultsHTML(res) {
  const pct = Math.round((res.score / res.total) * 100);
  const msg = pct === 100 ? 'Perfect! 🎉' : pct >= 70 ? 'Great work! 💪' : pct >= 40 ? 'Getting there — read the explanations 👇' : 'Keep going — explanations will help 📈';
  return `
    <div class="card score-box">
      <div class="score-ring" style="--pct:${pct}" data-label="${res.score}/${res.total}"></div>
      <div class="score-msg">
        <h3>${msg}</h3>
        <p class="muted tiny">${pct}% correct · explanations below for every question</p>
      </div>
    </div>
    ${res.results.map((r, i) => `
      <div class="q-card res-q">
        <div class="q-num">QUESTION ${i + 1} ${r.ok ? '✅' : '❌'}</div>
        <div class="q-text">${esc(r.q)}</div>
        ${r.o.map((opt, j) => {
          const isCorrect = j === r.correct;
          const isYours = j === r.your;
          const cls = isCorrect ? 'correct' : isYours ? 'wrong' : '';
          const mark = isCorrect ? '✓' : isYours ? '✗' : '·';
          const tag = isCorrect ? '<span class="tag">CORRECT ANSWER</span>' : isYours ? '<span class="tag">YOUR ANSWER</span>' : '';
          return `<div class="res-opt ${cls}"><span class="mark">${mark}</span><span>${esc(opt)}</span>${tag}</div>`;
        }).join('')}
        <div class="explain"><b>💡 Explanation:</b> ${esc(r.e)}</div>
      </div>`).join('')}
    <button class="btn ghost block" id="btn-back-home" type="button">← Back to home</button>`;
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'btn-back-home') setView('home');
});

/* ---------- learn ---------- */
async function loadCourses() {
  const list = $('#courses-list');
  if (!state.courses) {
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    try {
      state.courses = await api('/api/courses');
    } catch (err) {
      list.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      return;
    }
  }
  if (state.view !== 'learn') return;
  const c = state.courses;
  $('#learn-title').textContent = `${fieldMeta(c.field).emoji} Free ${fieldMeta(c.field).label} courses`;
  $('#learn-sub').textContent = 'Completely free or audit-free resources — start anywhere.';
  list.innerHTML = c.courses.length ? c.courses.map((course) => `
    <a class="item-card" href="${esc(course.url)}" target="_blank" rel="noopener noreferrer">
      <div class="item-title">${esc(course.title)}</div>
      <div class="item-sub">${esc(course.provider)}</div>
      <div class="item-tags">
        <span class="tag-pill">📶 ${esc(course.level)}</span>
        <span class="tag-pill">⏱ ${esc(course.hours)}</span>
        <span class="tag-pill near">FREE</span>
      </div>
      <span class="go">Open course</span>
    </a>`).join('') : '<div class="empty">No courses listed yet.</div>';
}

/* ---------- opportunities ---------- */
function renderOpps() {
  $('#opp-location').value = state.user.location || '';
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.oppTab));
  $('#opp-jobs').hidden = state.oppTab !== 'jobs';
  $('#opp-startups').hidden = state.oppTab !== 'startups';
  if (state.oppTab === 'jobs') loadJobs();
  else loadStartups();
}

$$('.tab').forEach((t) => t.addEventListener('click', () => {
  state.oppTab = t.dataset.tab;
  renderOpps();
}));

let locTimer = null;
$('#opp-location').addEventListener('input', () => {
  clearTimeout(locTimer);
  locTimer = setTimeout(saveLocation, 900);
});

async function saveLocation() {
  const loc = $('#opp-location').value.trim();
  if (loc === (state.user.location || '')) return;
  try {
    const res = await api('/api/profile', { method: 'PATCH', body: { location: loc } });
    state.user = res.user;
    state.jobs = null;
    state.startups = null;
    if (state.oppTab === 'jobs') loadJobs();
    else loadStartups();
  } catch (err) {
    toast(err.message, true);
  }
}

$('#btn-geo').addEventListener('click', () => {
  const status = $('#geo-status');
  status.hidden = false;
  if (!navigator.geolocation) {
    status.textContent = 'Geolocation is not available in this browser.';
    return;
  }
  status.textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const res = await api(`/api/geocode?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
      if (res.city) {
        const full = res.city + (res.country ? `, ${res.country}` : '');
        $('#opp-location').value = full;
        await saveLocation();
        status.textContent = `Location set to ${full} ✓`;
      } else {
        status.textContent = 'Could not determine your city — please type it manually.';
      }
    } catch (err) {
      status.textContent = 'Could not determine your city — please type it manually.';
    }
  }, () => {
    status.textContent = 'Location permission denied — please type your city manually.';
  }, { timeout: 12000, maximumAge: 600000 });
});

async function loadJobs() {
  const list = $('#jobs-list');
  if (!state.jobs) {
    list.innerHTML = '<div class="skeleton sk-lg"></div><div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const loc = $('#opp-location').value.trim() || state.user.location || '';
      state.jobs = await api(`/api/jobs?location=${encodeURIComponent(loc)}`);
    } catch (err) {
      list.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      return;
    }
  }
  if (state.view !== 'opps' || state.oppTab !== 'jobs') return;
  const j = state.jobs;
  const loc = j.location || '';
  const card = (job) => `
    <a class="item-card" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">
      <div class="item-title">${esc(job.title)}</div>
      <div class="item-sub">${esc(job.company)}${job.location ? ' · ' + esc(job.location) : ''}</div>
      <div class="item-tags">
        ${job.nearHits ? '<span class="tag-pill near">📍 Near you</span>' : ''}
        ${job.remote && !job.nearHits ? '<span class="tag-pill remote">🌍 Remote</span>' : ''}
        <span class="tag-pill">${esc(job.source)}</span>
      </div>
      <span class="go">View &amp; apply</span>
    </a>`;
  const parts = [];
  if (loc) {
    parts.push(`<div class="section-head"><h3>📍 Near ${esc(loc)}</h3></div>`);
    parts.push(j.near && j.near.length
      ? j.near.map(card).join('')
      : `<div class="empty"><span class="big">🗺️</span>No live ${esc(fieldMeta(j.field).label)} jobs listed for ${esc(loc)} right now.<br />The direct searches below always cover your area.</div>`);
  }
  parts.push(`<div class="section-head"><h3>${loc ? '🌍 Remote &amp; worldwide' : '🌍 Latest matches'}</h3></div>`);
  parts.push(j.global && j.global.length
    ? j.global.map(card).join('')
    : `<div class="empty"><span class="big">🔍</span>No matches in the live feeds — use the direct searches below.</div>`);
  list.innerHTML = parts.join('');
  $('#job-links').innerHTML = `<div class="link-row">${(j.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</div>`;
}

async function loadStartups() {
  const list = $('#startups-list');
  if (!state.startups) {
    list.innerHTML = '<div class="skeleton sk-lg"></div><div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const loc = $('#opp-location').value.trim() || state.user.location || '';
      state.startups = await api(`/api/startups?location=${encodeURIComponent(loc)}`);
    } catch (err) {
      list.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      return;
    }
  }
  if (state.view !== 'opps' || state.oppTab !== 'startups') return;
  const s = state.startups;
  const parts = [];
  if (s.thread) {
    parts.push(`
      <a class="item-card" href="${esc(s.thread.url)}" target="_blank" rel="noopener noreferrer">
        <div class="item-title">📣 ${esc(s.thread.title)}</div>
        <div class="item-sub">Monthly HN thread — hundreds of startups hiring</div>
        <span class="go">Open thread</span>
      </a>`);
  }
  const commentCard = (c) => `
    <a class="item-card" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">
      <div class="item-title">@${esc(c.author)}${c.near ? ' <span class="tag-pill near">📍 NEAR YOU</span>' : ''}</div>
      <div class="item-sub" style="margin-top:6px">${esc(c.text)}</div>
      <span class="go">Read on Hacker News</span>
    </a>`;
  const nearOnes = (s.comments || []).filter((c) => c.near);
  const rest = (s.comments || []).filter((c) => !c.near);
  if (s.location && nearOnes.length) {
    parts.push(`<div class="section-head"><h3>📍 Mentions ${esc(s.location)}</h3></div>`);
    parts.push(nearOnes.map(commentCard).join(''));
  }
  if (rest.length) {
    parts.push(`<div class="section-head"><h3>🌍 Hiring in ${esc(fieldMeta(s.field).label)}</h3></div>`);
    parts.push(rest.map(commentCard).join(''));
  }
  if (!parts.length || (!nearOnes.length && !rest.length)) {
    parts.push(`<div class="empty"><span class="big">🚀</span>No startup posts matched yet — check the boards below.</div>`);
  }
  parts.push(`<div class="link-row">${(s.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</div>`);
  list.innerHTML = parts.join('');
}

/* ---------- settings ---------- */
function renderSettings() {
  const u = state.user;
  $('#set-avatar').textContent = (u.name || '?').charAt(0).toUpperCase();
  $('#set-name').textContent = u.name;
  $('#set-email').textContent = u.email;

  const sel = $('#set-field');
  sel.innerHTML = state.fields.map((f) => `<option value="${esc(f.id)}"${f.id === u.field ? ' selected' : ''}>${f.emoji} ${esc(f.label)}</option>`).join('');
  $('#set-location').value = u.location || '';
  $('#set-time').value = u.notifyTime || '08:00';

  const on = u.notificationsOn && u.hasPush;
  $('#notif-status').textContent = on
    ? `Reminders are ON — daily at ${u.notifyTime}.`
    : 'Reminders are OFF for this account.';
  $('#btn-enable-push').hidden = on;
  $('#btn-test-push').hidden = !on;
}

$('#set-field').addEventListener('change', async (e) => {
  try {
    const res = await api('/api/profile', { method: 'PATCH', body: { field: e.target.value } });
    state.user = res.user;
    clearCaches();
    toast(`Field set to ${fieldMeta(res.user.field).label} ${fieldMeta(res.user.field).emoji}`);
  } catch (err) { toast(err.message, true); }
});

$('#set-location').addEventListener('change', async (e) => {
  try {
    const res = await api('/api/profile', { method: 'PATCH', body: { location: e.target.value } });
    state.user = res.user;
    state.jobs = null; state.startups = null;
    toast('Location saved ✓');
  } catch (err) { toast(err.message, true); }
});

$('#set-time').addEventListener('change', async (e) => {
  try {
    const res = await api('/api/profile', { method: 'PATCH', body: { notifyTime: e.target.value } });
    state.user = res.user;
    toast(`Reminder set for ${res.user.notifyTime} ✓`);
  } catch (err) { toast(err.message, true); }
});

$('#btn-logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  state.user = null;
  clearCaches();
  showAuth();
});

/* ---------- push notifications ---------- */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function enablePush() {
  const hint = $('#push-hint');
  hint.hidden = true;

  if (!window.isSecureContext) {
    hint.hidden = false;
    hint.textContent = '⚠️ Browser notifications require HTTPS (or localhost). Open this app over HTTPS to enable reminders.';
    toast('HTTPS needed for notifications', true);
    setView('settings');
    return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    hint.hidden = false;
    hint.textContent = '⚠️ This browser does not support push notifications. Try Chrome or Edge.';
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast('Notification permission denied', true);
      return;
    }
    const { publicKey } = await api('/api/push/vapid-key');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    const res = await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    state.user = res.user;
    toast('Daily reminders enabled! 🔔');
    renderSettings();
    renderReminderCard();
  } catch (err) {
    toast(err.message, true);
  }
}

$('#btn-enable-push').addEventListener('click', enablePush);

$('#btn-test-push').addEventListener('click', async () => {
  const btn = $('#btn-test-push');
  btn.disabled = true;
  try {
    const res = await api('/api/push/test', { method: 'POST' });
    toast(res.delivered > 0 ? 'Test notification sent ✓' : 'Sent — check your notifications', false);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- boot ---------- */
async function boot() {
  renderAuthFields();
  try {
    const [f, me] = await Promise.all([api('/api/fields'), api('/api/auth/me')]);
    state.fields = f.fields;
    if (!state.authField) state.authField = f.fields[0].id;
    renderAuthFields();
    if (me.user) {
      state.user = me.user;
      showMain();
    } else {
      showAuth();
    }
  } catch (err) {
    showAuth();
    toast('Cannot reach the server', true);
  }
}

boot();
