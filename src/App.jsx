import React, { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'project_takeover_radar_v2'

const MARKET_DEFS = {
  XAUUSD: { name: 'Gold', type: 'metal', finnhub: 'OANDA:XAU_USD', twelve: 'XAU/USD', proxy: 'XAUUSD' },
  NQ: { name: 'Nasdaq 100', type: 'index', finnhub: 'QQQ', twelve: 'QQQ', proxy: 'QQQ proxy' },
  ES: { name: 'S&P 500', type: 'index', finnhub: 'SPY', twelve: 'SPY', proxy: 'SPY proxy' },
  EURUSD: { name: 'Euro / USD', type: 'fx', finnhub: 'OANDA:EUR_USD', twelve: 'EUR/USD', proxy: 'EURUSD' },
  GBPUSD: { name: 'Pound / USD', type: 'fx', finnhub: 'OANDA:GBP_USD', twelve: 'GBP/USD', proxy: 'GBPUSD' },
  USDJPY: { name: 'USD / Yen', type: 'fx', finnhub: 'OANDA:USD_JPY', twelve: 'USD/JPY', proxy: 'USDJPY' },
}
const MARKET_LIST = Object.keys(MARKET_DEFS)
const SETUP_STATES = ['NO SETUP','WATCHING','FORMING','READY','TRIGGERED','MANAGING','INVALIDATED','CLOSED']
const GRADES = ['A+','A','B','C','REJECT']
const MISTAKES = ['None','Variance','Execution mistake','Emotional mistake','Strategy mistake','Missed trade','Good skip','Entered too early','Chased entry','Oversized risk','No HTF displacement','News blindside']
const SESSIONS = ['Asia','London','NY AM','NY PM','Overlap']

const TF = {
  metal: [ ['W1','macro regime'], ['D1','institutional direction'], ['4H','structure bias'], ['1H','trade context'], ['15M','setup validation'], ['5M','precision entry'], ['1M','optional only'] ],
  index: [ ['D1','macro / risk regime'], ['4H','higher-timeframe structure'], ['1H','session bias'], ['15M','setup validation'], ['5M','execution'], ['1M','optional only'] ],
  fx: [ ['W1/D1','macro / rate direction'], ['4H','structure'], ['1H','context'], ['15M','validation'], ['5M','precision'] ],
}

function todayISO(){ return new Date().toISOString().slice(0,10) }
function id(prefix='S'){ return `${prefix}-${Math.random().toString(36).slice(2,6).toUpperCase()}` }
function n(v){ const x = Number(v); return Number.isFinite(x) ? x : null }
function fmt(v, d=2){ const x=n(v); return x===null ? '—' : x.toLocaleString(undefined,{maximumFractionDigits:d}) }
function pct(v){ const x=n(v); return x===null ? '—' : `${x.toFixed(2)}%` }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)) }
function directionSign(direction){ return direction === 'LONG' ? 1 : direction === 'SHORT' ? -1 : 0 }

