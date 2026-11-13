-- ONFON production hotfix: Supabase installs pgcrypto in the extensions schema.
-- The ticket RPC is SECURITY DEFINER with a restricted search_path, so digest()
-- must be resolvable through extensions rather than only public.
alter function public.create_ticket(text, text, text)
  set search_path = public, extensions;
