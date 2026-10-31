# ONFON Mobile Risk Ticketing — Implementation Plan

## Product scope

Build a responsive operational web application for ONFON Mobile's Risk Department. It includes a customer kiosk route, Risk Officer queue dashboard, Risk Manager controls, and a TV display route. The initial application uses the approved external stack: React + TypeScript + Vite, private GitHub, Cloudflare Pages Free, Supabase PostgreSQL/Auth/Realtime, PostgreSQL RPC functions and RLS, and a local print adapter for the 58 mm USB thermal printer.

The first implementation slice will be usable without secrets through a clearly marked local demo adapter. When Supabase environment variables are configured, data operations will be routed through protected RPC functions rather than frontend-generated ticket numbers. The printer is isolated behind an adapter so Android/USB compatibility can be verified without coupling it to queue logic.

## Architecture

The static frontend contains route-level experiences for `/kiosk`, `/teller`, `/manager`, and `/display`. A domain layer owns phone normalization, queue rules, status transitions, idempotency keys, local draft recovery, and print-job requests. The Supabase adapter will call narrowly scoped PostgreSQL functions and subscribe to Realtime events. The local demo adapter persists sample operational data in browser storage for preview only.

The database migration will define services, staff profiles, daily counters, tickets, histories, assignments, print jobs, kiosk devices, offline allocations, audit logs, and settings. Ticket numbers are created in PostgreSQL under a transaction. Active phone uniqueness is enforced with a partial unique index over canonical phone identity. Claiming is implemented with row locks and a protected RPC.

## Design direction

Three possible styles were considered: **Operational Clarity** (0.08), a calm utility dashboard with strong hierarchy and service colour cues; **Civic Service Modernism** (0.06), a public-service interface with generous spacing and reassuring contrast; and **Quiet Control Room** (0.07), a dark operational console with bright status accents. The selected direction is **Operational Clarity**.

The design uses a warm paper-like background, deep navy ink, and restrained service accents: cobalt blue for REPAIR, emerald green for CUSTOMER CARE, and amber orange for MINILOAN. Panels use thin borders, compact shadows, and generous spacing rather than decorative imagery. Typography uses a readable system sans stack with a heavy numeric treatment for ticket numbers. The brand voice is direct, respectful, and reassuring: “Select the service you need” and “Your ticket is saved. Please wait to be called.”

Signature elements are a ticket-number capsule, a left rail with a vertical status line, and small service-colour markers that always sit beside a written service name. Motion is short and purposeful: queue updates fade and slide in, status changes use a 160ms transition, and kiosk success states use a single calm confirmation pulse.

## Project structure

- `src/app`: route shell and screen composition.
- `src/components`: reusable cards, badges, buttons, and data tables.
- `src/domain`: ticket types, phone normalization, status and queue rules.
- `src/lib`: Supabase client, demo adapter, local draft persistence, and printer adapter boundary.
- `src/styles.css`: design tokens and responsive layouts.
- `supabase/migrations`: PostgreSQL schema, policies, functions, and seed data.
- `public`: route manifest and static brand/runtime assets.
- `docs`: print-agent, deployment, backup, and operating guides.

## Delivery workflow

1. Build the UI and demo adapter so each route is visible and testable.
2. Add SQL schema, RLS policies, and protected RPC contracts.
3. Add Supabase configuration and Realtime subscriptions.
4. Add local draft recovery and controlled offline allocation contracts.
5. Add printer adapter, print status recovery, and 58 mm ticket template.
6. Run typecheck, build, route-manifest, and scenario checks.
7. Connect the canonical repository through the Webdev GitHub workflow, checkpoint the working slice, and publish only after build checks pass.

## Explicit limitations

The local demo adapter is not a production database. Automatic USB printing is not claimed complete until a physical Android/printer path is tested. Free-tier Supabase and Cloudflare do not provide enterprise uptime or backup guarantees; backup/export and usage monitoring remain part of the deployment work.
