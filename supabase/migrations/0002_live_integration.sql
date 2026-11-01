-- ONFON live integration additions. Apply after 0001_onfon_ticketing.sql.

alter table public.profiles add column if not exists service_mode text not null default 'ALL SERVICES';
alter table public.tickets add column if not exists teller_id uuid references auth.users(id);

update public.profiles set service_mode = 'ALL SERVICES' where service_mode is null;

alter table public.profiles drop constraint if exists profiles_service_mode_check;
alter table public.profiles add constraint profiles_service_mode_check check (service_mode in ('ALL SERVICES', 'repair', 'customer-care', 'miniloan'));

alter type public.ticket_status add value if not exists 'REASSIGNED';

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
  v_existing public.tickets%rowtype;
  v_repeat boolean;
begin
  if p_phone_canonical !~ '^254(7|1)[0-9]{8}$' then raise exception 'INVALID_PHONE'; end if;
  select * into v_service from public.services where key = p_service_key and is_active = true;
  if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;
  if p_client_idempotency_key is not null then
    select * into v_ticket from public.tickets where client_idempotency_key = p_client_idempotency_key;
    if found then return jsonb_build_object('ticket', to_jsonb(v_ticket), 'idempotent', true); end if;
  end if;
  select * into v_existing from public.tickets where phone_hash = v_phone_hash and business_date = v_date and status in ('WAITING', 'CALLED', 'SERVING', 'ON_HOLD') order by created_at desc limit 1;
  if found then return jsonb_build_object('ticket', to_jsonb(v_existing), 'existing', true); end if;
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
  update public.tickets set status = 'CALLED', call_count = 1, last_called_at = now(), teller_id = v_teller, created_by = coalesce(created_by, v_teller), updated_at = now() where id = v_ticket.id returning * into v_ticket;
  insert into public.teller_assignments (ticket_id, teller_id) values (v_ticket.id, v_teller);
  insert into public.ticket_history (ticket_id, from_status, to_status, event_type, actor_id) values (v_ticket.id, v_from, 'CALLED', 'CALL_NEXT', v_teller);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (v_teller, 'TICKET_CALLED', 'ticket', v_ticket.id::text);
  return jsonb_build_object('ticket', to_jsonb(v_ticket));
end;
$$;

create or replace function public.recall_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.tickets%rowtype; v_from public.ticket_status;
begin
  if public.current_app_role() not in ('RISK-MANAGER', 'RISK-OFFICER') then raise exception 'NOT_AUTHORISED'; end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.status not in ('CALLED', 'SERVING') then raise exception 'TICKET_NOT_FOUND'; end if;
  if v_ticket.call_count >= 3 then raise exception 'THREE_CALLS_REACHED'; end if;
  if v_ticket.last_called_at is not null and now() < v_ticket.last_called_at + interval '30 seconds' then raise exception 'WAIT_30_SECONDS'; end if;
  v_from := v_ticket.status;
  update public.tickets set status = 'CALLED', call_count = call_count + 1, last_called_at = now(), updated_at = now() where id = p_ticket_id returning * into v_ticket;
  insert into public.ticket_history (ticket_id, from_status, to_status, event_type, actor_id) values (p_ticket_id, v_from, 'CALLED', 'RECALL', auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values) values (auth.uid(), 'TICKET_RECALLED', 'ticket', p_ticket_id::text, jsonb_build_object('call_count', v_ticket.call_count));
  return jsonb_build_object('ticket', to_jsonb(v_ticket));
end;
$$;

create or replace function public.reprint_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.tickets%rowtype; v_job public.print_jobs%rowtype; v_key text;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id and business_date = (timezone('Africa/Nairobi', now()))::date and status in ('WAITING', 'CALLED', 'SERVING', 'ON_HOLD') for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  v_key := v_ticket.id::text || ':reprint:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  insert into public.print_jobs (ticket_id, idempotency_key, status, requested_by) values (v_ticket.id, v_key, 'RETRY_PENDING', auth.uid()) returning * into v_job;
  update public.tickets set print_status = 'RETRY_PENDING', updated_at = now() where id = v_ticket.id;
  insert into public.ticket_history (ticket_id, to_status, event_type, actor_id, metadata) values (v_ticket.id, v_ticket.status, 'REPRINT_REQUESTED', auth.uid(), jsonb_build_object('print_job_id', v_job.id));
  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'print_job', to_jsonb(v_job));
end;
$$;

drop function if exists public.get_display_queue();
create or replace function public.get_display_queue()
returns table(ticket_id uuid, display_number text, service_key text, status public.ticket_status, call_count integer, last_called_at timestamptz, counter_name text)
language sql stable security definer set search_path = public
as $$
  select t.id, t.display_number, s.key, t.status, t.call_count, t.last_called_at, coalesce(p.counter_name, 'Teller')
  from public.tickets t
  join public.services s on s.id = t.service_id
  left join public.profiles p on p.id = t.teller_id
  where t.business_date = (timezone('Africa/Nairobi', now()))::date and t.status in ('CALLED', 'SERVING')
  order by t.last_called_at desc nulls last
  limit 12
$$;

create policy staff_update_own_profile_mode on public.profiles for update using (id = auth.uid() and public.current_app_role() in ('RISK-MANAGER', 'RISK-OFFICER')) with check (id = auth.uid());

create index if not exists tickets_teller_active_idx on public.tickets (teller_id, status, business_date);

grant execute on function public.recall_ticket(uuid) to authenticated;
grant execute on function public.reprint_ticket(uuid) to anon, authenticated;
grant execute on function public.get_display_queue() to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when undefined_object then null;
end $$;
