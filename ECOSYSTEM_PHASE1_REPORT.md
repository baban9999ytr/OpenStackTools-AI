# OpenStackTools AI ecosystem integration — Phase 1

Date: 2026-11-06. Scope: AI repository only. No production deployment, DNS change, main-site edit, SSO, or shared cookie was made in this phase.

## Delivered

- Versioned, framework-independent `brand/tokens.json` v1.0.0 with generated dashboard CSS and Shadow DOM widget variables. The zinc/sky palette supports light and dark themes.
- Original text-based OpenStackTools AI wordmark, responsive dashboard navigation, English and Turkish labels, persisted dashboard preferences, and keyboard-visible focus styles. The widget follows embedding-page language and theme, with optional explicit overrides.
- Client routing at `/app`, direct-load SPA fallback in the Nginx static image, and account links under `/app/#verify`, `/app/#reset`, and `/app/#invite`.
- Production web image builds static assets and serves them with Nginx. `/api` and `/health` proxy to the private API. `deploy/Caddyfile.example` illustrates a separate TLS edge for the AI subdomain.
- Cookie, CSRF, tenant isolation, widget retry, and handoff behavior remain enforced by the existing API. Tests were extended for the account-link path, session cookie attributes, and foreign-origin mutation rejection.

## Verification performed

| Check | Result |
| --- | --- |
| `npm run brand:check` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed: API TypeScript, widget bundle, dashboard assets |
| `npm test` | Passed: 11 API tests against ephemeral MongoDB replica set with fake AI responder |
| `npm run test:browser -w apps/web` | Passed: 6 Chromium tests covering dashboard navigation, dark/Turkish and light/English accessibility, mobile keyboard menu, verification route, widget reload/retry, and Turkish/dark widget |
| `npm audit --audit-level=low` | Passed: 0 vulnerabilities reported on 2026-11-06 |
| `docker compose build web` and `docker compose up -d web` | Passed, serving production Nginx image locally |
| Local HTTP smoke through Nginx | `/app` and `/app/assistants` 200 HTML, `/embed.js` 200 JS, `/api/auth/me` 401 JSON, `/health/ready` 200 JSON, unknown path 404, foreign-origin logout 403 |
| Security headers | Static routes returned CSP, no-sniff and referrer policy; API retained Helmet headers |

The browser tests mocked API responses for dashboard and widget UI behavior. The API tests used real ephemeral MongoDB and a fake AI responder. No real OpenAI key, production SMTP, public TLS, DNS, or production infrastructure was tested.

## Deployment gates

- Configure the private API, authenticated MongoDB, SMTP, secrets, model prices, and budgets per `docs/DEPLOYMENT.md`.
- Provision and validate HTTPS and HSTS at the approved edge, set `DASHBOARD_ORIGIN` to the exact AI origin and `COOKIE_SECURE=true`, and verify trusted proxy hop count and real cookie delivery over HTTPS.
- Run a manual end-to-end pilot with real account email delivery, owner/staff workflows, a permitted external widget origin, monitoring, and backup restoration.
- Review the dashboard's Google Fonts request against the privacy policy; self-host fonts if needed.
- A full external accessibility audit and penetration test remain outstanding. Automated axe checks cover selected sign-in, inbox, and navigation states only.
