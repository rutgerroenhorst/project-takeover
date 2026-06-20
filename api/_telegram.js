// Telegram helper (server-side). Underscore prefix = not a public route;
// imported by the webhook. Token/chat id come from env vars only.
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID

function fmtZone(low, high) {
  const l = low || '', h = high || ''
  if (l && h && l !== h) return `${l} – ${h}`
  return String(l || h || '—')
}

function actionFor(status) {
  if (status === 'READY') return 'Setup READY. Confirm in Decision Engine, then execute manually in MT5. No chase.'
  if (status === 'WATCH') return 'Watching. Wait for confirmation. No entry yet.'
  if (status === 'INVALIDATED') return 'Setup invalidated. Stand down. No trade.'
  return 'Logged.'
}

export function buildSignalMessage(s) {
  const head = s.status === 'READY' ? '🚨 READY'
    : s.status === 'WATCH' ? '👀 WATCH'
    : s.status === 'INVALIDATED' ? '❌ INVALIDATED'
    : `• ${s.status}`

  const tps = [s.tp1, s.tp2, s.tp3].filter((x) => x !== '' && x != null && +x !== 0)
  const lines = [
    `${head} — PROJECT TAKEOVER`,
    '',
    `Symbol: ${s.symbol}${s.timeframe ? ` (${s.timeframe})` : ''}`,
    `Direction: ${s.direction || '—'}`,
    `Score: ${s.score ?? 0}/100`,
  ]
  const hasEntry = (s.entry_low && +s.entry_low !== 0) || (s.entry_high && +s.entry_high !== 0)
  if (hasEntry) lines.push(`Entry: ${fmtZone(s.entry_low, s.entry_high)}`)
  if (s.sl && +s.sl !== 0) lines.push(`SL: ${s.sl}`)
  if (tps.length) lines.push(`TP: ${tps.join(' / ')}`)
  if (Array.isArray(s.reason) && s.reason.length) {
    lines.push('', 'Reason:')
    s.reason.forEach((r) => lines.push(`• ${r}`))
  }
  lines.push('', 'Action:', actionFor(s.status))
  return lines.join('\n')
}

export async function sendTelegram(text, chatIdOverride) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN env var.')
  if (!chatId) throw new Error('No chat_id provided and TELEGRAM_CHAT_ID env var is unset.')
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.description || `Telegram HTTP ${res.status}`)
  return data
}
