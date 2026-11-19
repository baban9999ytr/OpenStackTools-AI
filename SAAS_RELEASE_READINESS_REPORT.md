# OpenStackTools AI SaaS release readiness

Phase 2C assessment, 2026-11-19. **Public SaaS launch and a real-customer pilot remain gated.** The code supports an operator-managed synthetic trial. Hosted CI, live Responses behavior, live delivery and operated infrastructure still need evidence.

| Area | Repository evidence | Status and next action |
| --- | --- | --- |
| Onboarding and access | Organization registration, account verification, password recovery, invitations, roles and assistant settings are implemented in the authenticated API. | Local fixtures pass. Rehearse sandbox mail delivery and account recovery using the release topology. Review role changes and account revocation as part of onboarding. |
| Model and usage policy | Platform and tenant allowlists, registry pricing, reasoning ceilings, product-mode entitlement attestations, daily/monthly atomic reservations and usage events. Automatic is Luna-only. | Confirm actual project access, provider invoice reconciliation and error handling first. |
| Billing | AI credits are internal limits. | Subscription billing, payment collection, tax handling, plan entitlement and webhook reconciliation are absent. Defer until pilot costs and demand are measured. |
| Privacy and tenancy | Tenant predicates, scoped sessions, owner-controlled export, retention and deletion. Backup contents have independent retention. | Rehearse extraction, deletion, backup expiry and access review. Exports and tenant deletion need scale testing. |
| Backups and deployment | Local HTTPS and authenticated restore rehearsal in historical records. TLS/proxy/replica set and staging examples exist. | Establish managed secrets, restore objectives, monitored backup schedules and recovery rehearsals on the intended infrastructure. |
| Monitoring and support | Structured request IDs, health endpoints, usage, audit records and Telegram outbox states. | Configure durable alerts and dashboards, ownership, incident triage, customer support response and an escalation runbook. Pilot with business-hours staffing. |
| Website and Telegram | Origin-bound website widget, tenant bot onboarding, durable inbound/outbox and explicit confirmations. | Rehearse approved synthetic webhook delivery, unknown-send recovery and manual handoff. Verify TLS, origin restrictions and degraded behavior externally. |
| Listing facts | Current tenant listings, structured prices/locations/room counts, stale and archived exclusion. | Add verified structured amenities and dues with source/freshness metadata. Proximity, suitability and unverified descriptions need clarification or staff help. |
| Leads and follow-up | Staff can track opportunities and follow-up, and visitor action paths require explicit confirmation/consent. | Define separate contact-for-this-request consent and marketing permission, with evidence and revocation. Prefer an optional phone field where it serves a concrete need. |
| Appointments and takeover | Organization schedules, appointment list, action history, conflict checking, worker handoff and dashboard takeover. | Verify operational coverage and notification delivery. Automated staff notification and robust follow-up reminders still need implementation. |

Evidence sources include the current routes and services and the [architecture](docs/ARCHITECTURE.md), [security review](docs/SECURITY_REVIEW.md), [deployment runbook](docs/DEPLOYMENT.md), and [backup and restore runbook](BACKUP_RESTORE_RUNBOOK.md).

## Phase 3 priorities

1. **Pilot gate.** Run hosted CI and a separately approved dedicated-project Responses comparison on synthetic tenant records. Review Turkish/English answers, unsupported claims, tool use, refusals, booking and estimated versus billed cost. Capture the run version and acceptance criteria.
2. **Pilot gate.** Rehearse HTTPS, sandbox SMTP verification/recovery, Telegram outbox uncertainty, restore, retention, tenant deletion and staff takeover in controlled staging. Assign a support owner and measure queue age, provider failures, budget denials, delivery uncertainty and recovery time.
3. **Pilot value.** Add verified amenities and dues, optional scoped phone consent, staff notifications and follow-up assignments. Add acceptance checks for disclosure, tenant access, callback consent and expiry.
4. **Public SaaS gate.** Implement plan entitlements, subscription events and invoice/reconciliation workflows. Add abuse monitoring, support escalation, privacy and contractual review, backup schedules, multi-instance load tests and a release rollback procedure.
