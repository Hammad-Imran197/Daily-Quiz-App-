// Headless UI smoke test: register → home → quiz → results → learn → jobs → startups → settings
const puppeteer = require('puppeteer-core');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = '/tmp/opencode/dq-shots';
const errors = [];
let pageRef = null;

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const errors = [];
  const errorsLocal = errors;
  pageRef = page;
  page.on('pageerror', (e) => errorsLocal.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errorsLocal.push(`console: ${m.text()}`); });
  page.on('response', (res) => {
    if (res.url().includes('/api/quiz/submit')) errorsLocal.push(`submit response: ${res.status()}`);
  });

  const shot = (name, opts) => page.screenshot({ path: `${OUT}/${name}.png`, ...opts });

  console.log('1. loading app…');
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.waitForSelector('#auth-screen:not([hidden])', { timeout: 8000 });
  await shot('1-auth');

  console.log('2. registering…');
  await page.click('#tab-register');
  await page.type('#auth-name', 'Hammad');
  await page.click('#auth-field-chips .chip'); // first field
  await page.type('#auth-email', `ui-${Date.now()}@example.com`);
  await page.type('#auth-password', 'secret123');
  await page.click('#auth-submit');
  await page.waitForSelector('#main-screen:not([hidden])', { timeout: 8000 });
  await page.waitForSelector('#home-hero .hero-field', { timeout: 12000 });
  await shot('2-home');

  console.log('3. quiz flow…');
  await page.click('.nav-btn[data-view="quiz"]');
  await page.waitForSelector('#quiz-form .q-card', { timeout: 12000 });
  const qCount = await page.$$eval('#quiz-form .q-card', (els) => els.length);
  console.log(`   ${qCount} questions rendered`);
  // tap via input.click() — immune to the sticky header intercepting coordinate clicks
  await page.evaluate(() => {
    document.querySelectorAll('#quiz-form .q-card').forEach((card, i) => {
      card.querySelectorAll('input')[i % 4].click();
    });
  });
  const checked = await page.$$eval('#quiz-form input:checked', (els) => els.length);
  if (checked !== qCount) throw new Error(`only ${checked}/${qCount} questions answered`);
  await shot('3-quiz-answered');
  await page.click('#quiz-form button[type="submit"]');
  await page.waitForSelector('.score-ring', { timeout: 10000 });
  const scoreLabel = await page.$eval('.score-ring', (el) => el.getAttribute('data-label'));
  const explainCount = await page.$$eval('.explain', (els) => els.length);
  console.log(`   score: ${scoreLabel}, explanations shown: ${explainCount}`);
  await shot('4-results', { fullPage: true });

  console.log('3b. reload after submit — record must still load…');
  await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
  await page.waitForSelector('#main-screen:not([hidden])', { timeout: 8000 });
  // home hero must show real marks (not undefined/undefined)
  await page.click('.nav-btn[data-view="home"]');
  await page.waitForSelector('#home-hero .score-pill', { timeout: 12000 });
  const heroScore = await page.$eval('#home-hero .score-pill', (el) => el.textContent);
  if (/undefined|NaN/.test(heroScore) || !/\d+\s*\/\s*\d+/.test(heroScore)) {
    throw new Error(`bad hero score after reload: ${heroScore}`);
  }
  // quiz view must show score ring + full answer summary with explanations
  await page.click('.nav-btn[data-view="quiz"]');
  await page.waitForSelector('.score-ring', { timeout: 15000 });
  const label2 = await page.$eval('.score-ring', (el) => el.getAttribute('data-label'));
  if (!/^\d+\/\d+$/.test(label2)) throw new Error(`bad score label after reload: ${label2}`);
  const explain2 = await page.$$eval('.explain', (els) => els.length);
  if (explain2 < 7) throw new Error(`explanations missing after reload: ${explain2}`);
  const resCards = await page.$$eval('.res-q', (els) => els.length);
  console.log(`   hero: "${heroScore.trim()}" | ring: ${label2} | summary cards: ${resCards} | explanations: ${explain2}`);
  await shot('4b-results-after-reload', { fullPage: true });

  console.log('4. courses…');
  await page.click('.nav-btn[data-view="learn"]');
  await page.waitForSelector('#courses-list .item-card', { timeout: 10000 });
  await shot('5-learn');

  console.log('5. jobs…');
  await page.click('.nav-btn[data-view="opps"]');
  await page.waitForSelector('#jobs-list .item-card, #jobs-list .empty', { timeout: 30000 });
  await shot('6-jobs');

  console.log('5b. location search (Berlin)…');
  await page.type('#opp-location', 'Berlin, Germany');
  // debounced save (900ms) → jobs reload grouped under "Near …"
  await page.waitForFunction(() => {
    const h = document.querySelector('#jobs-list .section-head h3');
    return h && /Near Berlin/.test(h.textContent);
  }, { timeout: 25000 });
  const jobCards = await page.$$eval('#jobs-list .item-card', (els) => els.length);
  const nearJobs = await page.$$eval('#jobs-list .item-card .tag-pill.near', (els) => els.length);
  console.log(`   jobs after location: ${jobCards} cards, ${nearJobs} flagged near`);
  if (nearJobs < 1) throw new Error('expected at least one "near" job for Berlin');
  await shot('6b-jobs-near');

  console.log('6. startups…');
  await page.click('.tab[data-tab="startups"]');
  await page.waitForSelector('#startups-list .item-card, #startups-list .empty', { timeout: 30000 });
  const nearStartups = await page.$$eval('#startups-list .tag-pill.near', (els) => els.length);
  console.log(`   startup posts flagged near: ${nearStartups}`);
  await shot('7-startups');

  console.log('7. settings…');
  await page.click('.nav-btn[data-view="settings"]');
  await page.waitForSelector('#set-field option', { timeout: 8000 });
  await shot('8-settings');

  await browser.close();

  const realErrors = errors.filter((e) => !/favicon|ERR_|submit response/.test(e));
  if (realErrors.length) {
    console.log('\nJS ERRORS:');
    realErrors.forEach((e) => console.log('  -', e));
    process.exit(1);
  }
  console.log('\nUI TEST PASSED ✅');
})().catch(async (e) => {
  console.error('UI TEST FAILED ❌:', e.message);
  if (errors.length) {
    console.log('collected:');
    errors.forEach((x) => console.log('  -', x));
  }
  if (pageRef) {
    try {
      const info = await pageRef.evaluate(() => ({
        hash: location.hash,
        visibleViews: Array.from(document.querySelectorAll('.view')).filter((v) => v.offsetParent !== null).map((v) => v.id),
        toast: document.getElementById('toast').hidden ? null : document.getElementById('toast').textContent,
        hasForm: !!document.getElementById('quiz-form'),
        checked: document.querySelectorAll('#quiz-form input:checked').length
      }));
      console.log('page state:', JSON.stringify(info));
    } catch (err) { /* page gone */ }
  }
  process.exit(1);
});
