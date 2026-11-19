# ASTRA Phase 2I acceptance matrix

Scope is the supervised website pilot. Evidence comes from the source manifest in the [candidate report](ASTRA_PHASE_2I_RELEASE_CANDIDATE_REPORT.md). A PASS applies to the stated gate and evidence scope.

| Gate | Status | Evidence | Owner and next action |
| --- | --- | --- | --- |
| AI quality | BLOCKED | Historical raw selection 3/7 in fresh 2G. Current candidate has seven fixture decisions and preflight only. | Evaluation owner obtains separate authorization, runs one candidate evaluation, and commissions Turkish review. |
| Customer-response correctness | PARTIAL | Frozen responses replayed with 7/7 customer replies and 4/4 scenarios. Verified listing and booking facts passed local checks. | Product owner resolves any blocker found in fresh delivery or review before sign-off. |
| Tenant security | PARTIAL | Local HTTPS and Mongo suites verify tenant access, CSRF, staff roles, origin and session boundaries. | Release owner repeats approved-origin and identity checks on the intended host. |
| Privacy | PARTIAL | Automated consent/refusal, retention, export and deletion coverage. | Data owner signs notices, retention, access and incident policy, with legal review as required. |
| Listing management | PASS | Tenant-scoped API editing and persistence, current/archived/stale filtering, missing facts and browser editor passed locally. | Staff separately accepts usability and verifies actual inventory. |
| Appointment safety | PASS | Local HTTPS and Mongo checks confirm authorized booking, idempotency, contention, expiry, conflict recovery, rescheduling and cancellation. | Business owner confirms the actual calendar, timezone, duration and coverage as part of acceptance. |
| Staff usability | BLOCKED | Automated navigation, accessible mobile editor, takeover and booking controls passed. | Named real employee completes the checklist and records evidence. |
| Monitoring | PARTIAL | Private readiness fell to 503 with a stopped isolated MongoDB, delivered a STARTTLS alert to local Mailpit and recovered to 200. | On-call configures approved destinations, schedules checks and acknowledges a rehearsal on the intended stack. |
| Backup and recovery | PARTIAL | Authenticated isolated restoration with tenant scopes, audit and indexes, plus local authenticated archive encryption. | Infrastructure owner demonstrates off-host retention, key/access controls, time targets and rollback on the intended host. |
| HTTPS and deployment | PARTIAL | Local trusted TLS, canonical HSTS, blocked public readiness, same-origin API, widget bundle and SPA. | Release owner pins reviewed build and verifies actual proxy trust, credentials, origin, TLS and SMTP. |
| Cost controls | PARTIAL | Local budget exhaustion and offline admission tested under Luna-only ceilings. | Project owner verifies current price, entitlement, quota, dedicated project controls and settlement monitoring. |
| Customer support and escalation | PARTIAL | Local takeover and response persisted, later visitor input suppressed automated reply. | Business owner assigns coverage and rehearses acknowledgement, fallback contact and incident escalation. |

**Decision: NO-GO** pending intended-environment acceptance, candidate model and human review, actual staff acceptance and business policy sign-off.
