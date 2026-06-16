import React, { useState, useEffect, useMemo, useCallback } from 'react'

/* ============================================================
   1. STORAGE  — localStorage when available, graceful
      in-memory fallback for sandboxed environments.
   ============================================================ */
const _mem = {}
const KEY = 'project_takeover_v1'
const Store = {
  loadAll() {
    try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null }
    catch (e) { return _mem[KEY] || null }
  },
  saveAll(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)) }
    catch (e) { _mem[KEY] = state }
  },
}

/* ============================================================
   2. DOMAIN CONSTANTS
   ============================================================ */
const MARKETS = [
  { sym: 'XAUUSD', name: 'Gold', class: 'metal' },
  { sym: 'NQ', name: 'Nasdaq 100', class: 'index' },
  { sym: 'ES', name: 'S&P 500', class: 'index' },
  { sym: 'EURUSD', name: 'Euro / USD', class: 'fx' },
  { sym: 'USDJPY', name: 'USD / Yen', class: 'fx' },
  { sym: 'GBPUSD', name: 'Pound / USD', class: 'fx' },
]

// Timeframe ladders per market family
const TIMEFRAMES = {
  metal: [
    { tf: 'W1', role: 'Macro regime', note: 'Are we in a multi-month trend or range?' },
    { tf: 'D1', role: 'Institutional direction', note: 'The direction you must respect' },
    { tf: '4H', role: 'Structure bias', note: 'BOS / range / sweep zones' },
    { tf: '1H', role: 'Trade context', note: 'Where price is inside the 4H story' },
    { tf: '15M', role: 'Setup validation', note: 'Sweep + displacement confirm or kill it' },
    { tf: '5M', role: 'Precision entry', note: 'Refined OB / FVG entry' },
    { tf: '1M', role: 'Optional only', note: 'Never required — refinement at most' },
  ],
  index: [
    { tf: 'D1', role: 'Macro / risk regime', note: 'Risk-on vs risk-off backdrop' },
    { tf: '4H', role: 'Higher-TF structure', note: 'Trend / range you trade with' },
    { tf: '1H', role: 'Session bias', note: 'Direction into the open' },
    { tf: '15M', role: 'Setup validation', note: 'Opening range + confirmation' },
    { tf: '5M', role: 'Execution', note: 'Entry trigger' },
    { tf: '1M', role: 'Optional only', note: 'Not required' },
  ],
  fx: [
    { tf: 'W1/D1', role: 'Macro / rate direction', note: 'Rate differential & CB bias' },
    { tf: '4H', role: 'Structure', note: 'HTF trend / range' },
    { tf: '1H', role: 'Context', note: 'Session position' },
    { tf: '15M', role: 'Validation', note: 'Sweep + displacement' },
    { tf: '5M', role: 'Precision', note: 'Refined entry' },
  ],
}

// Per-market macro driver prompts (shown in Decision Engine, section B)
const DRIVERS = {
  XAUUSD: ['DXY direction', 'US yields direction', 'Fed / news risk', 'Geopolitical / safe-haven', 'Central bank narrative'],
  NQ: ['US yields', 'Risk-on / risk-off', 'Tech momentum / leaders', 'Major news / data', 'Opening range context'],
  ES: ['US yields', 'Risk-on / risk-off', 'Breadth / momentum', 'Major news / data', 'Opening range context'],
  EURUSD: ['Rate differential', 'ECB vs Fed bias', 'DXY', 'Session liquidity', 'News risk'],
  USDJPY: ['Rate differential', 'BoJ / Fed bias', 'DXY / yields', 'Session liquidity', 'News risk'],
  GBPUSD: ['Rate differential', 'BoE vs Fed bias', 'DXY', 'Session liquidity', 'News risk'],
}

// Instrument specs for position sizing. value = $ P/L per 1.0 price move per 1 unit (lot/contract).
// NOTE: estimates — verify with broker.
const SPECS = {
  XAUUSD: { unit: 'lot (100oz)', perPoint: 100, pip: 0.1, decimals: 2, kind: 'metal' },
  NQ: { unit: 'contract', perPoint: 20, pip: 1, decimals: 2, kind: 'index' },
  ES: { unit: 'contract', perPoint: 50, pip: 0.25, decimals: 2, kind: 'index' },
  EURUSD: { unit: 'lot', perPoint: 100000, pip: 0.0001, decimals: 5, kind: 'fx' },
  GBPUSD: { unit: 'lot', perPoint: 100000, pip: 0.0001, decimals: 5, kind: 'fx' },
  USDJPY: { unit: 'lot', perPoint: 1000, pip: 0.01, decimals: 3, kind: 'fxjpy' },
}

const REGIMES = ['trend', 'range', 'compression', 'expansion', 'panic']
const SESSIONS = ['Asia', 'London', 'NY AM', 'NY PM', 'Overlap']
const MISTAKES = [
  'No HTF displacement', 'Chased entry', 'Moved stop loss', 'No liquidity sweep',
  'Counter-trend entry', 'Oversized risk', 'News blindside', 'Entered too early',
  'No confirmation', 'Revenge trade', 'FOMO entry', 'Target blocked by HVN', 'Closed too early',
]
const EMOTIONS = ['Calm', 'Focused', 'Confident', 'Anxious', 'FOMO', 'Frustrated', 'Bored', 'Revengeful']

// Default checklist for a fresh decision
const blankChecklist = () => ({
  regimeType: 'trend',
  strategySuitable: false,    // A (15)
  macroAligned: false,        // B (8)
  newsClear: true,            // B (7) + gate
  liquiditySwept: false,      // C (8)
  clearTarget: false,         // C (7)
  htfBiasClear: false,        // D (9) + gate
  bosDisplacement: false,     // D (9)
  ltfNotAgainstHtf: false,    // D (7) + gate
  lowVolRoute: false,         // E (5)
  targetNotBlocked: false,    // E (5)
  refinedZone: false,         // F (5)
  slBeyondLiquidity: false,   // F (5)
  rr: 0,                      // F (5 if >=3) + gate
  // G psychology — red flags (true = bad)
  fomo: false, revenge: false, bored: false, alreadyLost: false, chasing: false,
  byPlan: true,               // taken because of plan, not emotion
})

/* ============================================================
   3. PURE DECISION LOGIC
   ============================================================ */
