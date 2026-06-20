# Project Takeover V5 — Auto Setup Scanner

This version is no longer a manual setup desk. It is an automatic SMC setup scanner prototype.

## Core workflow

Real-time Twelve Data candles → SMC checklist engine → setup score → WATCH / READY / INVALIDATED → optional Telegram alert → manual MT5 execution.

## Markets

V5 focuses only on:

- XAUUSD
- EURUSD
- GBPUSD
- USDJPY

NQ/ES are intentionally parked because free futures data/proxy feeds were not reliable enough.

## What the scanner checks

- HTF bias from D1 / 4H candles
- External liquidity sweep
- 1H BOS / structure break
- Displacement candle
- Refined FVG / imbalance zone
- Freshness / mitigation
- Retest into entry zone
- RR filter

## Important

This is a decision-assistant and scanner, not a profit guarantee and not auto-execution. The user still executes manually in MT5.

## Install

```bash
cd ~/Downloads
unzip -o project-takeover-v5-auto-scanner.zip
rsync -av project-takeover-v5-auto-scanner/ project-takeover/
cd project-takeover
rm -rf node_modules package-lock.json
npm install
npm run build
git add .
git commit -m "Add V5 auto setup scanner"
git push -f origin main
```

## Settings

Add your Twelve Data API key in Settings. Keep polling at 60 seconds or higher because the free plan has strict request limits.

Telegram is optional. Add bot token and chat ID on the Telegram page, then test alert.

---

# V7 — TradingView → Webhook → Telegram signal system

Adds a server-side signal pipeline alongside the V5 scanner:
**TradingView Pine alert → `/api/tradingview-webhook` → storage → Telegram (server-side) → Signals tab.**
This proves signal quality. No auto-trading, no broker execution — you place every trade manually in MT5. Not financial advice; not a profitability claim.

## V7 files added
- `tradingview/project_takeover_smc_scanner.pine` — SMC scanner that emits the alert JSON.
- `api/tradingview-webhook.js` — validates the secret, normalizes, stores, sends Telegram when `TELEGRAM_SERVER_ALERTS=1`.
- `api/signals.js` — GET endpoint the Signals tab reads.
- `api/_signalStore.js` — storage wrapper (Supabase → Upstash → in-memory).
- `api/_telegram.js` — server-side Telegram helper (token from env only).
- `src/SignalsInbox.jsx` — the Signals tab UI (Sync button + READY/WATCH/INVALIDATED cards).

(The existing `api/telegram.js` and the app's own Telegram tab are unchanged.)

## Vercel environment variables
See `.env.example`. Set in Vercel → Settings → Environment Variables, then redeploy:
- `TRADINGVIEW_WEBHOOK_SECRET` — must match the Pine "Webhook secret" input.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- `TELEGRAM_SERVER_ALERTS=1` (so alerts fire even when the app is closed).
- Storage (one set): `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. None = ephemeral in-memory.

Supabase table (if using Supabase):
```sql
create table if not exists signals (
  id text primary key,
  symbol text, timeframe text, status text, direction text,
  score int,
  entry_low double precision, entry_high double precision,
  sl double precision, tp1 double precision, tp2 double precision, tp3 double precision,
  reason jsonb, source_timestamp text,
  created_at timestamptz default now(),
  raw jsonb
);
```

## TradingView setup
1. Pine Editor → paste `tradingview/project_takeover_smc_scanner.pine` → Save → Add to chart.
2. Indicator Settings → set "Webhook secret" to the same value as `TRADINGVIEW_WEBHOOK_SECRET`.
3. Create Alert → Condition: the indicator + "Any alert() function call".
4. Notifications → Webhook URL: `https://<your-app>.vercel.app/api/tradingview-webhook` → Create.
   (Webhook alerts require a paid TradingView plan.)

## Test one fake READY signal (curl)
```bash
curl -X POST https://<your-app>.vercel.app/api/tradingview-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "YOUR_SECRET",
    "symbol": "XAUUSD",
    "timeframe": "15",
    "status": "READY",
    "direction": "LONG",
    "score": 91,
    "entry_low": 2327, "entry_high": 2330, "sl": 2321,
    "tp1": 2340, "tp2": 2358, "tp3": 2380,
    "reason": ["liquidity sweep", "BOS confirmed", "retest"],
    "timestamp": "1750000000"
  }'
```
Expected: `{ "ok": true, "stored": true, "storage": "supabase", "telegram": "sent", ... }`, a Telegram message arrives, and the **Signals** tab shows the setup after pressing **Sync**.
A wrong secret returns `401 { "ok": false, "error": "Invalid secret." }`.
