# Phase 3 pilot readiness report

Date: 2026-11-06. Scope: this AI repository only. No staging or production deployment, DNS change, remote push, customer email, or main website change was made.

## Decision

**NO-GO for a real-business pilot today.** The local application and security regressions pass, but an approved HTTPS staging host, authenticated private MongoDB, dedicated OpenAI project/key and verified model prices, sandbox SMTP credentials, and operator monitoring are still required. Real provider billing, inbox delivery, and staging TLS behavior have not been tested. The application is ready for a controlled staging exercise once those inputs are supplied.

## Reused foundation and changes

The existing Express/TypeScript API, React dashboard and widget, MongoDB replica-set transactions, organization membership checks, daily/monthly budget reservations, durable widget idempotency, distributed MongoDB rate limits, account-token flows, Nginx static serving, and bilingual brand UI were retained. The parent website was untouched.

1. **Provider and budget safety:** the official OpenAI SDK remains server-side and uses the configured `OPENAI_MODEL`. The adapter has a 30-second timeout and disables its automatic retries. The queue retries only an explicit HTTP 429 once. Definitive model/auth/request rejections release the budget reservation; ambiguous timeouts, connection failures, crashes after reservation, and expired reserved leases record a conservative uncertain charge without automatic replay. Successful replies require provider token usage and settle estimated cost from configured prices. Error responses and logs do not include raw provider details or customer text. The widget allows a new message after a terminal failure.
2. **Account mail and API security:** production configuration requires an HTTPS dashboard origin and SMTP TLS. Mail transport has bounded connection, greeting, and socket timeouts; account mail has escaped HTML and text content. Failed delivery removes the newly issued account token. Reset and resend responses remain identical for known and unknown addresses even during SMTP failure. API responses use `Cache-Control: no-store`; request IDs are returned and logged without query strings or bodies. Readiness returns 503 on a disconnected MongoDB. Server request and header timeouts are bounded.
3. **Staging and recovery:** added a Compose/Caddy example with an HTTPS edge, same-origin `/api`, private API, and an external authenticated MongoDB requirement; no dev server is exposed by the example. Added isolated `mongodump`/`mongorestore` rehearsal, opt-in live OpenAI and SMTP checks, and staging, backup, alert, incident, and secret-rotation runbooks.

Local commits: `c172ed0` (provider, mail and API hardening plus regressions), `7b76f0a` (staging and verification tools). The documentation and this report are in the final Phase 3 documentation commit.

## Verification record

| Area | Command or method | Result and limit |
| --- | --- | --- |
| Dependency installation | `npm ci` | Passed; host Node 26 produced an engine warning because the project supports Node 22/24. npm reported four blocked optional install scripts; post-install typechecks, builds, and tests passed. Docker builds use Node 22. |
| Tokens and TypeScript | `npm run brand:check`, `npm run typecheck` | Passed for API and web. |
| Production builds | `npm run build`; `docker compose build api web` | Passed, including embedded widget bundle and production Nginx image. |
| API/security tests | `npm test` | 17 passed against an ephemeral real MongoDB replica set with a fake AI responder. Covers tenant access, roles, budgets under concurrency, idempotency, reply serialization, 429/404/ambiguous failures, mail outage, token reuse/expiry, session revocation/expiry, retention, deletion, and readiness failure. |
| Browser/widget tests | `npm run test:browser -w apps/web` | 7 passed in Chromium against the local production web image with mocked widget API responses. Covers `/app` direct navigation, mobile keyboard menu, English/Turkish UI, light/dark theme, verification fragment, reload/reconnect, terminal error state, and unsafe HTML rendered as text. |
| Dependency security | `npm audit --audit-level=low` | Passed, 0 reported vulnerabilities at test time. This is not a source-code penetration test. |
| Local Compose and Nginx | `docker compose config --quiet`, `docker compose up -d`, `nginx -t`, HTTP smoke | Passed locally: `/app` and `/app/assistants` serve the SPA, `/embed.js` serves JavaScript, `/api/auth/me` returns 401 JSON with request ID/no-store/nosniff, live and ready health return 200, unknown path returns 404. No public TLS was tested. |
| Local process restart | `docker compose restart api`, readiness poll through the web proxy | Passed: `/health/ready` recovered to 200. This does not prove recovery of an in-flight provider call. |
| Staging config syntax | staging Compose `config --quiet`; Caddy `validate` | Passed with placeholder hostname and temporary ignored example env file. Caddy reported a formatting suggestion only. This does not test certificate issuance or network routing. |
| Local account mail | Mailpit sandbox and synthetic accounts over local Compose | Registration verification email, single-use invitation and acceptance, reset email, password change and login, and reset-token reuse rejection exercised. Mailpit acceptance is not external inbox delivery. |
| Isolated restore | `npm run test:backup:restore -w apps/api` | Passed: synthetic two-tenant source, `mongodump`, `mongorestore` into a separate database, tenant-scoped record counts and assistant index checked. Four representative collections were restored; full archive, encrypted backup, point-in-time recovery and production-scale restore remain untested. |
| Live OpenAI | `OPENAI_LIVE_TEST=1 npm run test:openai:live -w apps/api` | **BLOCKED / not run:** no approved provider key, supported model choice, verified prices, or billing authorization was configured. No mock result is presented as a provider result. |
| Real SMTP inbox | `SMTP_LIVE_TEST=1 SMTP_TEST_RECIPIENT_CONFIRMED=1 ... npm run test:smtp:live -w apps/api` | **BLOCKED / not run:** no approved sandbox SMTP account or dedicated recipient was configured. SMTP acceptance would still require manual inbox confirmation. |
| Public staging | HTTPS smoke, cookies, CSRF, outage injection, monitoring alerts | **BLOCKED / not run:** no approved staging host, DNS/TLS, private authenticated MongoDB, or operator alert destination exists in this workspace. |