function computeDecision(c) {
  const sc = {
    A: c.strategySuitable ? 15 : 0,
    B: (c.macroAligned ? 8 : 0) + (c.newsClear ? 7 : 0),
    C: (c.liquiditySwept ? 8 : 0) + (c.clearTarget ? 7 : 0),
    D: (c.htfBiasClear ? 9 : 0) + (c.bosDisplacement ? 9 : 0) + (c.ltfNotAgainstHtf ? 7 : 0),
    E: (c.lowVolRoute ? 5 : 0) + (c.targetNotBlocked ? 5 : 0),
    F: (c.refinedZone ? 5 : 0) + (c.slBeyondLiquidity ? 5 : 0) + ((+c.rr) >= 3 ? 5 : 0),
  }
  const psychClean = !c.fomo && !c.revenge && !c.bored && !c.alreadyLost && !c.chasing && c.byPlan
  sc.G = psychClean ? 5 : 0
  const score = sc.A + sc.B + sc.C + sc.D + sc.E + sc.F + sc.G

  const grade = score >= 85 ? 'A+' : score >= 75 ? 'A' : score >= 60 ? 'B' : 'C'
  const rr = +c.rr || 0

  // Hard gates required for a TAKE
  const gates = []
  if (!c.htfBiasClear) gates.push('HTF bias is not clearly defined')
  if (!c.ltfNotAgainstHtf) gates.push('Lower-TF signal fights the higher-TF bias')
  if (rr < 3) gates.push('Reward-to-risk is below the 1:3 minimum')
  if (!c.strategySuitable) gates.push('Strategy is not suited to this regime')
  if (!c.newsClear) gates.push('High-impact news within 60 minutes')
  const dangerEmotion = c.fomo || c.revenge || c.chasing
  const softEmotion = c.bored || c.alreadyLost || !c.byPlan

  let decision
  if (dangerEmotion) { decision = 'SKIP' }
  else if (score >= 75 && gates.length === 0 && psychClean) { decision = 'TAKE' }
  else if (score >= 58 && c.htfBiasClear && rr >= 2 && !dangerEmotion) { decision = 'WAIT' }
  else { decision = 'SKIP' }
  // soft emotional flags cannot become a TAKE
  if (decision === 'TAKE' && softEmotion) decision = 'WAIT'

  // Risk allowed (%) by grade, then reduced for news
  let riskPct = grade === 'A+' ? 1 : grade === 'A' ? 0.75 : grade === 'B' ? 0.5 : 0
  if (decision !== 'TAKE') riskPct = decision === 'WAIT' ? Math.min(riskPct, 0.5) : 0
  if (!c.newsClear) riskPct = +(riskPct / 2).toFixed(2)

  const status = decision === 'TAKE' ? 'GREEN' : decision === 'WAIT' ? 'ORANGE' : 'RED'

  // Human-readable reasons
  const reasons = []
  const push = (ok, t) => reasons.push({ ok, t })
  push(c.htfBiasClear, 'Higher-timeframe bias defined')
  push(c.bosDisplacement, 'Break of structure / displacement present')
  push(c.liquiditySwept, 'Liquidity swept before the move')
  push(rr >= 3, `Reward-to-risk ${rr ? ('1:' + rr.toFixed(1)) : 'not set'}${rr >= 3 ? '' : ' (need ≥1:3)'}`)
  push(c.newsClear, 'No high-impact news inside 60 min')
  push(psychClean, psychClean ? 'Mind is clean — trading the plan' : 'Emotional flags raised — step back')

  const nextAction = decision === 'TAKE'
    ? 'Place limit at the zone. No chase.'
    : decision === 'WAIT'
      ? "Wait for confirmation. Set an alert, don't force."
      : 'Stand down. No edge here.'

  return { score, grade, decision, status, riskPct, gates, reasons, nextAction, psychClean }
}

/* ---------- Risk / position sizing ---------- */
function computeRisk({ accountSize, riskPct, instrument, entry, sl, tps }) {
  const spec = SPECS[instrument] || SPECS.XAUUSD
  const e = +entry, s = +sl
  const valid = e > 0 && s > 0 && e !== s && +riskPct >= 0 && +accountSize > 0
  const dollarRisk = +((accountSize * (riskPct / 100))).toFixed(2)
  const stopDist = valid ? Math.abs(e - s) : 0
  const dir = valid ? (e > s ? 'long' : 'short') : null

  // $ value of one full point of stop distance, per 1 unit (lot/contract)
  let perPointDollar
  if (spec.kind === 'fxjpy') {
    perPointDollar = e > 0 ? (100000 / e) : 0
  } else {
    perPointDollar = spec.perPoint
  }
  const riskPerUnit = stopDist * perPointDollar
  const size = (valid && riskPerUnit > 0) ? +(dollarRisk / riskPerUnit).toFixed(4) : 0

  const pips = stopDist > 0 ? +(stopDist / spec.pip).toFixed(1) : 0

  const tpRows = (tps || []).map((tp, i) => {
    const t = +tp; if (!t || !valid) return { label: 'TP' + (i + 1), tp, rr: null, valid: false }
    const reward = Math.abs(t - e)
    const rr = stopDist > 0 ? +(reward / stopDist).toFixed(2) : null
    const right = dir === 'long' ? t > e : t < e
    return { label: 'TP' + (i + 1), tp: t, rr, ok: right, valid: true }
  })

  const rr1 = tpRows[0] && tpRows[0].rr ? tpRows[0].rr : 0
  const approved = valid && rr1 >= 3 && riskPct > 0 && riskPct <= 1
  const warnings = []
  if (valid && riskPct > 1) warnings.push('Risk above 1% — over your hard ceiling.')
  if (valid && rr1 && rr1 < 3) warnings.push('RR to TP1 below 1:3 — edge too thin.')
  if (valid) {
    const badTp = tpRows.find(r => r.valid && r.ok === false)
    if (badTp) warnings.push(`${badTp.label} is on the wrong side of entry for a ${dir}.`)
  }
  if (!valid) warnings.push('Enter account, entry and stop to size the trade.')

  return { valid, dir, dollarRisk, stopDist, pips, size, spec, tpRows, rr1, approved, warnings, perPointDollar }
}

/* ---------- Frequency governor (reads journal) ---------- */
function governor(journal) {
  const isToday = d => new Date(d).toDateString() === new Date().toDateString()
  const within = (d, days) => (Date.now() - new Date(d).getTime()) < days * 864e5
  const taken = journal.filter(j => j.taken)
  const today = taken.filter(j => isToday(j.date))
  const todayAplus = today.filter(j => j.grade === 'A+')
  const todayLosses = today.filter(j => j.result === 'loss')
  const weekLosses = taken.filter(j => j.result === 'loss' && within(j.date, 7))

  let level = 'clear', msg = 'Capital protected. Hunt only A-grade setups.'
  let allowNew = true, maxRiskCap = 1
  if (today.length >= 3) { level = 'stop'; allowNew = false; msg = 'Daily trade cap reached (3). The desk is closed for today.'; maxRiskCap = 0 }
  else if (todayLosses.length >= 2) { level = 'stop'; msg = 'Two losses today. Stop, or drop to 0.25% — you are protecting capital now, not hunting dopamine.'; maxRiskCap = 0.25 }
  else if (todayAplus.length >= 2) { level = 'warn'; msg = 'Two A+ trades already taken today. No more A+ slots — be ruthless.' }
  if (weekLosses.length >= 3) { level = level === 'clear' ? 'warn' : level; msg += ' 3+ losses this week → Review Mode: study before you size up.' }

  return {
    level, msg, allowNew, maxRiskCap,
    todayCount: today.length, todayAplus: todayAplus.length, todayLosses: todayLosses.length, weekLosses: weekLosses.length,
  }
}

/* ---------- Learning engine aggregation ---------- */
function learning(journal) {
  const counts = {}
  journal.filter(j => j.mistake && j.mistake !== 'None').forEach(j => {
    counts[j.mistake] = (counts[j.mistake] || 0) + 1
  })
  const tiers = Object.entries(counts).map(([cause, n]) => {
    let tier, label, color
    if (n >= 20) { tier = 'rule_change'; label = 'Eligible for rule change'; color = 'green' }
    else if (n >= 10) { tier = 'strong'; label = 'Strong hypothesis'; color = 'orange' }
    else if (n >= 5) { tier = 'hypothesis'; label = 'Hypothesis'; color = 'orange' }
    else if (n >= 3) { tier = 'warning'; label = 'Warning pattern'; color = 'orange' }
    else { tier = 'observation'; label = 'Observation'; color = '' }
    return { cause, n, tier, label, color }
  }).sort((a, b) => b.n - a.n)
  return tiers
}

/* ---------- Telegram alert text ---------- */
function telegramText(m) {
  const v = m.decision || 'WAIT'
  const dir = m.bias === 'bullish' ? 'LONG' : m.bias === 'bearish' ? 'SHORT' : ''
  const L = []
  L.push(`${m.sym} — ${m.grade || '?'} ${dir} SETUP`)
  L.push(`Decision: ${v}`)
  L.push(`Score: ${m.score || 0}/100`)
  if (m.entry) L.push(`Entry: ${m.entry}`)
  if (m.sl) L.push(`SL: ${m.sl}`)
  L.push(`Risk: ${m.riskAllowed || 0}%`)
  ;(m.tps || []).forEach((t, i) => { if (t) L.push(`TP${i + 1}: ${t}`) })
  if (m.reason) L.push(`Reason: ${m.reason}`)
  if (m.invalidation) L.push(`Invalidation: ${m.invalidation}`)
  L.push(`Action: ${m.nextAction || 'place limit order only, no chase'}`)
  return L.join('\n')
}

/* ============================================================
   4. SEED STATE — so the app feels alive on first run
   ============================================================ */
