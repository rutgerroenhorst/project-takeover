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
