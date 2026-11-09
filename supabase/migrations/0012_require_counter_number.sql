-- ONFON: do not allow queue claims until the teller has selected a numeric counter.
create or replace function public.claim_next_ticket(p_mode text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_teller uuid := auth.uid();
  v_counter text;
  v_from public.ticket_status;
begin
  if public.current_app_role() not in ('RISK-MANAGER', 'RISK-OFFICER') then raise exception 'NOT_AUTHORISED'; end if;
  select nullif(trim(counter_name), '') into v_counter from public.profiles where id = v_teller and is_active = true;
  if v_counter is null or v_counter !~ '^[0-9]{1,2}$' or v_counter::integer < 1 then raise exception 'COUNTER_REQUIRED'; end if;
  if exists (select 1 from public.tickets where teller_id = v_teller and business_date = (timezone('Africa/Nairobi', now()))::date and status in ('CALLED', 'SERVING')) then raise exception 'ACTIVE_CALL_EXISTS'; end if;
  select t.* into v_ticket from public.tickets t join public.services s on s.id = t.service_id where t.status = 'WAITING' and t.teller_id is null and (upper(p_mode) = 'ALL SERVICES' or s.key = p_mode) order by t.registered_at, t.queue_sequence for update of t skip locked limit 1;
  if not found then return jsonb_build_object('ticket', null); end if;
  v_from := v_ticket.status;
  update public.tickets set status = 'CALLED', call_count = 1, last_called_at = now(), teller_id = v_teller, counter_name = v_counter, created_by = coalesce(created_by, v_teller), updated_at = now() where id = v_ticket.id and status = 'WAITING' and teller_id is null returning * into v_ticket;
  if not found then return jsonb_build_object('ticket', null); end if;
  insert into public.teller_assignments (ticket_id, teller_id, counter_name) values (v_ticket.id, v_teller, v_counter);
  insert into public.ticket_history (ticket_id, from_status, to_status, event_type, actor_id) values (v_ticket.id, v_from, 'CALLED', 'CALL_NEXT', v_teller);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values) values (v_teller, 'TICKET_CALLED', 'ticket', v_ticket.id::text, jsonb_build_object('counter_name', v_counter));
  return jsonb_build_object('ticket', to_jsonb(v_ticket));
end;
$$;
grant execute on function public.claim_next_ticket(text) to authenticated;
