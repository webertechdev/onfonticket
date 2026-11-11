-- ONFON: display the immutable counter used when the ticket was called.
create or replace function public.get_display_queue()
returns table(ticket_id uuid, display_number text, service_key text, status public.ticket_status, call_count integer, last_called_at timestamptz, counter_name text)
language sql stable security definer set search_path = public
as $$
  select t.id, t.display_number, s.key, t.status, t.call_count, t.last_called_at,
         coalesce(nullif(t.counter_name, ''), nullif(p.counter_name, ''), 'Teller')
  from public.tickets t
  join public.services s on s.id = t.service_id
  left join public.profiles p on p.id = t.teller_id
  where t.business_date = (timezone('Africa/Nairobi', now()))::date
    and t.status in ('CALLED', 'SERVING')
  order by t.last_called_at desc nulls last
  limit 12
$$;

grant execute on function public.get_display_queue() to anon, authenticated;
