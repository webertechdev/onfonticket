-- ONFON: keep the current active call and TV display synchronized with teller counter changes.
create or replace function public.propagate_teller_counter_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.counter_name is distinct from old.counter_name then
    update public.tickets
      set counter_name = nullif(btrim(new.counter_name), ''), updated_at = now()
      where teller_id = new.id and status in ('CALLED', 'SERVING')
        and business_date = (timezone('Africa/Nairobi', now()))::date;
    update public.teller_assignments
      set counter_name = nullif(btrim(new.counter_name), '')
      where teller_id = new.id and released_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_counter_change on public.profiles;
create trigger profiles_counter_change
after update of counter_name on public.profiles
for each row execute function public.propagate_teller_counter_change();

-- Repair active calls created before counter snapshots were added.
update public.tickets t
set counter_name = nullif(btrim(p.counter_name), ''), updated_at = now()
from public.profiles p
where p.id = t.teller_id
  and t.status in ('CALLED', 'SERVING')
  and t.business_date = (timezone('Africa/Nairobi', now()))::date
  and (t.counter_name is null or btrim(t.counter_name) = '');

update public.teller_assignments a
set counter_name = nullif(btrim(p.counter_name), '')
from public.profiles p
where p.id = a.teller_id
  and a.released_at is null
  and (a.counter_name is null or btrim(a.counter_name) = '');
