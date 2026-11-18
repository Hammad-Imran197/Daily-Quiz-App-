# 🧠 Daily Quiz — Learn Your Field Daily

A mobile-first **installable web app (PWA)** that sends you a **fresh quiz every day** in the
field you choose — with a **full explanation for every answer**, plus **free courses**,
**job opportunities** and **startup roles near you**. Login-protected.

## Features

| Feature | Details |
|---|---|
| 🎯 **Field selection** | Cybersecurity, Networking, Robotics, AI, Programming, Cloud, Data Science, Software Engineering — switch anytime |
| 📝 **Daily quiz** | 7 questions per day, generated fresh. Uses **Google Gemini free tier** if you add an API key, otherwise the built-in curated question bank (works with zero keys) |
| 🔔 **Daily notifications** | Browser push notification at the time you choose (default 08:00), sent when your quiz is generated |
| 💡 **Answer explanations** | Submit → score ring + every question marked correct/wrong with a clear explanation of *why* |
| 🔐 **Login system** | Email + password (bcrypt-hashed), JWT session in an httpOnly cookie, rate-limited auth |
| 📚 **Free courses** | Curated free/audit resources per field (Coursera audit, freeCodeCamp, Cisco, Kaggle, MIT OCW…) |
| 💼 **Jobs near you** | Live feeds from free key-less APIs (Remotive, Arbeitnow) filtered to your field + your city, plus LinkedIn/Indeed/Google search links |
| 🚀 **Startups** | The monthly HN “Ask HN: Who is hiring?” thread with comments matching your field (location-matched when possible), plus YC/Wellfound/LinkedIn startup boards |
| 📍 **Location** | Type your city or tap 📍 to detect it automatically (OpenStreetMap reverse geocoding) |
| 📱 **Installable** | Add to Home screen → runs like a native app with its own icon |

## Run it

```bash
cd daily-quiz-app
node server.js          # that's it — no build step
```

Open **http://localhost:3000** — register, pick your field, take today's quiz.

> `npm` isn't required to run. If you want the pnpm scripts: `corepack pnpm start`.

### Optional: AI-generated quizzes (free)

1. Get a free key at **https://aistudio.google.com/apikey**
2. `GEMINI_API_KEY=your_key_here node server.js` (or copy `.env.example` → `.env`)

Without a key everything still works — quizzes come from the built-in question bank.

### Optional: environment variables

See [.env.example](.env.example) (`PORT`, `VAPID_*`, `GEMINI_*`).

## 🔔 Important: notifications need HTTPS

Web push only works in a **secure context** — `https://` or `localhost`.

- **On your computer**: open `http://localhost:3000` → notifications work.
- **On your phone**: browsers will refuse push over `http://192.168.x.x`. Options:
  1. **Deploy it** (free): render.com, railway.app, fly.io, or any host serving Node over HTTPS — push works instantly once the URL is HTTPS.
  2. Use a tunnel for testing: `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.

Settings → *Enable daily reminders* → allow permission → you'll get a test notification,
then one every day at your chosen time.

## 🌍 Deploy for a permanent URL (free)

**Render** hosts this Node app forever on a free plan — permanent `https://daily-quiz-xxx.onrender.com`
URL, no credit card, notifications work out of the box.

1. **Put the code on GitHub** (one time, ~3 minutes):
   - Go to [github.com/new](https://github.com/new) → name it `daily-quiz-app` → **Create repository**.
   - On the empty repo page: **Add file → Upload files** → drag in `daily-quiz-app-deploy.zip`
     contents (`server.js`, `src/`, `public/`, `banks/`, `scripts/`, `package.json`,
     `pnpm-lock.yaml`, `render.yaml`, `README.md`, `.env.example`, `run.sh`) →
     **Commit changes**. (Skip `data/` and `node_modules/` — the zip already excludes them.)
2. **Render the app** (one time, ~2 minutes):
   - Sign up at [render.com](https://render.com) with GitHub (free plan, no card).
   - **New → Blueprint** → connect the `daily-quiz-app` repo → Render detects `render.yaml`
     automatically → **Apply**.
3. Wait ~3 minutes → you get a permanent URL like `https://daily-quiz-xxxx.onrender.com`.
   Open it, register, enable reminders — everything works (HTTPS ✓).

**Free-plan notes:**

- The service **sleeps** after 15 min of no visitors; the first request wakes it (~30 s).
  A phone notification still works — the scheduler wakes on boot and catches up.
- User/quiz data lives in `data/*.json` on Render's **ephemeral disk**: it survives sleep,
  but resets if you redeploy or the service restarts. If that happens, just register again
  (a full data restore only needs re-registering 1 account).
- Optional: set `GEMINI_API_KEY` in Render's Environment tab to enable AI quizzes.

### Alternative: keep it on your computer (no signup)

The app runs as **systemd user services** — it starts on boot/login and **auto-restarts
within seconds if it ever crashes**:

```bash
systemctl --user status daily-quiz daily-quiz-tunnel   # check
systemctl --user restart daily-quiz-tunnel             # get a fresh tunnel URL
./run.sh                                               # convenience wrapper, prints the URL
```

Caveat: while your computer is **powered off**, nothing local can serve the app —
deploy to Render (above) for a link that never depends on your machine.
Quick-tunnel URLs also change whenever the tunnel restarts.

## How the daily flow works

1. You pick a **field** and a **reminder time** in Settings.
2. A server scheduler checks every 30 s: when your time arrives, it generates today's quiz
   for your field (AI if a key is present, otherwise the bank — deterministic per date),
   stores it, and **sends a push** to every subscribed user.
3. The notification opens the app straight to the quiz.
4. You answer → the server grades it and returns **score + explanation per question**.
5. Attempts are stored per user, per day, per field — revisit any time to re-read explanations.

## Project structure

```
daily-quiz-app/
├── server.js              # Express app + routes
├── src/
│   ├── auth.js            # register/login/JWT cookie/rate limit
│   ├── quiz.js            # generation (Gemini | bank), grading, scheduler
│   ├── question-bank.js   # field metadata + deterministic daily picker
│   ├── courses.js         # curated free courses per field
│   ├── opportunities.js   # jobs (Remotive/Arbeitnow) + startups (HN Algolia)
│   ├── push.js            # VAPID + web-push sending
│   └── store.js           # atomic JSON file storage
├── banks/                 # curated question pools (12+ questions × 8 fields)
├── public/                # PWA frontend (index.html, app.js, styles.css, sw.js, manifest)
├── scripts/gen-icons.js   # generates PNG icons with no image libraries
├── scripts/ui-test.js     # headless Chrome end-to-end test
└── data/                  # runtime: users, quizzes, attempts, keys (auto-created)
```

## Tests

```bash
node scripts/gen-icons.js   # regenerate icons
node scripts/ui-test.js     # full browser test: register → quiz → results → courses → jobs → startups → settings
```

## Data & privacy

Everything lives in local JSON files under `data/` (users, attempts, quizzes, VAPID secret).
No third party sees your data except: the optional Gemini API (only your quiz prompt, only if
you add a key), and the public job/startup feeds you browse.
