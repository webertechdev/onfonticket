import { businessDate, getService, normalizePhone, SERVICES } from '../domain/rules'
import type { DisplayCall, QueueSnapshot, ServiceKey, Ticket, TicketStatus, Teller, TellerMode } from '../domain/types'
import { supabase } from './supabase'

type ApiResult<T> = { data: T | null; error: { message: string } | null }

type RawTicket = {
  id: string
  display_number: string
  service_id?: string
  service?: { key?: ServiceKey } | Array<{ key?: ServiceKey }>
  phone_canonical: string
  registered_at: string
  business_date: string
  queue_sequence: number
  status: TicketStatus
  print_status: Ticket['printStatus']
  call_count: number
  last_called_at?: string | null
  teller_id?: string | null
  repeat_visit: boolean
  notes?: string | null
}

function serviceKeyFor(raw: RawTicket, fallback?: ServiceKey): ServiceKey {
  const nested = Array.isArray(raw.service) ? raw.service[0]?.key : raw.service?.key
  return nested ?? fallback ?? 'repair'
}

function mapTicket(raw: RawTicket, fallbackService?: ServiceKey): Ticket {
  return {
    id: raw.id,
    number: raw.display_number,
    service: serviceKeyFor(raw, fallbackService),
    phoneCanonical: raw.phone_canonical,
    registeredAt: raw.registered_at,
    businessDate: raw.business_date,
    queueSequence: Number(raw.queue_sequence),
    status: raw.status,
    printStatus: raw.print_status,
    callCount: raw.call_count,
    lastCalledAt: raw.last_called_at ?? undefined,
    tellerId: raw.teller_id ?? undefined,
    repeat: raw.repeat_visit,
    notes: raw.notes ?? undefined,
  }
}

function asError(error: { message?: string } | null): Error {
  const message = error?.message ?? 'The live backend request failed.'
  if (message.includes('ACTIVE_TICKET_EXISTS')) return new Error('ACTIVE_TICKET_EXISTS')
  if (message.includes('INVALID_PHONE')) return new Error('INVALID_PHONE')
  if (message.includes('NOT_AUTHORISED')) return new Error('NOT_AUTHORISED')
  if (message.includes('THREE_CALLS_REQUIRED')) return new Error('THREE_CALLS_REQUIRED')
  return new Error(message)
}

function ensureConfigured(): void {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_NOT_CONFIGURED')
  }
}

function roleName(value: unknown): string {
  if (Array.isArray(value)) return String((value[0] as { name?: string } | undefined)?.name ?? '')
  return String((value as { name?: string } | null)?.name ?? '')
}

async function currentUserId(): Promise<string> {
  ensureConfigured()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('AUTH_REQUIRED')
  return data.user.id
}

