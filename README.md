# Project Takeover — Live Setup Radar V3.1

Live setup radar for XAUUSD, NQ/QQQ proxy, ES/SPY proxy, EURUSD, GBPUSD and USDJPY.

## What this version adds

- New clean storage key so old browser data can no longer create fake NQ / price 0 states.
- Removed seeded active trade and fake ready setups from a fresh install.
- Fixed the fake `-347R` active-trade bug when no price feed is available.
- Fixed false TP/target states when price is empty or zero.
- Added explicit statuses: NO DATA, NO SETUP, TOO FAR, WATCH, READY, TARGET HIT, INVALIDATED.
- Added Live Watcher page with price feed, source, update time, watch-zone distance and entry-zone distance.
- Improved Radar homepage with Ready Now, Watching, Active and Invalid counters.
- Improved Active Trade Monitor with Waiting for price feed, floating R, distance to SL and distance to TP1.
- Scanner still supports manual price fallback plus Finnhub/Twelve Data provider settings.

## Safety rules

- No broker execution.
- No auto-trading.
- No TradingView dependency.
- Live price can only create WATCH / READY / INVALID / TARGET HIT status.
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
git commit -m "Live setup radar V3.1"
git push
```

Vercel will redeploy automatically.

## Free data providers

Settings → Data provider:

- Manual: always works.
- Finnhub: add free Finnhub key.
- Twelve Data: add free Twelve Data key.

Free plans have rate limits and may not support every symbol. The app falls back to manual mode if a symbol fails.
