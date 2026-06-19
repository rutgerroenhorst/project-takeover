# Project Takeover V4 — Action Desk

Manual trading desk for phone-first action.

## What is new

- Action Desk page: READY / WATCH / ACTIVE / INVALID overview
- New Setup page: create a trade plan from TradingView
- Mark trade as placed in MT5
- Active Trades + Journal flow
- Smart provider router option
- Better price validation for XAUUSD / FX / proxy markets
- Manual price input handles Dutch format like `2.325` for gold as `2325`
- Provider errors become NO DATA instead of fake TP / TARGET HIT

## Intended workflow

TradingView = analysis.
Project Takeover = setup plan, risk, action, tracking, journal.
MT5 = manual execution for now.

## Run

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub. Vercel will build with `npm run build`.

## Safety

This app does not place broker orders. Verify every setup in TradingView/MT5. API keys stored in browser localStorage are not secret.
