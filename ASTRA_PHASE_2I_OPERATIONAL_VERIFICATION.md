# ASTRA Phase 2I operational verification

Evidence is scoped to the candidate source manifest and image identifiers in the [candidate report](ASTRA_PHASE_2I_RELEASE_CANDIDATE_REPORT.md). The HTTPS tests used loopback Caddy, local certificates, production-built web and API images, the deterministic provider entry point, Mailpit and private authenticated MongoDB. The API suite ran its own isolated MongoDB replica sets.

## Rehearsal

| Check | Result |
| --- | --- |
| HTTPS edge | Trusted local CA, one HSTS header on /app and /health/live, public readiness 404, intended private readiness 200, same-origin application routes and embed asset |
| HTTPS account and widget smoke | Passed on the final images. TLS account links, STARTTLS mail, secure cookies, CSRF, roles, session and tenant isolation, widget origin, zero budget, password reset, sessions and logout. |
| Staging workflow | Existing HTTPS integration passed verified listings, stale and archived inventory, authenticated account onboarding, tenant boundaries, simultaneous booking, separate confirmation, persisted booking, idempotency, rescheduling and cancellation, staff-visible handoff, synthetic timeout and budget rejection |
| Natural inquiry and negative cases | The real API and Mongo-backed business-day test used natural synthetic messages for needs, verified recommendations, unknown property information, booking and cancellation, phone refusal and handoff. Existing integration tests also cover wrong-visitor approval, expired proposals and unavailable staffing. |
| App restart | The HTTPS scenario restarted the local API and verified recovery of requests and persisted appointment state. |
| Regression runs | npm test, npm run test:browser -w apps/web, npm run eval:deterministic -w apps/api, npm run eval:benchmark -w apps/api for phase2i-rc and phase2g-milestone-c, typecheck, eval:typecheck, build, brand:check, actionlint, npm audit --audit-level=low, git diff --check. Counts in the candidate report. |

The first HTTPS workflow trials found outdated assertions for the stale-listing reply and injected business text. After those were corrected, the workflow passed. An additional rerun received HTTP 429 due to the shared local fixed-window signup quota. The same final images passed after starting a fresh disposable synthetic project volume. The rate limiter was never changed.

## Monitoring evidence

| Signal | Evidence and candidate action |
| --- | --- |
| Private readiness and DB availability | On isolated MongoDB stop the running API returned 503. The local probe sent a real validated STARTTLS message to Mailpit, and the mailbox API retrieved the delivered message. This is automated receipt evidence. A human on-call acknowledgement remains pending. |
| Provider failures, budget rejection, widget failures | The HTTPS workflow generated a simulated provider failure and enforced zero budget. The private Mongo monitor reports count by bounded category for recent failures and website channel. Use an actual approved browser-origin widget canary for end-user availability. |
| Queue and uncertain provider state | The authenticated Mongo snapshot returns active-job age, expired leases and failed records still holding reservations. Live alert rules, alert routing and uncertain billing reconciliation require operator acceptance. |
| Appointment conflicts, auth failures and rate limits | Actual competing requests returned a conflict and a shared auth bucket returned HTTP 429. Use structured API route/status rates and workflow categories. GET a synthetic widget page and exercise join/send/read with an approved fixture for delivery. |
| Human handoff | Local real handoff transition and staff reply passed. The monitor counts handoff conversations with no update for 15 minutes as a signal. Confirm business thresholds and acknowledgement in the launch walkthrough. |

Run deploy/pilot-monitor.mongodb.js via mongosh against the app database with a read-only operator account from a private network. Emit metrics on an operator-defined cadence, add the endpoint health checks and request-status aggregation, and agree on thresholds and acknowledgement before sending real traffic. Keep correlation IDs and bounded status codes in incident records. Keep message bodies, contacts, cookies, and provider metadata out of shared alerts.

## Backup, recovery and rollback

- The authenticated two-tenant archive and restore rehearsal completed in 5 seconds locally, including fixture setup and assertions. It checked restored scopes, saved locations, audit target, appointments and unique slot and action idempotency indexes in a separate database. A separate authorization probe confirmed the app principal could read its own database and was denied access to a separate restore namespace.
- A separate authenticated archive stream was encrypted with AES-256 into a mode 0600 file in a private directory. Its decrypted digest matched the source stream. The one-use local key and archive were removed after verification. Off-host storage, scheduled retention, recovery permissions and key custody await verification on the intended infrastructure.
- Readiness recovered 9 seconds after the isolated MongoDB start command. These are synthetic rehearsal timings. Require the business and operator to agree measurable recovery point and time objectives before using timings as targets.
- A local round-trip API rollback verified the previous Phase 2H image (sha256:03b4f0a32d406d5f2acf0436bb104631951af0998801cd2e42f50e98afdd2533) and the final candidate against the same replica set and preserved a synthetic database sentinel. Both images regained private readiness in a 5-second round trip. The intended deployment still needs a representative rollback with actual deployment configuration, booking-state checks and an agreed abort condition.
