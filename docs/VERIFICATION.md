# Verification record — 2026-11-04

| Check | Result |
| --- | --- |
| `npm install` at repository root | Passed; host Node 26 was outside declared Node 22–24 support and emitted an engine warning |
| `npm run typecheck` | Passed for API and web |
| `npm run build` | Passed for API, dashboard, and `embed.js` |
| `npm test` | 4 suites passed, 0 failed; MongoMemoryReplSet supplied a real ephemeral MongoDB replica set and the AI responder was injected as a fake |
| `npm audit --audit-level=low` | 0 vulnerabilities at time of check |
| `docker compose config --quiet` | Passed |
| `docker compose build` | Passed on Node 22 images, including `npm ci` and API TypeScript build |
| `docker compose up -d` | API, web, and local MongoDB replica set started successfully with placeholder-only local configuration |
| HTTP smoke check | `/health/live` returned `ok`, `/health/ready` returned `ready`, dashboard and `/embed.js` returned HTTP 200 |
| Browser inspection | Login screen rendered correctly in a local browser |

The OpenAI network call was **not** run because no real API key or model was provided. The website widget's UI interaction with a real provider response was not exercised. The Docker smoke test used a temporary `.env` copied from the placeholder example; it was removed after stopping the local stack. This is not a penetration test, browser test suite, load test, or production deployment.
