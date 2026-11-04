# OpenStackTools AI pilot readiness — 2026-11-04

## Decision

The foundation is suitable for a **controlled, monitored first-business pilot** after the operator completes the configuration and release gates below. It is not validated for an open public launch. No production deployment, remote push, real OpenAI call, or live SMTP delivery occurred in this phase.

## Implemented

| Area | Pilot behavior |
| --- | --- |
| AI budget | Server-enforced UTC daily and monthly limits per organization. MongoDB transactions reserve a conservative maximum across both windows before the provider call; measured usage settles the reservation. A failed or timed-out attempt consumes the full reservation as uncertain cost. Owner budget settings and a migration for older organizations were added. |
| Request reliability | MongoDB-backed rate counters shared by API instances; durable first-message idempotency; per-conversation processing leases; serialized replies; worker recovery and one retry. Widget requests can return 202 and be polled. |
| Accounts | Email verification, expiring single-use invitations and reset links, password reset session revocation, session list/revoke endpoints. No staff password is entered by an owner or emailed. Mailpit is available in local Compose. |
| Website widget | Tab-scoped session restoration for 24 hours, latest-message reload, pending request recovery with the same message ID, queued/handoff/error states, and a clear-session control. |
| Operations | Organization retention setting and daily cleanup of inactive conversations, messages, and requests; paged owner export; password-confirmed full tenant deletion; staff mutation audit records; backup/restore and monitoring runbooks. |

## Verification performed

- `npm ci`: passed. The host is Node 26.12.1 and emitted an engine warning because the project targets Node 22–24.
- `npm run typecheck`: passed for API and web.
- `npm run build`: passed for API, dashboard, and embeddable widget.
- `npm test`: **11 passed, 0 failed**. Uses a real ephemeral MongoDB 8 replica set and an injected fake AI responder. Covers tenancy, role checks, origin isolation, distributed rate limiting, concurrent budget reservations, monthly exhaustion, idempotency, ordering, retry accounting, invitations, reset/session revocation, export, retention, and deletion.
- `npm run test:browser -w apps/web`: **1 passed** in installed Chromium using mocked API responses. Covers reload restoration, visible error, safe retry with the same message ID, and clearing the session.
- `npm audit --audit-level=low`: **0 vulnerabilities**. The third-party notice inventory was regenerated: 226 packages, none without notice text.
- `docker compose config --quiet`, `docker compose build`, and `docker compose up -d`: passed. API `/health/ready` returned `ready`; web and Mailpit returned HTTP 200. Compose was stopped without removing the MongoDB volume. A test-only `.env` with placeholder provider values was removed after the check.

These are the checks actually run. The real OpenAI network path, real SMTP delivery, backup restore, production-like load, and multi-instance failover were **not** tested.

## Release blockers and manual configuration

1. Configure a real server-side OpenAI key and supported Chat Completions model **only in the pilot environment**. Set current input/output prices and conservative daily/monthly budgets; compare internal estimated costs with provider billing. No such key was used here.
2. Configure an SMTP service, sender domain, and delivery monitoring. Exercise verification, invitation, and reset links with real inboxes. The local Mailpit smoke check only verified the service responded.
3. Use an authenticated MongoDB replica set, tested encrypted backup/restore, TLS, a secret manager, exact dashboard and website origins, and a reviewed proxy setting. Run the budget/retention migration for any older organizations before enabling traffic.
4. Rehearse queue recovery and budget enforcement across multiple API instances and under a provider timeout. A timed-out provider attempt can be billed despite no response; the internal full-reservation charge is intentionally conservative, not proof of actual provider cost.
5. Review the pilot business's privacy notice, retention period, export/deletion workflow, backup expiry, and widget site CSP. The widget bearer token is readable by scripts on the embedding origin; only trusted site scripts should run there.
6. Validate staged deletion for larger tenants before scaling. The current full tenant deletion uses one MongoDB transaction. Existing-email staff membership across organizations, MFA, and self-service account recovery remain outside this pilot scope.

## Changes and review points

Commits are split into a baseline, distributed limiter, AI budgets and request queue, account security, widget reconnection, and tenant operations. MongoDB remains the database. No future messaging channels or billing features were added. The main API compatibility changes are: registration now requires email verification before login; owner staff creation is replaced by `/invitations`; widget message POST may return 202 while work is queued or 402 on budget exhaustion. Clients must poll request status and messages.

See `docs/SECURITY_REVIEW.md`, `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`, and `docs/THIRD_PARTY_LICENSES.md` for implementation and operations detail.