function seed() {
  const now = Date.now()
  const ds = d => new Date(now - d * 864e5).toISOString()
  const markets = MARKETS.map(m => ({
    sym: m.sym, name: m.name, class: m.class,
    status: 'RED', decision: 'SKIP', score: 0, grade: 'C', bias: 'neutral',
    setup: '—', nextAction: 'Run the Decision Engine.', riskAllowed: 0,
    entry: '', sl: '', tps: ['', '', ''], reason: '', invalidation: '',
    updated: null,
  }))
  // Make XAUUSD a live A+ example
  const gold = markets.find(m => m.sym === 'XAUUSD')
  Object.assign(gold, {
    status: 'GREEN', decision: 'TAKE', score: 86, grade: 'A+', bias: 'bullish',
    setup: 'HTF sweep + displacement long',
    nextAction: 'Place limit at the zone. No chase.',
    riskAllowed: 1,
    entry: '2328.50', sl: '2321.80', tps: ['2340', '2358', '2380'],
    reason: 'D1 bullish + Asia low sweep + 15M displacement + clean route to PWH',
    invalidation: '1H close below 2321',
    updated: ds(0),
  })

  const journal = [
    { id: 'T-1042', market: 'XAUUSD', date: ds(0), session: 'London', setup: 'Sweep + displacement', bias: 'bullish', entry: '2328.50', sl: '2321.80', tps: ['2340', '2358', '2380'], riskPct: 1, score: 86, grade: 'A+', decision: 'TAKE', taken: true, result: 'win', r: 3.0, mistake: 'None', emotion: 'Focused', notes: 'Asia low swept, clean displacement on 15M.', review: 'Textbook. Held to TP2.' },
    { id: 'T-1041', market: 'NQ', date: ds(1), session: 'NY AM', setup: 'OR breakout', bias: 'bullish', entry: '', sl: '', tps: ['', '', ''], riskPct: 0.5, score: 64, grade: 'B', decision: 'WAIT', taken: true, result: 'loss', r: -1, mistake: 'Entered too early', emotion: 'FOMO', notes: 'Jumped before 15M confirmation.', review: 'Should have waited for the retest.' },
    { id: 'T-1040', market: 'EURUSD', date: ds(2), session: 'London', setup: 'Range fade', bias: 'bearish', entry: '', sl: '', tps: ['', '', ''], riskPct: 0.5, score: 58, grade: 'C', decision: 'SKIP', taken: false, result: 'skipped', r: 0, mistake: 'None', emotion: 'Calm', notes: 'No edge, correctly skipped.', review: '' },
    { id: 'T-1039', market: 'NQ', date: ds(4), session: 'NY AM', setup: 'Continuation', bias: 'bullish', entry: '', sl: '', tps: ['', '', ''], riskPct: 0.5, score: 60, grade: 'B', decision: 'WAIT', taken: true, result: 'loss', r: -1, mistake: 'Entered too early', emotion: 'Anxious', notes: 'Same early-entry error.', review: 'Pattern forming.' },
    { id: 'T-1038', market: 'GBPUSD', date: ds(6), session: 'London', setup: 'Sweep + BOS', bias: 'bearish', entry: '', sl: '', tps: ['', '', ''], riskPct: 0.75, score: 78, grade: 'A', decision: 'TAKE', taken: true, result: 'win', r: 3.2, mistake: 'None', emotion: 'Confident', notes: 'Clean sweep of PDH, displacement down.', review: 'Good execution.' },
    { id: 'T-1037', market: 'ES', date: ds(8), session: 'NY AM', setup: 'Reversal', bias: 'bullish', entry: '', sl: '', tps: ['', '', ''], riskPct: 0.5, score: 55, grade: 'C', decision: 'WAIT', taken: true, result: 'loss', r: -1, mistake: 'Entered too early', emotion: 'FOMO', notes: 'Third early entry — clear theme.', review: 'Need HTF confirmation rule.' },
  ]

  const rules = {
    stable: [
      'Never risk more than 1% on a single trade.',
      'No TAKE without a defined higher-timeframe bias.',
      'Minimum reward-to-risk is 1:3. Ideal is 1:5+.',
      'Stop loss always sits beyond real liquidity, never at a round number.',
      'Maximum 2 A+ trades and 3 total trades per day.',
      'After 2 losses in a day: stop or drop to 0.25%.',
      'No trade within 60 minutes of high-impact news unless risk is halved.',
      'One loss is an observation, never a reason to change strategy.',
    ],
    risk: [
      'Auto: news inside 60 min halves the allowed risk.',
      'Auto: emotional red flag (FOMO / revenge / chasing) forces a SKIP.',
    ],
    hypotheses: [
      { id: 'H-01', text: 'Require HTF (1H/4H) displacement before any A+ rating.', evidence: 'Multiple early-entry losses on NQ/ES lacked HTF confirmation.', status: 'gathering' },
    ],
  }

  return {
    settings: { accountSize: 10000, maxRiskPct: 1, trader: 'Operator' },
    markets, journal, rules,
  }
}

/* ============================================================
   5. UI PRIMITIVES
   ============================================================ */
const Ring = ({ score, decision, size = 58 }) => {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - (score || 0) / 100)
  const col = decision === 'TAKE' ? 'var(--green)' : decision === 'WAIT' ? 'var(--amber)' : 'var(--red)'
  return (
    <svg width={size} height={size} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="5"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .5s' }} />
      <text x="50%" y="50%" textAnchor="middle" dy="-1" fontFamily="Space Grotesk" fontWeight="700"
        fontSize={size * 0.3} fill="var(--text)">{score || 0}</text>
      <text x="50%" y="50%" textAnchor="middle" dy={size * 0.22} fontSize="8" fill="var(--muted-2)">/100</text>
    </svg>
  )
}

const Toggle = ({ label, hint, weight, on, bad, onChange }) => (
  <div className="tg">
    <div className="lab">{label}{weight != null && <span className="w">+{weight}</span>}{hint && <small>{hint}</small>}</div>
    <div className={`switch ${on ? 'on' : ''} ${bad ? 'bad' : ''}`} onClick={() => onChange(!on)}><i /></div>
  </div>
)

const Field = ({ label, children }) => (
  <div className="field"><label>{label}</label>{children}</div>
)

const Pill = ({ d, children }) => {
  const cls = d === 'TAKE' ? 'take' : d === 'WAIT' ? 'wait' : d === 'SKIP' ? 'skip' :
    d === 'GREEN' ? 'green' : d === 'ORANGE' ? 'orange' : d === 'RED' ? 'red' : ''
  return <span className={`pill ${cls}`}><span className="dot" />{children || d}</span>
}

const Sheet = ({ onClose, children }) => (
  <div className="scrim" onClick={onClose}>
    <div className="sheet" onClick={e => e.stopPropagation()}>{children}</div>
  </div>
)

const Section = ({ label }) => (
  <div className="sec"><span className="lab">{label}</span><span className="ln" /></div>
)

/* ============================================================
   6. PAGES
   ============================================================ */

