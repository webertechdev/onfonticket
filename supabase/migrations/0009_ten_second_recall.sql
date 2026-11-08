-- ONFON: recall customers after a 10-second interval.
-- Apply after 0002_live_integration.sql.
create or replace function public.recall_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_from public.ticket_status;
begin
  if public.current_app_role() not in ('RISK-MANAGER', 'RISK-OFFICER') then
    raise exception 'NOT_AUTHORISED';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found or v_ticket.status not in ('CALLED', 'SERVING') then
    raise exception 'TICKET_NOT_FOUND';
  end if;
  if v_ticket.call_count >= 3 then
    raise exception 'THREE_CALLS_REACHED';
  end if;
  if v_ticket.last_called_at is not null and now() < v_ticket.last_called_at + interval '10 seconds' then
    raise exception 'WAIT_10_SECONDS';
  end if;

  v_from := v_ticket.status;
  update public.tickets
    set status = 'CALLED', call_count = call_count + 1, last_called_at = now(), updated_at = now()
    where id = p_ticket_id
    returning * into v_ticket;
  insert into public.ticket_history (ticket_id, from_status, to_status, event_type, actor_id)
    values (p_ticket_id, v_from, 'CALLED', 'RECALL', auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
    values (auth.uid(), 'TICKET_RECALLED', 'ticket', p_ticket_id::text, jsonb_build_object('call_count', v_ticket.call_count));
  return jsonb_build_object('ticket', to_jsonb(v_ticket));
end;
$$;

grant execute on function public.recall_ticket(uuid) to authenticated;
