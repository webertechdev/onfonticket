# ONFON Mobile Deployment Notes

## Live frontend configuration

The application uses Supabase Authentication, PostgreSQL RPC functions, Row Level Security, and Realtime. Configure the browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values through the Webdev/Cloudflare Pages environment settings. Never commit a service-role key or database password.

## Supabase migrations

Apply `supabase/migrations/0001_onfon_ticketing.sql`, then `supabase/migrations/0002_live_integration.sql`, to the approved Supabase project. The second migration adds live profile modes, teller ownership, three-call recall enforcement, public same-day reprints, and the phone-number-free display feed.

Create staff users through Supabase Authentication using invitations. Then create a corresponding `public.profiles` row joined to the seeded role. The first manager profile is Samwel Mwangi. Public customer accounts are not required; `/kiosk` and `/display` use narrowly scoped anonymous RPCs.

## Staff access

Staff sign in at `/auth`. Staff routes are protected in the application and every queue mutation is protected again by PostgreSQL role checks and RLS. A user without an active profile cannot operate the teller or manager views.

## Cloudflare Pages

Cloudflare Pages must point to the private `webertechdev/onfonticket` repository, production branch `main`, and build command `pnpm install --frozen-lockfile && pnpm build` with output directory `dist`. Configure only the two browser-safe Supabase variables. Production deployments are enabled from `main`; verify the latest deployment after each migration-aware release.

## Printer bridge

Ticket creation persists a print job before any physical print attempt. The local printer adapter must receive the existing ticket ID and idempotency key, send ESC/POS output to the verified 58 mm USB printer, then update the same print job as PRINTED or FAILED. A retry uses the same ticket number. Direct browser-to-USB printing from an arbitrary Android phone is not considered verified until a physical test confirms the selected Android print service or local bridge.

## Backups

Export the Supabase database on a defined schedule, encrypt the export, store it on ONFON-approved storage, and test restoration before launch. Free-tier hosting does not provide an enterprise uptime or retention guarantee.
