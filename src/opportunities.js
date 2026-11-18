// Free courses (static), live jobs from key-less APIs, and startup hiring leads (HN).
// Jobs/startups support "near me" matching via location tokens (city / country / aliases).
const { getCourses } = require('./courses');
const { fieldMeta } = require('./question-bank');

const STOPWORDS = new Set(['and', 'the', 'of', 'in', 'on', 'at', 'de', 'la', 'el']);

async function fetchJSON(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DailyQuizPWA/1.0 (study app)', Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// "Lahore, Pakistan" → ['lahore','pakistan']; "New York" → ['new','york']
function locTokens(loc) {
  return String(loc || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function wordHit(text, token) {
  // whole-word match so 'pk'/'new' don't match inside other words
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
}

function countKeywords(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) score += kw.includes(' ') ? 2 : 1;
  }
  return score;
}

// Title matches weigh far more than tags to keep results relevant
function relevance(job, keywords) {
  const title = `${job.title} ${job.company || ''}`.toLowerCase();
  let s = 0;
  for (const kw of keywords) {
    if (title.includes(kw)) s += kw.includes(' ') ? 4 : 3;
  }
  s += Math.min(countKeywords((job.tags || []).join(' ').toLowerCase(), keywords), 2);
  return s;
}

function isNear(job, tokens) {
  const where = `${job.location || ''}`.toLowerCase();
  if (!where) return 0;
  return tokens.filter((t) => wordHit(where, t)).length;
}

function searchLinks(meta, location) {
  const kw = encodeURIComponent(meta.searchTerm);
  const loc = encodeURIComponent(location || '');
  return [
    { label: `LinkedIn — ${meta.label}${location ? ` near ${location}` : ''}`, url: `https://www.linkedin.com/jobs/search?keywords=${kw}&location=${loc}` },
    { label: `Indeed — ${meta.label}${location ? ` in ${location}` : ''}`, url: `https://www.indeed.com/jobs?q=${kw}&l=${loc}` },
    { label: `Google Jobs — ${meta.label}${location ? ` near ${location}` : ''}`, url: `https://www.google.com/search?q=${kw}+jobs${location ? `+near+${encodeURIComponent(location)}` : ''}` }
  ];
}

async function getJobs(fieldId, location) {
  const meta = fieldMeta(fieldId);
  const kws = meta.keywords;
  const tokens = locTokens(location);

  const [remotive, arbeit1, arbeit2, jobicy, remoteok] = await Promise.allSettled([
    fetchJSON(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(meta.searchTerm)}&limit=24`),
    fetchJSON('https://www.arbeitnow.com/api/job-board-api?page=1'),
    fetchJSON('https://www.arbeitnow.com/api/job-board-api?page=2'),
    fetchJSON('https://jobicy.com/api/v2/remote-jobs?count=40'),
    fetchJSON('https://remoteok.com/api')
  ]);

  const jobs = [];
  const seen = new Set();

  const pushJob = (j) => {
    if (!j.title || !j.url) return;
    const key = `${j.title.toLowerCase()}|${(j.company || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    j.rel = relevance(j, kws);
    if (j.rel > 0) jobs.push(j);
  };

  if (remotive.status === 'fulfilled' && Array.isArray(remotive.value.jobs)) {
    for (const r of remotive.value.jobs) {
      pushJob({
        title: r.title, company: r.company_name,
        location: r.candidate_required_location || 'Worldwide',
        url: r.url, source: 'Remotive', remote: true,
        date: r.publication_date || '', tags: r.tags || []
      });
    }
  }

  for (const res of [arbeit1, arbeit2]) {
    if (res.status !== 'fulfilled' || !Array.isArray(res.value.data)) continue;
    for (const a of res.value.data) {
      pushJob({
        title: stripHtml(a.title), company: a.company_name || '',
        location: a.location || (a.remote ? 'Remote' : ''),
        url: a.url || `https://www.arbeitnow.com/jobs/${a.slug || ''}`,
        source: 'Arbeitnow', remote: !!a.remote,
        date: a.created_at ? new Date(a.created_at * 1000).toISOString() : '',
        tags: Array.isArray(a.tags) ? a.tags : []
      });
    }
  }

  if (jobicy.status === 'fulfilled' && Array.isArray(jobicy.value.jobs)) {
    for (const j of jobicy.value.jobs) {
      pushJob({
        title: j.jobTitle, company: j.companyName,
        location: j.jobGeo || 'Worldwide',
        url: j.url, source: 'Jobicy', remote: true,
        date: j.pubDate || '',
        tags: [j.jobIndustry, ...(Array.isArray(j.jobType) ? j.jobType : [])].filter(Boolean)
      });
    }
  }

  if (remoteok.status === 'fulfilled' && Array.isArray(remoteok.value)) {
    for (const r of remoteok.value) {
      if (!r || typeof r !== 'object' || !r.position) continue;
      pushJob({
        title: r.position, company: r.company || '',
        location: r.location || 'Worldwide',
        url: r.url, source: 'RemoteOK', remote: true,
        date: r.date || '', tags: Array.isArray(r.tags) ? r.tags : []
      });
    }
  }

  // Split into "near you" (location token match) and the rest
  const near = [];
  const global = [];
  for (const j of jobs) {
    j.nearHits = tokens.length ? isNear(j, tokens) : 0;
    (j.nearHits > 0 ? near : global).push(j);
  }
  near.sort((a, b) => b.nearHits - a.nearHits || b.rel - a.rel);
  global.sort((a, b) => b.rel - a.rel || String(b.date).localeCompare(String(a.date)));

  return {
    location: location || '',
    near: near.slice(0, 15),
    global: global.slice(0, 15),
    links: searchLinks(meta, location)
  };
}

async function getStartups(fieldId, location) {
  const meta = fieldMeta(fieldId);
  const tokens = locTokens(location);
  const nearToken = tokens.find((t) => t.length >= 4) || tokens[0] || null;

  let thread = null;
  const byId = new Map();

  const addHits = (hits, forceNear) => {
    for (const h of hits || []) {
      if (!h || !h.comment_text) continue;
      if (byId.has(h.objectID)) {
        if (forceNear) byId.get(h.objectID).near = true;
        continue;
      }
      const text = stripHtml(h.comment_text);
      if (!text) continue;
      byId.set(h.objectID, {
        id: h.objectID,
        author: h.author,
        text: text.length > 400 ? `${text.slice(0, 400)}…` : text,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        near: forceNear || (nearToken ? wordHit(text.toLowerCase(), nearToken) : false)
      });
    }
  };

  try {
    const stories = await fetchJSON(
      'https://hn.algolia.com/api/v1/search_by_date?query=%22who%20is%20hiring%22&tags=story&hitsPerPage=25'
    );
    const hits = (stories.hits || []).filter((h) =>
      h.author === 'whoishiring' || /ask hn: who is hiring/i.test(h.title || '')
    );
    if (hits.length) {
      const s = hits[0];
      thread = { title: s.title, url: `https://news.ycombinator.com/item?id=${s.objectID}`, date: s.created_at };

      // Pass 1: comments in the thread mentioning this field
      const res1 = await fetchJSON(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(meta.searchTerm)}&tags=comment,story_${s.objectID}&hitsPerPage=30`
      );
      addHits(res1.hits, false);

      // Pass 2 (near me): comments mentioning the user's city/region, even if the field word is absent
      if (nearToken) {
        const res2 = await fetchJSON(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(nearToken)}&tags=comment,story_${s.objectID}&hitsPerPage=25`
        );
        addHits(res2.hits, true);
      }
    }
  } catch (err) {
    console.error('[opportunities] HN lookup failed:', err.message);
  }

  const comments = Array.from(byId.values())
    .sort((a, b) => Number(b.near) - Number(a.near))
    .slice(0, 14);
  const nearCount = comments.filter((c) => c.near).length;

  const kw = encodeURIComponent(meta.searchTerm);
  const locEnc = encodeURIComponent(location || '');
  const links = [
    { label: 'Y Combinator — Work at a Startup', url: 'https://www.workatastartup.com/' },
    { label: `Wellfound — startup ${meta.label} roles`, url: `https://wellfound.com/jobs?query=${kw}` },
    { label: `LinkedIn — startups hiring ${meta.searchTerm}${location ? ` near ${location}` : ''}`, url: `https://www.linkedin.com/jobs/search?keywords=${kw}%20startup&location=${locEnc}` },
    { label: `Indeed — startup jobs${location ? ` in ${location}` : ''}`, url: `https://www.indeed.com/jobs?q=startup+${kw}&l=${locEnc}` }
  ];

  return { thread, comments, nearCount, location: location || '', links };
}

module.exports = { getCourses, getJobs, getStartups };
