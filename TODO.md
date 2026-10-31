# ONFON Mobile Risk Ticketing — Implementation Outcomes

## 1. Customer kiosk registration

- Provide a customer-facing kiosk route with Welcome, service selection, phone entry, review, checking, ticket-created, existing-ticket, print-error, and unavailable states.
- Accept local phone numbers beginning with `07` or `01`; normalize internally to `2547XXXXXXXX` or `2541XXXXXXXX`.
- Include Back, Next, Clear, Cancel/Start Over, refresh resume, and inactivity timeout behavior.
- Save the ticket before creating its print job.
- Permit one active ticket per canonical phone number.

## 2. Queue and teller operations

- Maintain one chronological master queue across REPAIR, CUSTOMER CARE, and MINILOAN.
- Support ALL SERVICES, REPAIR, CUSTOMER CARE, and MINILOAN teller modes.
- Claim tickets atomically so two tellers cannot call the same ticket.
- Support three calls at 30-second intervals, then UNATTENDED.
- Preserve status and assignment history.

## 3. Manager controls and security

- Provide Risk Officer and Risk Manager roles.
- Provide manager controls for reassignment, release, overrides, staff, services, settings, reports, print recovery, and audit logs.
- Mask phone numbers by default and never show them on the TV display or printed ticket.
- Protect database operations with PostgreSQL RPC and RLS when Supabase is configured.

## 4. Display and sound

- Provide a TV display route showing current ticket and teller number.
- Provide audible ticket announcements with mute and volume controls.
- Do not show sensitive customer data.

## 5. Printing and recovery

- Provide a 58 mm compact black-and-white ticket template.
- Route print work through an adapter with idempotent jobs, retry, failure, and audited reprint states.
- Never create a new ticket because of a print retry.
- Leave the Android/USB adapter behind a physical compatibility check.

## 6. Persistent data contract

- Add SQL migrations for services, profiles, daily counters, tickets, histories, assignments, print jobs, devices, offline allocations, audit logs, and settings.
- Add protected functions for ticket creation, claiming, recalls, completion, unattended status, reassignment, offline synchronization, and printing.
- Add daily counters in Africa/Nairobi with transaction-safe numbering.

## 7. Delivery evidence

- Typecheck and build must pass.
- The route manifest must include `/`, `/kiosk`, `/teller`, `/manager`, and `/display`.
- The demo adapter must exercise the main flows without secrets.
- The project must be ready for GitHub connection and later Supabase/Cloudflare configuration.