function defaultZones(){
  return MARKET_LIST.reduce((acc, sym) => {
    acc[sym] = { watchLow:'', watchHigh:'', entryLow:'', entryHigh:'', invalidation:'', tp1:'', tp2:'', tp3:'', direction:'LONG', htfBias:'neutral', setupType:'', requiredConfirmation:'1H displacement + 15M retest' }
    return acc
  }, {})
}
function defaultPrices(){ return MARKET_LIST.reduce((a,s)=>{ a[s] = { price:null, source:'manual', status:'manual', updated:null, error:'' }; return a }, {}) }
function defaultScreens(){ return MARKET_LIST.reduce((acc, sym)=>{ acc[sym] = (TF[MARKET_DEFS[sym].type]||[]).map(([tf,role],i)=>({tf,role,checked:false,notes:'',requiredNext:i===0})) ; return acc }, {}) }
function seedState(){
  const zones = defaultZones()
  zones.XAUUSD = { watchLow:'2321', watchHigh:'2334', entryLow:'2327.5', entryHigh:'2329.5', invalidation:'2321.8', tp1:'2340', tp2:'2358', tp3:'2380', direction:'LONG', htfBias:'bullish', setupType:'HTF sweep + displacement', requiredConfirmation:'1H displacement + 15M retest' }
  const setups = [
    { id:'S-001', market:'XAUUSD', direction:'LONG', status:'READY', grade:'A', riskPct:0.5, entry:'2328.50', sl:'2321.80', tp1:'2340', tp2:'2358', tp3:'2380', reason:'HTF bullish + price inside entry zone + clean upside route.', missing:'Final chart check only.', invalidation:'1H close below 2321.80', nextAction:'Verify chart. Place limit only, no chase.', createdAt:new Date().toISOString(), taken:false },
    { id:'S-002', market:'EURUSD', direction:'SHORT', status:'FORMING', grade:'B', riskPct:0.25, entry:'', sl:'', tp1:'', tp2:'', tp3:'', reason:'London liquidity is being built above current price.', missing:'Sweep + 1H displacement.', invalidation:'D1 bias flips bullish.', nextAction:'Watch only. No entry.', createdAt:new Date().toISOString(), taken:false },
  ]
  const trades = [
    { id:'T-001', setupId:'S-001', market:'XAUUSD', direction:'LONG', status:'MANAGING', entry:'2328.50', sl:'2321.80', tp1:'2340', tp2:'2358', tp3:'2380', riskPct:0.5, openedAt:new Date().toISOString(), closedAt:'', result:'open', r:0, notes:'Seed example.' }
  ]
  const journal = [
    { id:'J-001', market:'NQ', date:new Date(Date.now()-86400000).toISOString(), session:'NY AM', setupType:'OR breakout', decision:'WAIT', taken:true, result:'loss', r:-1, classification:'Execution mistake', mistake:'Entered too early', emotion:'FOMO', lesson:'Require HTF displacement before A rating.' },
    { id:'J-002', market:'ES', date:new Date(Date.now()-4*86400000).toISOString(), session:'NY AM', setupType:'Reversal', decision:'WAIT', taken:true, result:'loss', r:-1, classification:'Execution mistake', mistake:'Entered too early', emotion:'FOMO', lesson:'Same early-entry pattern.' },
    { id:'J-003', market:'NQ', date:new Date(Date.now()-6*86400000).toISOString(), session:'NY AM', setupType:'Continuation', decision:'WAIT', taken:true, result:'loss', r:-1, classification:'Execution mistake', mistake:'Entered too early', emotion:'Anxious', lesson:'Do not enter before 1H confirmation.' },
    { id:'J-004', market:'GBPUSD', date:new Date(Date.now()-9*86400000).toISOString(), session:'London', setupType:'Sweep + BOS', decision:'TAKE', taken:true, result:'win', r:3.2, classification:'Variance', mistake:'None', emotion:'Focused', lesson:'Good process.' },
  ]
  return {
    settings:{ trader:'Operator', accountSize:10000, maxRiskPct:1, dataProvider:'manual', finnhubKey:'', twelveKey:'', pollSeconds:60, economicCalendarUrl:'', customWebhookUrl:'' },
    prices: defaultPrices(), zones, setups, trades, journal, screens: defaultScreens(),
    daily:{ date:todayISO(), sleep:'good', mental:'calm', news:'', primary:'XAUUSD', secondary:'EURUSD', noTrade:'', maxRisk:1, maxTrades:3, command:'Focus on Gold first. Everything else must prove itself.' },
    rules:['Never risk more than 1% on a single trade.','Live price can only trigger WATCH / READY / INVALID — never TAKE.','No A+ without HTF bias + liquidity + displacement + valid RR.','Two losses in one day: stop or reduce to 0.25%.','One normal loss is variance, not a strategy change.']
  }
}
function loadState(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seedState() } catch { return seedState() } }

