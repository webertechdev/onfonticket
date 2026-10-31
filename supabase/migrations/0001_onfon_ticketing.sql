-- ONFON Mobile Risk Department ticketing foundation
-- Apply in Supabase SQL editor or through the Supabase migration workflow.

create extension if not exists pgcrypto;

create type public.app_role as enum ('RISK-MANAGER', 'RISK-OFFICER');
create type public.ticket_status as enum ('WAITING', 'CALLED', 'SERVING', 'ON_HOLD', 'COMPLETED', 'UNATTENDED', 'CANCELLED');
create type public.print_status as enum ('PENDING', 'PRINTING', 'PRINTED', 'FAILED', 'RETRY_PENDING', 'REPRINTED');

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name public.app_role unique not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role_id uuid not null references public.roles(id),
  counter_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  key text unique not null check (key in ('repair', 'customer-care', 'miniloan')),
  name text unique not null,
  prefix text unique not null,
  colour text not null,
  soft_colour text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.daily_ticket_counters (
  business_date date not null,
  service_id uuid not null references public.services(id),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (business_date, service_id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  business_date date not null default (timezone('Africa/Nairobi', now()))::date,
  display_number text not null,
  service_id uuid not null references public.services(id),
  phone_canonical text not null check (phone_canonical ~ '^254(7|1)[0-9]{8}$'),
  phone_hash text not null,
  registered_at timestamptz not null default now(),
  queue_sequence bigint not null,
  status public.ticket_status not null default 'WAITING',
  call_count integer not null default 0 check (call_count between 0 and 3),
  last_called_at timestamptz,
  repeat_visit boolean not null default false,
  created_by uuid references auth.users(id),
  source_device_id uuid,
  print_status public.print_status not null default 'PENDING',
  client_idempotency_key text,
  offline_sync_state text not null default 'SYNCED' check (offline_sync_state in ('SYNCED', 'PENDING_SYNC', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_date, display_number),
  unique (business_date, queue_sequence)
);

create unique index tickets_one_active_phone_idx on public.tickets(phone_hash)
where status in ('WAITING', 'CALLED', 'SERVING', 'ON_HOLD');

create table public.ticket_history (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_status public.ticket_status,
  to_status public.ticket_status not null,
  event_type text not null,
  actor_id uuid references auth.users(id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.teller_assignments (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  teller_id uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  assignment_reason text
);

create table public.printer_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  connection_type text not null check (connection_type in ('USB', 'ETHERNET', 'WIFI', 'ANDROID_BRIDGE')),
  device_identifier text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  device_token_hash text unique,
  is_authorised boolean not null default false,
  printer_id uuid references public.printer_devices(id),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  printer_id uuid references public.printer_devices(id),
  status public.print_status not null default 'PENDING',
  attempt_count integer not null default 0,
  idempotency_key text unique not null,
  error_message text,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offline_allocations (
  id uuid primary key default gen_random_uuid(),
  kiosk_device_id uuid not null references public.kiosk_devices(id),
  business_date date not null,
  service_id uuid not null references public.services(id),
  range_start integer not null,
  range_end integer not null,
  next_number integer not null,
  allocated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (range_start > 0 and range_end >= range_start and next_number between range_start and range_end + 1)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  actor_type text not null default 'USER',
  action text not null,
  entity_type text,
  entity_id text,
  reason text,
  previous_values jsonb,
  new_values jsonb,
  device_id uuid,
  created_at timestamptz not null default now()
);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index tickets_queue_idx on public.tickets (business_date, status, registered_at, queue_sequence);
create index ticket_history_ticket_idx on public.ticket_history (ticket_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

insert into public.roles (name, description) values
  ('RISK-MANAGER', 'Full queue, configuration, staff, reporting, and audit permissions'),
  ('RISK-OFFICER', 'Queue operation, service, recall, completion, and permitted reprint permissions')
on conflict (name) do nothing;

insert into public.services (key, name, prefix, colour, soft_colour, display_order) values
  ('repair', 'REPAIR', 'REP', '#2B6DE8', '#E9F1FF', 1),
  ('customer-care', 'CUSTOMER CARE', 'CC', '#159A68', '#E6F7EF', 2),
  ('miniloan', 'MINILOAN', 'ML', '#D98716', '#FFF3DF', 3)
on conflict (key) do update set name = excluded.name, prefix = excluded.prefix, colour = excluded.colour, soft_colour = excluded.soft_colour, display_order = excluded.display_order;

insert into public.system_settings (key, value) values
  ('call_policy', '{"max_calls":3,"interval_seconds":30}'::jsonb),
  ('kiosk_policy', '{"draft_ttl_seconds":600,"phone_country_code":"254"}'::jsonb),
  ('display_policy', '{"sound_enabled":true,"show_recent_calls":true}'::jsonb),
  ('timezone', '"Africa/Nairobi"'::jsonb)
on conflict (key) do nothing;

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select r.name from public.profiles p join public.roles r on r.id = p.role_id where p.id = auth.uid() and p.is_active = true limit 1;
$$;

create or replace function public.next_queue_sequence(p_business_date date)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare result bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('onfon-queue-' || p_business_date::text, 0));
  select coalesce(max(queue_sequence), 0) + 1 into result from public.tickets where business_date = p_business_date;
  return result;
end;
$$;

create or replace function public.create_ticket(p_service_key text, p_phone_canonical text, p_client_idempotency_key text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_date date := (timezone('Africa/Nairobi', now()))::date;
  v_phone_hash text := encode(digest(p_phone_canonical, 'sha256'), 'hex');
  v_next integer;
  v_queue bigint;
  v_ticket public.tickets%rowtype;
  v_repeat boolean;
begin
  if p_phone_canonical !~ '^254(7|1)[0-9]{8}$' then raise exception 'INVALID_PHONE'; end if;
  select * into v_service from public.services where key = p_service_key and is_active = true;
  if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;
  if p_client_idempotency_key is not null then
    select * into v_ticket from public.tickets where client_idempotency_key = p_client_idempotency_key;
    if found then return jsonb_build_object('ticket', to_jsonb(v_ticket), 'idempotent', true); end if;
  end if;
  if exists (select 1 from public.tickets where phone_hash = v_phone_hash and status in ('WAITING', 'CALLED', 'SERVING', 'ON_HOLD')) then raise exception 'ACTIVE_TICKET_EXISTS'; end if;
  select exists (select 1 from public.tickets where phone_hash = v_phone_hash and business_date = v_date) into v_repeat;
  insert into public.daily_ticket_counters (business_date, service_id, last_number) values (v_date, v_service.id, 0) on conflict do nothing;
  select last_number + 1 into v_next from public.daily_ticket_counters where business_date = v_date and service_id = v_service.id for update;
  update public.daily_ticket_counters set last_number = v_next where business_date = v_date and service_id = v_service.id;
  select public.next_queue_sequence(v_date) into v_queue;
  insert into public.tickets (business_date, display_number, service_id, phone_canonical, phone_hash, queue_sequence, repeat_visit, created_by, client_idempotency_key)
  values (v_date, v_service.prefix || '-' || lpad(v_next::text, 3, '0'), v_service.id, p_phone_canonical, v_phone_hash, v_queue, v_repeat, auth.uid(), p_client_idempotency_key)
  returning * into v_ticket;
  insert into public.print_jobs (ticket_id, idempotency_key, requested_by)
  values (v_ticket.id, coalesce(p_client_idempotency_key, v_ticket.id::text) || ':initial-print', auth.uid());
  insert into public.ticket_history (ticket_id, to_status, event_type, actor_id) values (v_ticket.id, 'WAITING', 'TICKET_CREATED', auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values) values (auth.uid(), 'TICKET_CREATED', 'ticket', v_ticket.id::text, jsonb_build_object('number', v_ticket.display_number, 'repeat', v_repeat));
  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'idempotent', false);
end;
$$;

create or replace function public.claim_next_ticket(p_mode text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.tickets%rowtype; v_teller uuid := auth.uid(); v_from public.ticket_status;
begin
  if public.current_app_role() not in ('RISK-MANAGER', 'RISK-OFFICER') then raise exception 'NOT_AUTHORISED'; end if;
  select t.* into v_ticket from public.tickets t join public.services s on s.id = t.service_id where t.status = 'WAITING' and (upper(p_mode) = 'ALL SERVICES' or s.key = p_mode) order by t.registered_at, t.queue_sequence for update of t skip locked limit 1;
  if not found then return jsonb_build_object('ticket', null); end if;
  v_from := v_ticket.status;
  update public.tickets set status = 'CALLED', call_count = 1, last_called_at = now(), created_by = coalesce(created_by, v_teller), updated_at = now() where id = v_ticket.id returning * into v_ticket;
  insert into public.teller_assignments (ticket_id, teller_id) values (v_ticket.id, v_teller);
  insert into public.ticket_history (ticket_id, from_status, to_status, event_type, actor_id) values (v_ticket.id, v_from, 'CALLED', 'CALL_NEXT', v_teller);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (v_teller, 'TICKET_CALLED', 'ticket', v_ticket.id::text);
  return jsonb_build_object('ticket', to_jsonb(v_ticket));
end;
$$;

create or replace function public.transition_ticket(p_ticket_id uuid, p_to_status public.ticket_status, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.tickets%rowtype; v_from public.ticket_status;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  if public.current_app_role() = 'RISK-OFFICER' and p_to_status in ('CANCELLED') then raise exception 'NOT_AUTHORISED'; end if;
  if p_to_status = 'UNATTENDED' and v_ticket.call_count < 3 then raise exception 'THREE_CALLS_REQUIRED'; end if;
  v_from := v_ticket.status;
  update public.tickets set status = p_to_status, updated_at = now() where id = p_ticket_id returning * into v_ticket;
  insert into public.ticket_history (ticket_id, from_status, to_status, event_type, actor_id, reason) values (p_ticket_id, v_from, p_to_status, 'STATUS_CHANGE', auth.uid(), p_reason);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason, previous_values, new_values) values (auth.uid(), 'TICKET_STATUS_CHANGED', 'ticket', p_ticket_id::text, p_reason, jsonb_build_object('status', v_from), jsonb_build_object('status', p_to_status));
  return to_jsonb(v_ticket);
end;
$$;

create or replace function public.retry_print_job(p_ticket_id uuid, p_printer_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_job public.print_jobs%rowtype; v_ticket public.tickets%rowtype;
begin
  if public.current_app_role() not in ('RISK-MANAGER', 'RISK-OFFICER') then raise exception 'NOT_AUTHORISED'; end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  select * into v_job from public.print_jobs where ticket_id = p_ticket_id order by created_at desc limit 1 for update;
  if not found then raise exception 'PRINT_JOB_NOT_FOUND'; end if;
  update public.print_jobs set status = 'RETRY_PENDING', printer_id = coalesce(p_printer_id, printer_id), attempt_count = attempt_count + 1, error_message = null, updated_at = now() where id = v_job.id returning * into v_job;
  update public.tickets set print_status = 'RETRY_PENDING', updated_at = now() where id = p_ticket_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values) values (auth.uid(), 'PRINT_RETRY_REQUESTED', 'ticket', p_ticket_id::text, jsonb_build_object('print_job_id', v_job.id));
  return jsonb_build_object('print_job', to_jsonb(v_job), 'ticket_id', p_ticket_id);
end;
$$;

alter table public.services enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_history enable row level security;
alter table public.teller_assignments enable row level security;
alter table public.print_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.profiles enable row level security;

create policy services_read_active on public.services for select using (is_active = true or public.current_app_role() = 'RISK-MANAGER');
create policy staff_read_tickets on public.tickets for select using (public.current_app_role() in ('RISK-MANAGER', 'RISK-OFFICER'));
create policy staff_read_history on public.ticket_history for select using (public.current_app_role() in ('RISK-MANAGER', 'RISK-OFFICER'));
create policy manager_read_audit on public.audit_logs for select using (public.current_app_role() = 'RISK-MANAGER');
create policy own_profile_read on public.profiles for select using (id = auth.uid() or public.current_app_role() = 'RISK-MANAGER');

revoke all on public.tickets, public.ticket_history, public.teller_assignments, public.print_jobs, public.audit_logs from anon;
revoke all on public.tickets, public.ticket_history, public.teller_assignments, public.print_jobs, public.audit_logs from authenticated;
grant execute on function public.create_ticket(text, text, text) to anon, authenticated;
grant execute on function public.claim_next_ticket(text) to authenticated;
grant execute on function public.transition_ticket(uuid, public.ticket_status, text) to authenticated;
grant execute on function public.retry_print_job(uuid, uuid) to authenticated;

alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_history;
