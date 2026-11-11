import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Activity, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Headphones, LockKeyhole, LogOut, Monitor, Phone, Printer, RotateCcw, ShieldCheck, Ticket as TicketIcon, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { businessDate, formatTime, getService, isValidLocalPhone, maskPhone, SERVICES } from './domain/rules'
import type { DisplayCall, QueueSnapshot, ServiceKey, Ticket, TellerMode } from './domain/types'
import { realQueue } from './lib/realQueue'
import { clearDraft, loadDraft, saveDraft } from './lib/draft'
import { printTicket } from './lib/printTicket'
import { initialAuthCallbackType, isSupabaseConfigured, supabase } from './lib/supabase'
import { ManagerWorkspace } from './components/ManagerWorkspace'
import './styles.css'


type KioskStep = 'welcome' | 'service' | 'phone' | 'review' | 'created'
type KioskState = { step: KioskStep; service?: ServiceKey; phoneInput: string }

type AuthState = { session: Session | null; loading: boolean }

async function getStaffLandingPath(userId: string): Promise<'/manager' | '/teller'> {
  // First retrieve the staff profile without an embedded role relationship.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,is_active,role_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) throw profileError

  if (!profile || !profile.is_active) {
    throw new Error('Your ONFON staff profile is inactive or has not been activated. Contact a Risk Manager.')
  }

  if (!profile.role_id) {
    throw new Error('Your staff profile has no assigned role. Contact a Risk Manager.')
  }

  // Retrieve the role directly using the profile's role_id.
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('name')
    .eq('id', profile.role_id)
    .maybeSingle()

  if (roleError) throw roleError

  const roleName = role?.name?.trim().toUpperCase()

  if (roleName === 'RISK-MANAGER') return '/manager'
  if (roleName === 'RISK-OFFICER') return '/teller'

  throw new Error(
    `Your account role could not be recognised (received: ${roleName || 'none'}). Contact a Risk Manager.`
  )
}

function StaffLanding({ session }: { session: Session }) {
  const [destination, setDestination] = useState<'/manager' | '/teller' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getStaffLandingPath(session.user.id)
      .then((path) => { if (active) setDestination(path) })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to verify your staff access.')
      })
    return () => { active = false }
  }, [session.user.id])

  if (destination) return <Navigate to={destination} replace />
  if (error) return (
    <main className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src="/onfon-logo.png" alt="ONFON Mobile" />
        <p className="eyebrow">ONFON MOBILE / STAFF ACCESS</p>
        <h1>Access not available</h1>
        <p className="form-error">{error}</p>
        <button className="button primary large" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
  return <div className="auth-loading"><img src="/onfon-logo.png" alt="ONFON Mobile" /><span>Checking your ONFON staff access…</span></div>
}


function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false) } })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])
  return { session, loading }
}

function useQueue(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({ tickets: [], tellers: [], lastUpdatedAt: '' })
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const refresh = async () => {
    if (!enabled) return
    try { setError(''); setSnapshot(await realQueue.getSnapshot()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the live queue.') } finally { setLoading(false) }
  }
  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    void refresh()
    const unsubscribe = realQueue.subscribe(() => { void refresh() })
    return unsubscribe
  }, [enabled])
  return { snapshot, loading, error, refresh }
}

