# Project Takeover — Setup Radar V2

Live pair scanner + setup radar for XAUUSD, NQ/QQQ proxy, ES/SPY proxy, EURUSD, GBPUSD and USDJPY.

## What this version does

- Radar homepage: Setups Now, Setups Later, Active Trades and Market Ranking.
- Live Pair Scanner: optional free API price polling with Finnhub or Twelve Data, plus manual fallback.
- Watch Zone Engine: watch zone, entry zone, invalidation and targets per market.
- Setup Lifecycle: NO SETUP, WATCHING, FORMING, READY, TRIGGERED, MANAGING, INVALIDATED, CLOSED.
- Active Trade Monitor: floating R, TP/SL context and manual close.
- Decision Engine: confirms or rejects setups. Live price alone never creates a TAKE.
- Risk Calculator, Journal, Learning Engine, Daily Flow, Weekly CEO Review and Settings.

## Safety rules

- No broker execution.
- No auto trading.
- No TradingView dependency.
- Live data can only create WATCH / READY / INVALID signals.
- Final TAKE / WAIT / SKIP still requires the Decision Engine and user approval.
- API keys stored in localStorage are not secret. For production, move API calls to Vercel serverless functions.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy existing Vercel project

```bash
git add .
git commit -m "V2 setup radar upgrade"
git push
```

Vercel will redeploy automatically.

## Free data providers

Settings → Data provider:

- Manual: always works.
- Finnhub: add free Finnhub key.
- Twelve Data: add free Twelve Data key.

Free plans have rate limits and may not support every symbol. The app falls back to manual mode if a symbol fails.