function setupFromZone(sym, zone, priceObj){
  const price = n(priceObj?.price)
  const z = zone || {}
  const wl=n(z.watchLow), wh=n(z.watchHigh), el=n(z.entryLow), eh=n(z.entryHigh), inv=n(z.invalidation)
  const tps=[n(z.tp1),n(z.tp2),n(z.tp3)]
  let status = 'NO SETUP', reason = 'No active zone configured.', next = 'Set watch zone and entry zone.', missing = 'Watch zone', grade='REJECT'
  if(price !== null && wl !== null && wh !== null && price >= Math.min(wl,wh) && price <= Math.max(wl,wh)) { status='WATCHING'; reason='Price entered watch zone.'; next='Wait for confirmation. No market entry.'; missing=z.requiredConfirmation || 'confirmation'; grade='C' }
  if(price !== null && el !== null && eh !== null && price >= Math.min(el,eh) && price <= Math.max(el,eh)) { status='READY'; reason='Price is inside entry zone.'; next='Run Decision Engine before execution.'; missing='Decision Engine confirmation'; grade = z.htfBias && z.htfBias !== 'neutral' ? 'A' : 'B' }
  if(price !== null && inv !== null) {
    if(z.direction === 'LONG' && price <= inv) { status='INVALIDATED'; reason='Price hit invalidation.'; next='No trade. Archive setup.'; missing='—'; grade='REJECT' }
    if(z.direction === 'SHORT' && price >= inv) { status='INVALIDATED'; reason='Price hit invalidation.'; next='No trade. Archive setup.'; missing='—'; grade='REJECT' }
  }
  const tpHit = price !== null && tps.findIndex(tp => tp !== null && ((z.direction==='LONG' && price>=tp) || (z.direction==='SHORT' && price<=tp)))
  if(tpHit >= 0){ status='MANAGING'; reason=`TP${tpHit+1} reached or passed.`; next='Manage position according to plan.'; missing='management' }
  return { status, reason, next, missing, grade }
}
function distanceToZone(price, low, high){ const p=n(price), l=n(low), h=n(high); if(p===null||l===null||h===null) return null; if(p>=Math.min(l,h)&&p<=Math.max(l,h)) return 0; return p<Math.min(l,h) ? Math.min(l,h)-p : p-Math.max(l,h) }
function computeFloatingR(trade, price){
  const p=n(price), e=n(trade.entry), sl=n(trade.sl); if(p===null||e===null||sl===null||e===sl) return null
  const sign = directionSign(trade.direction); return ((p-e)*sign / Math.abs(e-sl))
}
function riskCalc({accountSize,riskPct,entry,sl,tp1,market}){
  const specs = { XAUUSD:100, NQ:20, ES:50, EURUSD:100000, GBPUSD:100000, USDJPY:1000 }
  const e=n(entry), s=n(sl), t=n(tp1), acct=n(accountSize)||0, rp=n(riskPct)||0
  if(e===null||s===null||e===s) return { ok:false, dollars:0, size:0, rr:null, stop:0 }
  const stop = Math.abs(e-s), dollars = acct*rp/100, perPoint = specs[market] || 100000
  const size = dollars/(stop*perPoint)
  const rr = t===null ? null : Math.abs(t-e)/stop
  return { ok: rp <= 1 && (rr===null || rr>=3), dollars, size, rr, stop }
}
function governor(journal){
  const today = journal.filter(j => j.taken && new Date(j.date).toDateString() === new Date().toDateString())
  const losses = today.filter(j=>j.result==='loss').length
  if(today.length >= 3) return { state:'LOCKED', msg:'Daily cap reached. Desk closed.', riskCap:0 }
  if(losses >= 2) return { state:'DANGER', msg:'Two losses today. Protect capital, no dopamine hunting.', riskCap:0.25 }
  return { state:'OPEN', msg:`Desk open. ${today.length}/3 trades today, ${losses} losses.`, riskCap:1 }
}
function learning(journal){
  const counts={}; journal.forEach(j=>{ if(j.mistake && j.mistake !== 'None') counts[j.mistake]=(counts[j.mistake]||0)+1 })
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,c])=>({ label:k, count:c, tier:c>=20?'rule candidate':c>=10?'strong hypothesis':c>=5?'hypothesis':c>=3?'pattern':'observation' }))
}
async function fetchPrice(provider, sym, settings){
  const def = MARKET_DEFS[sym]
  if(provider === 'finnhub' && settings.finnhubKey){
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(def.finnhub)}&token=${encodeURIComponent(settings.finnhubKey)}`
    const r = await fetch(url); const j = await r.json(); if(j.c) return { price:j.c, source:'Finnhub', status:'live', updated:new Date().toISOString(), error:'' }
    throw new Error(j.error || 'Finnhub returned no price')
  }
  if(provider === 'twelve' && settings.twelveKey){
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(def.twelve)}&apikey=${encodeURIComponent(settings.twelveKey)}`
    const r = await fetch(url); const j = await r.json(); if(j.price) return { price:Number(j.price), source:'Twelve Data', status:'live', updated:new Date().toISOString(), error:'' }
    throw new Error(j.message || 'Twelve Data returned no price')
  }
  throw new Error('Manual mode or missing API key')
}

function Badge({children, tone='neutral'}){ return <span className={`badge ${tone}`}>{children}</span> }
function Button({children, tone='primary', ...props}){ return <button className={`btn ${tone}`} {...props}>{children}</button> }
function Field({label, children}){ return <label className="field"><span>{label}</span>{children}</label> }
function TextInput(props){ return <input className="input" {...props} /> }
function Select(props){ return <select className="input" {...props} /> }
function Area(props){ return <textarea className="input area" {...props} /> }
function Card({children, className=''}){ return <section className={`card ${className}`}>{children}</section> }

