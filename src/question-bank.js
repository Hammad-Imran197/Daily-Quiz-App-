// Field definitions + daily deterministic question picker
const bankA = require('../banks/bank-a');
const bankB = require('../banks/bank-b');
const bankC = require('../banks/bank-c');

const pools = Object.assign({}, bankA, bankB, bankC);

// searchTerm + keywords are used for job/startup search and AI prompt tuning
const FIELDS = [
  { id: 'cybersecurity', label: 'Cybersecurity', emoji: '🛡️', blurb: 'Ethical hacking, defense, threat analysis', searchTerm: 'cybersecurity', keywords: ['security', 'cyber', 'soc', 'pentest', 'infosec', 'vulnerability', 'malware', 'ciso', 'appsec', 'threat', 'incident response', 'security analyst'] },
  { id: 'networking', label: 'Networking', emoji: '🌐', blurb: 'Protocols, routing, LAN/WAN, Wi-Fi', searchTerm: 'network', keywords: ['network', 'ccna', 'routing', 'switching', 'sysadmin', 'lan', 'wan', 'firewall', 'dns', 'vpn', 'network engineer'] },
  { id: 'robotics', label: 'Robotics', emoji: '🤖', blurb: 'Automation, ROS, actuators, control', searchTerm: 'robotics', keywords: ['robot', 'robotics', 'ros', 'automation', 'mechatronics', 'embedded', 'control systems', 'autonomous'] },
  { id: 'artificial-intelligence', label: 'Artificial Intelligence', emoji: '🧠', blurb: 'ML, deep learning, NLP, computer vision', searchTerm: 'machine learning', keywords: ['machine learning', 'ml', 'ai', 'deep learning', 'nlp', 'computer vision', 'pytorch', 'tensorflow', 'llm', 'data scientist'] },
  { id: 'programming', label: 'Programming', emoji: '💻', blurb: 'Languages, algorithms, problem solving', searchTerm: 'developer', keywords: ['developer', 'programmer', 'software engineer', 'frontend', 'backend', 'full stack', 'fullstack', 'javascript', 'python', 'java', 'golang', 'node'] },
  { id: 'cloud-computing', label: 'Cloud Computing', emoji: '☁️', blurb: 'AWS, Azure, GCP, DevOps, containers', searchTerm: 'cloud', keywords: ['cloud', 'aws', 'azure', 'gcp', 'devops', 'sre', 'kubernetes', 'docker', 'terraform', 'site reliability'] },
  { id: 'data-science', label: 'Data Science', emoji: '📊', blurb: 'Statistics, analysis, visualization, modeling', searchTerm: 'data', keywords: ['data', 'analytics', 'statistics', 'pandas', 'visualization', 'etl', 'business intelligence', 'bi analyst', 'data engineer'] },
  { id: 'software-engineering', label: 'Software Engineering', emoji: '🏗️', blurb: 'Design, testing, architecture, delivery', searchTerm: 'software engineer', keywords: ['software engineer', 'sdlc', 'qa', 'test automation', 'architecture', 'code review', 'agile', 'scrum', 'developer', 'devops'] }
];

function fieldMeta(id) {
  return FIELDS.find((f) => f.id === id) || FIELDS[0];
}

function getPool(fieldId) {
  return pools[fieldId] || [];
}

// Deterministic PRNG so everyone gets the same quiz for a given date+field,
// but the selection changes every day.
function seededShuffle(arr, seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DAILY_COUNT = 7;

// Returns DAILY_COUNT fresh questions (by reference copies) for a field on a date
function dailyQuestions(fieldId, dateStr) {
  const pool = getPool(fieldId);
  if (!pool.length) return [];
  const picked = seededShuffle(pool, `${fieldId}:${dateStr}`).slice(0, Math.min(DAILY_COUNT, pool.length));
  return picked.map((q) => ({ q: q.q, o: q.o.slice(), c: q.c, e: q.e }));
}

module.exports = { FIELDS, fieldMeta, getPool, dailyQuestions, DAILY_COUNT };
