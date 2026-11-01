import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Search, UserPlus } from 'lucide-react'
import type { DateFilters, PageResult, PageSize, ManagerTicketRow, HistoryRow, AuditRow, PrintRow, AssignmentRow, StaffRow, ServiceRow, SettingRow } from '../lib/managerData'
import { managerData } from '../lib/managerData'
import type { TellerMode } from '../domain/types'

type Tab = 'tickets' | 'history' | 'audit' | 'prints' | 'assignments' | 'staff' | 'services' | 'settings'
type Row = ManagerTicketRow | HistoryRow | AuditRow | PrintRow | AssignmentRow | StaffRow | ServiceRow | SettingRow

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'tickets', label: 'Tickets' }, { key: 'history', label: 'Ticket history' }, { key: 'audit', label: 'Audit logs' }, { key: 'prints', label: 'Print jobs' },
  { key: 'assignments', label: 'Assignments' }, { key: 'staff', label: 'Staff profiles' }, { key: 'services', label: 'Services' }, { key: 'settings', label: 'System settings' },
]
const emptyFilters = (pageSize: PageSize = 5): DateFilters => ({ from: '', to: '', search: '', page: 1, pageSize })
const rowValue = (row: Row, key: string): string => {
  const value = (row as Record<string, unknown>)[key]
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const serviceName = (row: ManagerTicketRow) => { const service = Array.isArray(row.service) ? row.service[0] : row.service; return service?.name ?? service?.key ?? '—' }

export function ManagerWorkspace() {
  const [tab, setTab] = useState<Tab>('tickets')
  const [filters, setFilters] = useState<DateFilters>(emptyFilters())
  const [result, setResult] = useState<PageResult<Row>>({ rows: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'RISK-OFFICER' | 'RISK-MANAGER'>('RISK-OFFICER')

  const load = async (nextFilters = filters, nextTab = tab) => {
    setLoading(true); setError('')
    try {
      const data = nextTab === 'tickets' ? await managerData.tickets(nextFilters) : nextTab === 'history' ? await managerData.history(nextFilters) : nextTab === 'audit' ? await managerData.audit(nextFilters) : nextTab === 'prints' ? await managerData.printJobs(nextFilters) : nextTab === 'assignments' ? await managerData.assignments(nextFilters) : nextTab === 'staff' ? await managerData.staff(nextFilters) : nextTab === 'services' ? await managerData.services(nextFilters) : await managerData.settings(nextFilters)
      setResult(data as PageResult<Row>)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load manager data.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [tab, filters.page, filters.pageSize])
  const totalPages = filters.pageSize === 'all' ? 1 : Math.max(1, Math.ceil(result.total / filters.pageSize))
  const update = (values: Partial<DateFilters>) => setFilters((current) => ({ ...current, ...values, page: values.page ?? 1 }))
  const invite = async (event: React.FormEvent) => { event.preventDefault(); setNotice(''); try { await managerData.inviteStaff(inviteEmail, inviteName, inviteRole); setNotice(`Invitation sent to ${inviteEmail}.`); setInviteEmail(''); setInviteName(''); setInviteOpen(false); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation failed.') } }

  return <section className="manager-workspace panel">
    <div className="workspace-toolbar"><div><p className="eyebrow">MANAGER CONTROL CENTRE</p><h2>Historical records & administration</h2><p>Search every operational table, including previous business days. Internal staff views show the full phone number.</p></div><button className="button primary" onClick={() => setInviteOpen(!inviteOpen)}><UserPlus size={17} /> Invite staff</button></div>
    {inviteOpen && <form className="invite-form" onSubmit={invite}><label>Staff email<input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@onfonmobile.com" /></label><label>Full name<input required value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Full name" /></label><label>Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}><option value="RISK-OFFICER">Risk Officer</option><option value="RISK-MANAGER">Risk Manager</option></select></label><button className="button primary" type="submit">Send invitation</button></form>}
    <div className="manager-tabs">{tabs.map((item) => <button className={tab === item.key ? 'active' : ''} key={item.key} onClick={() => { setTab(item.key); setFilters(emptyFilters(filters.pageSize)); setNotice('') }}>{item.label}</button>)}</div>
    <div className="manager-filters"><label>Search<div className="search-input"><Search size={15} /><input value={filters.search} onChange={(event) => update({ search: event.target.value })} placeholder="Ticket, phone, action, name…" onKeyDown={(event) => { if (event.key === 'Enter') void load() }} /></div></label><label>From<input type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} /></label><label>To<input type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} /></label><label>Rows<select value={String(filters.pageSize)} onChange={(event) => update({ pageSize: event.target.value === 'all' ? 'all' : Number(event.target.value) as 5 | 100 })}><option value="5">5</option><option value="100">100</option><option value="all">All</option></select></label><button className="button secondary filter-button" onClick={() => void load()}>Apply filters</button></div>
    {notice && <div className="form-success">{notice}</div>}{error && <div className="form-error">{error}</div>}
    {loading ? <div className="loading-panel">Loading records…</div> : <ManagerTable tab={tab} rows={result.rows} onStaffSaved={async () => { await load() }} />}
    <div className="pagination"><span>{result.total} records</span><button className="button quiet" disabled={filters.page <= 1 || loading} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}><ArrowLeft size={15} /> Previous</button><strong>Page {filters.page} of {totalPages}</strong><button className="button quiet" disabled={filters.page >= totalPages || loading} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next <ArrowRight size={15} /></button></div>
  </section>
}

function ManagerTable({ tab, rows, onStaffSaved }: { tab: Tab; rows: Row[]; onStaffSaved: () => Promise<void> }) {
  if (!rows.length) return <div className="empty-table">No records match the current filters.</div>
  if (tab === 'tickets') return <TableShell headers={['Ticket', 'Phone', 'Service', 'Business date', 'Registered', 'Status', 'Print']} rows={rows.map((row) => { const ticket = row as ManagerTicketRow; return [ticket.display_number, ticket.phone_canonical, serviceName(ticket), ticket.business_date, new Date(ticket.registered_at).toLocaleString('en-GB'), ticket.status, ticket.print_status] })} />
  if (tab === 'history') return <TableShell headers={['Ticket', 'From', 'To', 'Event', 'Actor', 'Created']} rows={rows.map((row) => { const item = row as HistoryRow; return [item.ticket?.display_number ?? item.ticket_id, item.from_status ?? '—', item.to_status, item.event_type, item.actor_id ?? 'System', new Date(item.created_at).toLocaleString('en-GB')] })} />
  if (tab === 'audit') return <TableShell headers={['Action', 'Entity', 'Entity ID', 'Actor', 'Reason', 'Created']} rows={rows.map((row) => { const item = row as AuditRow; return [item.action, item.entity_type ?? '—', item.entity_id ?? '—', item.actor_id ?? 'System', item.reason ?? '—', new Date(item.created_at).toLocaleString('en-GB')] })} />
  if (tab === 'prints') return <TableShell headers={['Job', 'Ticket', 'Status', 'Attempts', 'Error', 'Created']} rows={rows.map((row) => { const item = row as PrintRow; return [item.id, item.ticket_id, item.status, String(item.attempt_count), item.error_message ?? '—', new Date(item.created_at).toLocaleString('en-GB')] })} />
  if (tab === 'assignments') return <TableShell headers={['Assignment', 'Ticket', 'Teller', 'Assigned', 'Released', 'Reason']} rows={rows.map((row) => { const item = row as AssignmentRow; return [String(item.id), item.ticket_id, item.teller_id, new Date(item.assigned_at).toLocaleString('en-GB'), item.released_at ? new Date(item.released_at).toLocaleString('en-GB') : 'Active', item.assignment_reason ?? '—'] })} />
  if (tab === 'services') return <TableShell headers={['Service', 'Key', 'Prefix', 'Active', 'Order']} rows={rows.map((row) => { const item = row as ServiceRow; return [item.name, item.key, item.prefix, item.is_active ? 'Yes' : 'No', String(item.display_order)] })} />
  if (tab === 'settings') return <TableShell headers={['Key', 'Value', 'Updated by', 'Updated']} rows={rows.map((row) => { const item = row as SettingRow; return [item.key, JSON.stringify(item.value), item.updated_by ?? 'System', new Date(item.updated_at).toLocaleString('en-GB')] })} />
  return <StaffTable rows={rows as StaffRow[]} onSaved={onStaffSaved} />
}

function TableShell({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="data-table-wrap"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${index}-${row[0]}`}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div> }

function StaffTable({ rows, onSaved }: { rows: StaffRow[]; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<StaffRow | null>(null)
  const edit = (row: StaffRow) => { setEditing(row.id); setDraft(row) }
  const save = async () => { if (!draft) return; setSaving(true); try { const role = Array.isArray(draft.role) ? draft.role[0]?.name : draft.role?.name; await managerData.updateStaff(draft.id, { full_name: draft.full_name, counter_name: draft.counter_name, service_mode: draft.service_mode as TellerMode, is_active: draft.is_active, role: role === 'RISK-MANAGER' ? 'RISK-MANAGER' : 'RISK-OFFICER' }); setEditing(null); setDraft(null); await onSaved() } finally { setSaving(false) } }
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Role</th><th>Counter</th><th>Mode</th><th>Active</th><th>Action</th></tr></thead><tbody>{rows.map((row) => { const current = editing === row.id && draft ? draft : row; const role = Array.isArray(current.role) ? current.role[0]?.name : current.role?.name; return <tr key={row.id}><td>{editing === row.id ? <input value={current.full_name} onChange={(event) => setDraft({ ...current, full_name: event.target.value })} /> : current.full_name}</td><td>{editing === row.id ? <select value={role ?? 'RISK-OFFICER'} onChange={(event) => setDraft({ ...current, role: { name: event.target.value } })}><option>RISK-OFFICER</option><option>RISK-MANAGER</option></select> : role}</td><td>{editing === row.id ? <input value={current.counter_name ?? ''} onChange={(event) => setDraft({ ...current, counter_name: event.target.value })} /> : current.counter_name ?? '—'}</td><td>{editing === row.id ? <select value={current.service_mode} onChange={(event) => setDraft({ ...current, service_mode: event.target.value })}><option>ALL SERVICES</option><option>repair</option><option>customer-care</option><option>miniloan</option></select> : current.service_mode}</td><td>{editing === row.id ? <input type="checkbox" checked={current.is_active} onChange={(event) => setDraft({ ...current, is_active: event.target.checked })} /> : current.is_active ? 'Yes' : 'No'}</td><td>{editing === row.id ? <button className="button quiet" onClick={() => void save()} disabled={saving}><Check size={14} /> Save</button> : <button className="button quiet" onClick={() => edit(row)}>Edit</button>}</td></tr> })}</tbody></table></div>
}