function useDisplayQueue() {
  const [calls, setCalls] = useState<DisplayCall[]>([])
  const [error, setError] = useState('')
  const refresh = async () => { try { setCalls(await realQueue.getDisplayQueue()); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Display feed unavailable.') } }
  useEffect(() => { void refresh(); const unsubscribe = realQueue.subscribeDisplay(() => { void refresh() }); return unsubscribe }, [])
  return { calls, error }
}

function AppShell() {
  const location = useLocation()
  const { session, loading } = useAuth()
  const [appRole, setAppRole] = useState<'RISK-MANAGER' | 'RISK-OFFICER' | null>(null)
  const inviteCallback = initialAuthCallbackType === 'invite'
  const publicPaths = ['/', '/auth', '/reset-password', '/kiosk', '/display']
  const protectedRoute = !publicPaths.includes(location.pathname)
  const role = location.pathname === '/kiosk' ? 'Customer kiosk' : location.pathname === '/display' ? 'Customer display' : location.pathname === '/manager' ? 'Risk Manager' : location.pathname === '/teller' ? 'Teller desk' : 'Operations'
  useEffect(() => {
    let active = true
    if (!session) { setAppRole(null); return () => { active = false } }
    void supabase.from('profiles').select('role:roles(name)').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (!active) return
      const value = Array.isArray(data?.role) ? data.role[0]?.name : (data?.role as unknown as { name?: string } | null)?.name
      setAppRole(value === 'RISK-MANAGER' || value === 'RISK-OFFICER' ? value : null)
    })
    return () => { active = false }
  }, [session?.user.id])
  if (loading) return <div className="auth-loading"><img src="/onfon-logo.png" alt="ONFON Mobile" /><span>Connecting to ONFON secure access…</span></div>
  if (protectedRoute && !session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  return <div className="app-shell">
    <header className="topbar">
      <Link className="brand" to="/"><img className="brand-logo" src="/onfon-logo.png" alt="ONFON Mobile logo" /><span><strong>ONFON MOBILE</strong><small>Risk Department</small></span></Link>
      <div className="topbar-right"><span className="connection"><span className="status-dot" /> {isSupabaseConfigured ? 'Live Supabase' : 'Backend not configured'}</span>{session && <nav className="role-nav" aria-label="Staff navigation">{appRole && <Link className={location.pathname === '/teller' ? 'active' : ''} to="/teller">Teller desk</Link>}{appRole === 'RISK-MANAGER' && <Link className={location.pathname === '/manager' ? 'active' : ''} to="/manager">Manager</Link>}</nav>}<span className="current-role">{role}</span>{session && <button className="button secondary topbar-logout" onClick={() => void supabase.auth.signOut()} aria-label="Sign out"><LogOut size={16} /> Sign out</button>}</div>
    </header>
    <Routes>
      <Route path="/" element={<Home session={session} />} />
      <Route path="/auth" element={session ? (inviteCallback ? <SetPasswordPage /> : <StaffLanding session={session} />) : <AuthPage />} />
      <Route path="/reset-password" element={session && initialAuthCallbackType === 'recovery' ? <SetPasswordPage /> : <AuthPage />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/teller" element={<TellerDashboard session={session} />} />
      <Route path="/manager" element={<ManagerDashboard session={session} />} />
      <Route path="/display" element={<DisplayBoard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </div>
}

function Home({ session }: { session: Session | null }) {
  const cards = [
    { to: '/kiosk', icon: <Phone />, title: 'Customer kiosk', desc: 'Register a customer, normalize their phone number, and print a compact ticket.', tone: 'blue' },
    { to: session ? '/teller' : '/auth', icon: <TicketIcon />, title: 'Teller dashboard', desc: session ? 'Call, recall, serve, complete, or mark tickets unattended.' : 'Staff sign-in is required for queue operations.', tone: 'green' },
    { to: session ? '/manager' : '/auth', icon: <ShieldCheck />, title: 'Risk Manager', desc: session ? 'Monitor services, staff activity, live status, and audit events.' : 'Invite-controlled staff access protects management data.', tone: 'amber' },
    { to: '/display', icon: <Monitor />, title: 'TV display', desc: 'Show called tickets and teller numbers without phone numbers.', tone: 'navy' },
  ]
  return <main className="home page-wrap">
    <section className="hero-grid">
      <div className="hero-copy"><p className="eyebrow">WALK-IN OPERATIONS / {businessDate()}</p><h1>A calmer queue starts at the first touch.</h1><p className="hero-lede">A live ONFON workspace for customer registration, fair queue handling, and clear teller calls.</p><div className="hero-actions"><Link to="/kiosk" className="button primary">Open customer kiosk <ArrowRight size={17} /></Link>{session ? <Link to="/teller" className="button secondary">Open teller desk</Link> : <Link to="/auth" className="button secondary"><LockKeyhole size={17} /> Staff sign in</Link>}</div></div>
      <div className="hero-panel"><div className="hero-panel-head"><span className="live-indicator"><span className="pulse" /> Live queue</span><span className="tiny-label">Africa/Nairobi</span></div><div className="hero-ticket"><span>{session ? 'Operations access' : 'Customer access'}</span><strong>{session ? 'READY' : 'KIOSK'}</strong><em>{session ? 'Real-time queue controls available' : 'No account required to take a ticket'}</em></div><div className="hero-panel-foot"><span><Wifi size={15} /> Supabase connected</span><span><Printer size={15} /> Print job protected</span></div></div>
    </section>
    <section className="workspace-grid">{cards.map((card) => <Link className={`workspace-card ${card.tone}`} key={card.title} to={card.to}><span className="card-icon">{card.icon}</span><span className="card-content"><strong>{card.title}</strong><span>{card.desc}</span></span><ArrowRight className="card-arrow" size={18} /></Link>)}</section>
    <section className="status-strip"><div><span className="status-label">Live access model</span><strong>Customer kiosk and display are public. Queue operations require an invited staff account.</strong></div><span className="status-chip"><ShieldCheck size={15} /> Protected</span></section>
  </main>
}

function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('error_code') === 'otp_expired'
      ? 'This password reset or invitation link has expired. Request a new link or contact a Risk Manager.'
      : ''
  })
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (result.error) throw result.error
      if (!result.data.user) throw new Error('Unable to verify your staff account.')
      const destination = await getStaffLandingPath(result.data.user.id)
      navigate(destination, { replace: true })
    } catch (cause) {
      await supabase.auth.signOut()
      setError(cause instanceof Error ? cause.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  const requestPasswordReset = async () => {
    setError('')
    setSuccess('')

    if (!email.trim()) {
      setError('Enter your staff email address first.')
      return
    }

    setBusy(true)
    try {
      const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (result.error) throw result.error
      setSuccess('If this email belongs to an account, a password reset link has been sent. Check your inbox.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send the password reset email.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page"><div className="auth-card">
    <img className="auth-logo" src="/onfon-logo.png" alt="ONFON Mobile" />
    <p className="eyebrow">ONFON MOBILE / STAFF ACCESS</p>
    <h1>Sign in to operations</h1>
    <p className="auth-copy">Use your invited ONFON staff email and password.</p>
    <form onSubmit={submit} className="auth-form">
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@onfonmobile.com" /></label>
      <label>Password<input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>
      {error && <p className="form-error">{error}</p>}
      {success && <p className="auth-copy" role="status">{success}</p>}
      <button className="button primary large" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'} <ArrowRight size={18} /></button>
      <button type="button" className="text-button" onClick={() => void requestPasswordReset()} disabled={busy}>
        Forgot password? Send reset email
      </button>
    </form>
    <p className="auth-copy">Staff accounts can only be created through invitations from an ONFON Risk Manager.</p>
    <Link className="auth-back" to="/"><ArrowLeft size={16} /> Back to ONFON</Link>
  </div></main>
}
function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const isRecovery = initialAuthCallbackType === 'recovery'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const result = await supabase.auth.updateUser({ password })
      if (result.error) throw result.error

      const userResult = await supabase.auth.getUser()
      if (userResult.error) throw userResult.error
      if (!userResult.data.user) throw new Error('Please request a new password link and try again.')

      if (isRecovery) {
        await supabase.auth.signOut()
        window.history.replaceState({}, document.title, '/auth')
        navigate('/auth', { replace: true })
        return
      }

      const destination = await getStaffLandingPath(userResult.data.user.id)
      window.history.replaceState({}, document.title, '/auth')
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password update failed.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page"><div className="auth-card">
    <img className="auth-logo" src="/onfon-logo.png" alt="ONFON Mobile" />
    <p className="eyebrow">ONFON MOBILE / {isRecovery ? 'PASSWORD RECOVERY' : 'INVITATION ACTIVATION'}</p>
    <h1>{isRecovery ? 'Reset your password' : 'Create your new password'}</h1>
    <p className="auth-copy">{isRecovery
      ? 'Choose a new password for your ONFON staff account.'
      : 'Create a private password to activate your ONFON staff account.'}</p>
    <form onSubmit={submit} className="auth-form">
      <label>New password<input type="password" autoFocus autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your new password" /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="button primary large" disabled={busy}>
        {busy ? 'Saving password…' : isRecovery ? 'Save new password' : 'Activate staff account'}
        <ArrowRight size={18} />
      </button>
    </form>
    <Link className="auth-back" to="/"><ArrowLeft size={16} /> Back to ONFON</Link>
  </div></main>
}
function Kiosk() {
  const persisted = loadDraft()
  const [draft, setDraft] = useState<KioskState>({ step: persisted?.step ?? 'welcome', service: persisted?.service as ServiceKey | undefined, phoneInput: persisted?.phoneInput ?? '' })
  const [selectedService, setSelectedService] = useState<ServiceKey | undefined>(draft.service)
  const [message, setMessage] = useState('')
  const [created, setCreated] = useState<Ticket | undefined>()
  const [existing, setExisting] = useState<Ticket | undefined>()
  const [busy, setBusy] = useState(false)
  const service = selectedService ? getService(selectedService) : undefined
  useEffect(() => saveDraft({ ...draft, service: selectedService }), [draft, selectedService])
  const setStep = (step: KioskStep) => setDraft((current) => ({ ...current, step }))
  const startOver = () => { clearDraft(); setSelectedService(undefined); setCreated(undefined); setExisting(undefined); setMessage(''); setDraft({ step: 'welcome', phoneInput: '' }) }
  const submit = async () => { if (!selectedService) return; setMessage(''); setBusy(true); const result = await realQueue.createTicket(selectedService, draft.phoneInput); setBusy(false); if (result.error) { setMessage(result.error); return } if (result.existing) { setExisting(result.existing); setStep('created'); return } if (result.ticket) { setCreated(result.ticket); clearDraft(); setStep('created') } }
  return <main className="kiosk-page"><div className="kiosk-shell"><div className="kiosk-top"><Link to="/" className="back-home"><ArrowLeft size={18} /> ONFON Mobile</Link><span className="kiosk-mode"><span className="status-dot" /> Live customer kiosk</span></div>
    <div className="kiosk-progress"><span className={draft.step === 'welcome' ? 'active' : 'done'}>01</span><i /><span className={['service', 'phone', 'review'].includes(draft.step) ? 'active' : draft.step === 'created' ? 'done' : ''}>02</span><i /><span className={draft.step === 'phone' || draft.step === 'review' ? 'active' : draft.step === 'created' ? 'done' : ''}>03</span><i /><span className={draft.step === 'created' ? 'active' : ''}>04</span></div>
    {draft.step === 'welcome' && <div className="kiosk-content centered"><div className="kiosk-emblem"><TicketIcon size={32} /></div><p className="eyebrow">ONFON MOBILE / RISK DEPARTMENT</p><h1>Welcome</h1><p className="kiosk-intro">Please select the service you require. It only takes a moment.</p><button className="button primary large" onClick={() => setStep('service')}>Start registration <ArrowRight size={19} /></button><span className="privacy-note"><ShieldCheck size={15} /> Your phone number is protected and never printed on the ticket.</span></div>}
    {draft.step === 'service' && <div className="kiosk-content"><KioskHeading step="01 / 03" title="What can we help you with?" subtitle="Select one service to continue." /><div className="service-grid">{SERVICES.map((item) => <button className={`service-choice ${selectedService === item.key ? 'selected' : ''}`} style={{ '--service-color': item.color, '--service-soft': item.softColor } as CSSProperties} key={item.key} onClick={() => { setSelectedService(item.key); setStep('phone') }}><span className="service-marker" /><span><strong>{item.name}</strong><small>Join the {item.name.toLowerCase()} queue</small></span><ArrowRight size={20} /></button>)}</div><KioskNav onBack={() => setStep('welcome')} onNext={() => selectedService ? setStep('phone') : setMessage('Please select a service.')} nextDisabled={!selectedService} message={message} /></div>}
    {draft.step === 'phone' && <div className="kiosk-content"><KioskHeading step="02 / 03" title="Your phone number" subtitle="Enter a Kenyan number beginning with 07 or 01." /><div className="phone-entry"><div className="country-code">+254</div><input autoFocus inputMode="numeric" maxLength={10} value={draft.phoneInput} onChange={(event) => setDraft((current) => ({ ...current, phoneInput: event.target.value.replace(/\D/g, '') }))} placeholder="0712 345 678" aria-label="Phone number" /><Phone className="input-icon" size={22} /></div><p className="field-hint">We use this only to prevent duplicate active tickets. It will be masked in staff views.</p><KioskNav onBack={() => setStep('service')} onNext={() => isValidLocalPhone(draft.phoneInput) ? setStep('review') : setMessage('Enter a valid 10-digit number beginning with 07 or 01.')} message={message} /></div>}
    {draft.step === 'review' && service && <div className="kiosk-content"><KioskHeading step="03 / 03" title="Ready to join the queue?" subtitle="Check your details, then confirm." /><div className="review-card"><span className="review-label">Selected service</span><strong><span className="service-marker" style={{ background: service.color }} />{service.name}</strong><span className="review-label">Phone number</span><strong><Phone size={17} /> +254 {draft.phoneInput.slice(1)}</strong><span className="review-note">Your full phone number stays private and will not appear on the printed ticket.</span></div><KioskNav onBack={() => setStep('phone')} onNext={() => void submit()} nextLabel={busy ? 'Saving ticket…' : 'Confirm & get ticket'} nextDisabled={busy} message={message} /></div>}
    {draft.step === 'created' && <div className="kiosk-content centered">{existing ? <><div className="kiosk-emblem warm"><RotateCcw size={31} /></div><p className="eyebrow">ACTIVE TICKET FOUND</p><h1>You already have a ticket.</h1><p className="kiosk-intro">Your number is <strong>{existing.number}</strong>. You can print the same ticket again without joining the queue twice.</p><button className="button primary large" onClick={async () => { setBusy(true); try { await realQueue.reprint(existing.id); if (!printTicket(existing, 'reprint')) throw new Error('Enable pop-ups to print the ticket.'); setMessage('Ticket sent to the Epson printer.'); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Reprint failed.') } finally { setBusy(false) } }} disabled={busy}>{message || 'Print existing ticket'} <Printer size={18} /></button><button className="text-button" onClick={startOver}>Start over</button></> : <><div className="kiosk-emblem success"><Check size={34} /></div><p className="eyebrow">TICKET SAVED / READY TO PRINT</p><h1>Your ticket is ready</h1><div className="ticket-number">{created?.number}</div><p className="kiosk-intro">Print the ticket, then wait to be called.</p><div className="ticket-meta"><span>{created && getService(created.service).name}</span><span>{created && maskPhone(created.phoneCanonical)}</span></div><button className="button primary large" onClick={() => { if (created && !printTicket(created)) setMessage('Enable pop-ups to print the ticket.') }}><Printer size={18} /> Print ticket</button><button className="button secondary large" onClick={startOver}>Done <ArrowRight size={18} /></button></>}</div>}
  </div></main>
}

function KioskHeading({ step, title, subtitle }: { step: string; title: string; subtitle: string }) { return <div className="kiosk-heading"><span className="eyebrow">{step}</span><h1>{title}</h1><p>{subtitle}</p></div> }
function KioskNav({ onBack, onNext, nextLabel = 'Next', nextDisabled, message }: { onBack: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; message: string }) { return <div className="kiosk-nav"><button className="button secondary" onClick={onBack}><ArrowLeft size={17} /> Back</button><span className="nav-message">{message}</span><button className="button primary" disabled={nextDisabled} onClick={onNext}>{nextLabel} <ArrowRight size={17} /></button></div> }
function preferredEnglishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((voice) => /^en(-|_)/i.test(voice.lang))
  return voices.find((voice) => /^en[-_]KE$/i.test(voice.lang))
    ?? voices.find((voice) => /female|woman|susan|zira|samantha|karen|moira|google uk english female/i.test(voice.name))
    ?? voices.find((voice) => /^en[-_]GB$/i.test(voice.lang))
    ?? voices.find((voice) => /^en[-_]US$/i.test(voice.lang))
    ?? voices[0]
}
function announceCall(ticket: Pick<Ticket, 'number'>, counter: string): void {
  if (!('speechSynthesis' in window)) return
  const tellerNumber = counter.replace(/^teller\s*(?:number\s*)?/i, '').trim()
  window.speechSynthesis.cancel()
  const announcement = new SpeechSynthesisUtterance(`Ticket ${ticket.number}, please proceed to Teller number ${tellerNumber || counter}`)
  const voice = preferredEnglishVoice()
  if (voice) { announcement.voice = voice; announcement.lang = voice.lang }
  else announcement.lang = 'en-KE'
  announcement.rate = 0.88
  announcement.pitch = 1.08
  announcement.volume = 1
  window.speechSynthesis.speak(announcement)
}
function primeAnnouncement(): void {
  if (!('speechSynthesis' in window)) return
  const primer = new SpeechSynthesisUtterance(' ')
  primer.volume = 0
  primer.rate = 10
  window.speechSynthesis.speak(primer)
}
function TellerDashboard({ session }: { session: Session | null }) {
  const { snapshot, loading, error, refresh } = useQueue(Boolean(session))
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [counterEditorOpen, setCounterEditorOpen] = useState(false)
  const [counterInput, setCounterInput] = useState('')
  const teller = snapshot.tellers.find((item) => item.id === session?.user.id)
  const active = teller ? snapshot.tickets.find((ticket) => ticket.tellerId === teller.id && ['CALLED', 'SERVING'].includes(ticket.status)) : undefined
  const waiting = snapshot.tickets.filter((ticket) => ticket.status === 'WAITING')
  const act = async (operation: () => Promise<void>, success: string) => { setBusy(true); try { await operation(); await refresh(); setNotice(success) } catch (cause) { const message = cause instanceof Error ? cause.message : 'Operation failed.'; setNotice(message === 'COUNTER_REQUIRED' ? 'Enter your counter number before calling the next customer.' : message) } finally { setBusy(false) } }
  useEffect(() => { if (teller) { setCounterInput(teller.counter === 'Teller' ? '' : teller.counter); setCounterEditorOpen(teller.counter === 'Teller') } }, [teller?.id, teller?.counter])
  if (loading) return <main className="page-wrap"><div className="loading-panel">Loading the live queue…</div></main>
  if (error) return <main className="page-wrap"><div className="error-panel"><WifiOff size={22} /><strong>Live queue unavailable</strong><span>{error}</span><button className="button primary" onClick={() => void refresh()}>Retry</button></div></main>
  if (!teller) return <main className="page-wrap"><div className="error-panel"><LockKeyhole size={22} /><strong>Staff profile not activated</strong><span>Your account is authenticated, but a manager must create an active ONFON profile before you can operate the queue.</span></div></main>
  const saveCounter = () => void act(async () => { await realQueue.setCounter(teller.id, counterInput); setCounterEditorOpen(false) }, `Counter ${counterInput.trim()} saved. Future assignments will record this counter.`)
  const callNext = () => { primeAnnouncement(); void act(async () => { const ticket = await realQueue.claimNext(teller.mode); if (!ticket) throw new Error('No eligible tickets in this mode.'); announceCall(ticket, teller.counter) }, 'Next eligible ticket called.') }
  const recall = () => { if (!active) return; announceCall(active, teller.counter); void act(async () => { const result = await realQueue.recall(active.id); if (!result.ok) throw new Error(result.message ?? 'Recall failed.') }, `${active.number} recalled.`) }
  return <main className="page-wrap dashboard-page"><div className="page-heading"><div><p className="eyebrow">RISK OPERATIONS / LIVE QUEUE</p><h1>Teller desk</h1><p>Signed in as {teller.name}. Calls are protected by the shared master queue.</p></div><div className="heading-actions"><span className="manager-badge"><ShieldCheck size={16} /> Teller {teller.counter}</span><button className="button secondary" onClick={() => { setCounterInput(teller.counter === 'Teller' ? '' : teller.counter); setCounterEditorOpen(true) }}>Change counter</button><Link to="/display" className="button secondary"><Monitor size={17} /> TV display</Link></div></div>{counterEditorOpen && <section className="panel counter-setup"><div><p className="eyebrow">COUNTER SETUP</p><h2>{teller.counter === 'Teller' ? 'Enter your counter number' : 'Confirm your counter number'}</h2><p>Enter the counter where you are serving customers, for example 1, 2, or 3. This is saved with your teller profile and recorded for queue assignments and service history.</p></div><div className="counter-setup-actions"><label>Counter number<input inputMode="numeric" pattern="[0-9]*" maxLength={2} autoFocus value={counterInput} onChange={(event) => setCounterInput(event.target.value.replace(/\D/g, ''))} placeholder="1" /></label><button className="button primary" onClick={saveCounter} disabled={busy || !/^\d{1,2}$/.test(counterInput) || Number(counterInput) < 1}>Save counter</button>{teller.counter !== 'Teller' && <button className="button quiet" onClick={() => setCounterEditorOpen(false)} disabled={busy}>Cancel</button>}</div></section>}<div className="metric-row"><Metric label="Waiting now" value={String(waiting.length).padStart(2, '0')} detail="all services" tone="blue" /><Metric label="Oldest waiting" value={waiting[0] ? `${Math.max(1, Math.floor((Date.now() - new Date(waiting[0].registeredAt).getTime()) / 60000))}m` : '—'} detail="needs attention" tone="amber" /><Metric label="Your mode" value={teller.mode === 'ALL SERVICES' ? 'ALL' : getService(teller.mode).prefix} detail={teller.mode === 'ALL SERVICES' ? 'all services' : getService(teller.mode).name} tone="green" /></div><div className="dashboard-grid"><section className="panel active-panel"><PanelTitle icon={<Activity size={18} />} title="Your current call" meta={active ? `Call ${active.callCount} of 3` : 'Ready for next customer'} />{active ? <><div className="active-ticket"><span className="ticket-service" style={{ color: getService(active.service).color }}>{getService(active.service).name}{active.repeat && <b> REPEAT</b>}</span><strong>{active.number}</strong><span>Calling from {teller.counter}</span></div><div className="call-actions"><button className="button primary" onClick={() => void act(() => realQueue.transition(active.id, 'SERVING'), `${active.number} is now serving.`)} disabled={busy || active.status === 'SERVING'}>{active.status === 'SERVING' ? 'Serving now' : 'Start serving'} <Check size={17} /></button><button className="button secondary" onClick={recall} disabled={busy || active.callCount >= 3}><RotateCcw size={17} /> Recall</button><button className="button secondary" onClick={() => void act(() => realQueue.transition(active.id, 'COMPLETED'), `${active.number} completed.`)} disabled={busy}>Complete / served</button><button className="button quiet" onClick={() => void act(() => realQueue.transition(active.id, 'UNATTENDED'), `${active.number} marked unattended.`)} disabled={busy || active.callCount < 3}>Mark unattended</button></div></> : <div className="empty-call"><div className="empty-icon"><Headphones size={25} /></div><p>When you are ready, call the next eligible customer.</p><button className="button primary large" onClick={callNext} disabled={busy}>Call next customer <ArrowRight size={18} /></button></div>}<div className="notice">{notice}</div></section><section className="panel mode-panel"><PanelTitle icon={<ShieldCheck size={18} />} title="Operating mode" meta="Only your own mode can change" /><div className="mode-list">{(['ALL SERVICES', ...SERVICES.map((item) => item.key)] as TellerMode[]).map((mode) => <button key={mode} className={`mode-option ${teller.mode === mode ? 'selected' : ''}`} onClick={() => void act(() => realQueue.setMode(teller.id, mode), `Mode changed to ${mode === 'ALL SERVICES' ? mode : getService(mode).name}.`)}><span className="mode-dot" style={{ background: mode === 'ALL SERVICES' ? '#0b1f33' : getService(mode).color }} /><span>{mode === 'ALL SERVICES' ? 'ALL SERVICES' : getService(mode).name}</span>{teller.mode === mode && <Check size={16} />}</button>)}</div><div className="mode-tip"><Clock3 size={15} /><span>Three calls are allowed with a 10-second interval between calls.</span></div></section></div><section className="panel queue-panel"><PanelTitle icon={<TicketIcon size={18} />} title="Waiting queue" meta={`${waiting.length} tickets`} /><div className="queue-table"><div className="table-head"><span>Ticket</span><span>Service</span><span>Registered</span><span>Status</span></div>{waiting.map((ticket) => <div className="table-row" key={ticket.id}><strong>{ticket.number}</strong><span className="service-name"><i style={{ background: getService(ticket.service).color }} />{getService(ticket.service).name}{ticket.repeat && <b>Repeat</b>}</span><span>{formatTime(ticket.registeredAt)}</span><span className="status-pill waiting">WAITING</span></div>)}</div></section></main>
}

function ManagerDashboard({ session }: { session: Session | null }) {
  const { snapshot, loading, error, refresh } = useQueue(Boolean(session))
  const manager = snapshot.tellers.find((item) => item.id === session?.user.id)
  if (loading) return <main className="page-wrap"><div className="loading-panel">Loading management data…</div></main>
  if (error) return <main className="page-wrap"><div className="error-panel"><WifiOff size={22} /><strong>Management data unavailable</strong><span>{error}</span><button className="button primary" onClick={() => void refresh()}>Retry</button></div></main>
  if (!manager || manager.role !== 'RISK-MANAGER') return <main className="page-wrap"><div className="error-panel"><LockKeyhole size={22} /><strong>Manager access required</strong><span>This account is not assigned the Risk Manager role.</span></div></main>
  const total = snapshot.tickets.length
  const waiting = snapshot.tickets.filter((ticket) => ticket.status === 'WAITING').length
  const served = snapshot.tickets.filter((ticket) => ticket.status === 'COMPLETED').length
  const unattended = snapshot.tickets.filter((ticket) => ticket.status === 'UNATTENDED').length
  return <main className="page-wrap dashboard-page"><div className="page-heading"><div><p className="eyebrow">MANAGEMENT CONTROL / {manager.name.toUpperCase()}</p><h1>Risk Manager overview</h1><p>Live service demand, staff activity, exceptions, and audit-ready queue status.</p></div><div className="heading-actions"><span className="manager-badge"><ShieldCheck size={16} /> Risk Manager</span><Link to="/teller" className="button secondary">Open teller desk</Link></div></div><div className="metric-row"><Metric label="Tickets today" value={String(total).padStart(2, '0')} detail="all services" tone="navy" /><Metric label="Waiting" value={String(waiting).padStart(2, '0')} detail="in master queue" tone="blue" /><Metric label="Served" value={String(served).padStart(2, '0')} detail="completed visits" tone="green" /><Metric label="Unattended" value={String(unattended).padStart(2, '0')} detail="after 3 calls" tone="amber" /></div><div className="dashboard-grid manager-grid"><section className="panel"><PanelTitle icon={<Activity size={18} />} title="Service demand" meta="Today / live" />{SERVICES.map((service) => { const count = snapshot.tickets.filter((ticket) => ticket.service === service.key).length; return <div className="service-bar" key={service.key}><div><span className="service-name"><i style={{ background: service.color }} />{service.name}</span><strong>{count}</strong></div><div className="bar-track"><span style={{ width: `${Math.max(count ? 12 : 0, (count / Math.max(total, 1)) * 100)}%`, background: service.color }} /></div></div> })}</section><section className="panel"><PanelTitle icon={<Printer size={18} />} title="System health" meta="Live Supabase" /><HealthRow icon={<Wifi size={16} />} label="Backend connection" value="Connected" good /><HealthRow icon={<Printer size={16} />} label="Print jobs" value="Persisted" good /><HealthRow icon={<ShieldCheck size={16} />} label="Role protection" value="RLS enabled" good /><HealthRow icon={<Clock3 size={16} />} label="Last queue update" value={snapshot.lastUpdatedAt ? formatTime(snapshot.lastUpdatedAt) : '—'} good /></section></div><section className="panel audit-panel"><PanelTitle icon={<ShieldCheck size={18} />} title="Live operational activity" meta="Database-backed queue" /><div className="activity-list"><ActivityItem title={`${snapshot.tellers.length} active staff profiles visible`} meta="Supabase profiles · today" tone="green" /><ActivityItem title={`${snapshot.tickets.filter((ticket) => ['CALLED', 'SERVING'].includes(ticket.status)).length} active calls`} meta="Live ticket state · now" tone="blue" /><ActivityItem title="Ticket history and audit events are persisted" meta="PostgreSQL functions · protected" tone="amber" /></div></section><ManagerWorkspace /></main>
}

function DisplayBoard() {
  const { calls, error } = useDisplayQueue()
  const [sound, setSound] = useState(true)
  const lastSpoken = useRef('')
  const current = calls[0]
  useEffect(() => { if (!sound || !current || !('speechSynthesis' in window)) return; const key = `${current.id}:${current.callCount}`; if (lastSpoken.current === key) return; lastSpoken.current = key; announceCall(current, current.counter) }, [current?.id, current?.callCount, sound])
  return <main className="display-page"><div className="display-top"><Link className="brand" to="/"><img className="brand-logo" src="/onfon-logo.png" alt="ONFON Mobile logo" /><span><strong>ONFON MOBILE</strong><small>Risk Department</small></span></Link><div className="display-controls"><span className="display-live"><span className="pulse" /> Live call board</span><button className="icon-button" onClick={() => setSound(!sound)} aria-label={sound ? 'Mute announcements' : 'Enable announcements'}>{sound ? <Volume2 /> : <VolumeX />}</button><Link to="/teller" className="button secondary">Staff view</Link></div></div><div className="display-content"><p className="eyebrow">PLEASE PROCEED WHEN YOUR NUMBER IS CALLED</p>{current ? <><div className="display-ticket-label">NOW CALLING</div><div className="display-ticket">{current.number}</div><div className="display-service"><span className="service-marker" style={{ background: getService(current.service).color }} />{getService(current.service).name}<span className="display-divider" />{current.counter}</div><p className="display-message">Please proceed to {current.counter}.</p></> : <><div className="display-idle"><TicketIcon size={54} /><strong>{error ? 'Display feed unavailable' : 'Thank you for waiting'}</strong><span>{error || 'The next ticket will appear here.'}</span></div></>}</div><div className="display-footer"><span><ShieldCheck size={15} /> No phone numbers are shown on this display</span><span>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', timeStyle: 'short' }).format(new Date())}</span></div></main>
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function PanelTitle({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) { return <div className="panel-title"><span className="panel-title-main">{icon}<strong>{title}</strong></span><span>{meta}</span></div> }
function HealthRow({ icon, label, value, good }: { icon: ReactNode; label: string; value: string; good?: boolean }) { return <div className="health-row"><span className="health-label">{icon}{label}</span><span className={`health-value ${good ? 'good' : ''}`}><span className="status-dot" />{value}</span></div> }
function ActivityItem({ title, meta, tone }: { title: string; meta: string; tone: string }) { return <div className="activity-item"><span className={`activity-mark ${tone}`}><Check size={14} /></span><span><strong>{title}</strong><small>{meta}</small></span></div> }

createRoot(document.getElementById('root')!).render(<BrowserRouter><AppShell /></BrowserRouter>)
