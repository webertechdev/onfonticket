import type { ServiceDefinition, ServiceKey, Ticket, TicketStatus } from './types'

export const SERVICES: ServiceDefinition[] = [
  { key: 'repair', name: 'REPAIR', prefix: 'REP', color: '#2b6de8', softColor: '#e9f1ff' },
  { key: 'customer-care', name: 'CUSTOMER CARE', prefix: 'CC', color: '#159a68', softColor: '#e6f7ef' },
  { key: 'miniloan', name: 'MINILOAN', prefix: 'ML', color: '#d98716', softColor: '#fff3df' },
]

export const ACTIVE_STATUSES: TicketStatus[] = ['WAITING', 'CALLED', 'SERVING', 'ON_HOLD']

export function businessDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(date)
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(value))
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (!/^(07|01)\d{8}$/.test(digits)) return null
  return `254${digits.slice(1)}`
}

export function isValidLocalPhone(input: string): boolean {
  return /^(07|01)\d{8}$/.test(input.replace(/\D/g, ''))
}

export function maskPhone(canonical: string): string {
  if (canonical.length < 9) return '••••••••••'
  return `${canonical.slice(0, 4)}••••${canonical.slice(-3)}`
}

export function getService(key: ServiceKey): ServiceDefinition {
  return SERVICES.find((service) => service.key === key) ?? SERVICES[0]
}

export function isActiveTicket(ticket: Ticket): boolean {
  return ACTIVE_STATUSES.includes(ticket.status)
}

export function eligibleForMode(ticket: Ticket, mode: string): boolean {
  return ticket.status === 'WAITING' && (mode === 'ALL SERVICES' || ticket.service === mode)
}