## Security findings and limits

- Existing tenant-scoped data access, explicit roles, exact dashboard origin and CSRF header checks, widget origin allowlists, host-only HttpOnly cookies, and budget transactions remain in place. Production flags and links have a dedicated regression test. Local Compose MongoDB is unauthenticated and private to its Docker network; it is for development only. The staging example requires an authenticated private MongoDB but cannot prove that an operator provisioned one.
- Provider charges after a timeout cannot be determined from the failed call. The full reservation is internally charged as uncertain to protect the budget. This is an estimate, not a provider invoice. Operators must reconcile actual usage and decide how to handle customer retries.
- The shared MongoDB queue and worker were tested in process with concurrent and idempotent requests, and a local process restart reached readiness. Recovery of an in-flight provider call and a multi-instance staging fault drill remain necessary. A full backup restore and recovery-time measurement are also required before pilot traffic.
- No tool execution or retrieval is present, so customer text has no server-side authorization authority. Prompt injection and answer-quality evaluation still require a pilot-specific safety review. No MFA exists. Account email delivery and sender reputation remain external risks.
- Proposed alert thresholds and incident steps are documented in `STAGING_RUNBOOK.md`; they are **not active monitoring**. Logs exclude routine request bodies and raw customer conversations. Review telemetry and backup access policies before processing customer data.

## Required operator decisions and release gates

1. Approve a staging hostname and isolated infrastructure, provide HTTPS/TLS, a private authenticated MongoDB replica set, secret manager, and sandbox SMTP destination. Do not use production customer data.
2. Provide a dedicated OpenAI staging project/key, choose a supported model, verify current input/output token prices, set low organization budgets, and authorize one benign live test. Review provider usage against the recorded estimate.
3. Authorize one SMTP test to a dedicated mailbox, inspect the received link and headers, then run verification, invitation, and reset flows over the approved HTTPS origin.
4. Run the staging smoke and fault drills in `STAGING_RUNBOOK.md`, including Secure/HttpOnly/SameSite and CSRF checks, two-tenant isolation, provider/SMTP/Mongo outages, and worker restart. Configure and test alert delivery.
5. Perform a full encrypted-backup restore into an isolated authenticated target, measure recovery time, review retention/deletion obligations, and record a rollback owner and incident contact.

Reassess GO/NO-GO only after these gates are recorded. See `docs/SECURITY_REVIEW.md`, `docs/DEPLOYMENT.md`, `STAGING_RUNBOOK.md`, and `BACKUP_RESTORE_RUNBOOK.md` for the procedures.