/* ---- Dashboard / Command Center ---- */
function Dashboard({ state, openMarket }) {
  const gov = governor(state.journal)
  const taken = state.journal.filter(j => j.taken)
  const wins = taken.filter(j => j.result === 'win').length
  const losses = taken.filter(j => j.result === 'loss').length
  const totalR = +taken.reduce((a, j) => a + (+j.r || 0), 0).toFixed(1)
  const winrate = (wins + losses) > 0 ? Math.round(wins / (wins + losses) * 100) : 0
  const takeable = state.markets.filter(m => m.decision === 'TAKE')

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Command Center</div>
        <h1>Good session, {state.settings.trader}.</h1>
        <p>Six markets. One job: decide <b style={{ color: 'var(--green)' }}>TAKE</b>, <b style={{ color: 'var(--amber)' }}>WAIT</b>, or <b style={{ color: 'var(--red)' }}>SKIP</b> — and protect the ${Number(state.settings.accountSize).toLocaleString()} account.</p>
      </div>

      <div className={`banner ${gov.level === 'stop' ? 'stop' : gov.level === 'warn' ? 'warn' : 'ok'}`}>
        <div style={{ fontSize: 18, lineHeight: 1 }}>{gov.level === 'stop' ? '⛔' : gov.level === 'warn' ? '⚠️' : '✓'}</div>
        <div><b>Frequency Governor — {gov.todayCount}/3 today, {gov.todayAplus}/2 A+, {gov.todayLosses} losses.</b><br />{gov.msg}</div>
      </div>

      <div className="grid cols-3 mt">
        <div className="card stat"><div className="lab">Net R (logged)</div><div className="val mono" style={{ color: totalR >= 0 ? 'var(--green)' : 'var(--red)' }}>{totalR >= 0 ? '+' : ''}{totalR}R</div><div className="hint">{taken.length} trades taken</div></div>
        <div className="card stat"><div className="lab">Win rate</div><div className="val mono">{winrate}%</div><div className="hint">{wins}W · {losses}L</div></div>
        <div className="card stat"><div className="lab">Live TAKE signals</div><div className="val">{takeable.length}</div><div className="hint">{takeable.map(m => m.sym).join(', ') || 'None right now'}</div></div>
      </div>

      <Section label="Markets" />
      <div className="grid cols-2">
        {state.markets.map(m => (
          <div key={m.sym} className={`card ticket ${m.decision.toLowerCase()}`} onClick={() => openMarket(m.sym)}>
            <div className="bar" />
            <div className="top">
              <div>
                <div className="sym mono">{m.sym}</div>
                <div className="name">{m.name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Pill d={m.decision} />
                <div className="score" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
                  <span className="n">{m.score}</span><span className="d">/100</span>
                </div>
              </div>
            </div>
            <div className={`meter ${m.decision.toLowerCase()}`}><i style={{ width: `${m.score}%` }} /></div>
            <div className="verdict">{m.decision === 'TAKE' ? 'TAKE TRADE' : m.decision === 'WAIT' ? 'WAIT FOR CONFIRMATION' : 'SKIP — NO EDGE'}</div>
            <div className="meta">
              <span>Bias <b className={`bias ${m.bias}`}>{m.bias}</b></span>
              <span>Setup <b>{m.setup}</b></span>
              <span>Risk <b>{m.riskAllowed}%</b></span>
            </div>
            <div className="next">
              <span><span className="lab">Next</span><br />{m.nextAction}</span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><span className="lab">Updated</span><br />{m.updated ? new Date(m.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="disc">No live data, no auto-trading. Every value here is what you entered through the Decision Engine and Scanner. You remain the final decision maker.</div>
    </div>
  )
}

/* ---- Market Scanner (fast manual overview / edit) ---- */
function Scanner({ state, update, openMarket }) {
  const setField = (sym, k, v) => update(s => {
    const m = s.markets.find(x => x.sym === sym); m[k] = v; return { ...s }
  })
  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Market Scanner</div>
        <h1>Fast bias board</h1>
        <p>Set a quick read per market, or open the full Decision Engine for a scored verdict.</p>
      </div>
      <div className="card">
        {state.markets.map(m => (
          <div key={m.sym} className="lrow">
            <div style={{ width: 74 }}>
              <div className="t mono">{m.sym}</div>
              <div className="s">{m.name}</div>
            </div>
            <div className="grow">
              <div className="seg" style={{ marginBottom: 6 }}>
                {['bullish', 'neutral', 'bearish'].map(b => (
                  <button key={b} className={m.bias === b ? 'active' : ''} onClick={() => setField(m.sym, 'bias', b)}>
                    {b === 'bullish' ? 'Bull' : b === 'bearish' ? 'Bear' : 'Flat'}
                  </button>
                ))}
              </div>
              <Pill d={m.decision} /> <span className="xs mut2 mono">{m.score}/100</span>
            </div>
            <button className="btn ghost sm" onClick={() => openMarket(m.sym)}>Decide →</button>
          </div>
        ))}
      </div>
      <div className="disc">The Scanner is a glance. The TAKE / WAIT / SKIP verdict and score come from the weighted Decision Engine.</div>
    </div>
  )
}

/* ---- Decision Engine ---- */
function DecisionEngine({ state, update, addJournal, sym, setSym }) {
  const market = MARKETS.find(m => m.sym === sym) || MARKETS[0]
  const spec = SPECS[market.sym]
  const [c, setC] = useState(blankChecklist())
  const [entry, setEntry] = useState('')
  const [sl, setSl] = useState('')
  const [tps, setTps] = useState(['', '', ''])
  const [gate, setGate] = useState(null)
  const [toast, setToast] = useState('')

  const set = (k, v) => setC(p => ({ ...p, [k]: v }))
  useEffect(() => {
    const e = +entry, s = +sl, t = +tps[0]
    if (e && s && t && e !== s) { const rr = +(Math.abs(t - e) / Math.abs(e - s)).toFixed(2); set('rr', rr) }
  }, [entry, sl, tps])

  const v = useMemo(() => computeDecision(c), [c])
  const gov = governor(state.journal)

  const ladder = TIMEFRAMES[market.class]
  const drivers = DRIVERS[market.sym]

  const ACCT_QS = [
    { k: 'htfBiasClear', q: 'Is the higher-timeframe bias genuinely clear?' },
    { k: '_force', q: 'Is this A+ — or are you forcing it?' },
    { k: '_rr', q: 'Is reward-to-risk at least 1:3?' },
    { k: '_sl', q: 'Is the stop at true invalidation, beyond liquidity?' },
    { k: '_news', q: 'Is there NO high-impact news within 60 minutes?' },
    { k: '_chase', q: 'Are you NOT chasing price?' },
    { k: '_100k', q: 'Would you take this on a $100k account?' },
  ]

  const [answers, setAnswers] = useState({})

  function commit(decision) {
    update(s => {
      const m = s.markets.find(x => x.sym === market.sym)
      Object.assign(m, {
        decision, status: v.status, score: v.score, grade: v.grade,
        setup: c.regimeType + ' / ' + (market.class === 'metal' ? 'sweep+displacement' : 'structure'),
        nextAction: v.nextAction, riskAllowed: v.riskPct,
        entry, sl, tps: [...tps], reason: v.reasons.filter(r => r.ok).map(r => r.t).join('; '),
        invalidation: sl ? ('close beyond ' + sl) : '', updated: new Date().toISOString(),
      })
      return { ...s }
    })
    setToast(`Committed to the desk as ${decision}.`)
    setTimeout(() => setToast(''), 2200)
  }

  function logTrade(decision) {
    addJournal({
      market: market.sym, date: new Date().toISOString(), session: 'NY AM',
      setup: c.regimeType, bias: c.htfBiasClear ? 'bullish' : 'neutral',
      entry, sl, tps: [...tps], riskPct: v.riskPct, score: v.score, grade: v.grade,
      decision, taken: decision === 'TAKE', result: decision === 'TAKE' ? 'open' : 'skipped',
      r: 0, mistake: 'None', emotion: v.psychClean ? 'Focused' : 'FOMO',
      notes: v.reasons.filter(r => !r.ok).map(r => '⚠ ' + r.t).join('; '), review: '',
    })
    setToast('Logged to journal.')
    setTimeout(() => setToast(''), 2200)
  }

  function runGate() {
    setAnswers({
      htfBiasClear: c.htfBiasClear, _force: v.grade === 'A+', _rr: (+c.rr) >= 3,
      _sl: c.slBeyondLiquidity, _news: c.newsClear, _chase: !c.chasing, _100k: v.psychClean,
    })
    setGate(true)
  }
  const gatePass = Object.values(answers).every(Boolean)

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Decision Engine</div>
        <h1>Validate the setup</h1>
        <p>Weighted confluence across seven layers. The verdict is forced by the rules — not by how badly you want it.</p>
      </div>

      <div className="seg" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {MARKETS.map(m => (
          <button key={m.sym} className={m.sym === market.sym ? 'active' : ''} onClick={() => setSym(m.sym)} style={{ flex: '1 0 30%' }}>{m.sym}</button>
        ))}
      </div>

      <div className={`plate ${v.decision.toLowerCase()}`}>
        <div className="head">
          <div className="ring"><Ring score={v.score} decision={v.decision} size={64} /></div>
          <div style={{ flex: 1 }}>
            <div className="word">{v.decision}</div>
            <div className="small muted" style={{ marginTop: 2 }}>
              Grade <b style={{ color: 'var(--text)' }}>{v.grade}</b> · Risk allowed <b style={{ color: 'var(--text)' }}>{v.riskPct}%</b>
            </div>
          </div>
        </div>
        <div className="reasons">
          {v.reasons.map((r, i) => (
            <div key={i} className="r"><span className={r.ok ? 'ok' : 'no'}>{r.ok ? '✓' : '✕'}</span><span>{r.t}</span></div>
          ))}
          {v.gates.length > 0 && <div className="r" style={{ marginTop: 4 }}><span className="no">⛔</span><span>Blocks a TAKE: {v.gates.join(' · ')}</span></div>}
          <div className="r" style={{ marginTop: 4 }}><b>Next</b> — {v.nextAction}</div>
        </div>
      </div>

      <Section label={`Timeframe route — ${market.sym}`} />
      <div className="ladder">
        {ladder.map((t, i) => (
          <div className="tf" key={t.tf}>
            <span className="tag">{t.tf}</span>
            <span className="role">{t.role}<small>{t.note}</small></span>
            <span className="step">{i === 0 ? 'start' : i === ladder.length - 1 ? 'last' : 'then'}</span>
          </div>
        ))}
      </div>

      <Section label="A · Regime" />
      <div className="card pad">
        <Field label="Current regime">
          <div className="seg">
            {REGIMES.map(r => (<button key={r} className={c.regimeType === r ? 'active' : ''} onClick={() => set('regimeType', r)}>{r}</button>))}
          </div>
        </Field>
        <Toggle label="Strategy suits this regime" hint="Don't run a trend playbook in a dead range" weight={15} on={c.strategySuitable} onChange={val => set('strategySuitable', val)} />
      </div>

      <Section label={`B · Macro / drivers — ${market.sym}`} />
      <div className="card pad">
        <div className="xs mut2" style={{ marginBottom: 8 }}>Check: {drivers.join(' · ')}</div>
        <Toggle label="Macro drivers align with the trade" weight={8} on={c.macroAligned} onChange={val => set('macroAligned', val)} />
        <Toggle label="No high-impact news within 60 min" weight={7} on={c.newsClear} onChange={val => set('newsClear', val)} />
      </div>

      <Section label="C · Liquidity" />
      <div className="card pad">
        <Toggle label="Liquidity swept before the move" hint="PDH/PDL, PWH/PWL, equal highs/lows, Asia range" weight={8} on={c.liquiditySwept} onChange={val => set('liquiditySwept', val)} />
        <Toggle label="Clear liquidity target to aim at" weight={7} on={c.clearTarget} onChange={val => set('clearTarget', val)} />
      </div>

      <Section label="D · Structure (most weight)" />
      <div className="card pad">
        <Toggle label="HTF bias is clearly defined" hint="Required for any TAKE" weight={9} on={c.htfBiasClear} onChange={val => set('htfBiasClear', val)} />
        <Toggle label="BOS / displacement present" weight={9} on={c.bosDisplacement} onChange={val => set('bosDisplacement', val)} />
        <Toggle label="Lower-TF signal NOT against HTF" hint="No counter-HTF entries" weight={7} on={c.ltfNotAgainstHtf} onChange={val => set('ltfNotAgainstHtf', val)} />
      </div>

      <Section label="E · Volume / profile route" />
      <div className="card pad">
        <Toggle label="Low-volume route toward target" hint="Price not fighting through value" weight={5} on={c.lowVolRoute} onChange={val => set('lowVolRoute', val)} />
        <Toggle label="Target not blocked by a high-volume node" weight={5} on={c.targetNotBlocked} onChange={val => set('targetNotBlocked', val)} />
      </div>

      <Section label="F · Execution" />
      <div className="card pad">
        <div className="row">
          <Field label="Entry"><input className="input mono" inputMode="decimal" value={entry} onChange={e => setEntry(e.target.value)} placeholder={spec.kind === 'fx' ? '1.08500' : '2328.50'} /></Field>
          <Field label="Stop loss"><input className="input mono" inputMode="decimal" value={sl} onChange={e => setSl(e.target.value)} placeholder={spec.kind === 'fx' ? '1.08200' : '2321.80'} /></Field>
        </div>
        <div className="row">
          {tps.map((t, i) => (
            <Field key={i} label={'TP' + (i + 1)}><input className="input mono" inputMode="decimal" value={t} onChange={e => { const n = [...tps]; n[i] = e.target.value; setTps(n) }} /></Field>
          ))}
        </div>
        <div className="xs mut2" style={{ margin: '2px 0 10px' }}>RR to TP1 auto-fills from entry/stop. Currently <b className="mono" style={{ color: (+c.rr) >= 3 ? 'var(--green)' : 'var(--amber)' }}>{c.rr ? ('1:' + (+c.rr).toFixed(1)) : '—'}</b></div>
        <Toggle label="Entry is a refined OB / FVG / retest zone" weight={5} on={c.refinedZone} onChange={val => set('refinedZone', val)} />
        <Toggle label="Stop sits beyond real liquidity" weight={5} on={c.slBeyondLiquidity} onChange={val => set('slBeyondLiquidity', val)} />
        <Toggle label="Reward-to-risk ≥ 1:3" hint="Gate — ideal is 1:5+" weight={5} on={(+c.rr) >= 3} onChange={() => {}} />
      </div>

      <Section label="G · Psychology (red flags)" />
      <div className="card pad">
        <Toggle label="FOMO — chasing a move I missed" bad on={c.fomo} onChange={val => set('fomo', val)} />
        <Toggle label="Revenge — trying to win money back" bad on={c.revenge} onChange={val => set('revenge', val)} />
        <Toggle label="Bored — trading for action" bad on={c.bored} onChange={val => set('bored', val)} />
        <Toggle label="Already lost today" bad on={c.alreadyLost} onChange={val => set('alreadyLost', val)} />
        <Toggle label="Chasing price into the candle" bad on={c.chasing} onChange={val => set('chasing', val)} />
        <Toggle label="Taking this because of the plan (not emotion)" on={c.byPlan} onChange={val => set('byPlan', val)} />
      </div>

      {!gov.allowNew && <div className="banner stop mt"><div>⛔</div><div>{gov.msg}</div></div>}

      <div className="grid cols-2 mt2">
        {v.decision === 'TAKE'
          ? <button className="btn green" disabled={!gov.allowNew} onClick={runGate}>Run accountability gate</button>
          : <button className="btn ghost" onClick={() => commit(v.decision)}>Commit {v.decision} to desk</button>}
        <button className="btn ghost" onClick={() => logTrade(v.decision)}>Log to journal</button>
      </div>
      {toast && <div className="banner ok mt"><div>✓</div><div>{toast}</div></div>}

      <div className="disc">The engine cannot be argued with: emotional red flags force a SKIP, RR under 1:3 or an undefined HTF bias blocks any TAKE, and the frequency governor can close the desk for the day.</div>

      {gate && (
        <Sheet onClose={() => setGate(null)}>
          <div className="x flex between ac" style={{ background: 'var(--ink-2)', paddingBottom: 8 }}>
            <h3>Accountability gate</h3>
            <button className="iconbtn" onClick={() => setGate(null)}>✕</button>
          </div>
          <p className="small muted">Answer honestly. A single failure downgrades the trade.</p>
          {ACCT_QS.map(q => (
            <Toggle key={q.k} label={q.q} on={!!answers[q.k]} onChange={val => setAnswers(a => ({ ...a, [q.k]: val }))} />
          ))}
          <div className="mt2">
            {gatePass
              ? <button className="btn green" onClick={() => { commit('TAKE'); logTrade('TAKE'); setGate(null) }}>Approved — commit & log TAKE</button>
              : <button className="btn red" onClick={() => { commit('WAIT'); setGate(null) }}>Gate failed — downgrade to WAIT</button>}
          </div>
          <div className="disc">If you can't answer every question with a clean yes, it isn't an A+ — it's a WAIT or a SKIP.</div>
        </Sheet>
      )}
    </div>
  )
}

/* ---- Risk Calculator ---- */
function RiskCalc({ state }) {
  const gov = governor(state.journal)
  const [instrument, setInstrument] = useState('XAUUSD')
  const [riskPct, setRiskPct] = useState(state.settings.maxRiskPct)
  const [account, setAccount] = useState(state.settings.accountSize)
  const [entry, setEntry] = useState('2328.50')
  const [sl, setSl] = useState('2321.80')
  const [tps, setTps] = useState(['2340', '2358', '2380'])

  const r = useMemo(() => computeRisk({ accountSize: +account, riskPct: +riskPct, instrument, entry, sl, tps }),
    [account, riskPct, instrument, entry, sl, tps])
  const capExceeded = gov.maxRiskCap < +riskPct

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Risk Calculator</div>
        <h1>Size it correctly</h1>
        <p>Default account ${Number(state.settings.accountSize).toLocaleString()}, hard ceiling {state.settings.maxRiskPct}%. The desk grades your risk before you place anything.</p>
      </div>

      <div className="card pad">
        <Field label="Instrument">
          <select className="input" value={instrument} onChange={e => setInstrument(e.target.value)}>
            {MARKETS.map(m => <option key={m.sym} value={m.sym}>{m.sym} — {m.name}</option>)}
          </select>
        </Field>
        <div className="row">
          <Field label="Account ($)"><input className="input mono" inputMode="decimal" value={account} onChange={e => setAccount(e.target.value)} /></Field>
          <Field label="Risk %"><input className="input mono" inputMode="decimal" value={riskPct} onChange={e => setRiskPct(e.target.value)} /></Field>
        </div>
        <div className="seg" style={{ marginBottom: 12 }}>
          {[1, 0.75, 0.5, 0.25].map(p => (<button key={p} className={+riskPct === p ? 'active' : ''} onClick={() => setRiskPct(p)}>{p}%</button>))}
        </div>
        <div className="row">
          <Field label="Entry"><input className="input mono" inputMode="decimal" value={entry} onChange={e => setEntry(e.target.value)} /></Field>
          <Field label="Stop loss"><input className="input mono" inputMode="decimal" value={sl} onChange={e => setSl(e.target.value)} /></Field>
        </div>
        <div className="row">
          {tps.map((t, i) => (<Field key={i} label={'TP' + (i + 1)}><input className="input mono" inputMode="decimal" value={t} onChange={e => { const n = [...tps]; n[i] = e.target.value; setTps(n) }} /></Field>))}
        </div>
      </div>

      {capExceeded && <div className="banner warn mt"><div>⚠️</div><div><b>Governor cap is {gov.maxRiskCap}%.</b> {gov.msg}</div></div>}

      <Section label="Output" />
      <div className="grid cols-2">
        <div className="card stat"><div className="lab">Dollar risk</div><div className="val mono">${r.dollarRisk.toLocaleString()}</div><div className="hint">{riskPct}% of ${Number(account).toLocaleString()}</div></div>
        <div className="card stat"><div className="lab">Stop distance</div><div className="val mono">{r.stopDist ? r.stopDist.toFixed(r.spec.decimals) : '—'}</div><div className="hint">{r.pips ? r.pips + ' pips/pts · ' : ''}{r.dir || ''}</div></div>
        <div className="card stat"><div className="lab">Position size</div><div className="val mono">{r.size ? r.size : '—'}</div><div className="hint">{r.spec.unit}{r.size ? ` · $${(r.perPointDollar).toLocaleString(undefined, { maximumFractionDigits: 0 })}/pt` : ''}</div></div>
        <div className="card stat"><div className="lab">RR to TP1</div><div className="val mono" style={{ color: r.rr1 >= 3 ? 'var(--green)' : 'var(--amber)' }}>{r.rr1 ? ('1:' + r.rr1) : '—'}</div><div className="hint">ideal 1:5+</div></div>
      </div>

      <div className="card mt">
        {r.tpRows.map((t, i) => (
          <div className="lrow" key={i}>
            <div className="grow"><div className="t">{t.label} <span className="mono mut2">{t.tp || '—'}</span></div></div>
            {t.rr != null
              ? <span className="tag-mini" style={{ color: t.rr >= 3 ? 'var(--green)' : 'var(--amber)' }}>1:{t.rr}{t.ok === false ? ' ⚠ wrong side' : ''}</span>
              : <span className="tag-mini">set TP</span>}
          </div>
        ))}
      </div>

      <div className={`banner ${r.approved && !capExceeded ? 'ok' : 'stop'} mt`}>
        <div>{r.approved && !capExceeded ? '✓' : '⛔'}</div>
        <div>
          <b>{r.approved && !capExceeded ? 'RISK APPROVED' : 'RISK REJECTED'}</b>
          {r.warnings.length > 0 && <><br />{r.warnings.join(' ')}</>}
          {capExceeded && <><br />Risk exceeds the active governor cap.</>}
        </div>
      </div>

      <div className="disc">Position size is an <b>estimate</b> using standard contract/lot values (Gold $100/pt per lot, NQ $20/pt, ES $50/pt, FX $10/pip per standard lot, JPY pairs computed from price). Always verify the exact size and value with your broker before placing an order.</div>
    </div>
  )
}

/* ---- Journal ---- */
function Journal({ state, update, addJournal }) {
  const [open, setOpen] = useState(null)
  const blank = () => ({
    id: 'T-' + Math.floor(1000 + Math.random() * 9000), market: 'XAUUSD',
    date: new Date().toISOString(), session: 'NY AM', setup: '', bias: 'neutral',
    entry: '', sl: '', tps: ['', '', ''], riskPct: 1, score: 0, grade: 'C', decision: 'WAIT',
    taken: false, result: 'skipped', r: 0, mistake: 'None', emotion: 'Calm', notes: '', review: '',
  })
  const [draft, setDraft] = useState(blank())

  function save() {
    update(s => {
      const i = s.journal.findIndex(j => j.id === draft.id)
      if (i >= 0) s.journal[i] = { ...draft }; else s.journal.unshift({ ...draft })
      return { ...s }
    })
    setOpen(null)
  }
  function del(id) { update(s => ({ ...s, journal: s.journal.filter(j => j.id !== id) })); setOpen(null) }
  const F = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  const resultColor = r => r === 'win' ? 'var(--green)' : r === 'loss' ? 'var(--red)' : r === 'breakeven' ? 'var(--amber)' : 'var(--muted-2)'

  return (
    <div>
      <div className="page-head flex between ac">
        <div>
          <div className="eyebrow">Trade Journal</div>
          <h1>Every setup is a dossier</h1>
        </div>
        <button className="btn primary sm" onClick={() => { setDraft(blank()); setOpen('new') }}>+ New</button>
      </div>

      {state.journal.length === 0 && <div className="card empty"><div className="ico">📓</div><div className="mt">No trades logged yet. Build your edge one dossier at a time.</div></div>}

      <div className="card">
        {state.journal.map(j => (
          <div className="lrow" key={j.id} onClick={() => { setDraft({ ...j, tps: j.tps || ['', '', ''] }); setOpen(j.id) }} style={{ cursor: 'pointer' }}>
            <div style={{ width: 8, height: 38, borderRadius: 4, background: resultColor(j.result), flex: '0 0 auto' }} />
            <div className="grow">
              <div className="t mono">{j.market} <span className="mut2 xs">{j.id}</span></div>
              <div className="s">{j.setup || '—'} · {new Date(j.date).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {j.session}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Pill d={j.decision} />
              <div className="xs mono mut2" style={{ marginTop: 4 }}>{j.taken ? (j.r > 0 ? '+' : '') + j.r + 'R' : j.result}</div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Sheet onClose={() => setOpen(null)}>
          <div className="x flex between ac" style={{ background: 'var(--ink-2)', paddingBottom: 8 }}>
            <h3>{open === 'new' ? 'New trade dossier' : draft.id}</h3>
            <button className="iconbtn" onClick={() => setOpen(null)}>✕</button>
          </div>
          <div className="row">
            <Field label="Market"><select className="input" value={draft.market} onChange={e => F('market', e.target.value)}>{MARKETS.map(m => <option key={m.sym}>{m.sym}</option>)}</select></Field>
            <Field label="Session"><select className="input" value={draft.session} onChange={e => F('session', e.target.value)}>{SESSIONS.map(s => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <Field label="Setup type"><input className="input" value={draft.setup} onChange={e => F('setup', e.target.value)} placeholder="Sweep + displacement" /></Field>
          <div className="row">
            <Field label="Bias"><select className="input" value={draft.bias} onChange={e => F('bias', e.target.value)}><option>bullish</option><option>neutral</option><option>bearish</option></select></Field>
            <Field label="Pre-trade score"><input className="input mono" inputMode="numeric" value={draft.score} onChange={e => F('score', +e.target.value)} /></Field>
            <Field label="Grade"><select className="input" value={draft.grade} onChange={e => F('grade', e.target.value)}><option>A+</option><option>A</option><option>B</option><option>C</option></select></Field>
          </div>
          <div className="row">
            <Field label="Entry"><input className="input mono" value={draft.entry} onChange={e => F('entry', e.target.value)} /></Field>
            <Field label="SL"><input className="input mono" value={draft.sl} onChange={e => F('sl', e.target.value)} /></Field>
            <Field label="Risk %"><input className="input mono" value={draft.riskPct} onChange={e => F('riskPct', e.target.value)} /></Field>
          </div>
          <div className="row">
            {(draft.tps || ['', '', '']).map((t, i) => (<Field key={i} label={'TP' + (i + 1)}><input className="input mono" value={t} onChange={e => { const n = [...draft.tps]; n[i] = e.target.value; F('tps', n) }} /></Field>))}
          </div>
          <div className="row">
            <Field label="Decision"><select className="input" value={draft.decision} onChange={e => F('decision', e.target.value)}><option>TAKE</option><option>WAIT</option><option>SKIP</option></select></Field>
            <Field label="Taken?"><select className="input" value={draft.taken ? 'yes' : 'no'} onChange={e => F('taken', e.target.value === 'yes')}><option value="no">No</option><option value="yes">Yes</option></select></Field>
          </div>
          <div className="row">
            <Field label="Result"><select className="input" value={draft.result} onChange={e => F('result', e.target.value)}><option>open</option><option>win</option><option>loss</option><option>breakeven</option><option>missed</option><option>skipped</option></select></Field>
            <Field label="R result"><input className="input mono" inputMode="decimal" value={draft.r} onChange={e => F('r', +e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="Mistake category"><select className="input" value={draft.mistake} onChange={e => F('mistake', e.target.value)}><option>None</option>{MISTAKES.map(m => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Emotional state"><select className="input" value={draft.emotion} onChange={e => F('emotion', e.target.value)}>{EMOTIONS.map(m => <option key={m}>{m}</option>)}</select></Field>
          </div>
          <Field label="Screenshots / notes"><textarea className="input" value={draft.notes} onChange={e => F('notes', e.target.value)} placeholder="What you saw, where the setup formed…" /></Field>
          <Field label="Post-trade review"><textarea className="input" value={draft.review} onChange={e => F('review', e.target.value)} placeholder="What to repeat, what to fix." /></Field>
          <div className="grid cols-2 mt">
            <button className="btn primary" onClick={save}>Save dossier</button>
            {open !== 'new' && <button className="btn red" onClick={() => del(draft.id)}>Delete</button>}
          </div>
        </Sheet>
      )}
    </div>
  )
}

/* ---- Learning Engine ---- */
function Learning({ state, update }) {
  const tiers = learning(state.journal)
  const observations = tiers.filter(t => t.tier === 'observation')
  const patterns = tiers.filter(t => t.tier === 'warning')
  const hyps = tiers.filter(t => t.tier === 'hypothesis' || t.tier === 'strong')
  const candidates = tiers.filter(t => t.tier === 'rule_change')

  function promote(text) {
    update(s => { s.rules.stable.push(text); return { ...s } })
  }

  const Block = ({ label, hint, items, render }) => (
    <>
      <Section label={label} />
      {hint && <div className="xs mut2" style={{ margin: '-4px 2px 8px' }}>{hint}</div>}
      <div className="card">
        {items.length === 0 ? <div className="empty small">Nothing here yet.</div> : items.map(render)}
      </div>
    </>
  )

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Self-Learning Engine</div>
        <h1>Evidence, not panic</h1>
        <p>One loss is an observation. The strategy only changes when the data demands it. Counts come straight from your journal's mistake categories.</p>
      </div>

      <div className="banner ok"><div>🧠</div><div><b>The ladder:</b> 1 = observation · 3 = warning pattern · 5 = hypothesis · 10 = strong · 20 = eligible for a rule change.</div></div>

      <Block label="Observations (1–2)" items={observations} hint="Single data points. Watch, don't react."
        render={t => (<div className="lrow" key={t.cause}><div className="grow"><div className="t">{t.cause}</div><div className="s">Logged {t.n}×</div></div><span className="tag-mini">observe</span></div>)} />

      <Block label="Detected patterns (3+)" items={patterns} hint="A theme is forming. Stay disciplined."
        render={t => (<div className="lrow" key={t.cause}><div className="grow"><div className="t">{t.cause}</div><div className="s">{t.n}× — recurring</div></div><span className="tag-mini" style={{ color: 'var(--amber)' }}>warning</span></div>)} />

      <Block label="Hypotheses (5+)" items={hyps} hint="Worth a documented hypothesis with a proposed fix."
        render={t => (
          <div className="lrow" key={t.cause}>
            <div className="grow">
              <div className="t">{t.cause}</div>
              <div className="s">{t.n} examples · {t.label}</div>
              <div className="xs mut2" style={{ marginTop: 4 }}>Hypothesis: add a rule that blocks setups showing this error.</div>
            </div>
          </div>
        )} />

      <Section label="Open hypotheses" />
      <div className="card">
        {state.rules.hypotheses.map(h => (
          <div className="lrow" key={h.id}>
            <div className="grow"><div className="t">{h.text}</div><div className="s">{h.evidence}</div></div>
            <span className="tag-mini" style={{ color: 'var(--amber)' }}>{h.status}</span>
          </div>
        ))}
      </div>

      <Block label="Rule-change candidates (20+)" items={candidates} hint="The evidence threshold is met. You may promote this to a stable rule."
        render={t => (
          <div className="lrow" key={t.cause}>
            <div className="grow"><div className="t">{t.cause}</div><div className="s">{t.n} examples — eligible</div></div>
            <button className="btn green sm" onClick={() => promote(`Block setups exhibiting "${t.cause}" (${t.n} documented losses).`)}>Promote</button>
          </div>
        )} />

      <div className="disc">A bad takeaway is "the strategy is broken." A good one is "the last several losers all shared one missing condition — require it next time." This page enforces that discipline.</div>
    </div>
  )
}

/* ---- Rules ---- */
function Rules({ state, update }) {
  const [nr, setNr] = useState('')
  function add() { if (!nr.trim()) return; update(s => ({ ...s, rules: { ...s.rules, stable: [...s.rules.stable, nr.trim()] } })); setNr('') }
  function remove(i) { update(s => { s.rules.stable.splice(i, 1); return { ...s } }) }
  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Rule Book</div>
        <h1>The lines you don't cross</h1>
        <p>Stable rules change slowly and only with evidence. Risk rules are enforced automatically by the engine.</p>
      </div>

      <Section label="Active risk rules (auto-enforced)" />
      <div className="card">
        {state.rules.risk.map((r, i) => (<div className="lrow" key={i}><div style={{ color: 'var(--brass)' }}>⚙︎</div><div className="grow"><div className="t" style={{ fontWeight: 500, fontSize: 13.5 }}>{r}</div></div></div>))}
      </div>

      <Section label="Stable rules" />
      <div className="card">
        {state.rules.stable.map((r, i) => (
          <div className="lrow" key={i}>
            <div className="mut2 mono" style={{ width: 24 }}>{String(i + 1).padStart(2, '0')}</div>
            <div className="grow"><div className="t" style={{ fontWeight: 500, fontSize: 13.5 }}>{r}</div></div>
            <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => remove(i)}>✕</button>
          </div>
        ))}
      </div>
      <div className="card pad mt">
        <Field label="Add a stable rule"><input className="input" value={nr} onChange={e => setNr(e.target.value)} placeholder="e.g. No trading the first 5 minutes of the NY open" /></Field>
        <button className="btn ghost" onClick={add}>Add rule</button>
      </div>
      <div className="disc">Promote rules from the Learning Engine only after the evidence threshold is met. Don't edit the rule book in tilt.</div>
    </div>
  )
}

/* ---- Settings (+ Telegram alert) ---- */
function Settings({ state, update, resetAll }) {
  const [s1, setS1] = useState(state.settings.accountSize)
  const [s2, setS2] = useState(state.settings.maxRiskPct)
  const [s3, setS3] = useState(state.settings.trader)
  const [copied, setCopied] = useState(false)
  function saveSettings() { update(s => ({ ...s, settings: { accountSize: +s1, maxRiskPct: +s2, trader: s3 || 'Operator' } })) }

  const takeMkt = state.markets.find(m => m.decision === 'TAKE') || state.markets[0]
  const alertText = telegramText(takeMkt)
  function copy() {
    try { navigator.clipboard.writeText(alertText) } catch (e) {}
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = 'project-takeover-backup.json'; a.click(); URL.revokeObjectURL(url)
    } catch (e) { window.alert('Export not available in this environment.') }
  }
  function importData(e) {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader()
    r.onload = () => { try { update(() => JSON.parse(r.result)) } catch (err) {} }; r.readAsText(f)
  }

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1>Your desk</h1>
      </div>

      <Section label="Account" />
      <div className="card pad">
        <Field label="Trader name"><input className="input" value={s3} onChange={e => setS3(e.target.value)} /></Field>
        <div className="row">
          <Field label="Account size ($)"><input className="input mono" inputMode="decimal" value={s1} onChange={e => setS1(e.target.value)} /></Field>
          <Field label="Max risk %"><input className="input mono" inputMode="decimal" value={s2} onChange={e => setS2(e.target.value)} /></Field>
        </div>
        <button className="btn primary" onClick={saveSettings}>Save settings</button>
      </div>

      <Section label="Telegram alert (copy-ready)" />
      <div className="card pad">
        <div className="xs mut2 mb">Generated from the current TAKE signal ({takeMkt.sym}). No bots, no API — copy and paste into your own channel.</div>
        <pre className="mono" style={{ whiteSpace: 'pre-wrap', background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 11, padding: 13, fontSize: 12.5, color: 'var(--text)', margin: 0 }}>{alertText}</pre>
        <button className="btn ghost mt" onClick={copy}>{copied ? 'Copied ✓' : 'Copy alert'}</button>
      </div>

      <Section label="Data" />
      <div className="card pad">
        <div className="grid cols-2">
          <button className="btn ghost" onClick={exportData}>Export backup (JSON)</button>
          <label className="btn ghost" style={{ cursor: 'pointer' }}>Import backup<input type="file" accept="application/json" onChange={importData} style={{ display: 'none' }} /></label>
        </div>
        <button className="btn red mt" onClick={() => { if (window.confirm('Reset everything to seed data? This cannot be undone.')) resetAll() }}>Reset to seed data</button>
        <div className="disc">All data lives only on this device via localStorage. Clearing your browser data or using private mode will erase it — export a backup regularly.</div>
      </div>

      <Section label="About" />
      <div className="card pad small muted">
        <b style={{ color: 'var(--text)' }}>Project Takeover — Decision Engine</b> is a research, decision, risk and journaling tool. It does <b style={{ color: 'var(--text)' }}>not</b> auto-trade, connect to a broker, or show live market data. Nothing here is financial advice — you are always the final decision maker.
      </div>
    </div>
  )
}

/* ============================================================
   7. APP SHELL + NAVIGATION
   ============================================================ */
const ICONS = {
  desk: 'M3 3h7v7H3zM14 3h7v4h-7zM14 9h7v12h-7zM3 12h7v9H3z',
  scan: 'M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 12h10',
  decide: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  risk: 'M3 3h18v4H3zM3 10h18M7 14h2M11 14h2M15 14h2M7 18h2M11 18h2M15 18h2',
  journal: 'M4 4h12a2 2 0 012 2v14l-4-2-4 2-4-2V6a2 2 0 012-2zM8 8h8M8 12h6',
  learn: 'M12 3l9 5-9 5-9-5 9-5zM21 8v6M7 11v4c0 1 2 3 5 3s5-2 5-3v-4',
  rules: 'M9 3h6l1 4H8zM6 7h12v14H6zM9 12h6M9 16h6',
  settings: 'M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h2M19 12h2M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19',
}
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICONS[name]} />
  </svg>
)

const NAV = [
  { id: 'desk', label: 'Desk', icon: 'desk' },
  { id: 'scan', label: 'Scanner', icon: 'scan' },
  { id: 'decide', label: 'Decide', icon: 'decide' },
  { id: 'risk', label: 'Risk', icon: 'risk' },
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'learn', label: 'Learning', icon: 'learn' },
  { id: 'rules', label: 'Rules', icon: 'rules' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]
const BOTTOM = ['desk', 'decide', 'risk', 'journal', 'learn']

function cloneSafe(o) { try { return structuredClone(o) } catch (e) { return JSON.parse(JSON.stringify(o)) } }

export default function App() {
  const [state, setState] = useState(() => Store.loadAll() || seed())
  const [page, setPage] = useState('desk')
  const [decideSym, setDecideSym] = useState('XAUUSD')
  const [menu, setMenu] = useState(false)

  useEffect(() => { Store.saveAll(state) }, [state])

  const update = useCallback(fn => setState(prev => {
    return typeof fn === 'function' ? fn(cloneSafe(prev)) : fn
  }), [])

  const addJournal = useCallback(entry => {
    update(s => { s.journal.unshift({ id: 'T-' + Math.floor(1000 + Math.random() * 9000), ...entry }); return { ...s } })
  }, [update])

  const openMarket = sym => { setDecideSym(sym); setPage('decide') }
  const resetAll = () => setState(seed())
  const go = id => { setPage(id); setMenu(false); window.scrollTo(0, 0) }

  let view
  if (page === 'desk') view = <Dashboard state={state} openMarket={openMarket} />
  else if (page === 'scan') view = <Scanner state={state} update={update} openMarket={openMarket} />
  else if (page === 'decide') view = <DecisionEngine state={state} update={update} addJournal={addJournal} sym={decideSym} setSym={setDecideSym} />
  else if (page === 'risk') view = <RiskCalc state={state} />
  else if (page === 'journal') view = <Journal state={state} update={update} addJournal={addJournal} />
  else if (page === 'learn') view = <Learning state={state} update={update} />
  else if (page === 'rules') view = <Rules state={state} update={update} />
  else if (page === 'settings') view = <Settings state={state} update={update} resetAll={resetAll} />

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">PT</div>
          <div><div className="ttl">PROJECT TAKEOVER</div><div className="sub">Decision Engine</div></div>
        </div>
        <nav className="nav">
          {NAV.map(n => (
            <div key={n.id} className={`navlink ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
              <Icon name={n.icon} />{n.label}
            </div>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="brand">
            <div className="mark">PT</div>
            <div><div className="ttl">PROJECT TAKEOVER</div><div className="sub">Decision Engine</div></div>
          </div>
          <button className="iconbtn menu" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
        </div>

        {view}
      </main>

      <nav className="tabbar">
        {BOTTOM.map(id => {
          const n = NAV.find(x => x.id === id)
          return (
            <button key={id} className={`tab ${page === id ? 'active' : ''}`} onClick={() => go(id)}>
              <Icon name={n.icon} />{n.label}
            </button>
          )
        })}
      </nav>

      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          <div className="flex between ac"><h3>All modules</h3><button className="iconbtn" onClick={() => setMenu(false)}>✕</button></div>
          <div className="grid cols-2 mt">
            {NAV.map(n => (
              <button key={n.id} className="btn ghost" style={{ justifyContent: 'flex-start', gap: 12 }} onClick={() => go(n.id)}>
                <span style={{ width: 18, height: 18, display: 'inline-flex', color: page === n.id ? 'var(--brass)' : 'var(--muted)' }}><Icon name={n.icon} /></span>{n.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
