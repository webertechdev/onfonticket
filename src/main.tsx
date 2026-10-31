import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Headphones, Monitor, Phone, Printer, RotateCcw, ShieldCheck, Ticket as TicketIcon, Volume2, VolumeX, Wifi } from 'lucide-react'
import { businessDate, formatTime, getService, isValidLocalPhone, maskPhone, SERVICES } from './domain/rules'
import type { ServiceKey, Ticket, TellerMode } from './domain/types'
import { demoQueue } from './lib/demoQueue'
import { clearDraft, loadDraft, saveDraft } from './lib/draft'
import './styles.css'

function useQueue() {
  const [snapshot, setSnapshot] = useState(demoQueue.getSnapshot)
  useEffect(() => demoQueue.subscribe(() => setSnapshot(demoQueue.getSnapshot())), [])
  return snapshot
}

function AppShell() {
  const location = useLocation()
  const role = location.pathname === '/kiosk' ? 'Kiosk' : location.pathname === '/display' ? 'Customer display' : location.pathname === '/manager' ? 'Risk Manager' : location.pathname === '/teller' ? 'Teller desk' : 'Operations'
  return <div className="app-shell">
    <header className="topbar">
      <Link className="brand" to="/"><span className="brand-mark">O</span><span><strong>ONFON MOBILE</strong><small>Risk Department</small></span></Link>
      <div className="topbar-right"><span className="connection"><span className="status-dot" /> Demo mode</span><span className="current-role">{role}</span></div>
    </header>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/teller" element={<TellerDashboard />} />
      <Route path="/manager" element={<ManagerDashboard />} />
      <Route path="/display" element={<DisplayBoard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </div>
}

function Home() {
  const cards = [
    { to: '/kiosk', icon: <Phone />, title: 'Customer kiosk', desc: 'Register a customer, normalize their phone number, and print a compact ticket.', tone: 'blue' },
    { to: '/teller', icon: <TicketIcon />, title: 'Teller dashboard', desc: 'Call the next eligible customer, recall, serve, complete, or mark unattended.', tone: 'green' },
    { to: '/manager', icon: <ShieldCheck />, title: 'Risk Manager', desc: 'Monitor every service, printer state, staff activity, and operational metric.', tone: 'amber' },
    { to: '/display', icon: <Monitor />, title: 'TV display', desc: 'Show called tickets and teller numbers with optional audible announcements.', tone: 'navy' },
  ]
  return <main className="home page-wrap">
    <section className="hero-grid">
      <div className="hero-copy"><p className="eyebrow">WALK-IN OPERATIONS / {businessDate()}</p><h1>A calmer queue starts at the first touch.</h1><p className="hero-lede">A single operational view for customer registration, fair queue handling, and clear teller calls.</p><div className="hero-actions"><Link to="/kiosk" className="button primary">Open customer kiosk <ArrowRight size={17} /></Link><Link to="/teller" className="button secondary">Open teller desk</Link></div></div>
      <div className="hero-panel"><div className="hero-panel-head"><span className="live-indicator"><span className="pulse" /> Live queue</span><span className="tiny-label">Africa/Nairobi</span></div><div className="hero-ticket"><span>Next in line</span><strong>REP-014</strong><em>REPAIR · 4 min waiting</em></div><div className="hero-panel-foot"><span><Wifi size={15} /> Connected</span><span><Printer size={15} /> Printer ready</span></div></div>
    </section>
    <section className="workspace-grid">{cards.map((card) => <Link className={`workspace-card ${card.tone}`} key={card.to} to={card.to}><span className="card-icon">{card.icon}</span><span className="card-content"><strong>{card.title}</strong><span>{card.desc}</span></span><ArrowRight className="card-arrow" size={18} /></Link>)}</section>
    <section className="status-strip"><div><span className="status-label">Today’s operating note</span><strong>One shared master queue. Three service lanes. No ticket left unaccounted for.</strong></div><span className="status-chip"><Check size={15} /> System ready</span></section>
  </main>
}

type KioskStep = 'welcome' | 'service' | 'phone' | 'review' | 'created'
type KioskState = { step: KioskStep; service?: ServiceKey; phoneInput: string }

function Kiosk() {
  const persisted = loadDraft()
  const [draft, setDraft] = useState<KioskState>({ step: persisted?.step ?? 'welcome', service: persisted?.service as ServiceKey | undefined, phoneInput: persisted?.phoneInput ?? '' })
  const [selectedService, setSelectedService] = useState<ServiceKey | undefined>(draft.service as ServiceKey | undefined)
  const [message, setMessage] = useState('')
  const [created, setCreated] = useState<Ticket | undefined>()
  const [existing, setExisting] = useState<Ticket | undefined>()
  const service = selectedService ? getService(selectedService) : undefined

  useEffect(() => saveDraft({ ...draft, service: selectedService }), [draft, selectedService])
  const setStep = (step: KioskStep) => setDraft((current) => ({ ...current, step }))
  const startOver = () => { clearDraft(); setSelectedService(undefined); setCreated(undefined); setExisting(undefined); setMessage(''); setDraft({ step: 'welcome', phoneInput: '' }) }
  const submit = () => {
    setMessage('')
    const result = demoQueue.createTicket(selectedService!, draft.phoneInput)
    if (result.error) { setMessage(result.error); return }
    if (result.existing) { setExisting(result.existing); setStep('created'); return }
    if (result.ticket) { setCreated(result.ticket); clearDraft(); setStep('created') }
  }
  return <main className="kiosk-page"><div className="kiosk-shell"><div className="kiosk-top"><Link to="/" className="back-home"><ArrowLeft size={18} /> Operations</Link><span className="kiosk-mode"><span className="status-dot" /> Customer kiosk</span></div>
    <div className="kiosk-progress"><span className={draft.step === 'welcome' ? 'active' : 'done'}>01</span><i /><span className={['service','phone','review'].includes(draft.step) ? 'active' : draft.step === 'created' ? 'done' : ''}>02</span><i /><span className={draft.step === 'phone' || draft.step === 'review' ? 'active' : draft.step === 'created' ? 'done' : ''}>03</span><i /><span className={draft.step === 'created' ? 'active' : ''}>04</span></div>
    {draft.step === 'welcome' && <div className="kiosk-content centered"><div className="kiosk-emblem"><TicketIcon size={32} /></div><p className="eyebrow">ONFON MOBILE / RISK DEPARTMENT</p><h1>Welcome</h1><p className="kiosk-intro">Please select the service you require. It only takes a moment.</p><button className="button primary large" onClick={() => setStep('service')}>Start registration <ArrowRight size={19} /></button><span className="privacy-note"><ShieldCheck size={15} /> Your phone number is protected and never printed on the ticket.</span></div>}
    {draft.step === 'service' && <div className="kiosk-content"><KioskHeading step="01 / 03" title="What can we help you with?" subtitle="Select one service to continue." /><div className="service-grid">{SERVICES.map((item) => <button className={`service-choice ${selectedService === item.key ? 'selected' : ''}`} style={{ '--service-color': item.color, '--service-soft': item.softColor } as CSSProperties} key={item.key} onClick={() => { setSelectedService(item.key); setStep('phone') }}><span className="service-marker" /><span><strong>{item.name}</strong><small>Join the {item.name.toLowerCase()} queue</small></span><ArrowRight size={20} /></button>)}</div><KioskNav onBack={() => setStep('welcome')} onNext={() => selectedService ? setStep('phone') : setMessage('Please select a service.')} nextDisabled={!selectedService} message={message} /></div>}
    {draft.step === 'phone' && <div className="kiosk-content"><KioskHeading step="02 / 03" title="Your phone number" subtitle="Enter a Kenyan number beginning with 07 or 01." /><div className="phone-entry"><div className="country-code">+254</div><input autoFocus inputMode="numeric" maxLength={10} value={draft.phoneInput} onChange={(event) => setDraft((current) => ({ ...current, phoneInput: event.target.value.replace(/\D/g, '') }))} placeholder="0712 345 678" aria-label="Phone number" /><Phone className="input-icon" size={22} /></div><p className="field-hint">We use this only to prevent duplicate active tickets. It will be masked in staff views.</p><KioskNav onBack={() => setStep('service')} onNext={() => isValidLocalPhone(draft.phoneInput) ? setStep('review') : setMessage('Enter a valid 10-digit number beginning with 07 or 01.')} message={message} /></div>}
    {draft.step === 'review' && service && <div className="kiosk-content"><KioskHeading step="03 / 03" title="Ready to join the queue?" subtitle="Check your details, then confirm." /><div className="review-card"><span className="review-label">Selected service</span><strong><span className="service-marker" style={{ background: service.color }} />{service.name}</strong><span className="review-label">Phone number</span><strong><Phone size={17} /> +254 {draft.phoneInput.slice(1)}</strong><span className="review-note">Your full phone number stays private and will not appear on the printed ticket.</span></div><KioskNav onBack={() => setStep('phone')} onNext={submit} nextLabel="Confirm & get ticket" message={message} /></div>}
    {draft.step === 'created' && <div className="kiosk-content centered">{existing ? <><div className="kiosk-emblem warm"><RotateCcw size={31} /></div><p className="eyebrow">ACTIVE TICKET FOUND</p><h1>You already have a ticket.</h1><p className="kiosk-intro">Your number is <strong>{existing.number}</strong>. You can print the same ticket again without joining the queue twice.</p><button className="button primary large" onClick={() => { demoQueue.reprint(existing.id); setMessage('Existing ticket sent to the printer.'); }}>{message || 'Reprint existing ticket'} <Printer size={18} /></button><button className="text-button" onClick={startOver}>Start over</button></> : <><div className="kiosk-emblem success"><Check size={34} /></div><p className="eyebrow">TICKET SAVED / PRINT REQUESTED</p><h1>Your ticket is ready</h1><div className="ticket-number">{created?.number}</div><p className="kiosk-intro">Please collect your ticket and wait to be called.</p><div className="ticket-meta"><span>{created && getService(created.service).name}</span><span>{created && maskPhone(created.phoneCanonical)}</span></div><button className="button secondary large" onClick={startOver}>Done <ArrowRight size={18} /></button></>}</div>}
  </div></main>
}

function KioskHeading({ step, title, subtitle }: { step: string; title: string; subtitle: string }) { return <div className="kiosk-heading"><span className="eyebrow">{step}</span><h1>{title}</h1><p>{subtitle}</p></div> }
function KioskNav({ onBack, onNext, nextLabel = 'Next', nextDisabled, message }: { onBack: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; message: string }) { return <div className="kiosk-nav"><button className="button secondary" onClick={onBack}><ArrowLeft size={17} /> Back</button><span className="nav-message">{message}</span><button className="button primary" disabled={nextDisabled} onClick={onNext}>{nextLabel} <ArrowRight size={17} /></button></div> }

function TellerDashboard() {
  const snapshot = useQueue()
  const [tellerId, setTellerId] = useState('teller-1')
  const teller = snapshot.tellers.find((item) => item.id === tellerId) ?? snapshot.tellers[0]
  const active = snapshot.tickets.find((ticket) => ticket.tellerId === teller.id && ['CALLED', 'SERVING'].includes(ticket.status))
  const waiting = snapshot.tickets.filter((ticket) => ticket.status === 'WAITING')
  const [notice, setNotice] = useState('')
  const callNext = () => { const ticket = demoQueue.claimNext(teller.id); setNotice(ticket ? `${ticket.number} called to ${teller.counter}.` : 'No eligible tickets in this mode.') }
  const recall = () => { if (!active) return; const result = demoQueue.recall(active.id); setNotice(result.ok ? `${active.number} recalled.` : result.message ?? '') }
  return <main className="page-wrap dashboard-page"><div className="page-heading"><div><p className="eyebrow">RISK OPERATIONS / LIVE QUEUE</p><h1>Teller desk</h1><p>Call customers fairly from the shared master queue.</p></div><div className="heading-actions"><label className="select-wrap"><span>Signed in as</span><select value={teller.id} onChange={(event) => setTellerId(event.target.value)}>{snapshot.tellers.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.counter}</option>)}</select><ChevronDown size={16} /></label><Link to="/display" className="button secondary"><Monitor size={17} /> TV display</Link></div></div><div className="metric-row"><Metric label="Waiting now" value={String(waiting.length).padStart(2, '0')} detail="all services" tone="blue" /><Metric label="Oldest waiting" value={waiting[0] ? `${Math.max(1, Math.floor((Date.now() - new Date(waiting[0].registeredAt).getTime()) / 60000))}m` : '—'} detail="needs attention" tone="amber" /><Metric label="Your mode" value={teller.mode === 'ALL SERVICES' ? 'ALL' : getService(teller.mode).prefix} detail={teller.mode === 'ALL SERVICES' ? 'all services' : getService(teller.mode).name} tone="green" /></div><div className="dashboard-grid"><section className="panel active-panel"><PanelTitle icon={<Activity size={18} />} title="Your current call" meta={active ? `Call ${active.callCount} of 3` : 'Ready for next customer'} />{active ? <><div className="active-ticket"><span className="ticket-service" style={{ color: getService(active.service).color }}>{getService(active.service).name}{active.repeat && <b> REPEAT</b>}</span><strong>{active.number}</strong><span>Calling from {teller.counter}</span></div><div className="call-actions"><button className="button primary" onClick={() => demoQueue.startServing(active.id)} disabled={active.status === 'SERVING'}>{active.status === 'SERVING' ? 'Serving now' : 'Start serving'} <Check size={17} /></button><button className="button secondary" onClick={recall} disabled={active.callCount >= 3}><RotateCcw size={17} /> Recall</button><button className="button secondary" onClick={() => demoQueue.complete(active.id)}>Complete / served</button><button className="button quiet" onClick={() => { const result = demoQueue.unattended(active.id); setNotice(result.ok ? `${active.number} marked unattended.` : result.message ?? '') }}>Mark unattended</button></div></> : <div className="empty-call"><div className="empty-icon"><Headphones size={25} /></div><p>When you are ready, call the next eligible customer.</p><button className="button primary large" onClick={callNext}>Call next customer <ArrowRight size={18} /></button></div>}<div className="notice">{notice}</div></section><section className="panel mode-panel"><PanelTitle icon={<ShieldCheck size={18} />} title="Operating mode" meta="Changes only your eligible view" /><div className="mode-list">{(['ALL SERVICES', ...SERVICES.map((item) => item.key)] as TellerMode[]).map((mode) => <button key={mode} className={`mode-option ${teller.mode === mode ? 'selected' : ''}`} onClick={() => demoQueue.setMode(teller.id, mode)}><span className="mode-dot" style={{ background: mode === 'ALL SERVICES' ? '#0b1f33' : getService(mode).color }} /><span>{mode === 'ALL SERVICES' ? 'ALL SERVICES' : getService(mode).name}</span>{teller.mode === mode && <Check size={16} />}</button>)}</div><div className="mode-tip"><Clock3 size={15} /><span>Three recalls are allowed with a 30-second interval between calls.</span></div></section></div><section className="panel queue-panel"><PanelTitle icon={<TicketIcon size={18} />} title="Waiting queue" meta={`${waiting.length} tickets`} /><div className="queue-table"><div className="table-head"><span>Ticket</span><span>Service</span><span>Registered</span><span>Status</span></div>{waiting.map((ticket) => <div className="table-row" key={ticket.id}><strong>{ticket.number}</strong><span className="service-name"><i style={{ background: getService(ticket.service).color }} />{getService(ticket.service).name}{ticket.repeat && <b>Repeat</b>}</span><span>{formatTime(ticket.registeredAt)}</span><span className="status-pill waiting">WAITING</span></div>)}</div></section></main>
}