export const realQueue = {
  async getSnapshot(): Promise<QueueSnapshot> {
    ensureConfigured()
    const date = businessDate()
    const ticketsResult = await supabase
      .from('tickets')
      .select('id,display_number,service_id,service:services(key),phone_canonical,registered_at,business_date,queue_sequence,status,print_status,call_count,last_called_at,teller_id,repeat_visit,notes')
      .eq('business_date', date)
      .order('queue_sequence', { ascending: true }) as ApiResult<RawTicket[]>
    if (ticketsResult.error) throw asError(ticketsResult.error)

    const profilesResult = await supabase
      .from('profiles')
      .select('id,full_name,counter_name,service_mode,is_active,role:roles(name)')
      .eq('is_active', true)
      .order('full_name', { ascending: true }) as ApiResult<Array<{ id: string; full_name: string; counter_name?: string | null; service_mode?: TellerMode; role?: unknown }>>
    if (profilesResult.error) throw asError(profilesResult.error)

    const tellers: Teller[] = (profilesResult.data ?? []).map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      counter: profile.counter_name || 'Teller',
      mode: profile.service_mode ?? 'ALL SERVICES',
      role: roleName(profile.role),
    }))

    return {
      tickets: (ticketsResult.data ?? []).map((ticket) => mapTicket(ticket)),
      tellers,
      lastUpdatedAt: new Date().toISOString(),
    }
  },

  subscribe(listener: () => void): () => void {
    const channel = supabase
      .channel(`onfon-live-queue-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, listener)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, listener)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  },

  async createTicket(service: ServiceKey, phoneInput: string): Promise<{ ticket?: Ticket; existing?: Ticket; error?: string }> {
    const canonical = normalizePhone(phoneInput)
    if (!canonical) return { error: 'Enter a valid Kenyan number beginning with 07 or 01.' }
    try {
      const result = await supabase.rpc('create_ticket', {
        p_service_key: service,
        p_phone_canonical: canonical,
        p_client_idempotency_key: crypto.randomUUID(),
      }) as ApiResult<{ ticket?: RawTicket; idempotent?: boolean; existing?: boolean }>
      if (result.error) throw asError(result.error)
      const raw = result.data?.ticket
      if (!raw) return { error: 'The backend did not return a ticket.' }
      const ticket = mapTicket(raw, service)
      if (result.data?.existing) return { existing: ticket }
      return { ticket }
    } catch (error) {
      if (error instanceof Error && error.message === 'ACTIVE_TICKET_EXISTS') return { error: 'This phone number already has an active ticket. Please ask staff to reprint it.' }
      if (error instanceof Error && error.message === 'SUPABASE_NOT_CONFIGURED') return { error: 'The live ticketing backend is not configured on this device.' }
      if (error instanceof Error && error.message === 'INVALID_PHONE') return { error: 'Enter a valid Kenyan number beginning with 07 or 01.' }
      return { error: error instanceof Error ? error.message : 'Ticket creation failed. Please try again.' }
    }
  },

  async reprint(ticketId: string): Promise<void> {
    const result = await supabase.rpc('reprint_ticket', { p_ticket_id: ticketId })
    if (result.error) throw asError(result.error)
  },

  async claimNext(mode: TellerMode): Promise<Ticket | undefined> {
    const result = await supabase.rpc('claim_next_ticket', { p_mode: mode }) as ApiResult<{ ticket?: RawTicket | null }>
    if (result.error) throw asError(result.error)
    return result.data?.ticket ? mapTicket(result.data.ticket) : undefined
  },

  async recall(ticketId: string): Promise<{ ok: boolean; message?: string }> {
    const result = await supabase.rpc('recall_ticket', { p_ticket_id: ticketId }) as ApiResult<{ ticket?: RawTicket }>
    if (result.error) {
      const message = result.error.message
      if (message.includes('WAIT_10_SECONDS')) return { ok: false, message: 'Wait 10 seconds between calls.' }
      if (message.includes('THREE_CALLS_REACHED')) return { ok: false, message: 'This ticket has reached the three-call limit.' }
      return { ok: false, message }
    }
    return { ok: Boolean(result.data?.ticket) }
  },

  async transition(ticketId: string, status: TicketStatus, reason?: string): Promise<void> {
    const result = await supabase.rpc('transition_ticket', { p_ticket_id: ticketId, p_to_status: status, p_reason: reason ?? null })
    if (result.error) throw asError(result.error)
  },

  async setMode(tellerId: string, mode: TellerMode): Promise<void> {
    const userId = await currentUserId()
    if (userId !== tellerId) throw new Error('Only the signed-in teller can change their mode.')
    const result = await supabase.from('profiles').update({ service_mode: mode, updated_at: new Date().toISOString() }).eq('id', tellerId)
    if (result.error) throw asError(result.error)
  },

  async getDisplayQueue(): Promise<DisplayCall[]> {
    ensureConfigured()
    const result = await supabase.rpc('get_display_queue') as ApiResult<Array<{ ticket_id: string; display_number: string; service_key: ServiceKey; status: TicketStatus; call_count: number; last_called_at: string; counter_name: string }>>
    if (result.error) throw asError(result.error)
    return (result.data ?? []).map((row) => ({
      id: row.ticket_id,
      number: row.display_number,
      service: row.service_key,
      status: row.status,
      callCount: row.call_count,
      lastCalledAt: row.last_called_at,
      counter: row.counter_name || 'Teller',
    }))
  },

  subscribeDisplay(listener: () => void): () => void {
    const channel = supabase
      .channel(`onfon-display-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, listener)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  },

  services: SERVICES.map((service) => getService(service.key)),
}
