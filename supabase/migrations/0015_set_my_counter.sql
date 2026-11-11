-- ONFON: teller-owned counter updates must go through a protected RPC.
create or replace function public.set_my_counter(p_counter_name text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_counter text := nullif(btrim(coalesce(p_counter_name, '')), '');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.current_app_role() is null or public.current_app_role() not in ('RISK-MANAGER', 'RISK-OFFICER') then raise exception 'NOT_AUTHORISED'; end if;
  if v_counter is null or v_counter !~ '^[0-9]{1,2}$' or v_counter::integer < 1 then raise exception 'INVALID_COUNTER'; end if;
  update public.profiles set counter_name = v_counter, updated_at = now() where id = auth.uid() and is_active = true;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
end;
$$;

grant execute on function public.set_my_counter(text) to authenticated;
