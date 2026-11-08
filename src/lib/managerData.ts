import { supabase } from './supabase'
import type { ServiceKey, TicketStatus } from '../domain/types'

export type PageSize = 5 | 100 | 'all'
export type DateFilters = { from: string; to: string; search: string; page: number; pageSize: PageSize }
export type PageResult<T> = { rows: T[]; total: number }

const rangeFor = (filters: DateFilters) => {
  if (filters.pageSize === 'all') return undefined
  const start = (filters.page - 1) * filters.pageSize
  return { start, end: start + filters.pageSize - 1 }
}

const applyDates = (query: any, column: string, filters: DateFilters) => {
  let result = query
  if (filters.from) result = result.gte(column, filters.from)
  if (filters.to) result = result.lte(column, filters.to)
  return result
}

const finish = async <T>(query: any, filters: DateFilters): Promise<PageResult<T>> => {
  const ranged = rangeFor(filters)
  const result = ranged ? await query.range(ranged.start, ranged.end) : await query
  if (result.error) throw new Error(result.error.message)
  return { rows: (result.data ?? []) as T[], total: result.count ?? 0 }
}

export type ManagerTicketRow = { id: string; display_number: string; phone_canonical: string; business_date: string; registered_at: string; status: TicketStatus; print_status: string; call_count: number; repeat_visit: boolean; queue_sequence: number; service?: { key: ServiceKey; name: string } | { key: ServiceKey; name: string }[] | null; teller_id: string | null }
export type HistoryRow = { id: number; ticket_id: string; from_status: string | null; to_status: string; event_type: string; actor_id: string | null; reason: string | null; created_at: string; ticket?: { display_number: string; phone_canonical: string } | null }
export type AuditRow = { id: number; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; reason: string | null; previous_values: unknown; new_values: unknown; created_at: string }
export type PrintRow = { id: string; ticket_id: string; status: string; attempt_count: number; idempotency_key: string; error_message: string | null; requested_by: string | null; created_at: string; updated_at: string }
export type AssignmentRow = { id: number; ticket_id: string; teller_id: string; assigned_at: string; released_at: string | null; assignment_reason: string | null }
export type StaffRow = { id: string; full_name: string; phone_number: string | null; staff_number: string | null; counter_name: string | null; service_mode: string; is_active: boolean; created_at: string; updated_at: string; role?: { name: string } | { name: string }[] | null }
export type ServiceRow = { id: string; key: ServiceKey; name: string; prefix: string; colour: string; soft_colour: string; is_active: boolean; display_order: number }
export type SettingRow = { key: string; value: unknown; updated_by: string | null; updated_at: string }
export type Directory = { profiles: Array<{ id: string; full_name: string; staff_number: string | null; phone_number: string | null; counter_name: string | null; role?: { name: string } | { name: string }[] | null }>; tickets: Array<{ id: string; display_number: string }> }

