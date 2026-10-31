# ONFON Mobile Deployment Notes

## Local development

Install dependencies with `pnpm install`, copy `.env.example` to `.env.local`, and run `pnpm dev`. Until `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured, the application runs in clearly labelled demo mode using browser storage. Demo mode is for UI and workflow verification only and is not the production data store.

## Supabase

Apply `supabase/migrations/0001_onfon_ticketing.sql` to the approved Supabase project. Create staff accounts through Supabase Authentication, then attach each user to a profile and role. The first manager profile should be created for Samwel Mwangi. Never place the Supabase service-role key or a database password in the frontend.

## Cloudflare Pages

Build with `pnpm build` and publish the `dist` directory as a static Vite application. Configure only the browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values in the Pages project environment. Keep production auto-publish disabled until acceptance testing is complete.

## Printer bridge

The queue creates a persisted print job before any physical print attempt. The adapter must receive the existing ticket ID and idempotency key, send ESC/POS output to the verified 58 mm USB printer, then update the same print job as PRINTED or FAILED. A retry uses the same job and ticket number. Direct browser-to-USB printing from an arbitrary Android phone is not considered verified until a physical test confirms the selected Android print service or local bridge.

## Backups

Export the Supabase database on a defined schedule, encrypt the export, store it on an ONFON-approved office computer or approved storage, and test restoration before launch. Free-tier hosting does not provide an enterprise uptime or retention guarantee.
