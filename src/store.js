// Tiny JSON file persistence (atomic writes, in-memory cache)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUIZ_DIR = path.join(DATA_DIR, 'quizzes');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(QUIZ_DIR)) fs.mkdirSync(QUIZ_DIR, { recursive: true });

const cache = new Map();

function fileFor(name) {
  return path.join(DATA_DIR, name.endsWith('.json') ? name : `${name}.json`);
}

function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let value = fallback;
  try {
    if (fs.existsSync(fileFor(name))) {
      value = JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
    }
  } catch (err) {
    console.error(`[store] failed to load ${name}:`, err.message);
  }
  cache.set(name, value);
  return value;
}

function save(name, value) {
  cache.set(name, value);
  const target = fileFor(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, target);
}

function loadQuizDate(dateStr) {
  const file = path.join(QUIZ_DIR, `${dateStr}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('[store] failed to load quiz file:', err.message);
  }
  return { date: dateStr, generatedAt: null, quizzes: {} };
}

function saveQuizDate(dateStr, data) {
  const file = path.join(QUIZ_DIR, `${dateStr}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { DATA_DIR, load, save, loadQuizDate, saveQuizDate };