export const managerData = {
  async directory(): Promise<Directory> {
    const [profiles, tickets] = await Promise.all([
      supabase.from('profiles').select('id,full_name,staff_number,phone_number,counter_name,role:roles(name)').order('full_name'),
      supabase.from('tickets').select('id,display_number').order('created_at', { ascending: false }),
    ])
    if (profiles.error) throw new Error(profiles.error.message)
    if (tickets.error) throw new Error(tickets.error.message)
    return { profiles: (profiles.data ?? []) as Directory['profiles'], tickets: (tickets.data ?? []) as Directory['tickets'] }
  },
  async tickets(filters: DateFilters): Promise<PageResult<ManagerTicketRow>> {
    let query = supabase.from('tickets').select('id,display_number,phone_canonical,business_date,registered_at,status,print_status,call_count,repeat_visit,queue_sequence,teller_id,service:services(key,name)', { count: 'exact' }).order('registered_at', { ascending: false })
    query = applyDates(query, 'business_date', filters)
    if (filters.search.trim()) query = query.or(`display_number.ilike.%${filters.search.trim()}%,phone_canonical.ilike.%${filters.search.trim()}%`)
    return finish(query, filters)
  },
  async history(filters: DateFilters): Promise<PageResult<HistoryRow>> {
    let query = supabase.from('ticket_history').select('id,ticket_id,from_status,to_status,event_type,actor_id,reason,created_at,ticket:tickets(display_number,phone_canonical)', { count: 'exact' }).order('created_at', { ascending: false })
    query = applyDates(query, 'created_at', filters)
    if (filters.search.trim()) query = query.ilike('event_type', `%${filters.search.trim()}%`)
    return finish(query, filters)
  },
  async audit(filters: DateFilters): Promise<PageResult<AuditRow>> {
    let query = supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,reason,previous_values,new_values,created_at', { count: 'exact' }).order('created_at', { ascending: false })
    query = applyDates(query, 'created_at', filters)
    if (filters.search.trim()) query = query.or(`action.ilike.%${filters.search.trim()}%,entity_type.ilike.%${filters.search.trim()}%`)
    return finish(query, filters)
  },
  async printJobs(filters: DateFilters): Promise<PageResult<PrintRow>> {
    let query = supabase.from('print_jobs').select('id,ticket_id,status,attempt_count,idempotency_key,error_message,requested_by,created_at,updated_at', { count: 'exact' }).order('created_at', { ascending: false })
    query = applyDates(query, 'created_at', filters)
    if (filters.search.trim()) query = query.ilike('status', `%${filters.search.trim()}%`)
    return finish(query, filters)
  },
  async assignments(filters: DateFilters): Promise<PageResult<AssignmentRow>> {
    let query = supabase.from('teller_assignments').select('id,ticket_id,teller_id,assigned_at,released_at,assignment_reason', { count: 'exact' }).order('assigned_at', { ascending: false })
    query = applyDates(query, 'assigned_at', filters)
    return finish(query, filters)
  },
  async staff(filters: DateFilters): Promise<PageResult<StaffRow>> {
    let query = supabase.from('profiles').select('id,full_name,phone_number,staff_number,counter_name,service_mode,is_active,created_at,updated_at,role:roles(name)', { count: 'exact' }).order('created_at', { ascending: false })
    query = applyDates(query, 'created_at', filters)
    if (filters.search.trim()) query = query.ilike('full_name', `%${filters.search.trim()}%`)
    return finish(query, filters)
  },
  async services(filters: DateFilters): Promise<PageResult<ServiceRow>> {
    const query = supabase.from('services').select('id,key,name,prefix,colour,soft_colour,is_active,display_order', { count: 'exact' }).order('display_order')
    return finish(query, filters)
  },
  async settings(filters: DateFilters): Promise<PageResult<SettingRow>> {
    let query = supabase.from('system_settings').select('key,value,updated_by,updated_at', { count: 'exact' }).order('key')
    if (filters.search.trim()) query = query.ilike('key', `%${filters.search.trim()}%`)
    return finish(query, filters)
  },
  async updateStaff(id: string, values: { full_name: string; counter_name: string | null; service_mode: string; is_active: boolean; role: 'RISK-MANAGER' | 'RISK-OFFICER' }): Promise<void> {
    const result = await supabase.rpc('manager_update_staff_profile', {
      p_profile_id: id,
      p_full_name: values.full_name,
      p_counter_name: values.counter_name,
      p_service_mode: values.service_mode,
      p_is_active: values.is_active,
      p_role: values.role,
    })
    if (result.error) throw new Error(result.error.message)
  },
  async inviteStaff(email: string, fullName: string, phoneNumber: string, staffNumber: string, role: 'RISK-MANAGER' | 'RISK-OFFICER'): Promise<void> {
    const result = await supabase.functions.invoke('manager-invite-user', { body: { email, fullName, phoneNumber, staffNumber, role } })
    if (result.error) throw new Error(result.error.message)
    if ((result.data as { error?: string } | null)?.error) throw new Error((result.data as { error: string }).error)
  },
}
