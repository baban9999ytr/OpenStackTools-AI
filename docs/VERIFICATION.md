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
