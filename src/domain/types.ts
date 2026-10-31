export type ServiceKey = 'repair' | 'customer-care' | 'miniloan'

export type TicketStatus =
  | 'WAITING'
  | 'CALLED'
  | 'SERVING'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'UNATTENDED'
  | 'CANCELLED'

export type PrintStatus = 'PENDING' | 'PRINTED' | 'FAILED' | 'RETRY_PENDING' | 'REPRINTED'

export type TellerMode = 'ALL SERVICES' | ServiceKey

export interface ServiceDefinition {
  key: ServiceKey
  name: string
  prefix: string
  color: string
  softColor: string
}

export interface Ticket {
  id: string
  number: string
  service: ServiceKey
  phoneCanonical: string
  registeredAt: string
  businessDate: string
  queueSequence: number
  status: TicketStatus
  printStatus: PrintStatus
  callCount: number
  lastCalledAt?: string
  tellerId?: string
  repeat: boolean
  notes?: string
}

export interface Teller {
  id: string
  name: string
  counter: string
  mode: TellerMode
}

export interface QueueSnapshot {
  tickets: Ticket[]
  tellers: Teller[]
  lastUpdatedAt: string
}