function App(){
  const [state,setState] = useState(loadState)
  const [page,setPage] = useState('radar')
  const [selected,setSelected] = useState('XAUUSD')
  const [manualPrice,setManualPrice] = useState('')
  useEffect(()=>{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) },[state])
  const update = fn => setState(s => typeof fn === 'function' ? fn(structuredClone(s)) : fn)
  const gov = useMemo(()=>governor(state.journal),[state.journal])
  const liveStatuses = useMemo(()=>MARKET_LIST.reduce((acc,sym)=>{ acc[sym]=setupFromZone(sym,state.zones[sym],state.prices[sym]); return acc },{}),[state.zones,state.prices])
  const activeTrades = state.trades.filter(t=>!['CLOSED','INVALIDATED'].includes(t.status))
  const rankedMarkets = MARKET_LIST.map(sym=>{
    const st = liveStatuses[sym]; const base = st.status==='READY'?90:st.status==='MANAGING'?84:st.status==='FORMING'?72:st.status==='WATCHING'?62:st.status==='INVALIDATED'?0:35
    return { sym, ...st, score:base, price:state.prices[sym]?.price }
  }).sort((a,b)=>b.score-a.score)
  const primary = rankedMarkets.find(m=>['READY','MANAGING','WATCHING','FORMING'].includes(m.status)) || rankedMarkets[0]

  async function refreshPrices(){
    const provider = state.settings.dataProvider
    if(provider === 'manual') return
    for(const sym of MARKET_LIST){
      try{ const p = await fetchPrice(provider, sym, state.settings); update(s=>{ s.prices[sym]=p; return s }) }
      catch(e){ update(s=>{ s.prices[sym] = { ...s.prices[sym], source:provider, status:'error', updated:new Date().toISOString(), error:e.message }; return s }) }
    }
  }
  useEffect(()=>{
    if(state.settings.dataProvider === 'manual') return
    refreshPrices()
    const ms = clamp(Number(state.settings.pollSeconds)||60, 15, 300)*1000
    const t = setInterval(refreshPrices, ms)
    return ()=>clearInterval(t)
  },[state.settings.dataProvider,state.settings.finnhubKey,state.settings.twelveKey,state.settings.pollSeconds])

  function createSetup(sym){
    const z = state.zones[sym]; const st = liveStatuses[sym];
    const setup = { id:id('S'), market:sym, direction:z.direction, status:st.status==='NO SETUP'?'WATCHING':st.status, grade:st.grade, riskPct:st.grade==='A'?0.5:0.25, entry:z.entryLow || '', sl:z.invalidation || '', tp1:z.tp1||'', tp2:z.tp2||'', tp3:z.tp3||'', reason:st.reason, missing:st.missing, invalidation:z.invalidation?`${z.direction==='LONG'?'Below':'Above'} ${z.invalidation}`:'Not defined', nextAction:st.next, createdAt:new Date().toISOString(), taken:false }
    update(s=>{ s.setups.unshift(setup); return s })
    setPage('radar')
  }
  function markTaken(setup){
    const trade = { id:id('T'), setupId:setup.id, market:setup.market, direction:setup.direction, status:'MANAGING', entry:setup.entry, sl:setup.sl, tp1:setup.tp1, tp2:setup.tp2, tp3:setup.tp3, riskPct:setup.riskPct, openedAt:new Date().toISOString(), closedAt:'', result:'open', r:0, notes:setup.reason }
    update(s=>{ const x=s.setups.find(a=>a.id===setup.id); if(x){x.taken=true;x.status='TRIGGERED'} s.trades.unshift(trade); return s })
  }
  function closeTrade(trade, result){
    const currentR = computeFloatingR(trade, state.prices[trade.market]?.price) || 0
    update(s=>{ const t=s.trades.find(x=>x.id===trade.id); if(t){t.status='CLOSED';t.result=result;t.r=Number(currentR.toFixed(2));t.closedAt=new Date().toISOString()} s.journal.unshift({ id:id('J'), market:trade.market, date:new Date().toISOString(), session:'Manual', setupType:'Radar setup', decision:'TAKE', taken:true, result, r:Number(currentR.toFixed(2)), classification: result==='loss'?'Variance':'Good skip', mistake:'None', emotion:'Calm', lesson:'' }); return s })
  }
  const pages = { radar:'Radar', scanner:'Scanner', decide:'Decide', risk:'Risk', trades:'Trades', journal:'Journal', learning:'Learning', daily:'Daily', weekly:'CEO Review', settings:'Settings' }
  const render = {
    radar:<Radar state={state} primary={primary} rankedMarkets={rankedMarkets} activeTrades={activeTrades} liveStatuses={liveStatuses} setPage={setPage} setSelected={setSelected} createSetup={createSetup} markTaken={markTaken} gov={gov} closeTrade={closeTrade}/>,
    scanner:<Scanner state={state} update={update} rankedMarkets={rankedMarkets} liveStatuses={liveStatuses} refreshPrices={refreshPrices} setSelected={setSelected} setPage={setPage} manualPrice={manualPrice} setManualPrice={setManualPrice}/>,
    decide:<Decide state={state} update={update} selected={selected} setSelected={setSelected} createSetup={createSetup}/>,
    risk:<Risk state={state}/>,
    trades:<Trades state={state} update={update} closeTrade={closeTrade}/>,
    journal:<Journal state={state} update={update}/>,
    learning:<Learning state={state}/>,
    daily:<Daily state={state} update={update}/>,
    weekly:<Weekly state={state}/>,
    settings:<Settings state={state} update={update}/>,
  }
  return <div className="app">
    <aside className="side"><Logo/><nav>{Object.entries(pages).map(([k,v])=><button key={k} className={page===k?'active':''} onClick={()=>setPage(k)}>{v}</button>)}</nav></aside>
    <main className="main"><MobileTop page={pages[page]}/>{render[page]}</main>
    <nav className="bottom">{['radar','scanner','decide','trades','settings'].map(k=><button key={k} className={page===k?'active':''} onClick={()=>setPage(k)}>{pages[k]}</button>)}</nav>
  </div>
}
function Logo(){ return <div className="logo"><div className="logoMark">PT</div><div><b>PROJECT TAKEOVER</b><span>SETUP RADAR</span></div></div> }
function MobileTop({page}){ return <div className="mobileTop"><Logo/><Badge tone="gold">{page}</Badge></div> }
function Header({kicker,title,sub}){ return <header className="head"><p>{kicker}</p><h1>{title}</h1>{sub&&<span>{sub}</span>}</header> }

