import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, Bell, CheckCircle2, Crosshair, Play, Radar, RefreshCw, Settings, Shield, Target, XCircle } from 'lucide-react'

const STORAGE_KEY = 'project_takeover_v5_auto_setup_scanner'

const MARKETS = {
  XAUUSD: { name: 'Gold', symbol: 'XAU/USD', type: 'metal', precision: 2, valid: [1000, 10000] },
  EURUSD: { name: 'Euro / USD', symbol: 'EUR/USD', type: 'fx', precision: 5, valid: [0.5, 2.5] },
  GBPUSD: { name: 'Pound / USD', symbol: 'GBP/USD', type: 'fx', precision: 5, valid: [0.5, 2.5] },
  USDJPY: { name: 'USD / Yen', symbol: 'USD/JPY', type: 'fx', precision: 3, valid: [50, 250] },
}
const MARKET_LIST = Object.keys(MARKETS)
const INTERVALS = ['1day', '4h', '1h', '15min']
const STATUS_ORDER = ['NO DATA', 'NO SETUP', 'FORMING', 'WATCH', 'BOS CONFIRMED', 'READY', 'ACTIVE', 'INVALIDATED', 'MISSED', 'CLOSED']

const RULES = [
  'Geen complete SMC-story = geen setup.',
  'Geen HTF bias = geen setup.',
  'Geen liquidity sweep = geen setup.',
  'Geen 1H BOS / displacement = geen entry.',
  'Geen FVG / OB retest = geen entry.',
  'Geen minimaal 1:3 RR = geen READY alert.',
  'Geen betrouwbare candle data = geen signaal.',
  'Max risk standaard 1%. Jij voert handmatig uit in MT5.',
]

const DEFAULT_SETTINGS = {
  twelveKey: '',
  accountSize: 10000,
  riskPct: 1,
  pollSeconds: 60,
  autoRefresh: false,
  focusMarket: 'XAUUSD',
  alertWatch: true,
  alertReady: true,
  alertInvalid: true,
  telegramBotToken: '',
  telegramChatId: '',
}

const DEFAULT_STATE = {
  settings: DEFAULT_SETTINGS,
  analyses: {},
  candles: {},
  activeTrades: [],
  journal: [],
  alertLog: [],
}

