# ASTRA Phase 2H release blockers

**Supervised pilot: NO-GO.** A controlled synthetic rehearsal can continue. Real customer use remains gated on the evidence below.

| Gate | Accountable role | Evidence required for release |
| --- | --- | --- |
| Candidate Luna quality | Product and evaluation leads | Separately authorized live candidate verification, followed by independent Turkish review with denominators and raw/application/reply separation. Resolve any blocking factual, privacy, booking, or cross-tenant failure. |
| Approved business workflow | Pilot business owner | Confirm inventory, consultant role and schedules, timezone, duration, consent and identity procedures, staff coverage and escalation contacts. Complete a staffed walkthrough with the actual candidate. |
| Candidate ingress and account security | Release operator | Validate the approved origin and deployed revision, HTTPS, secure cookies, CSRF, tenant authorization, SMTP delivery and secret separation on the intended environment. Verify forwarding headers, one canonical HSTS policy, and private readiness. |
| Privacy approvals | Business data owner | Approve notices, retention period, staff access, exports and deletion escalation, handling of declined consent, and encrypted backup custody. |
| Operations and cost controls | On-call and project owners | Verify available Luna entitlement, applicable pricing, quotas and provider limits, then demonstrate alert delivery, dashboard access, budget cap review and reconciliation of uncertain reservations. Establish staff response and handoff targets. |
| Recovery and rollback | Infrastructure owner | Verify encrypted off-host backup and retention, time an isolated restore against agreed targets, and rehearse rollback of the selected deployed image. Confirm no booking is replayed or overwritten. |
| External channel delivery | Channel owner | Demonstrate supervised live delivery, retry and reconciliation per channel before expanding scope. The pilot can start website-only once its other gates are met. |

Local results cover the feature and its automated regressions. They leave production environments, provider billing and the independent human review unverified. Staff should retain an alternate manually staffed intake path during the pilot.
