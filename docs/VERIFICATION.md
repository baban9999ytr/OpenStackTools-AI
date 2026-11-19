# Verification record — 2026-11-04

| Check | Result |
| --- | --- |
| `npm ci` | Passed; host Node 26.12.1 is outside the declared Node 22–24 range and emitted an engine warning |
| `npm run typecheck` | Passed for API and web |
| `npm run build` | Passed for API, dashboard, and widget bundle |
| `npm test` | 11 passed, 0 failed, with ephemeral real MongoDB 8 replica set and fake AI responder |
| `npm run test:browser -w apps/web` | 1 passed in installed Chromium with mocked API |
| `npm audit --audit-level=low` | 0 vulnerabilities |
| `docker compose config --quiet` and `docker compose build` | Passed; Node 22 container builds |
| `docker compose up -d` | API, web, MongoDB, and Mailpit started with test-only placeholder configuration |
| HTTP smoke | API `/health/ready` returned `ready`; web and Mailpit returned HTTP 200 |

The Compose stack was stopped without volume removal. The test-only ignored `.env` was removed. No real OpenAI call, live SMTP delivery, backup restoration, production infrastructure change, or remote push occurred. See `PILOT_READINESS_REPORT.md` for release gates.

## Current test procedure

Use Node 24 and the committed lockfile. From the repository root run:

```bash
MONGOMS_DISABLE_POSTINSTALL=1 npm ci
npm exec --workspace apps/web -- playwright install chromium
npm run typecheck
npm run eval:typecheck -w apps/api
npm run brand:check
npm run build
npm test
npm run eval:deterministic -w apps/api
npm run eval:benchmark -w apps/api
npm run test:browser -w apps/web
npm audit --audit-level=low --json
git diff --check
```

API integration and database evaluations download and start MongoDB 8.0.12 replica sets on local ports with disposable data directories. Tests exercise transactions, queue processing and tenant boundaries and use simulated AI, mail and Telegram providers in the relevant suites. The browser suite starts Vite and intercepts product APIs. Local Chromium may come from `/usr/bin/chromium` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. CI installs only Playwright Chromium and its system dependencies and starts its own Vite instance.

If MongoDB fails to initialize, check access to MongoDB's download mirror, supported OS/architecture, local bind permissions and available disk space. When Playwright cannot start, install the lockfile's browser with `playwright install --with-deps chromium` and free port 5173 or stop any conflicting local test server. For a failed tenant or booking assertion, use the isolated test fixture and review the full request/job outcome.

The checks run on pushes and pull requests targeting `master`, with manual dispatch available. Provider evaluation, live mail and backup restoration follow their separate runbooks. Local automation validates the declared fixtures. Public TLS, provider access, model quality, live channel delivery and operations require separate evidence.