function clone(x) { return JSON.parse(JSON.stringify(x)) }
function uid(prefix = 'ID') { return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}` }
function nowIso() { return new Date().toISOString() }
function today() { return new Date().toISOString().slice(0, 10) }
function n(v) {
  if (v === null || v === undefined || v === '') return null
  const raw = String(v).trim().replace(/\s/g, '')
  const normalized = raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw
  const x = Number(normalized)
  return Number.isFinite(x) ? x : null
}
function fmt(v, sym = 'XAUUSD') {
  const x = n(v)
  if (x === null) return '—'
  return x.toLocaleString(undefined, { maximumFractionDigits: MARKETS[sym]?.precision ?? 2 })
}
function pct(v) { const x = n(v); return x === null ? '—' : `${x.toFixed(1)}%` }
function classForStatus(status) {
  if (status === 'READY') return 'green'
  if (['WATCH', 'BOS CONFIRMED', 'FORMING', 'ACTIVE'].includes(status)) return 'amber'
  if (['INVALIDATED', 'MISSED'].includes(status)) return 'red'
  if (status === 'NO DATA') return 'blue'
  return 'neutral'
}
function safePrice(sym, price) {
  const p = n(price)
  if (p === null || p <= 0) return null
  const [min, max] = MARKETS[sym]?.valid || [0, Infinity]
  return p >= min && p <= max ? p : null
}
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!raw) return clone(DEFAULT_STATE)
    return {
      ...clone(DEFAULT_STATE),
      ...raw,
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      analyses: raw.analyses || {},
      candles: raw.candles || {},
      activeTrades: Array.isArray(raw.activeTrades) ? raw.activeTrades : [],
      journal: Array.isArray(raw.journal) ? raw.journal : [],
      alertLog: Array.isArray(raw.alertLog) ? raw.alertLog : [],
    }
  } catch {
    return clone(DEFAULT_STATE)
  }
}

function parseTwelveCandles(payload) {
  if (!payload || payload.status === 'error' || payload.code || payload.message) {
    throw new Error(payload?.message || payload?.code || 'Twelve Data returned an error')
  }
  const values = payload.values || []
  return values.map(c => ({
    time: c.datetime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse()
}
async function fetchTwelveSeries(sym, interval, apiKey, outputsize = 120) {
  const symbol = MARKETS[sym].symbol
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${outputsize}&apikey=${encodeURIComponent(apiKey)}`
  const r = await fetch(url)
  const j = await r.json()
  return parseTwelveCandles(j)
}
function last(arr) { return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0 }
function body(c) { return Math.abs(c.close - c.open) }
function atr(candles, len = 14) {
  if (!candles || candles.length < 2) return 0
  const slice = candles.slice(-len)
  const trs = slice.map((c, i) => {
    const prev = candles[candles.length - slice.length + i - 1]
    if (!prev) return c.high - c.low
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
  })
  return avg(trs)
}
function ema(values, len) {
  if (!values?.length) return null
  const k = 2 / (len + 1)
  let e = values[0]
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
}
function swingHighs(candles, left = 2, right = 2) {
  const out = []
  for (let i = left; i < candles.length - right; i++) {
    let ok = true
    for (let j = i - left; j <= i + right; j++) if (j !== i && candles[j].high >= candles[i].high) ok = false
    if (ok) out.push({ index: i, price: candles[i].high, time: candles[i].time })
  }
  return out
}
function swingLows(candles, left = 2, right = 2) {
  const out = []
  for (let i = left; i < candles.length - right; i++) {
    let ok = true
    for (let j = i - left; j <= i + right; j++) if (j !== i && candles[j].low <= candles[i].low) ok = false
    if (ok) out.push({ index: i, price: candles[i].low, time: candles[i].time })
  }
  return out
}
function htfBias(d1, h4) {
  const candles = h4?.length >= 60 ? h4 : d1
  if (!candles?.length) return { direction: 'NEUTRAL', reason: 'No HTF candles.' }
  const closes = candles.map(c => c.close)
  const e20 = ema(closes.slice(-80), 20)
  const e50 = ema(closes.slice(-100), 50)
  const p = last(candles).close
  if (e20 && e50 && p > e20 && e20 > e50) return { direction: 'LONG', reason: 'Price above 20/50 EMA structure.' }
  if (e20 && e50 && p < e20 && e20 < e50) return { direction: 'SHORT', reason: 'Price below 20/50 EMA structure.' }
  return { direction: 'NEUTRAL', reason: 'HTF is mixed / mid-range.' }
}
function detectSweep(candles, direction) {
  if (!candles || candles.length < 55) return null
  const recent = candles.slice(-16)
  const prior = candles.slice(-55, -16)
  const priorLow = Math.min(...prior.map(c => c.low))
  const priorHigh = Math.max(...prior.map(c => c.high))
  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i]
    if (direction === 'LONG' && c.low < priorLow && c.close > priorLow) return { ok: true, price: c.low, level: priorLow, time: c.time, text: 'Sell-side liquidity swept and candle closed back above.' }
    if (direction === 'SHORT' && c.high > priorHigh && c.close < priorHigh) return { ok: true, price: c.high, level: priorHigh, time: c.time, text: 'Buy-side liquidity swept and candle closed back below.' }
  }
  return null
}
function detectBos(candles, direction) {
  if (!candles || candles.length < 35) return null
  const recentClose = last(candles).close
  const prior = candles.slice(-35, -4)
  const refHigh = Math.max(...prior.map(c => c.high))
  const refLow = Math.min(...prior.map(c => c.low))
  if (direction === 'LONG' && recentClose > refHigh) return { ok: true, level: refHigh, time: last(candles).time, text: '1H close broke previous structure high.' }
  if (direction === 'SHORT' && recentClose < refLow) return { ok: true, level: refLow, time: last(candles).time, text: '1H close broke previous structure low.' }
  return null
}
function detectDisplacement(candles, direction) {
  if (!candles || candles.length < 40) return null
  const avgBody = avg(candles.slice(-35, -5).map(body))
  const candidates = candles.slice(-8)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i]
    const isDir = direction === 'LONG' ? c.close > c.open : c.close < c.open
    if (isDir && body(c) > avgBody * 1.5) return { ok: true, time: c.time, text: 'Strong displacement candle in trade direction.' }
  }
  return null
}
function detectFvg(candles, direction) {
  if (!candles || candles.length < 10) return null
  const start = Math.max(2, candles.length - 28)
  for (let i = candles.length - 1; i >= start; i--) {
    const a = candles[i - 2]
    const c = candles[i]
    if (!a || !c) continue
    if (direction === 'LONG' && a.high < c.low) {
      return { ok: true, low: a.high, high: c.low, mid: (a.high + c.low) / 2, time: c.time, text: 'Bullish FVG / imbalance detected.' }
    }
    if (direction === 'SHORT' && a.low > c.high) {
      return { ok: true, low: c.high, high: a.low, mid: (c.high + a.low) / 2, time: c.time, text: 'Bearish FVG / imbalance detected.' }
    }
  }
  return null
}
function nearestLiquidity(candles, direction, entry, fallbackRisk) {
  const highs = swingHighs(candles || []).map(s => s.price).filter(p => direction === 'LONG' ? p > entry : p < entry)
  const lows = swingLows(candles || []).map(s => s.price).filter(p => direction === 'LONG' ? p > entry : p < entry)
  const levels = direction === 'LONG' ? highs.sort((a, b) => a - b) : lows.sort((a, b) => b - a)
  return levels[0] || (direction === 'LONG' ? entry + fallbackRisk * 3 : entry - fallbackRisk * 3)
}
function evaluateDirection(sym, bundles, direction) {
  const d1 = bundles['1day'] || []
  const h4 = bundles['4h'] || []
  const h1 = bundles['1h'] || []
  const m15 = bundles['15min'] || []
  const price = safePrice(sym, last(m15)?.close || last(h1)?.close || last(h4)?.close)
  if (!price) return null

  const bias = htfBias(d1, h4)
  const sweep = detectSweep(m15, direction) || detectSweep(h1, direction)
  const bos = detectBos(h1, direction)
  const displacement = detectDisplacement(h1, direction) || detectDisplacement(m15, direction)
  const fvg = detectFvg(m15, direction) || detectFvg(h1, direction)
  const a = atr(m15, 14) || Math.abs(price) * 0.001
  const entry = fvg?.mid || price
  const zoneLow = fvg ? Math.min(fvg.low, fvg.high) : null
  const zoneHigh = fvg ? Math.max(fvg.low, fvg.high) : null
  const retest = fvg ? price >= zoneLow && price <= zoneHigh : false
  const nearZone = fvg ? Math.abs(price - entry) <= a * 0.75 : false
  const sl = direction === 'LONG'
    ? (sweep?.price || Math.min(...m15.slice(-30).map(c => c.low))) - a * 0.2
    : (sweep?.price || Math.max(...m15.slice(-30).map(c => c.high))) + a * 0.2
  const risk = Math.abs(entry - sl)
  const tp1 = nearestLiquidity(h1, direction, entry, risk)
  const tp2 = direction === 'LONG' ? Math.max(...h4.slice(-60).map(c => c.high), tp1) : Math.min(...h4.slice(-60).map(c => c.low), tp1)
  const tp3 = direction === 'LONG' ? entry + risk * 5 : entry - risk * 5
  const rr = risk > 0 ? Math.abs(tp1 - entry) / risk : 0
  const fvgMitigated = fvg ? m15.slice(m15.findIndex(c => c.time === fvg.time) + 1).some(c => c.low <= zoneHigh && c.high >= zoneLow) : false
  const invalidated = direction === 'LONG' ? price <= sl : price >= sl

  const checks = [
    { key: 'htf', label: 'HTF bias in trade direction', ok: bias.direction === direction, detail: bias.reason, weight: 15 },
    { key: 'sweep', label: 'External liquidity sweep', ok: !!sweep, detail: sweep?.text || 'No recent sweep confirmed.', weight: 20 },
    { key: 'bos', label: '1H BOS / structure break', ok: !!bos, detail: bos?.text || 'No valid 1H structure break yet.', weight: 20 },
    { key: 'displacement', label: 'Displacement candle', ok: !!displacement, detail: displacement?.text || 'No strong impulse candle yet.', weight: 15 },
    { key: 'fvg', label: 'Refined FVG / imbalance zone', ok: !!fvg, detail: fvg?.text || 'No clean FVG / imbalance zone.', weight: 15 },
    { key: 'fresh', label: 'Zone is not over-mitigated', ok: !!fvg && !fvgMitigated, detail: fvg ? (fvgMitigated ? 'Zone has already been touched. Treat as lower quality.' : 'Zone still fresh enough.') : 'No zone.', weight: 10 },
    { key: 'retest', label: 'Price retesting entry zone', ok: retest, detail: fvg ? (retest ? 'Price is inside the FVG zone.' : nearZone ? 'Price is near the zone, not inside yet.' : 'Price is not at entry yet.') : 'No entry zone.', weight: 10 },
    { key: 'rr', label: 'RR filter valid', ok: rr >= 3, detail: rr ? `Estimated RR to TP1: ${rr.toFixed(2)}R` : 'No RR.', weight: 10 },
  ]
  const max = checks.reduce((a, c) => a + c.weight, 0)
  const score = Math.round(checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0) / max * 100)
  let status = 'NO SETUP'
  let next = 'Do nothing. No complete SMC story.'
  if (invalidated && score >= 60) { status = 'INVALIDATED'; next = 'Setup invalidated. No trade.' }
  else if (sweep && !bos) { status = 'WATCH'; next = 'Wait for 1H BOS / displacement. No trade yet.' }
  else if (sweep && bos && !retest) { status = 'BOS CONFIRMED'; next = 'Wait for retest into refined FVG / OB zone.' }
  else if (score >= 80 && retest && rr >= 3) { status = 'READY'; next = 'Open MT5. Place trade only if price is still inside entry zone.' }
  else if (score >= 60) { status = 'WATCH'; next = 'Setup forming. Wait for missing confirmations.' }
  else if (score >= 40) { status = 'FORMING'; next = 'Early structure only. No trade.' }

  return {
    id: `${sym}-${direction}-${Date.now()}`,
    sym,
    direction,
    status,
    score,
    price,
    updated: nowIso(),
    next,
    bias,
    checks,
    setup: {
      entryLow: zoneLow,
      entryHigh: zoneHigh,
      entry: entry,
      sl,
      tp1,
      tp2,
      tp3,
      rr,
      risk,
      source: fvg ? `${fvg.text} @ ${fvg.time}` : 'No refined zone yet',
    },
  }
}
function analyzeMarket(sym, bundles) {
  const hasEnough = INTERVALS.every(tf => bundles?.[tf]?.length >= 40)
  if (!hasEnough) {
    return { sym, status: 'NO DATA', score: 0, updated: nowIso(), error: 'Not enough candle data. Need D1/4H/1H/15M.', checks: [], setup: {}, price: null, next: 'Fix API key or wait for data.' }
  }
  const long = evaluateDirection(sym, bundles, 'LONG')
  const short = evaluateDirection(sym, bundles, 'SHORT')
  const best = [long, short].filter(Boolean).sort((a, b) => b.score - a.score)[0]
  if (!best) return { sym, status: 'NO DATA', score: 0, updated: nowIso(), error: 'No valid latest price.', checks: [], setup: {}, price: null, next: 'No usable price.' }
  return best
}
function estimateLot(sym, accountSize, riskPct, entry, sl) {
  const e = n(entry), s = n(sl), acct = n(accountSize) || 0, risk = n(riskPct) || 0
  if (e === null || s === null || e === s) return null
  const riskUsd = acct * risk / 100
  const dist = Math.abs(e - s)
  let oneLotPerPoint = 100000
  if (sym === 'XAUUSD') oneLotPerPoint = 100
  if (sym === 'USDJPY') oneLotPerPoint = 1000
  const lot = riskUsd / (dist * oneLotPerPoint)
  return { riskUsd, lot: Math.max(0, lot), stopDistance: dist }
}
function telegramText(analysis) {
  const s = analysis.setup || {}
  const checks = (analysis.checks || []).map(c => `${c.ok ? '✅' : '❌'} ${c.label}`).join('\n')
  return `🚨 <b>${analysis.status} — ${analysis.sym} ${analysis.direction}</b>\n\nScore: ${analysis.score}/100\nPrice: ${fmt(analysis.price, analysis.sym)}\n\nEntry: ${fmt(s.entryLow, analysis.sym)} - ${fmt(s.entryHigh, analysis.sym)}\nSL: ${fmt(s.sl, analysis.sym)}\nTP1: ${fmt(s.tp1, analysis.sym)}\nTP2: ${fmt(s.tp2, analysis.sym)}\nTP3: ${fmt(s.tp3, analysis.sym)}\nRR: ${s.rr ? s.rr.toFixed(2) : '—'}R\n\n${checks}\n\nAction:\n${analysis.next}`
}
async function sendTelegram(settings, text) {
  if (!settings.telegramBotToken || !settings.telegramChatId) throw new Error('Telegram token/chat ID missing')
  const r = await fetch('/api/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botToken: settings.telegramBotToken, chatId: settings.telegramChatId, text })
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.ok === false) throw new Error(j.error || j.description || 'Telegram failed')
  return j
}

