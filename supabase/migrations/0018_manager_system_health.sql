-- ONFON manager troubleshooting: read-only health checks plus one safe repair.
-- This does not run arbitrary SQL, delete data, or change staff permissions.
create or replace function public.manager_system_health()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_manager boolean := public.current_app_role() = 'RISK-MANAGER';
  v_pgcrypto boolean;
  v_ticket_rpc boolean;
  v_ticket_search_path boolean;
  v_realtime_tickets boolean;
  v_realtime_profiles boolean;
begin
  if not v_is_manager then raise exception 'NOT_AUTHORISED'; end if;

  select exists (select 1 from pg_extension where extname = 'pgcrypto') into v_pgcrypto;
  select to_regprocedure('public.create_ticket(text,text,text)') is not null into v_ticket_rpc;
  select position('extensions' in pg_get_functiondef('public.create_ticket(text,text,text)'::regprocedure)) > 0 into v_ticket_search_path;
  select exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets') into v_realtime_tickets;
  select exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') into v_realtime_profiles;

  return jsonb_build_object(
    'ok', v_pgcrypto and v_ticket_rpc and v_ticket_search_path and v_realtime_tickets and v_realtime_profiles,
    'checked_at', now(),
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'pgcrypto', 'label', 'Phone hashing extension', 'ok', v_pgcrypto, 'detail', case when v_pgcrypto then 'pgcrypto is installed.' else 'pgcrypto is missing.' end),
      jsonb_build_object('key', 'ticket_rpc', 'label', 'Ticket creation function', 'ok', v_ticket_rpc, 'detail', case when v_ticket_rpc then 'create_ticket is available.' else 'create_ticket is missing.' end),
      jsonb_build_object('key', 'ticket_search_path', 'label', 'Ticket hashing configuration', 'ok', v_ticket_search_path, 'detail', case when v_ticket_search_path then 'The RPC can resolve pgcrypto digest().' else 'The RPC cannot resolve pgcrypto digest().' end),
      jsonb_build_object('key', 'realtime_tickets', 'label', 'Live ticket updates', 'ok', v_realtime_tickets, 'detail', case when v_realtime_tickets then 'Tickets are published to Realtime.' else 'Tickets are not published to Realtime.' end),
      jsonb_build_object('key', 'realtime_profiles', 'label', 'Live counter updates', 'ok', v_realtime_profiles, 'detail', case when v_realtime_profiles then 'Profiles are published to Realtime.' else 'Profiles are not published to Realtime.' end)
    )
  );
end;
$$;

grant execute on function public.manager_system_health() to authenticated;

create or replace function public.manager_repair_safe_database()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.current_app_role() <> 'RISK-MANAGER' then raise exception 'NOT_AUTHORISED'; end if;
  alter function public.create_ticket(text, text, text) set search_path = public, extensions;
  insert into public.audit_logs (actor_id, action, entity_type, reason, new_values)
  values (auth.uid(), 'SYSTEM_SAFE_REPAIR', 'system', 'Manager requested safe database configuration repair', jsonb_build_object('repair', 'create_ticket_search_path'));
  return public.manager_system_health();
end;
$$;

grant execute on function public.manager_repair_safe_database() to authenticated;
