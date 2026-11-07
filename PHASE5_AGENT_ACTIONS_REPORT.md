# Phase 5 — Agent Actions and AI receptionist MVP

Date: 2026-11-07 (Europe/Istanbul). Repository: `/home/krr/Projects/OpenStackTools-AI`. This is a local MVP foundation, **not approval for a real-business pilot**. No deployment, DNS change, remote push, purchase, customer contact, external calendar, WhatsApp, or billing work occurred.

## Architecture audit and reuse

The pre-existing Express API supplied organization membership/role checks, origin-bound widget bearer sessions, durable widget request IDs, serialized conversation processing, provider budget reservations, staff audit logging, and the handoff inbox. Those paths remain in place. Before Phase 5 there were no appointment, staff schedule, customer-record, or model function-call executors. The Phase 4B OpenAI adapter still uses Chat Completions; it now advertises a fixed list of function tools. [OpenAI's function-call reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) describes tool calls as returned names and JSON argument strings that applications must validate. The [GPT-6 Luna model reference](https://developers.openai.com/api/docs/models/gpt-6-luna) says Chat Completions function calling requires reasoning effort `none`; startup rejects another effort for this model.

The model's output is treated as untrusted data. A Zod registry accepts only `check_availability`, `create_appointment`, `reschedule_appointment`, `cancel_appointment`, `create_customer`, and `handoff_to_human`. Unknown names, extra fields, invalid IDs, unsupported durations, and malformed dates are rejected. No arbitrary code execution or external service call is possible through the registry. One tool call per model response is accepted. The backend produces the customer-facing action result from database state, rather than trusting the model's success wording.

## Implemented features

- Organization business hours use an IANA time zone and nonoverlapping 15-minute weekly local windows. Staff members have separate weekly windows. Existing organizations default to closed schedules until configured. Availability lists exact ISO instants only when both schedules permit the full duration and no slot is occupied. The dashboard formats those instants in the configured business time zone.
- Appointments have UTC start/end, staff, optional conversation/visitor association, and booked/cancelled status. Creation and rescheduling claim every 15-minute slot in a MongoDB transaction. A unique `(organizationId,staffId,startAt)` index rejects concurrent double bookings. Cancellation releases claims. The backend rechecks schedule and conflicts when a proposal is confirmed.
- Customer records store a name, contact string, request, conversation/visitor association, timestamps, and confirmation-based consent source/time. The model cannot save a record solely by emitting a tool call.
- Consequential widget tools create a pending action with a 15-minute expiry. The widget shows the proposed operation and has Confirm and Decline buttons. Confirmation requires the same origin-bound visitor, assistant, organization, and a completed originating widget request. Repeated confirmations return the recorded result. Booking modifications additionally check visitor ownership; staff routes require organization membership and role. Staff actions require an explicit confirmation field, and the dashboard uses a checkbox or dialog.
- Tenant-scoped action records use unique idempotency keys and retain structured results. Reusing a key with different arguments is rejected. Staff action history omits raw arguments; owner-only export includes these records. Staff mutation audit events remain active. The existing handoff state is reused.
- The dashboard adds appointments, backend availability search, business hours, staff availability, customer requests, and action history. It uses the existing brand tokens, English/Turkish strings, light/dark themes, mobile navigation, and keyboard focus styles. The widget confirmation state survives reload through its existing session and pending-action endpoint. A widget session carries its EN/TR locale into persisted actions, so backend-confirmed replies use the visitor's selected language.
- Tenant deletion now includes the new collections. Retention removes old action/customer records and old appointments with slot claims. Existing conversations and budget data remain under the previous controls.

## Verification

| Status | Check | Result |
| --- | --- | --- |
| PASS | `npm test` | 27 API tests passed against ephemeral MongoDB replica sets, including tenant isolation, staff authorization, time-zone availability, concurrent slot claims, confirmation, same-visitor booking changes, concurrent confirmation/idempotency, customer consent, handoff, Turkish action replies, provider failures, and the existing budget/auth suite. AI replies in these tests are deterministic fakes. |
| PASS | `npm run test:browser -w apps/web` | Nine Playwright tests passed, including a widget booking proposal that requires a visible confirmation, reload persistence, and a mobile Turkish/dark receptionist dashboard axe check. Widget API responses are mocked. |
| PASS | `npm run typecheck`, `npm run brand:check`, `npm run build` | API/web TypeScript and production builds passed. |
| PASS | `npm audit --audit-level=low` | Zero reported vulnerabilities; no new npm dependencies. |
| PASS | Local HTTPS production images | `docker compose -f deploy/local-https/compose.yaml up -d --build` rebuilt Node 22 API and static web images. `python3 deploy/local-https/smoke.py` passed TLS account links, STARTTLS Mailpit, cookies, CSRF, roles, tenant isolation, widget origin, zero-budget protection, reset, sessions, and logout. `/app`, `/embed.js`, `/health/live` returned 200; public `/health/ready` returned 404; an unauthenticated receptionist API request returned 401. Nginx validated. Authenticated MongoDB counts for organizations, appointments, customers, and actions were zero afterward. Containers were stopped without deleting the local volume. The staging provider key was an inert placeholder. |
| NOT TESTED | Real OpenAI function calling | No approved project credentials were configured. The public model documentation and mocked replies do not establish project access or live tool behavior. |

The HTTPS smoke exercised the existing account/security path and production serving, **not** a real model function call or a production-image appointment flow. The appointment flow was exercised through API integration tests with real MongoDB and a deterministic responder.

## Security findings and limits

The action registry never executes model-generated code. Appointment times come from validated backend schedules, and an appointment is reported as confirmed only after a successful database transaction. Booking proposals are **not slot holds**: another booking can take the slot before confirmation, in which case confirmation fails. Widget visitor sessions establish continuity for a 24-hour origin-bound browser session; they do not prove a person's legal identity. A future customer identity or recovery flow needs stronger verification before sensitive appointment changes across devices.

This MVP has weekly hours and individual staff windows. It has no holiday exceptions, leave management, capacity beyond one booking per staff member, notification delivery, external calendar reconciliation, or automatic customer identity matching. The dashboard exposes minimal creation and cancellation controls; staff rescheduling is available through the authorized action API. The model can still produce inaccurate **free-text** scheduling claims even though backend action outputs are authoritative; prompt instructions alone are not a hallucination guarantee. Treat this as a release evaluation gate. Provider calls retain the existing 30-second timeout and conservative uncertain-charge behavior; pending action proposals expire after 15 minutes. Database operation timeouts and production-scale fault recovery require further staging drills.

New customer contact data and action arguments are included in owner exports and backups. Operators must set retention, restrict export access, and complete a privacy review before real customer data. Tenant isolation is enforced in application queries and indexes; MongoDB does not supply row-level security. No real OpenAI key was used.

## Next recommended phase

1. Run one explicitly authorized GPT-6 Luna function-call test in a dedicated project with synthetic data and a small provider spending target. Verify the exact tool-call schema, usage/cost settlement, confirmation, and provider invoice entry. Do not infer this from mocks.
2. Rehearse the new booking flow over production images with local HTTPS, then in an approved public staging environment. Include concurrent API instances, process failure during confirmation, schedule changes during pending proposals, DST transition cases, and an isolated backup/restore of appointment/action records.
3. Validate the receptionist with a real business using a bounded service schedule and human review. Add holiday exceptions, customer verification, notifications, and calendar adapters only after observing actual booking workflows. Keep external channel integrations and billing out of this MVP.

## Final staging addendum

The local production-image HTTPS smoke passed. The stack was stopped. No live provider call, external SMTP delivery, public deployment, or real customer action was performed.
