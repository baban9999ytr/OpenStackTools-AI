# Phase 7 — Integration, reliability and pilot readiness

Date: 2026-11-08 (Europe/Istanbul). Local synthetic testing only. **Real-business pilot decision: NO-GO.** No deployment, push, DNS change, customer contact, external integration or billable OpenAI request occurred.

## Scope and architecture reviewed

The Phase 4B model verification, Phase 5 Agent Actions and Phase 6 business knowledge reports were reviewed with the current Express, MongoDB, widget, action, appointment, budget and listing paths. The existing organization predicates, role checks, origin-bound visitor session, durable request queue, MongoDB budget reservation, action confirmation and slot index were reused. Phase 7 added test infrastructure and a narrow conflict-response fix, not a new product feature.

The production-image integration fixture is a separate, opt-in API entry point. It accepts a `P7:` JSON action in place of a provider response only when `PHASE7_SYNTHETIC_FIXTURE=1`; the normal production command remains unchanged. All fixture actions still pass through the real HTTPS edge, API validation, MongoDB transactions, worker, widget session and action executor. It does **not** prove real model selection or function calling. Synthetic organizations are deleted through the authenticated owner endpoint at the end of a successful run.

## Verification matrix

| Area | Status | Evidence and limit |
| --- | --- | --- |
| Latest normal production images and HTTPS account/security smoke | PASS | `docker compose -f deploy/local-https/compose.yaml up -d --build`; `python3 deploy/local-https/smoke.py`. TLS, registration/verification/reset links, STARTTLS Mailpit, secure cookies, CSRF, origin, roles, tenant isolation, budgets, sessions and logout passed. Nginx and Caddy configuration validation passed. |
| Production-image receptionist workflow | PASS with deterministic provider | `python3 deploy/local-https/phase7-integration.py` through local HTTPS: visitor session, availability, pending proposal, initial-message replay, confirmed booking, repeated confirmation, cancellation, handoff and persisted appointment checked through staff API. |
| Schedule change, concurrent booking and restart | PASS with deterministic provider | Confirmation failed after hours closed; two concurrent proposals for one slot produced one booking and one HTTP 409 `slot_taken`; both API containers restarted between proposal and confirmation without losing it. This does not cover an abrupt crash inside a MongoDB commit. |
| Two API instances and distributed controls | PASS for exercised paths | `docker compose -p ost-ai-phase7-fresh -f deploy/local-https/compose.yaml -f deploy/local-https/compose.fixture.yaml up -d --scale api=2`; full workflow passed. API logs showed 25 completed requests on `api-1` and 30 on `api-2`. A repeat registration hit the expected shared auth rate limit (429) in the preserved project; a fresh isolated project was used for the final run. A load/chaos test was not performed. |
| Business knowledge and real-estate workflow | PASS with deterministic provider | Synthetic knowledge and listing created via staff API. Search by maximum budget/currency, location, property type, rooms and area returned one record matching stored ID, price and URL. Archived and 40-day-old listings were excluded. A second tenant saw no listing; unauthorized staff calls were denied. Invalid knowledge fields were rejected. |
| Customer/CRM and privacy behavior | PASS for exercised controls | A confirmed, consent-marked customer record was saved, lead preferences updated, and cross-tenant lead edit denied. Stored malicious FAQ text was returned only as labelled business data; existing API tests check it is omitted from later model context. This is not a legal privacy review. |
| Failure handling and budget | PASS with deterministic provider | Fixture timeout marked request failed with `provider_unavailable`; zero budget rejected a later AI message. Existing API tests cover concurrent budget reservations, provider failures and definitive retry behavior. No real provider timeout or invoice was measured. |
| Proposal expiry and DST | PASS in API tests | An expired proposal could not create an appointment. IANA conversion checks covered the Europe/Berlin spring gap and repeated autumn hour. These are deterministic time tests, not a full calendar policy review. |
| Authenticated backup and isolated restore | PASS locally | `docker compose -p ost-ai-phase7 -f deploy/local-https/compose.yaml exec -T mongo bash /run/local-config/backup-restore.sh` used authenticated `mongodump`/`mongorestore`, two synthetic tenants, Phase 5/6 collections and unique index checks in a separate database. It cleaned its synthetic source records and restore database. `npm run test:backup:restore -w apps/api` also passed against an ephemeral MongoDB replica set. No production-size restore, off-host storage or timed recovery objective was tested. |
| API tests, browser tests, typechecks and builds | PASS | `npm test`: 31 MongoDB-backed API tests. `npm run test:browser -w apps/web`: 10 Chromium tests with mocked browser APIs. `npm run typecheck`, `npm run build`, `npm run brand:check`, `git diff --check` passed. |
| Dependency audit | PASS | `npm audit --audit-level=low`: zero reported vulnerabilities at execution time. |
| Live GPT-6 Luna tool calls, actual provider payload and cost | NOT TESTED | No approved dedicated credentials or billable authorization. `python3 deploy/local-https/phase7-live-tool.py` exited at its opt-in gate before network access. The harness checks the persisted parsed action arguments, usage and estimated cost after an authorized run; it does not capture the raw provider response or reconcile the provider invoice. |
| External SMTP, public staging, real customer data and identity proof | NOT TESTED | Mailpit and loopback HTTPS are local. No external delivery, public ingress or customer identity verification was exercised. |

