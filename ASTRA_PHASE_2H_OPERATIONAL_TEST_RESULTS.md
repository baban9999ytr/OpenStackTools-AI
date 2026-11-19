# ASTRA Phase 2H operational test results

Phase 2H used synthetic tenants, customers, inventory and schedules. The integrated rehearsal exercised real app and MongoDB state transitions with a deterministic AI provider. The Playwright regression suite uses intercepted routes where appropriate. The local image checks used an isolated HTTPS Compose stack with authenticated MongoDB and local Mailpit.

## Commands and counts

| Command or check | Result |
| --- | --- |
| npm test | 126 passed, 0 failed, 0 skipped. Includes the new synthetic business day and regressions for concurrent writers, booking expiry, scheduling including DST, tenant authorization, queue recovery, budgets and privacy. |
| npm run test:browser -w apps/web | 20 passed, 0 failed. Three new dashboard tests cover listing facts and mobile Axe, inbox preferences and takeover, and reselection requiring fresh appointment confirmation. An initial test locator failed to resolve the wrapped select. The final run uses its accessible combobox role and name. |
| npm run eval:deterministic -w apps/api | 128 scenarios across 68 base fixtures, 24 continuity checks and 36 business checks. 64 base backend checks passed and four intentionally skipped. Zero failures in the executed checks. |
| npm run typecheck and npm run eval:typecheck -w apps/api | Passed for API, web and evaluation harness. |
| npm run build | API and frontend production builds passed. |
| npm run brand:check | Passed. |
| npm audit --audit-level=low | Zero vulnerabilities reported. |
| actionlint and git diff --check | Passed. |

Each benchmark below ran via **npm run eval:benchmark -w apps/api -- --suite=&lt;name&gt;**. Even the suite named **phase2g-live** executed in simulated mode. Counts are executed synthetic or frozen model decisions. No provider APIs were called.

| Suite | Scenarios | Simulated or replayed decisions | Harness failures |
| --- | ---: | ---: | ---: |
| comparison | 5 | 18, across 3 simulated models | 0 |
| luna-smoke | 2 | 3 | 0 |
| conversation-quality | 15 | 33 | 0 |
| luna-quality | 4 | 9 | 0 |
| phase2g-replay | 4 | 9 | 0 |
| phase2g-live | 4 | 7 | 0 |
| phase2g-single-call | 1 | 1 | 0 |
| phase2g-milestone-c | 4 | 7 | 0 |

The frozen Phase 2G Milestone C replay still has 3/7 correct raw tool choices, 1/2 semantically correct arguments, and 2/4 raw context signals. It passed all 8 application safety, tenant sentinel, reply pattern and grounding assertions, including the deterministic setup turn. Simulated metrics measure the behavior of fixtures and application contracts.

## Integrated business day

| Scenario | Result and evidence |
| --- | --- |
| Inquiry, flexible preferences and recommendations | API queue resolved flexible preferences and recommended multiple eligible synthetic listings. Current listing facts distinguished zero fee, false furnishing and missing deposit. Negative fee validation and cross-tenant access were checked. |
| Viewing and confirmation | Two distinct visitors chose the same 14:00 Istanbul viewing with a configured consultant and 30-minute duration. Turning off the consultant's viewing capability removed both English and Turkish viewing aliases and kept the unrelated service. The proposals created no appointments before confirmation. Cross-visitor confirmation was denied. |
| Concurrency and idempotency | Concurrent confirmations returned one successful booking and one conflict. Retrying the successful confirmation returned the same appointment ID. The appointment persisted and was visible through the staff appointment API. |
| Changed availability and unavailable property | An offered time taken by someone else led to a new-time prompt. A property subsequently marked sold cleared the stale viewing. Both cases previously presented inaccurate recovery behavior. |
| Reschedule and cancellation | Unconfirmed rescheduling was denied. Confirmed reschedule and cancellation persisted. Existing API regressions exercised expiry, unavailable windows and DST. |
| Consent and refusal | Declining to share a phone number created no customer record. Existing regressions exercised scoped export, deletion, retention and audit events. |
| Provider outage | Simulated provider failure returned 502. Authorized staff received the bounded failure category and time. Other tenants could not access the conversation. Existing tests cover uncertain usage reservation handling. |
| Staff takeover | Takeover and a staff reply persisted with an audit event. A later visitor message did not trigger another AI reply. |

## Production-image rehearsal

- Built and ran current production API and web images in a disposable local Compose project with the synthetic fixture override. Verified local trusted TLS, public liveness, private readiness returning 404 at the public edge, and the production SPA response at /app. The local health response carried two Strict-Transport-Security values from the edge and upstream. Validate one canonical policy on the release candidate.
- The deployment's smoke.py passed over HTTPS. It exercised account links, STARTTLS against local Mailpit, secure cookies, CSRF, staff roles, tenant isolation, widget origin restrictions, zero-budget rejection, reset, sessions and logout.
- The deployment's backup-restore.sh authenticated to MongoDB, took an archive and restored into a separate local database. Checks included two synthetic tenants, appointments and action idempotency indexes, verified zero fee and false furnishing, and absent deposit. An encrypted off-host destination and production restore timing still need rehearsal.
- The first extra deployed-image Chromium attempt received HTTP 429 after the preceding smoke suite consumed the same client IP's authentication quota. The endpoint enforced its 15-per-15-minute shared bucket. After reset, Chromium signed in to the latest built image, saved a listing with zero maintenance fee, explicit unfurnished status and absent deposit, then reloaded after an isolated API restart and verified its authenticated access and the three persisted facts.
- Production origin, production SMTP, external channel delivery, monitoring alert delivery, rollback and operator training remain unverified. Authorization, budgets and provider gates were preserved throughout.
