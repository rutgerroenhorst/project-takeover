// Storage wrapper for TradingView signals.
// Dependency-free: uses REST (fetch) so no npm packages are needed and the
// Vite build is unaffected. Picks a backend from whatever env vars exist:
//   1. Supabase   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)   [preferred]
//   2. Upstash    (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//   3. In-memory  (ephemeral — fine for a quick test, lost on cold start)
//
// Stored signal shape:
//   id, symbol, timeframe, status, direction, score,
//   entry_low, entry_high, sl, tp1, tp2, tp3, reason[], created_at, raw

const LIST_KEY = 'pt:signals'
const CAP = 100

function provider() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return 'supabase'
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return 'upstash'
  return 'memory'
}

/* ---------- in-memory fallback (per warm lambda) ---------- */
const _mem = (globalThis.__pt_signals ||= [])

/* ---------- Upstash REST ---------- */
async function redis(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `Upstash HTTP ${res.status}`)
  return data.result
}

/* ---------- Supabase REST ---------- */
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

/* ---------- public API ---------- */
export async function saveSignal(signal) {
  const p = provider()
  if (p === 'supabase') {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/signals`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(signal),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Supabase insert failed (${res.status}). ${txt}`)
    }
    return
  }
  if (p === 'upstash') {
    await redis(['LPUSH', LIST_KEY, JSON.stringify(signal)])
    await redis(['LTRIM', LIST_KEY, '0', String(CAP - 1)])
    return
  }
  // memory
  _mem.unshift(signal)
  if (_mem.length > CAP) _mem.length = CAP
}

export async function listSignals(limit = 50) {
  const p = provider()
  if (p === 'supabase') {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/signals?select=*&order=created_at.desc&limit=${limit}`,
      { headers: sbHeaders() }
    )
    if (!res.ok) throw new Error(`Supabase select failed (${res.status}).`)
    return await res.json()
  }
  if (p === 'upstash') {
    const result = await redis(['LRANGE', LIST_KEY, '0', String(limit - 1)])
    return (result || []).map((s) => { try { return JSON.parse(s) } catch { return null } }).filter(Boolean)
  }
  return _mem.slice(0, limit)
}

export function storageProvider() { return provider() }
