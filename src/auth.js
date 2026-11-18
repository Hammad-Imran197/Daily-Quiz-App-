// Auth: register / login / logout / me — bcrypt password hashing + JWT httpOnly cookie
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { FIELDS, fieldMeta } = require('./question-bank');

const SECRET_FILE = path.join(store.DATA_DIR, 'secret.key');
let JWT_SECRET;
try {
  JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  if (JWT_SECRET.length < 32) throw new Error('short');
} catch (err) {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
}

const COOKIE_NAME = 'dq_token';
const TOKEN_TTL = '7d';

function getUsers() {
  const users = store.load('users', []);
  return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
  store.save('users', users);
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    field: u.field,
    location: u.location || '',
    notifyTime: u.notifyTime || '08:00',
    notificationsOn: !!u.notificationsOn,
    lastNotified: u.lastNotified || '',
    hasPush: Array.isArray(u.push) && u.push.length > 0
  };
}

function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true when serving over HTTPS in production
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function getUserFromReq(req) {
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return null;
  const token = decodeURIComponent(raw.slice(COOKIE_NAME.length + 1));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return getUsers().find((u) => u.id === payload.sub) || null;
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  next();
}

// Simple in-memory rate limiting for auth endpoints
const attempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const bucket = attempts.get(ip) || { count: 0, reset: now + 60000 };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + 60000;
  }
  bucket.count += 1;
  attempts.set(ip, bucket);
  if (bucket.count > 30) return res.status(429).json({ error: 'Too many attempts, try again in a minute' });
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = express.Router();

router.post('/register', rateLimit, async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, 60);
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const field = fieldMeta(String((req.body && req.body.field) || '')).id;

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const users = getUsers();
  if (users.some((u) => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists' });

  const user = {
    id: crypto.randomUUID(),
    email,
    name: name || email.split('@')[0],
    hash: await bcrypt.hash(password, 10),
    field,
    location: '',
    notifyTime: '08:00',
    notificationsOn: false,
    lastNotified: '',
    push: [],
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);

  setTokenCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
});

router.post('/login', rateLimit, async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const user = getUsers().find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.hash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  setTokenCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = getUserFromReq(req);
  res.json({ user: user ? publicUser(user) : null });
});

module.exports = { router, requireAuth, getUsers, saveUsers, publicUser, fieldMeta, FIELDS };
