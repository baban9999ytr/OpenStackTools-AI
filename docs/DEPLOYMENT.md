# Deployment preparation

No production deployment is included. Local Compose runs MongoDB 8 as a single-node replica set, Mailpit for test email, API, and web. Run `docker compose up --build` after setting `apps/api/.env`; Mailpit is at `http://localhost:8025`. Never use Mailpit as a production mail server.

For an approved staging environment, review [`STAGING_RUNBOOK.md`](../STAGING_RUNBOOK.md), [`BACKUP_RESTORE_RUNBOOK.md`](../BACKUP_RESTORE_RUNBOOK.md), `deploy/compose.staging.example.yaml`, and `deploy/staging.api.env.example`. Those files are examples only; no staging service is running. The staging Compose example expects a private authenticated MongoDB replica set and a sandbox SMTP provider, and publishes only its HTTPS edge.

## Ecosystem routing and brand boundary

The parent website stays independently deployed as a static Cloudflare Worker. The AI web application is a separate static Nginx image at `bots.openstacktool.com`, with the dashboard at `/app`. Nginx serves `/app` and deeper SPA paths from `index.html`, the widget bundle at `/embed.js`, and proxies `/api` and `/health` to the private API service. [`deploy/Caddyfile.example`](../deploy/Caddyfile.example) shows a TLS edge routing example; it is not an active deployment. Do not create shared authentication cookies or SSO for this topology.

Set `DASHBOARD_ORIGIN=https://bots.openstacktool.com` exactly, with no path or trailing slash, and `COOKIE_SECURE=true`. The API session cookie remains host-only, HttpOnly, and SameSite=Lax. Account emails link to `https://bots.openstacktool.com/app/#verify=…`, `#reset=…`, or `#invite=…`; the fragment stays out of HTTP requests. Keep the exact-origin CSRF checks and `X-Requested-With` requirement. Set `TRUST_PROXY` to the number of trusted proxy hops actually in front of the API; do not trust arbitrary forwarded headers. Expose only the TLS edge publicly and keep MongoDB and API network access private. Configure TLS redirect/HSTS at the edge after certificate validation.

The Nginx template has a static-app Content Security Policy, no-sniff, and referrer policy. The embeddable widget runs on customer sites, which must allow the widget script and configured API origin under their own CSP. Google Fonts are requested by the dashboard stylesheet; self-host those fonts if third-party font requests are unsuitable for the pilot's privacy policy. Brand colors and dimensions come from `brand/tokens.json` and are generated with `npm run brand:generate`; publish both web and widget assets together when tokens change.

## Required configuration and release sequence

1. Use Node 22 or 24 LTS. Run `npm ci`, `npm run brand:check`, `npm run typecheck`, `npm test`, `npm run test:browser -w apps/web`, `npm run test:backup:restore -w apps/api`, `npm run build`, and `npm audit --audit-level=low`.
2. Configure an authenticated, private MongoDB replica set. Back up before schema changes. Run `npm run migrate:budgets -w apps/api` once for organizations created before the pilot fields existed. This fills missing daily/monthly budgets and 30-day retention; it does not overwrite configured values. Verify indexes and migration counts.
3. Provide `MONGODB_URL`, `SESSION_SECRET` (at least 32 random characters), `OPENAI_API_KEY`, `OPENAI_MODEL`, `DASHBOARD_ORIGIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optional SMTP credentials through a secret manager. Set `DEFAULT_DAILY_BUDGET_USD`, `DEFAULT_MONTHLY_BUDGET_USD`, and both model token prices from current provider pricing. Keep `COOKIE_SECURE=true`, set exact `TRUST_PROXY`, and serve API, dashboard, and widget over HTTPS.
4. Validate email sending/receiving, verification, invitation, and reset with a dedicated pilot test mailbox before involving the business. Register exact website origins for the assistant. Review site CSP to allow the widget script and API origin. The public assistant key is an identifier, not a secret.
5. Monitor `/health/live` and `/health/ready`, rate-limit 429s, budget 402s, queue depth/age, `uncertain` usage, SMTP failures, provider latency/errors, failed authentication, MongoDB storage, retention failures, and audit write failures. Alert on daily and monthly spend approaching limits. Review provider invoices against internal estimates.

Explicit live checks are available only after an operator supplies dedicated credentials and authorization. `OPENAI_LIVE_TEST=1 npm run test:openai:live -w apps/api` sends one benign provider request with the configured model and prices, then prints token counts and estimated cost without printing response text or secrets. `SMTP_LIVE_TEST=1 SMTP_TEST_RECIPIENT_CONFIRMED=1 SMTP_TEST_RECIPIENT=<dedicated-mailbox> npm run test:smtp:live -w apps/api` asks a configured SMTP server to accept one test message; an operator must separately confirm inbox delivery. Neither command is part of the ordinary test suite. Never target a customer mailbox or use production credentials without authorization.

## Backup and restoration runbook

- Take encrypted, access-controlled replica-set snapshots or `mongodump` backups on a schedule appropriate to the pilot's recovery point objective. Include database indexes and configuration in the restore plan. Keep backup retention explicit; deleted tenant data remains in backups until expiration.
- Rehearse restoration into an isolated, nonproduction replica set with different credentials and no outbound OpenAI or SMTP access. Restore a chosen snapshot with `mongorestore`, check `/health/ready`, collection counts, indexes, membership isolation, and a sample conversation. Record recovery time and point. Never restore a test snapshot over the live database.
- Restrict restore access to named operators, log every backup/restore action, and rotate credentials after suspected exposure. Verify encryption and restore ability periodically; a backup job succeeding is insufficient evidence of recoverability.

## Pilot operations

Owner export is paginated: `GET /api/organizations/:id/export/:kind?after=<last-id>` for `organization`, `members`, `assistants`, `conversations`, `messages`, `usage`, `audits`, `requests`, `widgetSessions`, and `budgets`. Each page contains at most 100 records and `next`; collect pages until `next` is null. Store exports securely because messages and user emails are sensitive. Widget token hashes are excluded.

Owner retention: `PATCH /api/organizations/:id/retention` with `{ "days": 30 }` (1–365). The daily worker deletes conversations inactive beyond the configured period and their messages and requests. Usage and audit ledgers remain until tenant deletion. Full tenant deletion: `DELETE /api/organizations/:id/tenant` with exact `organizationName` and owner `password`; take an export and backup first. It removes organization-scoped data, memberships, and orphaned accounts in a MongoDB transaction. Large tenants need a staged deletion design before scale.

Keep `docs/THIRD_PARTY_LICENSES.md` with distributed software and review package, MongoDB server, OpenAI, and future channel terms. The dashboard cookie design assumes a same-site API; changing that topology requires a new CSRF and cookie review.