function Badge({ children, tone = 'neutral' }) { return <span className={`badge ${tone}`}>{children}</span> }
function Button({ children, tone = 'primary', ...props }) { return <button className={`btn ${tone}`} {...props}>{children}</button> }
function Card({ children, className = '' }) { return <section className={`card ${className}`}>{children}</section> }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }
function Input(props) { return <input className="input" {...props} /> }
function Select(props) { return <select className="input" {...props} /> }
function Area(props) { return <textarea className="input area" {...props} /> }
function CheckRow({ c }) { return <div className="check-row"><span className={c.ok ? 'ok' : 'no'}>{c.ok ? '✅' : '❌'}</span><div><b>{c.label}</b><small>{c.detail}</small></div></div> }
function MiniChart({ candles = [], analysis }) {
  const data = candles.slice(-80)
  if (data.length < 2) return <div className="chart-empty">No chart data yet</div>
  const w = 680, h = 220, pad = 20
  const highs = data.map(c => c.high), lows = data.map(c => c.low)
  const min = Math.min(...lows, analysis?.setup?.sl ?? Infinity, analysis?.setup?.entryLow ?? Infinity)
  const max = Math.max(...highs, analysis?.setup?.tp1 ?? -Infinity, analysis?.setup?.entryHigh ?? -Infinity)
  const x = i => pad + i * ((w - pad * 2) / (data.length - 1))
  const y = v => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)
  const path = data.map((c, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(c.close)}`).join(' ')
  const lines = []
  const addLine = (value, label, cls) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return
    lines.push(<g key={label}><line className={cls} x1={pad} x2={w-pad} y1={y(value)} y2={y(value)} /><text x={w-pad-5} y={y(value)-4} textAnchor="end" className="chart-label">{label}</text></g>)
  }
  addLine(analysis?.setup?.entryLow, 'entry low', 'entry-line')
  addLine(analysis?.setup?.entryHigh, 'entry high', 'entry-line')
  addLine(analysis?.setup?.sl, 'SL', 'sl-line')
  addLine(analysis?.setup?.tp1, 'TP1', 'tp-line')
  return <svg className="mini-chart" viewBox={`0 0 ${w} ${h}`} role="img"><path d={path} className="price-path" />{lines}</svg>
}

export default function App() {
  const [state, setState] = useState(loadState)
  const [page, setPage] = useState('radar')
  const [selected, setSelected] = useState(state.settings.focusMarket || 'XAUUSD')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lastScanRef = useRef(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }, [state])
  const update = fn => setState(s => typeof fn === 'function' ? fn(clone(s)) : fn)

  const selectedAnalysis = state.analyses[selected]
  const selectedCandles = state.candles[selected]?.['15min'] || []
  const sortedAnalyses = useMemo(() => MARKET_LIST.map(sym => state.analyses[sym] || { sym, status: 'NO DATA', score: 0, next: 'Not scanned yet.', setup: {}, checks: [] }).sort((a, b) => b.score - a.score), [state.analyses])
  const ready = sortedAnalyses.filter(a => a.status === 'READY')
  const watch = sortedAnalyses.filter(a => ['WATCH', 'BOS CONFIRMED', 'FORMING'].includes(a.status))

  async function handleAlerts(analysis) {
    const s = state.settings
    const wants = (analysis.status === 'READY' && s.alertReady) || (analysis.status === 'WATCH' && s.alertWatch) || (analysis.status === 'BOS CONFIRMED' && s.alertWatch) || (analysis.status === 'INVALIDATED' && s.alertInvalid)
    if (!wants || !s.telegramBotToken || !s.telegramChatId) return
    const key = `${analysis.sym}-${analysis.direction}-${analysis.status}-${Math.floor(Date.now() / 1000 / 60 / 30)}`
    if (state.alertLog.some(a => a.key === key)) return
    try {
      await sendTelegram(s, telegramText(analysis))
      update(d => { d.alertLog.unshift({ key, time: nowIso(), sym: analysis.sym, status: analysis.status, ok: true }); return d })
    } catch (err) {
      update(d => { d.alertLog.unshift({ key, time: nowIso(), sym: analysis.sym, status: analysis.status, ok: false, error: err.message }); return d })
    }
  }

  async function scanMarket(sym = selected) {
    if (!state.settings.twelveKey) { setMessage('Add your Twelve Data API key in Settings first.'); return }
    setBusy(true); setMessage(`Scanning ${sym} candle data...`)
    try {
      const bundles = {}
      for (const interval of INTERVALS) {
        const size = interval === '1day' ? 100 : 120
        bundles[interval] = await fetchTwelveSeries(sym, interval, state.settings.twelveKey, size)
      }
      const analysis = analyzeMarket(sym, bundles)
      update(d => {
        d.candles[sym] = bundles
        d.analyses[sym] = analysis
        d.settings.focusMarket = sym
        return d
      })
      lastScanRef.current = nowIso()
      setMessage(`${sym} scanned: ${analysis.status} / score ${analysis.score}.`)
      setSelected(sym)
      setTimeout(() => handleAlerts(analysis), 0)
    } catch (err) {
      const analysis = { sym, status: 'NO DATA', score: 0, error: err.message, updated: nowIso(), next: 'Fix API key / rate limit / symbol access.', checks: [], setup: {} }
      update(d => { d.analyses[sym] = analysis; return d })
      setMessage(`${sym} scan failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!state.settings.autoRefresh) return
    const sec = Math.max(60, Number(state.settings.pollSeconds) || 60)
    const id = setInterval(() => scanMarket(selected), sec * 1000)
    return () => clearInterval(id)
  }, [state.settings.autoRefresh, state.settings.pollSeconds, selected, state.settings.twelveKey])

  function markTradeTaken(analysis) {
    const est = estimateLot(analysis.sym, state.settings.accountSize, state.settings.riskPct, analysis.setup.entry, analysis.setup.sl)
    update(d => {
      d.activeTrades.unshift({
        id: uid('T'),
        date: nowIso(),
        sym: analysis.sym,
        direction: analysis.direction,
        entry: analysis.setup.entry,
        entryLow: analysis.setup.entryLow,
        entryHigh: analysis.setup.entryHigh,
        sl: analysis.setup.sl,
        tp1: analysis.setup.tp1,
        tp2: analysis.setup.tp2,
        tp3: analysis.setup.tp3,
        rr: analysis.setup.rr,
        lotEstimate: est?.lot || null,
        riskUsd: est?.riskUsd || null,
        status: 'ACTIVE',
        setupScore: analysis.score,
        evidence: analysis.checks,
      })
      return d
    })
    setMessage('Trade marked ACTIVE. Execute manually in MT5 and manage from Active Trades.')
  }
  function closeTrade(id, result, r) {
    update(d => {
      const idx = d.activeTrades.findIndex(t => t.id === id)
      if (idx >= 0) {
        const t = d.activeTrades[idx]
        d.activeTrades.splice(idx, 1)
        d.journal.unshift({ ...t, closed: nowIso(), result, r, lesson: '', mistake: result === 'loss' ? 'Review execution vs checklist' : 'Process followed' })
      }
      return d
    })
  }

  const tabs = [
    ['radar', 'Radar', Radar], ['scanner', 'Scanner', Crosshair], ['evidence', 'Evidence', Shield], ['setups', 'Setups', Target], ['active', 'Active', Activity], ['telegram', 'Telegram', Bell], ['settings', 'Settings', Settings],
  ]

  return <div className="app">
    <header className="topbar">
      <div><h1>Project Takeover V5</h1><p>Auto Setup Scanner — real-time candles → SMC checklist → setup alert → MT5 execution.</p></div>
      <div className="top-actions"><Badge tone={classForStatus(selectedAnalysis?.status || 'NO DATA')}>{selectedAnalysis?.status || 'NO DATA'}</Badge><Button tone="ghost" onClick={() => scanMarket(selected)} disabled={busy}>{busy ? <RefreshCw className="spin" size={16}/> : <RefreshCw size={16}/>} Scan</Button></div>
    </header>

    <nav className="tabs">{tabs.map(([id, label, Icon]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={16}/>{label}</button>)}</nav>
    {message && <div className="notice">{message}</div>}

    {page === 'radar' && <main className="grid two">
      <Card className="hero">
        <div className="hero-head"><div><h2>Live Radar</h2><p>De app geeft alleen setups als de volledige checklist genoeg bewijs heeft. Geen data = geen signaal.</p></div><Badge tone="green">{ready.length} ready</Badge></div>
        <div className="stats"><div><b>{ready.length}</b><span>READY</span></div><div><b>{watch.length}</b><span>FORMING / WATCH</span></div><div><b>{state.activeTrades.length}</b><span>ACTIVE</span></div><div><b>{lastScanRef.current ? new Date(lastScanRef.current).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—'}</b><span>LAST SCAN</span></div></div>
        <div className="market-list">
          {sortedAnalyses.map(a => <button key={a.sym} className={`market-row ${selected === a.sym ? 'selected' : ''}`} onClick={() => { setSelected(a.sym); setPage('evidence') }}>
            <div><b>{a.sym}</b><small>{MARKETS[a.sym]?.name}</small></div>
            <div><Badge tone={classForStatus(a.status)}>{a.status}</Badge><span className="score">{a.score}/100</span></div>
            <small>{a.next || a.error || 'Not scanned yet.'}</small>
          </button>)}
        </div>
      </Card>
      <Card>
        <h2>Rules Engine</h2>
        <div className="rules">{RULES.map((r, i) => <div key={i}><CheckCircle2 size={16}/><span>{r}</span></div>)}</div>
        <div className="warning"><AlertTriangle size={18}/><span>Dit is een scanner en decision assistant, geen garantie op winst. Jij voert handmatig uit in MT5 na de alert.</span></div>
      </Card>
    </main>}

    {page === 'scanner' && <main className="grid two">
      <Card>
        <h2>Auto Scanner</h2>
        <p className="muted">Free Twelve Data heeft lage limieten. Scan daarom eerst één focus market per keer. XAUUSD is de primaire desk.</p>
        <Field label="Focus market"><Select value={selected} onChange={e => setSelected(e.target.value)}>{MARKET_LIST.map(s => <option key={s}>{s}</option>)}</Select></Field>
        <div className="button-row"><Button onClick={() => scanMarket(selected)} disabled={busy}><Play size={16}/> Scan {selected}</Button><Button tone="ghost" onClick={() => { const next = MARKET_LIST[(MARKET_LIST.indexOf(selected)+1)%MARKET_LIST.length]; setSelected(next); scanMarket(next) }} disabled={busy}>Scan next</Button></div>
        <div className="scan-info"><b>Wat hij ophaalt:</b><span>D1 candles</span><span>4H candles</span><span>1H candles</span><span>15M candles</span></div>
      </Card>
      <Card>
        <h2>{selected} mini chart</h2>
        <MiniChart candles={selectedCandles} analysis={selectedAnalysis}/>
        <p className="muted">Deze mini chart is alleen om zones/price visueel te zien. Diepe visuele analyse doe je nog steeds in TradingView.</p>
      </Card>
    </main>}

    {page === 'evidence' && <main className="grid two">
      <Card>
        <div className="card-head"><div><h2>{selected} Evidence Board</h2><p>{MARKETS[selected]?.name} · {MARKETS[selected]?.symbol}</p></div><Badge tone={classForStatus(selectedAnalysis?.status || 'NO DATA')}>{selectedAnalysis?.status || 'NO DATA'}</Badge></div>
        <div className="big-score"><b>{selectedAnalysis?.score ?? 0}</b><span>/100</span></div>
        <p className="next-action"><b>Next:</b> {selectedAnalysis?.next || selectedAnalysis?.error || 'Scan market first.'}</p>
        <div className="checks">{(selectedAnalysis?.checks || []).length ? selectedAnalysis.checks.map(c => <CheckRow key={c.key} c={c}/>) : <p className="muted">No evidence yet. Scan {selected} first.</p>}</div>
      </Card>
      <Card>
        <h2>Detected Setup</h2>
        {selectedAnalysis?.setup?.entry ? <SetupDetails analysis={selectedAnalysis} settings={state.settings} onTake={() => markTradeTaken(selectedAnalysis)} /> : <p className="muted">No setup zone detected yet.</p>}
      </Card>
    </main>}

    {page === 'setups' && <main className="grid two">
      {sortedAnalyses.map(a => <Card key={a.sym}>
        <div className="card-head"><div><h2>{a.sym} {a.direction || ''}</h2><p>{a.next || a.error || 'Not scanned yet.'}</p></div><Badge tone={classForStatus(a.status)}>{a.status}</Badge></div>
        <MiniChart candles={state.candles[a.sym]?.['15min'] || []} analysis={a}/>
        {a.setup?.entry ? <SetupDetails analysis={a} settings={state.settings} onTake={() => markTradeTaken(a)} compact/> : <p className="muted">No automatic setup zone yet.</p>}
      </Card>)}
    </main>}

    {page === 'active' && <main className="grid two">
      <Card><h2>Active Trades</h2>{state.activeTrades.length === 0 && <p className="muted">No active trades yet.</p>}{state.activeTrades.map(t => <TradeCard key={t.id} t={t} analysis={state.analyses[t.sym]} onClose={closeTrade}/>)}</Card>
      <Card><h2>Journal</h2>{state.journal.length === 0 && <p className="muted">Closed trades will appear here.</p>}{state.journal.slice(0,8).map(j => <div className="journal-row" key={j.id}><b>{j.sym} {j.direction}</b><span>{j.result} · {j.r}R</span><small>{new Date(j.closed).toLocaleString()}</small></div>)}</Card>
    </main>}

    {page === 'telegram' && <main className="grid two">
      <Card><h2>Telegram Alerts</h2><p className="muted">Alerts sturen bij WATCH / READY / INVALIDATED. Token staat alleen in jouw browser localStorage en wordt gebruikt via de Vercel API route.</p>
        <Field label="Bot token"><Input value={state.settings.telegramBotToken} onChange={e => update(d => { d.settings.telegramBotToken = e.target.value; return d })} placeholder="123456:ABC..."/></Field>
        <Field label="Chat ID"><Input value={state.settings.telegramChatId} onChange={e => update(d => { d.settings.telegramChatId = e.target.value; return d })} placeholder="123456789"/></Field>
        <div className="toggles"><label><input type="checkbox" checked={state.settings.alertWatch} onChange={e => update(d => { d.settings.alertWatch = e.target.checked; return d })}/> WATCH</label><label><input type="checkbox" checked={state.settings.alertReady} onChange={e => update(d => { d.settings.alertReady = e.target.checked; return d })}/> READY</label><label><input type="checkbox" checked={state.settings.alertInvalid} onChange={e => update(d => { d.settings.alertInvalid = e.target.checked; return d })}/> INVALID</label></div>
        <Button onClick={async () => { try { await sendTelegram(state.settings, '✅ Project Takeover V5 test alert werkt.'); setMessage('Telegram test sent.') } catch(e) { setMessage(e.message) } }}>Send test alert</Button>
      </Card>
      <Card><h2>Alert Log</h2>{state.alertLog.length === 0 && <p className="muted">No alerts sent yet.</p>}{state.alertLog.slice(0,10).map(a => <div className="journal-row" key={a.key + a.time}><b>{a.sym} {a.status}</b><span>{a.ok ? 'sent' : 'failed'}</span><small>{a.error || new Date(a.time).toLocaleString()}</small></div>)}</Card>
    </main>}

    {page === 'settings' && <main className="grid two">
      <Card><h2>Data Settings</h2>
        <Field label="Twelve Data API key"><Input value={state.settings.twelveKey} onChange={e => update(d => { d.settings.twelveKey = e.target.value; return d })} placeholder="paste key"/></Field>
        <Field label="Poll seconds"><Input type="number" min="60" value={state.settings.pollSeconds} onChange={e => update(d => { d.settings.pollSeconds = Number(e.target.value); return d })}/></Field>
        <div className="toggles"><label><input type="checkbox" checked={state.settings.autoRefresh} onChange={e => update(d => { d.settings.autoRefresh = e.target.checked; return d })}/> Auto-refresh selected market</label></div>
        <div className="warning"><AlertTriangle size={18}/><span>Gebruik 60s+ polling. Free plan rate-limit: scan niet alle markten tegelijk.</span></div>
      </Card>
      <Card><h2>Risk Settings</h2>
        <Field label="Account size"><Input type="number" value={state.settings.accountSize} onChange={e => update(d => { d.settings.accountSize = Number(e.target.value); return d })}/></Field>
        <Field label="Risk %"><Input type="number" step="0.1" max="1" value={state.settings.riskPct} onChange={e => update(d => { d.settings.riskPct = Number(e.target.value); return d })}/></Field>
        <Button tone="danger" onClick={() => { if(confirm('Reset V5 local data?')) setState(clone(DEFAULT_STATE)) }}>Reset app data</Button>
      </Card>
    </main>}
  </div>
}

function SetupDetails({ analysis, settings, onTake, compact = false }) {
  const s = analysis.setup || {}
  const est = estimateLot(analysis.sym, settings.accountSize, settings.riskPct, s.entry, s.sl)
  const canTake = analysis.status === 'READY'
  return <div className="setup-details">
    <div className="levels">
      <div><span>Entry zone</span><b>{fmt(s.entryLow, analysis.sym)} - {fmt(s.entryHigh, analysis.sym)}</b></div>
      <div><span>SL</span><b>{fmt(s.sl, analysis.sym)}</b></div>
      <div><span>TP1</span><b>{fmt(s.tp1, analysis.sym)}</b></div>
      <div><span>TP2</span><b>{fmt(s.tp2, analysis.sym)}</b></div>
      {!compact && <div><span>TP3</span><b>{fmt(s.tp3, analysis.sym)}</b></div>}
      <div><span>RR</span><b>{s.rr ? s.rr.toFixed(2) : '—'}R</b></div>
      <div><span>Lot estimate</span><b>{est ? est.lot.toFixed(3) : '—'}</b></div>
      <div><span>Risk</span><b>${est ? est.riskUsd.toFixed(0) : '—'}</b></div>
    </div>
    <p className="muted">Source: {s.source || '—'}</p>
    <Button tone={canTake ? 'primary' : 'ghost'} disabled={!canTake} onClick={onTake}>{canTake ? 'Trade placed in MT5' : 'No execution yet'}</Button>
  </div>
}
function TradeCard({ t, analysis, onClose }) {
  const price = analysis?.price
  const r = price && t.entry && t.sl ? ((t.direction === 'LONG' ? price - t.entry : t.entry - price) / Math.abs(t.entry - t.sl)) : null
  return <div className="trade-card">
    <div className="card-head"><div><b>{t.sym} {t.direction}</b><small>{t.id}</small></div><Badge tone="amber">ACTIVE</Badge></div>
    <div className="levels"><div><span>Entry</span><b>{fmt(t.entry, t.sym)}</b></div><div><span>SL</span><b>{fmt(t.sl, t.sym)}</b></div><div><span>TP1</span><b>{fmt(t.tp1, t.sym)}</b></div><div><span>Floating</span><b>{r === null ? '—' : `${r.toFixed(2)}R`}</b></div></div>
    <div className="button-row"><Button tone="ghost" onClick={() => onClose(t.id, 'win', 2)}>Close win</Button><Button tone="danger" onClick={() => onClose(t.id, 'loss', -1)}>Close loss</Button><Button tone="ghost" onClick={() => onClose(t.id, 'breakeven', 0)}>BE</Button></div>
  </div>
}
