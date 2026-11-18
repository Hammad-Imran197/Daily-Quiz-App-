// Daily Quiz PWA — server entry point
const path = require('path');
const express = require('express');
const { router: authRouter, requireAuth, getUsers, saveUsers, publicUser, FIELDS, fieldMeta } = require('./src/auth');
const quiz = require('./src/quiz');
const push = require('./src/push');
const opportunities = require('./src/opportunities');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: '1h', setHeaders: (res, p) => {
  if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
}}));

app.use('/api/auth', authRouter);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

app.get('/api/health', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.get('/api/fields', (req, res) => res.json({ fields: FIELDS }));

// ---- Profile (field, location, notification settings) ----
app.patch('/api/profile', requireAuth, (req, res) => {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });
  const u = users[idx];
  const b = req.body || {};

  if (typeof b.field === 'string') {
    const meta = FIELDS.find((f) => f.id === b.field);
    if (!meta) return res.status(400).json({ error: 'Unknown field' });
    u.field = meta.id;
  }
  if (typeof b.location === 'string') u.location = b.location.trim().slice(0, 120);
  if (typeof b.notifyTime === 'string') {
    if (!TIME_RE.test(b.notifyTime)) return res.status(400).json({ error: 'Time must be HH:MM (24h)' });
    u.notifyTime = b.notifyTime;
    u.lastNotified = ''; // allow re-notification today after a time change
  }
  if (typeof b.notificationsOn === 'boolean') {
    u.notificationsOn = b.notificationsOn;
    if (b.notificationsOn) u.lastNotified = '';
  }
  if (typeof b.name === 'string' && b.name.trim()) u.name = b.name.trim().slice(0, 60);

  users[idx] = u;
  saveUsers(users);
  res.json({ user: publicUser(u) });
});

// ---- Quiz ----
app.get('/api/quiz/today', requireAuth, async (req, res) => {
  try {
    res.json(await quiz.getTodayQuiz(req.user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load today’s quiz' });
  }
});

app.post('/api/quiz/submit', requireAuth, async (req, res) => {
  try {
    const result = await quiz.submitQuiz(req.user, req.body && req.body.answers);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Submission failed' });
  }
});

// ---- Reverse geocoding (for "jobs near me") ----
app.get('/api/geocode', requireAuth, async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat/lon required' });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`,
      { headers: { 'User-Agent': 'DailyQuizPWA/1.0 (study app)', Accept: 'application/json', 'Accept-Language': 'en' }, signal: controller.signal }
    );
    clearTimeout(timer);
    const j = await r.json();
    const a = (j && j.address) || {};
    const city = a.city || a.town || a.village || a.county || a.state || '';
    res.json({ city: String(city).slice(0, 120), country: a.country || '' });
  } catch (err) {
    console.error('[geocode]', err.message);
    res.status(502).json({ error: 'Reverse geocoding failed' });
  }
});

// ---- Courses ----
app.get('/api/courses', requireAuth, (req, res) => {
  const fieldId = (req.query.field && FIELDS.some((f) => f.id === req.query.field)) ? req.query.field : req.user.field;
  res.json({ field: fieldId, label: fieldMeta(fieldId).label, courses: opportunities.getCourses(fieldId) });
});

// ---- Jobs & startups (free external APIs, graceful degradation) ----
app.get('/api/jobs', requireAuth, async (req, res) => {
  const fieldId = (req.query.field && FIELDS.some((f) => f.id === req.query.field)) ? req.query.field : req.user.field;
  const location = typeof req.query.location === 'string' ? req.query.location : req.user.location || '';
  try {
    res.json({ field: fieldId, location, ...(await opportunities.getJobs(fieldId, location)) });
  } catch (err) {
    console.error('[jobs]', err);
    res.json({ field: fieldId, location, jobs: [], links: [], error: 'Job feeds are temporarily unavailable' });
  }
});

app.get('/api/startups', requireAuth, async (req, res) => {
  const fieldId = (req.query.field && FIELDS.some((f) => f.id === req.query.field)) ? req.query.field : req.user.field;
  const location = typeof req.query.location === 'string' ? req.query.location : req.user.location || '';
  try {
    res.json({ field: fieldId, location, ...(await opportunities.getStartups(fieldId, location)) });
  } catch (err) {
    console.error('[startups]', err);
    res.json({ field: fieldId, location, thread: null, comments: [], links: [], error: 'Startup feeds are temporarily unavailable' });
  }
});

// ---- Push notifications ----
app.get('/api/push/vapid-key', requireAuth, (req, res) => res.json({ publicKey: push.getPublicKey() }));

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('http') ||
      !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  const u = users[idx];
  u.push = Array.isArray(u.push) ? u.push : [];
  u.push = u.push.filter((s) => s.endpoint !== sub.endpoint);
  u.push.push({ endpoint: sub.endpoint, keys: sub.keys });
  if (u.push.length > 6) u.push = u.push.slice(-6);
  u.notificationsOn = true;
  u.lastNotified = '';
  users[idx] = u;
  saveUsers(users);
  res.json({ ok: true, user: publicUser(u) });
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  const u = users[idx];
  u.push = (Array.isArray(u.push) ? u.push : []).filter((s) => s.endpoint !== endpoint);
  if (!u.push.length) u.notificationsOn = false;
  users[idx] = u;
  saveUsers(users);
  res.json({ ok: true, user: publicUser(u) });
});

app.post('/api/push/test', requireAuth, async (req, res) => {
  const u = getUsers().find((x) => x.id === req.user.id);
  if (!u.push || !u.push.length) return res.status(400).json({ error: 'Subscribe to notifications first' });
  const delivered = await push.sendToUser(u, {
    title: '✅ Daily Quiz notifications work!',
    body: `Hi ${u.name}, you’ll be alerted every day when your quiz is ready.`,
    url: '/',
    tag: 'test'
  });
  res.json({ delivered });
});

// ---- Start ----
push.init();
quiz.startScheduler();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Daily Quiz running → http://localhost:${PORT}`);
  console.log(`  AI generation: ${process.env.GEMINI_API_KEY ? 'Gemini (free tier key detected)' : 'built-in question bank (set GEMINI_API_KEY to enable AI)'}\n`);
});
