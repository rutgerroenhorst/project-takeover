// POST /api/tradingview-webhook
// TradingView alert -> validate secret -> normalize -> store -> Telegram.
import { saveSignal, storageProvider } from './_signalStore.js'
import { sendTelegram, buildSignalMessage } from './_telegram.js'

const VALID_STATUS = ['NO_SETUP', 'FORMING', 'WATCH', 'BOS_CONFIRMED', 'READY', 'INVALIDATED']
const NOTIFY = ['WATCH', 'READY', 'INVALIDATED']

const numOr0 = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }

function toReasonArray(r) {
  if (Array.isArray(r)) return r.map(String)
  if (typeof r === 'string' && r.trim()) return r.split(',').map((x) => x.trim()).filter(Boolean)
  return []
}

function normalize(body) {
  const status = VALID_STATUS.includes(body.status) ? body.status : 'NO_SETUP'
  const symbol = String(body.symbol || 'UNKNOWN')
  const timeframe = String(body.timeframe || '')
  const created_at = new Date().toISOString()
  const id = `${symbol}-${timeframe || 'tf'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  return {
    id,
    symbol,
    timeframe,
    status,
    direction: body.direction === 'SHORT' ? 'SHORT' : body.direction === 'LONG' ? 'LONG' : '',
    score: Math.max(0, Math.min(100, Math.round(numOr0(body.score)))),
    entry_low: numOr0(body.entry_low),
    entry_high: numOr0(body.entry_high),
    sl: numOr0(body.sl),
    tp1: numOr0(body.tp1),
    tp2: numOr0(body.tp2),
    tp3: numOr0(body.tp3),
    reason: toReasonArray(body.reason),
    source_timestamp: body.timestamp != null ? String(body.timestamp) : '',
    created_at,
    raw: body,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' })
    return
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  if (!body || typeof body !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid or missing JSON body.' })
    return
  }

  const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET
  if (!secret) {
    res.status(500).json({ ok: false, error: 'Server missing TRADINGVIEW_WEBHOOK_SECRET.' })
    return
  }
  if (body.secret !== secret) {
    res.status(401).json({ ok: false, error: 'Invalid secret.' })
    return
  }

  const signal = normalize(body)

  let stored = false, storeError = null
  try { await saveSignal(signal); stored = true }
  catch (e) { storeError = e.message }

  // Server-side Telegram is OFF by default so the app is the single alert
  // source (chat_id lives in the app, with de-dup + log). Set
  // TELEGRAM_SERVER_ALERTS=1 to also send from the webhook (uses env chat_id).
  let telegram = 'skipped'
  if (process.env.TELEGRAM_SERVER_ALERTS === '1' && NOTIFY.includes(signal.status)) {
    try { await sendTelegram(buildSignalMessage(signal)); telegram = 'sent' }
    catch (e) { telegram = `error: ${e.message}` }
  }

  res.status(200).json({
    ok: true,
    id: signal.id,
    storage: storageProvider(),
    stored,
    storeError,
    telegram,
    signal,
  })
}