## Defect fixed

The concurrent booking loser previously surfaced a generic `action_conflict` (HTTP 403) when the unique slot index rejected it. The action executor now maps appointment slot collisions to `slot_taken` (HTTP 409), while retaining a separate customer identity-key conflict. The API regression asserts the error code; the production-image two-instance run confirmed one successful booking and one 409.

## Security and operational findings

- Widget appointment modifications are tied to the same origin-bound visitor session. That session proves continuity of a browser token, **not** the customer's identity. A stolen/shared browser or a new device cannot be resolved safely with the current booking identity scheme. Add verified contact ownership and a recovery process before sensitive real-customer changes.
- Proposals are not slot holds. Schedule and conflict checks run again at confirmation, as verified. Expiry and unique slot claims prevent stale proposals and double booking in the exercised cases. Calendar exceptions, staff leave and external calendar reconciliation remain absent.
- The 30-day listing freshness cutoff and database-backed recommendation output prevent old stored listings from appearing in the tested action result. They do not verify market availability or price. Owners must review data; monitoring for aging listings and a business process for updates are needed.
- Strict action schemas and tenant-scoped retrieval prevent a stored FAQ from changing backend permissions. The model can still make unsupported claims in unconstrained free-text replies. Real-provider prompt-injection, factuality and tool-choice evaluation remain release gates.
- Customer contacts, conversation text, preferences, action arguments and knowledge are present in exports and backups. Consent UI and retention controls exist, but a controller/processor privacy review, access policy, deletion/restore policy and operational procedures are required before real data.
- The local authenticated restore proves collection/index recovery for synthetic records. Off-host encrypted backup storage, restore drills at expected data volume, alerting, recovery objectives and a rollback plan remain unverified. Monitor queue age/failure, budget reservations, provider errors and latency, booking conflicts, stale listings, MongoDB health, SMTP failures and 429 rates.
- The fixture API must never be deployed: it is an explicit test-only Compose override. Normal production images were built and smoked separately. The test key is an inert local placeholder. No secrets were printed or committed.

## Opt-in live-provider harness

`deploy/local-https/phase7-live-tool.py` requires explicit flags for a dedicated project, current price verification and spending approval, plus a non-placeholder server-side key. It requires GPT-6 Luna with reasoning effort `none`, at most 128 output tokens, daily budget at most $0.10 and monthly budget at most $0.50. It runs only against the normal API entry point and uses one synthetic listing request. On success it checks the selected `search_listings` action, validated persisted arguments, listing ID/price, provider-reported usage, internal estimated cost and settled budget, latency and log secret absence; it deletes the synthetic tenant. A definitive 429 may cause the existing queue to make one retry, so this is not a strict one-attempt provider harness. No live run occurred. Reconcile the provider billing entry separately after explicit authorization.

## Remaining pilot blockers and next step

1. Authorize a dedicated low-limit provider project and one synthetic live tool-call test; verify entitlement, raw provider function-call behavior, latency, tool selection and provider billing against the internal ledger. Do not infer these from the deterministic fixture.
2. Verify real customer identity before appointment modification, complete privacy/data-processing review, and evaluate free-text factuality and hostile knowledge with the real model.
3. Rehearse public HTTPS staging, external SMTP, off-host backups and a timed restore with monitoring and rollback. Test an abrupt API failure during confirmation and the expected multi-instance load profile.
4. Establish listing review/expiry ownership and schedule-exception procedures with a pilot business before accepting bookings or property facts.

**Decision: NO-GO for a real-business pilot.** The local integration and recovery exercises are promising, but the live provider, identity, privacy and operational gates above are unverified. Continue with a synthetic, supervised staging evaluation only.