function ManagerDashboard() {
  const snapshot = useQueue()
  const total = snapshot.tickets.length
  const waiting = snapshot.tickets.filter((ticket) => ticket.status === 'WAITING').length
  const served = snapshot.tickets.filter((ticket) => ticket.status === 'COMPLETED').length
  const unattended = snapshot.tickets.filter((ticket) => ticket.status === 'UNATTENDED').length
  return <main className="page-wrap dashboard-page"><div className="page-heading"><div><p className="eyebrow">MANAGEMENT CONTROL / SAMWEL MWANGI</p><h1>Risk Manager overview</h1><p>One place to watch service demand, staff activity, and exceptions.</p></div><div className="heading-actions"><span className="manager-badge"><ShieldCheck size={16} /> Risk Manager</span><Link to="/teller" className="button secondary">Open teller desk</Link></div></div><div className="metric-row"><Metric label="Tickets today" value={String(total).padStart(2, '0')} detail="all services" tone="navy" /><Metric label="Waiting" value={String(waiting).padStart(2, '0')} detail="in master queue" tone="blue" /><Metric label="Served" value={String(served).padStart(2, '0')} detail="completed visits" tone="green" /><Metric label="Unattended" value={String(unattended).padStart(2, '0')} detail="after 3 calls" tone="amber" /></div><div className="dashboard-grid manager-grid"><section className="panel"><PanelTitle icon={<Activity size={18} />} title="Service demand" meta="Today / live" />{SERVICES.map((service) => { const count = snapshot.tickets.filter((ticket) => ticket.service === service.key).length; return <div className="service-bar" key={service.key}><div><span className="service-name"><i style={{ background: service.color }} />{service.name}</span><strong>{count}</strong></div><div className="bar-track"><span style={{ width: `${Math.max(12, (count / Math.max(total, 1)) * 100)}%`, background: service.color }} /></div></div> })}</section><section className="panel"><PanelTitle icon={<Printer size={18} />} title="System health" meta="Pilot environment" /><HealthRow icon={<Wifi size={16} />} label="Backend connection" value="Demo adapter" good /><HealthRow icon={<Printer size={16} />} label="Ticket printer" value="Ready to test" good /><HealthRow icon={<ShieldCheck size={16} />} label="Audit trail" value="Enabled" good /><HealthRow icon={<Clock3 size={16} />} label="Last queue update" value="Just now" good /></section></div><section className="panel audit-panel"><PanelTitle icon={<ShieldCheck size={18} />} title="Recent operational activity" meta="Audit-ready event stream" /><div className="activity-list"><ActivityItem title="Customer kiosk is ready for registration" meta="System · just now" tone="green" /><ActivityItem title="Three teller lanes configured" meta="Samwel Mwangi · today" tone="blue" /><ActivityItem title="Black-and-white ticket template selected" meta="System settings · today" tone="amber" /></div></section></main>
}

