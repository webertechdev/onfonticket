import { businessDate, eligibleForMode, getService, isActiveTicket, normalizePhone, SERVICES } from '../domain/rules'
import type { QueueSnapshot, ServiceKey, Ticket, Teller, TellerMode } from '../domain/types'

const STORAGE_KEY = 'onfon-demo-queue-v1'
const listeners = new Set<() => void>()

const defaultTellers: Teller[] = [
  { id: 'teller-1', name: 'Amina W.', counter: 'Teller 1', mode: 'ALL SERVICES' },
  { id: 'teller-2', name: 'Brian K.', counter: 'Teller 2', mode: 'customer-care' },
  { id: 'teller-3', name: 'Caroline N.', counter: 'Teller 3', mode: 'miniloan' },
]

function notify(): void {
  listeners.forEach((listener) => listener())
}

function read(): QueueSnapshot {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) return JSON.parse(raw) as QueueSnapshot
  const now = new Date().toISOString()
  const date = businessDate()
  const seed: Ticket[] = [
    makeTicket('REP-014', 'repair', '254712345678', 1, now, false, 'WAITING'),
    makeTicket('CC-009', 'customer-care', '254112345678', 2, now, false, 'WAITING'),
    makeTicket('ML-006', 'miniloan', '254798765432', 3, now, false, 'WAITING'),
  ].map((ticket) => ({ ...ticket, businessDate: date }))
  const snapshot = { tickets: seed, tellers: defaultTellers, lastUpdatedAt: now }
  write(snapshot)
  return snapshot
}

function write(snapshot: QueueSnapshot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

function makeTicket(number: string, service: ServiceKey, phoneCanonical: string, queueSequence: number, registeredAt: string, repeat: boolean, status: Ticket['status']): Ticket {
  return { id: crypto.randomUUID(), number, service, phoneCanonical, registeredAt, businessDate: businessDate(), queueSequence, status, printStatus: 'PRINTED', callCount: 0, repeat }
}

function update(mutator: (snapshot: QueueSnapshot) => void): QueueSnapshot {
  const snapshot = read()
  mutator(snapshot)
  snapshot.lastUpdatedAt = new Date().toISOString()
  write(snapshot)
  notify()
  return snapshot
}

function nextNumber(snapshot: QueueSnapshot, service: ServiceKey): string {
  const date = businessDate()
  const serviceDefinition = getService(service)
  const count = snapshot.tickets.filter((ticket) => ticket.businessDate === date && ticket.service === service).length + 1
  return `${serviceDefinition.prefix}-${String(count).padStart(3, '0')}`
}

export const demoQueue = {
  getSnapshot(): QueueSnapshot { return read() },
  subscribe(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener) },
  createTicket(service: ServiceKey, phoneInput: string): { ticket?: Ticket; existing?: Ticket; error?: string } {
    const phoneCanonical = normalizePhone(phoneInput)
    if (!phoneCanonical) return { error: 'Enter a valid Kenyan number beginning with 07 or 01.' }
    const snapshot = read()
    const existing = snapshot.tickets.find((ticket) => ticket.phoneCanonical === phoneCanonical && isActiveTicket(ticket))
    if (existing) return { existing }
    const repeat = snapshot.tickets.some((ticket) => ticket.phoneCanonical === phoneCanonical && ticket.businessDate === businessDate())
    const nextSequence = snapshot.tickets.filter((ticket) => ticket.businessDate === businessDate()).length + 1
    const now = new Date().toISOString()
    const ticket = makeTicket(nextNumber(snapshot, service), service, phoneCanonical, nextSequence, now, repeat, 'WAITING')
    update((current) => current.tickets.push(ticket))
    return { ticket }
  },
  reprint(ticketId: string): void {
    update((snapshot) => {
      const ticket = snapshot.tickets.find((item) => item.id === ticketId)
      if (ticket) ticket.printStatus = 'REPRINTED'
    })
  },
  setMode(tellerId: string, mode: TellerMode): void {
    update((snapshot) => {
      const teller = snapshot.tellers.find((item) => item.id === tellerId)
      if (teller) teller.mode = mode
    })
  },
  claimNext(tellerId: string): Ticket | undefined {
    let claimed: Ticket | undefined
    update((snapshot) => {
      const teller = snapshot.tellers.find((item) => item.id === tellerId)
      if (!teller) return
      const next = snapshot.tickets.filter((ticket) => eligibleForMode(ticket, teller.mode)).sort((a, b) => a.queueSequence - b.queueSequence)[0]
      if (!next) return
      next.status = 'CALLED'
      next.callCount = 1
      next.lastCalledAt = new Date().toISOString()
      next.tellerId = teller.id
      claimed = next
    })
    return claimed
  },
  recall(ticketId: string): { ok: boolean; message?: string } {
    const snapshot = read()
    const ticket = snapshot.tickets.find((item) => item.id === ticketId)
    if (!ticket || !ticket.lastCalledAt) return { ok: false, message: 'No active call found.' }
    const elapsed = Date.now() - new Date(ticket.lastCalledAt).getTime()
    if (elapsed < 30_000) return { ok: false, message: `Wait ${Math.ceil((30_000 - elapsed) / 1000)} seconds before recalling.` }
    if (ticket.callCount >= 3) return { ok: false, message: 'This ticket has reached the three-call limit.' }
    update((current) => {
      const next = current.tickets.find((item) => item.id === ticketId)
      if (next) { next.callCount += 1; next.lastCalledAt = new Date().toISOString(); next.status = 'CALLED' }
    })
    return { ok: true }
  },
  startServing(ticketId: string): void { update((snapshot) => { const ticket = snapshot.tickets.find((item) => item.id === ticketId); if (ticket) ticket.status = 'SERVING' }) },
  complete(ticketId: string): void { update((snapshot) => { const ticket = snapshot.tickets.find((item) => item.id === ticketId); if (ticket) ticket.status = 'COMPLETED' }) },
  unattended(ticketId: string): { ok: boolean; message?: string } {
    const snapshot = read()
    const ticket = snapshot.tickets.find((item) => item.id === ticketId)
    if (!ticket || ticket.callCount < 3) return { ok: false, message: 'The ticket can be marked unattended after three calls.' }
    update((current) => { const next = current.tickets.find((item) => item.id === ticketId); if (next) next.status = 'UNATTENDED' })
    return { ok: true }
  },
  resetDemo(): void { localStorage.removeItem(STORAGE_KEY); read(); notify() },
  getServices: () => SERVICES,
}
