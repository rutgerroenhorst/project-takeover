# Project Takeover — Decision Engine

A mobile-first **research, decision, risk, journaling and self-learning** app for a funded trading account. It helps you decide **TAKE / WAIT / SKIP** and is built to prevent overtrading, FOMO, revenge trading, weak setups, bad risk, and random strategy changes.

> **Not a trading bot.** No auto-execution, no broker connection, no live market data, no paid APIs. Everything is manual-first and stored locally on your device. You remain the final decision maker. Nothing here is financial advice.

## Modules

- **Command Center** — market cards with status (GREEN/ORANGE/RED), verdict (TAKE/WAIT/SKIP), score /100, bias, setup, next action, risk allowed.
- **Market Scanner** — fast bias board across all six markets.
- **Decision Engine** — weighted A–G confluence checklist, per-market timeframe route, accountability gate, frequency governor.
- **Risk Calculator** — dollar risk, stop distance, estimated position size, RR to each TP, approve/reject.
- **Trade Journal** — full editable trade dossiers.
- **Self-Learning Engine** — observation → pattern → hypothesis → rule-change ladder driven by your logged mistakes.
- **Rules** — stable rules + auto-enforced risk rules.
- **Settings** — account size, max risk, copy-ready Telegram alert, JSON export/import, reset.

Markets covered: XAUUSD, NQ, ES, EURUSD, USDJPY, GBPUSD.

## Tech

- React 18 + Vite
- Plain CSS (no framework), mobile-first
- `localStorage` for persistence (per device)
- Zero external runtime services

## Run locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). Use it on your phone by adding the page to your home screen, or by opening the dev URL from another device on the same network with `npm run dev -- --host`.

Build a production bundle:

```bash
npm run build      # outputs to /dist
npm run preview    # serve the built bundle locally
```

## Deploy to GitHub

1. Create an empty repository on GitHub (no README/license, to avoid conflicts).
2. In this project folder:

```bash
git init
git add .
git commit -m "Project Takeover — Decision Engine"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Deploy to Vercel (free)

**Option A — Dashboard (easiest)**

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New… → Project**, then import the repository you just pushed.
3. Vercel auto-detects Vite. Confirm the defaults:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Click **Deploy**. You get a free `https://<project>.vercel.app` URL. Every push to `main` redeploys automatically.

**Option B — CLI**

```bash
npm i -g vercel
vercel          # follow prompts, accept the detected Vite settings
vercel --prod   # promote to production
```

No environment variables are required.

## Using it on your phone

- Open the deployed Vercel URL on your phone.
- Use the browser's **Add to Home Screen** to launch it full-screen with the bottom tab bar.
- Data is stored per device/browser. Use **Settings → Export backup** regularly; private/incognito mode and clearing browser data will erase local storage.

## Data & privacy

All data stays in your browser's `localStorage` on the device you use. Nothing is uploaded anywhere. Export/import JSON backups from the Settings page to move data between devices.

## Future upgrades

- Optional screenshot attachments in the journal
- Equity curve and R-multiple charts
- Your-own-token Telegram relay (still no paid service)
- Economic-calendar paste field to semi-automate the news gate
- Optional free backend for multi-device sync
