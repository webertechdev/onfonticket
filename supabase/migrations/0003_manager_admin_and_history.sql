-- ONFON manager administration, profile provisioning, and historical data access.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role_id uuid;
  v_name text;
begin
  select id into v_role_id from public.roles where name = 'RISK-OFFICER';
  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'ONFON staff'), '@', 1));
  insert into public.profiles (id, full_name, role_id)
  values (new.id, v_name, v_role_id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill invited or previously-created Auth users that predate the trigger.
insert into public.profiles (id, full_name, role_id)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(u.email, 'ONFON staff'), '@', 1)),
       r.id
from auth.users u
cross join public.roles r
where r.name = 'RISK-OFFICER'
  and not exists (select 1 from public.profiles p where p.id = u.id);

create policy manager_manage_profiles on public.profiles
for all using (public.current_app_role() = 'RISK-MANAGER')
with check (public.current_app_role() = 'RISK-MANAGER');

create policy manager_manage_services on public.services
for all using (public.current_app_role() = 'RISK-MANAGER')
with check (public.current_app_role() = 'RISK-MANAGER');

alter table public.system_settings enable row level security;
create policy manager_read_system_settings on public.system_settings
for select using (public.current_app_role() = 'RISK-MANAGER');
create policy manager_update_system_settings on public.system_settings
for all using (public.current_app_role() = 'RISK-MANAGER')
with check (public.current_app_role() = 'RISK-MANAGER');

alter table public.printer_devices enable row level security;
create policy manager_read_printers on public.printer_devices
for select using (public.current_app_role() = 'RISK-MANAGER');

alter table public.kiosk_devices enable row level security;
create policy manager_read_kiosks on public.kiosk_devices
for select using (public.current_app_role() = 'RISK-MANAGER');

alter table public.offline_allocations enable row level security;
create policy manager_read_offline_allocations on public.offline_allocations
for select using (public.current_app_role() = 'RISK-MANAGER');

create policy staff_read_teller_assignments on public.teller_assignments
for select using (public.current_app_role() in ('RISK-MANAGER', 'RISK-OFFICER'));
create policy manager_read_print_jobs on public.print_jobs
for select using (public.current_app_role() = 'RISK-MANAGER');

-- Existing revoke statements removed default table access. Restore only the read grants
-- that are protected by the RLS policies above.
grant select on public.roles, public.services, public.profiles, public.tickets, public.ticket_history,
  public.teller_assignments, public.print_jobs, public.audit_logs, public.system_settings,
  public.printer_devices, public.kiosk_devices, public.offline_allocations to authenticated;
grant update on public.profiles, public.services, public.system_settings to authenticated;

create index if not exists profiles_created_idx on public.profiles (created_at desc);
create index if not exists print_jobs_created_idx on public.print_jobs (created_at desc);
create index if not exists teller_assignments_created_idx on public.teller_assignments (assigned_at desc);
