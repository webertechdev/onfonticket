-- ONFON: return the existing active ticket when two kiosk requests race.
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
  begin
    insert into public.tickets (business_date, display_number, service_id, phone_canonical, phone_hash, queue_sequence, repeat_visit, created_by, client_idempotency_key)
    values (v_date, v_service.prefix || '-' || lpad(v_next::text, 3, '0'), v_service.id, p_phone_canonical, v_phone_hash, v_queue, v_repeat, auth.uid(), p_client_idempotency_key)
    returning * into v_ticket;
  exception when unique_violation then
    select * into v_existing from public.tickets where phone_hash = v_phone_hash and business_date = v_date and status in ('WAITING', 'CALLED', 'SERVING', 'ON_HOLD') order by created_at desc limit 1;
    if found then return jsonb_build_object('ticket', to_jsonb(v_existing), 'existing', true); end if;
    raise;
  end;
  insert into public.print_jobs (ticket_id, idempotency_key, requested_by) values (v_ticket.id, coalesce(p_client_idempotency_key, v_ticket.id::text) || ':initial-print', auth.uid());
  insert into public.ticket_history (ticket_id, to_status, event_type, actor_id) values (v_ticket.id, 'WAITING', 'TICKET_CREATED', auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values) values (auth.uid(), 'TICKET_CREATED', 'ticket', v_ticket.id::text, jsonb_build_object('number', v_ticket.display_number, 'repeat', v_repeat));
  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'idempotent', false);
end;
$$;

grant execute on function public.create_ticket(text, text, text) to anon, authenticated;
