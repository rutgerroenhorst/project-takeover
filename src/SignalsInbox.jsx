import React, { useState } from 'react'
import { RefreshCw } from 'lucide-react'

// V7 Signal Inbox — reads signals stored by /api/tradingview-webhook.
// Self-contained: holds its own state, no app globals, no localStorage.
// Styled with the app's existing CSS classes (card / badge / btn / etc).

const NOTIFY = ['READY', 'WATCH', 'INVALIDATED']
const toneFor = (s) => (s === 'READY' ? 'green' : s === 'WATCH' ? 'amber' : s === 'INVALIDATED' ? 'red' : 'neutral')
const fmt = (v) => (v == null || +v === 0 ? '—' : String(v))
const ago = (iso) => {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleString()
}

export default function SignalsInbox() {
  const [signals, setSignals] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function sync() {
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/signals?limit=50')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSignals(Array.isArray(data.signals) ? data.signals : [])
      setMsg(`Synced ${data.signals?.length || 0} signal(s) from ${data.storage}.`)
    } catch (e) {
      setMsg(`Sync failed: ${e.message} (works on the deployed site / vercel dev).`)
    }
    setBusy(false)
  }

  const shown = signals.filter((s) => NOTIFY.includes(s.status))
  const count = (st) => signals.filter((s) => s.status === st).length

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><h2>Signal Inbox</h2><p className="muted">Setups from the TradingView webhook. You execute manually in MT5.</p></div>
          <button className="btn primary" onClick={sync} disabled={busy}>
            {busy ? <RefreshCw className="spin" size={16} /> : <RefreshCw size={16} />} Sync
          </button>
        </div>
        <div className="stats">
          <div><b>{count('READY')}</b><span>READY</span></div>
          <div><b>{count('WATCH')}</b><span>WATCH</span></div>
          <div><b>{count('INVALIDATED')}</b><span>INVALIDATED</span></div>
        </div>
        {msg && <div className="notice">{msg}</div>}
      </section>

      <section className="card">
        <h2>Live Setups</h2>
        {shown.length === 0 && <p className="muted">No READY / WATCH / INVALIDATED signals yet. Press Sync after a webhook arrives.</p>}
        {shown.map((s) => (
          <div className="trade-card" key={s.id}>
            <div className="card-head">
              <div><b>{s.symbol} {s.direction || ''}</b><small>{s.timeframe ? `${s.timeframe} · ` : ''}{ago(s.created_at)}</small></div>
              <span className={`badge ${toneFor(s.status)}`}>{s.status}</span>
            </div>
            <div className="levels">
              <div><span>Entry</span><b>{fmt(s.entry_low)}{(+s.entry_high && +s.entry_high !== +s.entry_low) ? ` - ${fmt(s.entry_high)}` : ''}</b></div>
              <div><span>SL</span><b>{fmt(s.sl)}</b></div>
              <div><span>TP1</span><b>{fmt(s.tp1)}</b></div>
              <div><span>TP2</span><b>{fmt(s.tp2)}</b></div>
              <div><span>TP3</span><b>{fmt(s.tp3)}</b></div>
              <div><span>Score</span><b>{s.score ?? 0}/100</b></div>
            </div>
            {Array.isArray(s.reason) && s.reason.length > 0 && (
              <p className="muted">Evidence: {s.reason.join(' · ')}</p>
            )}
          </div>
        ))}
      </section>
    </>
  )
}
