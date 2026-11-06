# Staging runbook

This repository provides examples, not a deployed staging environment. The parent website is separate. Use a dedicated staging hostname, private authenticated MongoDB replica set, staging-only OpenAI project/key, and sandbox SMTP mailbox. Never copy production customer data.

## Preparation

1. Approve a staging hostname and TLS certificate path. Copy `deploy/staging.api.env.example` to ignored `deploy/staging.api.env`, replace every placeholder, and deliver secrets through an operator-controlled secret manager or restricted file. Set `STAGING_HOST` to the exact approved hostname. Keep the API and MongoDB private; only the Caddy edge publishes 80/443. The example does not change DNS or start services.
2. Confirm `DASHBOARD_ORIGIN=https://<approved-host>` exactly, `COOKIE_SECURE=true`, `TRUST_PROXY=1` for Caddy-to-API traffic, an authenticated MongoDB URI with TLS, verified token prices, small daily/monthly budgets, and `SMTP_REQUIRE_TLS=true`. Configure assistant `allowedOrigins` to exact pilot website origins; do not use wildcards.
3. Review `deploy/compose.staging.example.yaml` and `deploy/Caddyfile.staging.example` with the infrastructure owner. The edge routes `/api/*` directly to the private API and `/app` and `/embed.js` to the production Nginx image. Public `/health/ready` is blocked. Caddy handles HTTPS and HSTS after a certificate is working. Do not expose the Vite dev server.
4. Run local gates from the repository root: `npm ci`, `npm run brand:check`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:browser -w apps/web`, `npm run test:backup:restore -w apps/api`, and `npm audit --audit-level=low`.

## Controlled smoke test after staging approval

- Check HTTPS redirect, certificate chain, HSTS, `/app` direct navigation and refresh, `/embed.js`, `/api/auth/me` returning 401 unauthenticated with `Cache-Control: no-store`, and `/health/live`. Confirm `/health/ready` is not public. Use private monitoring access for readiness.
- Register only a synthetic staging organization; verify mail in a dedicated sandbox inbox, accept a single-use staff invite, reset a password, list/revoke a session, and inspect Secure/HttpOnly/SameSite=Lax/host-only cookie flags. Test foreign-origin and missing-CSRF-header mutations return 403.
- Configure an assistant with an exact staging website origin. Send one benign widget message, verify the configured model and actual token usage, review estimated cost and budget windows, test handoff and reload, and confirm a second tenant cannot read the first tenant's data.
- Simulate provider 429, provider timeout, SMTP outage, and MongoDB unavailability in a nonproduction environment. Verify generic customer errors, one safe 429 retry, uncertain charge without replay on ambiguous timeout, readiness 503, and alert delivery.
- Use the [backup and restore runbook](BACKUP_RESTORE_RUNBOOK.md) before pilot traffic. Record operator, date, configuration version, and results; do not paste secrets or conversation text into tickets.

## Monitoring and response

Collect structured API logs by `X-Request-ID`; do not log message bodies, passwords, tokens, or SMTP credentials. Alert on readiness failures, 5xx and 429 spikes, provider failure codes, `billingStatus=uncertain`, budget 402s and spend near limits, worker queue age, SMTP failures, audit-write failures, and backup failures. Confirm alert routing and an on-call owner before pilot traffic. In an incident: pause new pilot traffic at the edge, preserve logs and database state, notify the owner, reconcile provider usage, and rotate exposed keys/sessions as appropriate. Restore only into an isolated target first. See `docs/SECURITY_REVIEW.md` for remaining risks.

### Initial alert rules to configure in the operator's monitoring system

These are proposed thresholds, not active alerts. Page the pilot operator for two readiness failures within five minutes, any failed backup, any `billingStatus=uncertain` event, or a sustained queue age above 60 seconds. Notify on five provider failures or SMTP delivery failures within five minutes, a budget at 80% of either window, a spike in 429/402 responses, and repeated failed logins. Tune thresholds after observing pilot traffic. Log-derived provider failure counts use the controlled `failureCode` field; usage/cost counts come from tenant-scoped usage and budget records. Confirm alerts fire in a staging drill before live traffic.

## Secret rotation

Use a secret manager and document the operator and time of each rotation. Rotate OpenAI and SMTP credentials in their provider consoles, update staging secrets, restart only affected services, and verify one benign request or dedicated mailbox delivery. Rotate MongoDB credentials using a new least-privilege user before disabling the old one, then verify readiness and backups. Changing `SESSION_SECRET` invalidates every existing staff and widget session and account link because token hashes change; schedule this as an explicit maintenance event and require new sign-ins and links. Revoke exposed sessions and invite/reset tokens where needed. Never paste old or new secrets into logs, tickets, or this repository.
