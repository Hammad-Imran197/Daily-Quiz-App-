// Web Push (VAPID) setup and sending
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const VAPID_FILE = path.join(store.DATA_DIR, 'vapid.json');

let publicKey;
let privateKey;
let initialized = false;

function init() {
  if (initialized) return;
  let keys = null;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    try {
      if (fs.existsSync(VAPID_FILE)) keys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
    } catch (err) {
      console.error('[push] failed to read vapid.json:', err.message);
    }
    if (!keys || !keys.publicKey || !keys.privateKey) {
      keys = webpush.generateVAPIDKeys();
      fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
      console.log('[push] generated new VAPID keys');
    }
  }
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@localhost',
    publicKey,
    privateKey
  );
  initialized = true;
}

function getPublicKey() {
  init();
  return publicKey;
}

// Send a push to one subscription; returns 'ok' | 'gone' | 'error'
async function sendToSubscription(sub, payload) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
    return 'ok';
  } catch (err) {
    const status = err && err.statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.error('[push] send failed:', status || err.message);
    return 'error';
  }
}

// Send to a user's stored subscriptions; prunes dead ones. Returns number delivered.
async function sendToUser(user, payload) {
  init();
  if (!Array.isArray(user.push) || !user.push.length) return 0;
  const results = await Promise.all(user.push.map((sub) => sendToSubscription(sub, payload)));
  const alive = user.push.filter((sub, i) => results[i] !== 'gone');
  const delivered = results.filter((r) => r === 'ok').length;
  if (alive.length !== user.push.length) {
    user.push = alive;
    const { getUsers, saveUsers } = require('./auth');
    const users = getUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
      saveUsers(users);
    }
  }
  return delivered;
}

module.exports = { init, getPublicKey, sendToSubscription, sendToUser };