function Radar({state, primary, rankedMarkets, activeTrades, liveStatuses, setPage, setSelected, createSetup, markTaken, gov, closeTrade}){
  const setupsNow = state.setups.filter(s=>['READY','TRIGGERED'].includes(s.status) && !s.taken)
  const setupsLater = state.setups.filter(s=>['WATCHING','FORMING'].includes(s.status) && !s.taken)
  return <>
    <Header kicker="Setup Radar" title="Today’s command" sub="Live prices create WATCH / READY / INVALID. The Decision Engine still decides TAKE / WAIT / SKIP."/>
    <Card className="command">
      <div><span className="muted">PRIMARY MARKET</span><h2>{primary.sym}</h2><p>{MARKET_DEFS[primary.sym].name} · price {fmt(primary.price, primary.sym.includes('JPY')?3:2)}</p></div>
      <div className="verdict"><Badge tone={primary.status==='READY'?'green':primary.status==='INVALIDATED'?'red':'amber'}>{primary.status}</Badge><strong>{primary.grade}</strong></div>
      <div className="reason"><b>{primary.reason}</b><span>{primary.next}</span></div>
      <div className="actions"><Button onClick={()=>{setSelected(primary.sym); setPage('decide')}}>Run Decision</Button><Button tone="steel" onClick={()=>createSetup(primary.sym)}>Save Setup</Button></div>
    </Card>
    <div className={`banner ${gov.state.toLowerCase()}`}>{gov.state}: {gov.msg}</div>
    <section className="split">
      <div><h3>Setups now</h3>{setupsNow.length?setupsNow.map(s=><SetupCard key={s.id} setup={s} markTaken={markTaken}/>):<Empty text="No READY setups. Good. No forcing."/>}</div>
      <div><h3>Setups later</h3>{setupsLater.length?setupsLater.map(s=><SetupCard key={s.id} setup={s} markTaken={markTaken}/>):<Empty text="No forming setups."/>}</div>
    </section>
    <section><h3>Active trades</h3>{activeTrades.length?activeTrades.map(t=><TradeMonitor key={t.id} trade={t} price={state.prices[t.market]?.price} closeTrade={closeTrade}/>):<Empty text="No active trades."/>}</section>
    <section><h3>Market ranking</h3><div className="rankGrid">{rankedMarkets.map(m=><button className="rank" key={m.sym} onClick={()=>{setSelected(m.sym);setPage('scanner')}}><span>{m.sym}</span><Badge tone={m.status==='READY'?'green':m.status==='INVALIDATED'?'red':m.status==='NO SETUP'?'neutral':'amber'}>{m.status}</Badge><b>{m.grade}</b><small>{m.reason}</small></button>)}</div></section>
  </>
}
function SetupCard({setup, markTaken}){ return <Card className="setup"><div className="setupTop"><b>{setup.market} {setup.direction}</b><Badge tone={setup.status==='READY'?'green':'amber'}>{setup.status}</Badge></div><h4>{setup.grade} · risk {setup.riskPct}%</h4><p>{setup.reason}</p><dl><dt>Entry</dt><dd>{setup.entry||'—'}</dd><dt>SL</dt><dd>{setup.sl||'—'}</dd><dt>TP</dt><dd>{[setup.tp1,setup.tp2,setup.tp3].filter(Boolean).join(' / ')||'—'}</dd></dl><p className="muted">Missing: {setup.missing}</p><p className="muted">Invalidation: {setup.invalidation}</p><Button tone="green" onClick={()=>markTaken(setup)}>Mark taken</Button></Card> }
function TradeMonitor({trade, price, closeTrade}){ const r=computeFloatingR(trade, price); return <Card className="trade"><div><b>{trade.market} {trade.direction}</b><span>Live {fmt(price)}</span></div><strong className={r>=0?'greenText':'redText'}>{r===null?'—':`${r.toFixed(2)}R`}</strong><p>Entry {trade.entry} · SL {trade.sl} · TP1 {trade.tp1}</p><div className="row"><Button tone="steel" onClick={()=>closeTrade(trade,'win')}>Close win</Button><Button tone="red" onClick={()=>closeTrade(trade,'loss')}>Close loss</Button></div></Card> }
function Empty({text}){ return <Card className="empty">{text}</Card> }