function DisplayBoard() {
  const snapshot = useQueue()
  const current = [...snapshot.tickets].filter((ticket) => ['CALLED', 'SERVING'].includes(ticket.status)).sort((a, b) => (b.lastCalledAt ?? '').localeCompare(a.lastCalledAt ?? ''))[0]
  const [sound, setSound] = useState(true)
  const teller = current?.tellerId ? snapshot.tellers.find((item) => item.id === current.tellerId) : undefined
  return <main className="display-page"><div className="display-top"><Link className="brand" to="/"><span className="brand-mark">O</span><span><strong>ONFON MOBILE</strong><small>Risk Department</small></span></Link><div className="display-controls"><span className="display-live"><span className="pulse" /> Live call board</span><button className="icon-button" onClick={() => setSound(!sound)} aria-label={sound ? 'Mute announcements' : 'Enable announcements'}>{sound ? <Volume2 /> : <VolumeX />}</button><Link to="/teller" className="button secondary">Staff view</Link></div></div><div className="display-content"><p className="eyebrow">PLEASE PROCEED WHEN YOUR NUMBER IS CALLED</p>{current ? <><div className="display-ticket-label">NOW CALLING</div><div className="display-ticket">{current.number}</div><div className="display-service"><span className="service-marker" style={{ background: getService(current.service).color }} />{getService(current.service).name}<span className="display-divider" />{teller?.counter ?? 'Teller'}</div><p className="display-message">Please proceed to {teller?.counter ?? 'the teller'}.</p></> : <><div className="display-idle"><TicketIcon size={54} /><strong>Thank you for waiting</strong><span>The next ticket will appear here.</span></div></>}</div><div className="display-footer"><span><ShieldCheck size={15} /> No phone numbers are shown on this display</span><span>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', timeStyle: 'short' }).format(new Date())}</span></div></main>
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function PanelTitle({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) { return <div className="panel-title"><span className="panel-title-main">{icon}<strong>{title}</strong></span><span>{meta}</span></div> }
function HealthRow({ icon, label, value, good }: { icon: ReactNode; label: string; value: string; good?: boolean }) { return <div className="health-row"><span className="health-label">{icon}{label}</span><span className={`health-value ${good ? 'good' : ''}`}><span className="status-dot" />{value}</span></div> }
function ActivityItem({ title, meta, tone }: { title: string; meta: string; tone: string }) { return <div className="activity-item"><span className={`activity-mark ${tone}`}><Check size={14} /></span><span><strong>{title}</strong><small>{meta}</small></span></div> }

createRoot(document.getElementById('root')!).render(<BrowserRouter><AppShell /></BrowserRouter>)
