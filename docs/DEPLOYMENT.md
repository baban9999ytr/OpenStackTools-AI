# Deployment preparation

This repository has not been deployed. Docker Compose is for local development only. A production deployment needs separate API and web builds, TLS termination, a managed MongoDB replica set with authentication, secret management, backups, monitoring, and a controlled release pipeline.

1. Build with Node 22 LTS using `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --audit-level=low`.
2. Provision MongoDB as a replica set. Restrict network access. Run schema index creation under controlled credentials and test a restore.
3. Supply `SESSION_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `MONGODB_URL`, `DASHBOARD_ORIGIN`, `PORT`, `COOKIE_SECURE=true`, and a precise `TRUST_PROXY` value through the deployment secret/config system.
4. Serve the dashboard and `embed.js` over HTTPS. Set `DASHBOARD_ORIGIN` to the exact dashboard origin. Configure customer website origins on each assistant, with no wildcards. Publish the API on HTTPS with CORS checks intact.
5. Ensure the API health endpoints are monitored. Add provider error, latency, token-spend, queue, and failed-login alerts before scaling.
6. Add distributed rate limits and tenant budgets; run load, security, backup-restore, and browser tests before opening the public widget widely.
7. Distribute `docs/THIRD_PARTY_LICENSES.md` with the application and confirm the four related-package notice mappings. Review service terms for OpenAI and future channels.

The dashboard uses cookies with SameSite=Lax. Prefer a same-site API and dashboard deployment; cross-site cookie architecture would need revised cookie and CSRF controls. Website widgets use a separate bearer session and do not depend on dashboard cookies.