function Scanner({state, update, rankedMarkets, liveStatuses, refreshPrices, setSelected, setPage, manualPrice, setManualPrice}){
  return <><Header kicker="Live Pair Scanner" title="Scanner + watch zones" sub="Free APIs are optional. Manual mode always works."/><Card><div className="row"><Button onClick={refreshPrices}>Refresh live prices</Button><Button tone="steel" onClick={()=>setPage('settings')}>Data settings</Button></div></Card><div className="scanList">{MARKET_LIST.map(sym=><MarketRow key={sym} sym={sym} state={state} update={update} status={liveStatuses[sym]} setSelected={setSelected} setPage={setPage} manualPrice={manualPrice} setManualPrice={setManualPrice}/>)}</div></>
}
function MarketRow({sym,state,update,status,setSelected,setPage,manualPrice,setManualPrice}){
  const p=state.prices[sym], z=state.zones[sym]
  function updZone(k,v){ update(s=>{ s.zones[sym][k]=v; return s }) }
  function setPrice(){ const val=n(manualPrice); if(val!==null) update(s=>{ s.prices[sym]={price:val,source:'manual',status:'manual',updated:new Date().toISOString(),error:''}; return s }) }
  return <Card className="marketRow"><div className="marketHead"><div><h3>{sym}</h3><p>{MARKET_DEFS[sym].name} · {MARKET_DEFS[sym].proxy}</p></div><div><Badge tone={status.status==='READY'?'green':status.status==='INVALIDATED'?'red':status.status==='NO SETUP'?'neutral':'amber'}>{status.status}</Badge><strong>{fmt(p.price, sym==='USDJPY'?3:2)}</strong></div></div><p>{status.reason} <span className="muted">Next: {status.next}</span></p><div className="zoneGrid"><Field label="Watch low"><TextInput value={z.watchLow} onChange={e=>updZone('watchLow',e.target.value)}/></Field><Field label="Watch high"><TextInput value={z.watchHigh} onChange={e=>updZone('watchHigh',e.target.value)}/></Field><Field label="Entry low"><TextInput value={z.entryLow} onChange={e=>updZone('entryLow',e.target.value)}/></Field><Field label="Entry high"><TextInput value={z.entryHigh} onChange={e=>updZone('entryHigh',e.target.value)}/></Field><Field label="Invalidation"><TextInput value={z.invalidation} onChange={e=>updZone('invalidation',e.target.value)}/></Field><Field label="TP1"><TextInput value={z.tp1} onChange={e=>updZone('tp1',e.target.value)}/></Field></div><div className="row"><Select value={z.direction} onChange={e=>updZone('direction',e.target.value)}><option>LONG</option><option>SHORT</option></Select><Select value={z.htfBias} onChange={e=>updZone('htfBias',e.target.value)}><option>bullish</option><option>neutral</option><option>bearish</option></Select><Button tone="steel" onClick={()=>{setSelected(sym);setPage('decide')}}>Decide</Button></div><div className="row"><TextInput placeholder="manual price" value={manualPrice} onChange={e=>setManualPrice(e.target.value)}/><Button tone="steel" onClick={setPrice}>Set price</Button></div><small className="muted">Source {p.source} · {p.status} · {p.error}</small></Card>
}
function Decide({state,update,selected,setSelected,createSetup}){
  const [checks,setChecks]=useState({regime:false,macro:false,liquidity:false,structure:false,displacement:false,route:false,execution:false,rr:false,psych:true,news:true})
  const score = Object.entries(checks).reduce((a,[k,v])=>a+(v?(k==='psych'||k==='news'?8:12):0),0)
  const decision = !checks.psych || !checks.news ? 'SKIP' : score>=84 ? 'TAKE TRADE' : score>=56 ? 'WAIT' : 'SKIP'
  const risk = decision==='TAKE TRADE' ? (score>=96?1:0.5) : decision==='WAIT'?0.25:0
  const z=state.zones[selected]
  const screens=state.screens[selected]||[]
  function updScreen(i,k,v){ update(s=>{ s.screens[selected][i][k]=v; return s }) }
  return <><Header kicker="Decision Engine" title="Validate the setup" sub="Live price can prepare a setup. Only this gate can approve a trade."/><div className="selector">{MARKET_LIST.map(s=><button className={s===selected?'active':''} onClick={()=>setSelected(s)} key={s}>{s}</button>)}</div><Card className={`decision ${decision.includes('TAKE')?'take':decision==='WAIT'?'wait':'skip'}`}><span>FINAL DECISION</span><h2>{decision}</h2><p>{decision.includes('TAKE')?'Place limit order only. No chase.':decision==='WAIT'?'Wait for missing confirmation. Set alert.':'No trade. Protect capital.'}</p><div className="row"><Badge tone={decision.includes('TAKE')?'green':decision==='WAIT'?'amber':'red'}>{score}/100</Badge><Badge tone="gold">Risk {risk}%</Badge></div><p><b>Invalidation:</b> {z.invalidation || 'not defined'}</p><p><b>Next:</b> {decision.includes('TAKE')?'Verify chart and calculate risk.': 'Wait for 1H displacement + 15M retest.'}</p></Card><section className="split"><Card><h3>Confluence gates</h3>{Object.keys(checks).map(k=><label className="check" key={k}><input type="checkbox" checked={checks[k]} onChange={e=>setChecks({...checks,[k]:e.target.checked})}/><span>{k}</span></label>)}<Button onClick={()=>createSetup(selected)}>Create setup dossier</Button></Card><Card><h3>Screenshot workflow</h3>{screens.map((x,i)=><div className="tf" key={x.tf}><label><input type="checkbox" checked={x.checked} onChange={e=>updScreen(i,'checked',e.target.checked)}/><b>{x.tf}</b><span>{x.role}</span>{x.requiredNext&&<Badge tone="amber">required next</Badge>}</label><TextInput placeholder="notes" value={x.notes} onChange={e=>updScreen(i,'notes',e.target.value)}/></div>)}</Card></section></>
}
function Risk({state}){ const [form,setForm]=useState({market:'XAUUSD',entry:'2328.50',sl:'2321.80',tp1:'2340',riskPct:1}); const r=riskCalc({accountSize:state.settings.accountSize,...form}); const set=(k,v)=>setForm({...form,[k]:v}); return <><Header kicker="Risk Calculator" title="Size before execution" sub="Max 1%. Estimates only — verify inside broker."/><Card><div className="zoneGrid"><Field label="Market"><Select value={form.market} onChange={e=>set('market',e.target.value)}>{MARKET_LIST.map(m=><option key={m}>{m}</option>)}</Select></Field><Field label="Risk %"><TextInput value={form.riskPct} onChange={e=>set('riskPct',e.target.value)}/></Field><Field label="Entry"><TextInput value={form.entry} onChange={e=>set('entry',e.target.value)}/></Field><Field label="SL"><TextInput value={form.sl} onChange={e=>set('sl',e.target.value)}/></Field><Field label="TP1"><TextInput value={form.tp1} onChange={e=>set('tp1',e.target.value)}/></Field></div></Card><div className="stats"><Card><span>Dollar risk</span><b>${fmt(r.dollars)}</b></Card><Card><span>Position estimate</span><b>{fmt(r.size,4)}</b></Card><Card><span>RR to TP1</span><b>{r.rr?`1:${r.rr.toFixed(2)}`:'—'}</b></Card><Card><span>Status</span><b className={r.ok?'greenText':'redText'}>{r.ok?'APPROVED':'REJECTED'}</b></Card></div></> }
function Trades({state,closeTrade}){ return <><Header kicker="Trades" title="Active trade monitor" sub="Track floating R and manage according to plan."/>{state.trades.length?state.trades.map(t=><TradeMonitor key={t.id} trade={t} price={state.prices[t.market]?.price} closeTrade={closeTrade}/>):<Empty text="No trades."/>}</> }
function Journal({state,update}){ const [form,setForm]=useState({market:'XAUUSD',date:new Date().toISOString(),session:'London',setupType:'',decision:'WAIT',taken:false,result:'skipped',r:0,classification:'Variance',mistake:'None',emotion:'Calm',lesson:''}); function add(){ update(s=>{ s.journal.unshift({...form,id:id('J')}); return s }) } return <><Header kicker="Journal" title="Every setup is a dossier" sub="Classify losses correctly: variance is not a mistake."/><Card><div className="zoneGrid"><Field label="Market"><Select value={form.market} onChange={e=>setForm({...form,market:e.target.value})}>{MARKET_LIST.map(m=><option key={m}>{m}</option>)}</Select></Field><Field label="Session"><Select value={form.session} onChange={e=>setForm({...form,session:e.target.value})}>{SESSIONS.map(s=><option key={s}>{s}</option>)}</Select></Field><Field label="Classification"><Select value={form.classification} onChange={e=>setForm({...form,classification:e.target.value})}>{MISTAKES.slice(1,7).map(m=><option key={m}>{m}</option>)}</Select></Field><Field label="Mistake"><Select value={form.mistake} onChange={e=>setForm({...form,mistake:e.target.value})}>{MISTAKES.map(m=><option key={m}>{m}</option>)}</Select></Field><Field label="R result"><TextInput value={form.r} onChange={e=>setForm({...form,r:e.target.value})}/></Field></div><Field label="Lesson"><Area value={form.lesson} onChange={e=>setForm({...form,lesson:e.target.value})}/></Field><Button onClick={add}>Add journal item</Button></Card><div>{state.journal.map(j=><Card key={j.id} className="journal"><b>{j.market}</b><Badge tone={j.result==='win'?'green':j.result==='loss'?'red':'neutral'}>{j.result}</Badge><p>{j.classification} · {j.mistake} · {j.r}R</p><small>{j.lesson}</small></Card>)}</div></> }
function Learning({state}){ const l=learning(state.journal); return <><Header kicker="Self-Learning" title="Evidence, not panic" sub="The strategy changes only when repeated data demands it."/><div className="banner open">1 = observation · 3 = pattern · 5 = hypothesis · 10 = strong · 20 = rule candidate</div>{l.map(x=><Card key={x.label} className="learn"><b>{x.label}</b><Badge tone={x.count>=5?'amber':'neutral'}>{x.tier}</Badge><p>{x.count} recurring examples</p></Card>)}</> }
function Daily({state,update}){ const d=state.daily; const set=(k,v)=>update(s=>{ s.daily[k]=v; return s }); return <><Header kicker="Daily Flow" title="Run the day like a desk" sub="Morning scan → active watch → decision → evening review."/><Card><div className="zoneGrid"><Field label="Primary market"><Select value={d.primary} onChange={e=>set('primary',e.target.value)}>{MARKET_LIST.map(m=><option key={m}>{m}</option>)}</Select></Field><Field label="Secondary"><Select value={d.secondary} onChange={e=>set('secondary',e.target.value)}>{MARKET_LIST.map(m=><option key={m}>{m}</option>)}</Select></Field><Field label="Mental state"><TextInput value={d.mental} onChange={e=>set('mental',e.target.value)}/></Field><Field label="Max trades"><TextInput value={d.maxTrades} onChange={e=>set('maxTrades',e.target.value)}/></Field></div><Field label="Today’s command"><Area value={d.command} onChange={e=>set('command',e.target.value)}/></Field><Field label="High-impact news"><Area value={d.news} onChange={e=>set('news',e.target.value)}/></Field></Card></> }
function Weekly({state}){ const j=state.journal; const taken=j.filter(x=>x.taken); const wins=taken.filter(x=>x.result==='win').length; const losses=taken.filter(x=>x.result==='loss').length; const net=taken.reduce((a,x)=>a+(Number(x.r)||0),0); const learn=learning(j)[0]; return <><Header kicker="Weekly CEO Review" title="Prop-desk performance review" sub="What improved expectancy, what destroyed it, and what changes next week."/><div className="stats"><Card><span>Trades</span><b>{taken.length}</b></Card><Card><span>Winrate</span><b>{wins+losses?Math.round(wins/(wins+losses)*100):0}%</b></Card><Card><span>Net R</span><b className={net>=0?'greenText':'redText'}>{net.toFixed(1)}R</b></Card><Card><span>Repeated pattern</span><b>{learn?.label || 'none'}</b></Card></div><Card><h3>Next week focus</h3><p>{learn ? `Reduce: ${learn.label}. Proposed test: no A rating unless this failure mode is explicitly blocked.` : 'Keep collecting clean data.'}</p></Card></> }
function Settings({state,update}){ const set=(k,v)=>update(s=>{ s.settings[k]=v; return s }); function exportJson(){ const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='project-takeover-backup.json'; a.click() } return <><Header kicker="Settings" title="Your desk" sub="API keys in localStorage are not secret. Move to serverless functions later."/><Card><div className="zoneGrid"><Field label="Trader"><TextInput value={state.settings.trader} onChange={e=>set('trader',e.target.value)}/></Field><Field label="Account size"><TextInput value={state.settings.accountSize} onChange={e=>set('accountSize',e.target.value)}/></Field><Field label="Max risk"><TextInput value={state.settings.maxRiskPct} onChange={e=>set('maxRiskPct',e.target.value)}/></Field><Field label="Data provider"><Select value={state.settings.dataProvider} onChange={e=>set('dataProvider',e.target.value)}><option value="manual">Manual</option><option value="finnhub">Finnhub</option><option value="twelve">Twelve Data</option></Select></Field><Field label="Finnhub API key"><TextInput value={state.settings.finnhubKey} onChange={e=>set('finnhubKey',e.target.value)}/></Field><Field label="Twelve Data API key"><TextInput value={state.settings.twelveKey} onChange={e=>set('twelveKey',e.target.value)}/></Field><Field label="Poll seconds"><TextInput value={state.settings.pollSeconds} onChange={e=>set('pollSeconds',e.target.value)}/></Field><Field label="Economic Calendar URL"><TextInput value={state.settings.economicCalendarUrl} onChange={e=>set('economicCalendarUrl',e.target.value)}/></Field></div><Button onClick={exportJson}>Export backup</Button></Card></> }

export default App
