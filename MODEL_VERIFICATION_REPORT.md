# GPT-6 Luna model verification — Phase 4B

Date: 2026-11-07 (Europe/Istanbul). Repository: `/home/krr/Projects/OpenStackTools-AI`. Scope: local implementation and HTTPS staging only. **Real-business pilot decision: NO-GO.** No public deployment, DNS change, remote push, purchase, customer contact, external SMTP delivery, or billable OpenAI request occurred.

## Official model findings

| Status | Finding | Evidence and limit |
| --- | --- | --- |
| PASS | The public API catalog lists `gpt-6-luna` as the exact model ID and lists Chat Completions and Responses endpoints. Its rate-limit table lists Build, Launch, and Grow tiers and does not support the Free tier. | [Official GPT-6 Luna model reference](https://developers.openai.com/api/docs/models/gpt-6-luna). Catalog listing does not establish this project's entitlement. |
| PASS | Chat Completions accepts `max_completion_tokens`, `reasoning_effort`, and `service_tier`; the model lists reasoning effort `none`, `low`, `medium`, `high`, `xhigh`, and `max` (default `medium`). | [Chat Completions create reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [model reference](https://developers.openai.com/api/docs/models/gpt-6-luna). We request `none` and `default` (Standard) in the sample configuration. |
| PASS | Published context window is 1,050,000 tokens and maximum output is 128,000 tokens. | [Official model reference](https://developers.openai.com/api/docs/models/gpt-6-luna). Application output cap remains 800; local staging uses 64. |
| PASS | Published Standard text rates per one million tokens are $0.10 input, $0.01 cached input, $0.125 cache write, and $0.50 output. | [Official model reference](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing](https://developers.openai.com/api/docs/pricing). Prices are configuration examples, not a guaranteed future tariff or invoice. |
| PASS | The model reference lists higher rates for input above 272,000 tokens, regional processing, and other service tiers. | [Official model reference](https://developers.openai.com/api/docs/models/gpt-6-luna). Current widget input is bounded to 12 prior messages plus one new message, each at most 4,000 characters, and assistant instructions at most 8,000 characters. This is below the long-context threshold under current validation. Revisit cost logic before increasing those limits or using a different tier/region. |
| BLOCKED | Access from a dedicated configured API project. | No usable API key or project access was available. Public listing and mocked tests do not prove entitlement. A provider 404 now has a distinct non-retryable model-unavailable code. |

## Implementation and accounting

- `OPENAI_MODEL` remains server-controlled and configurable. Examples prefer `gpt-6-luna`; `OPENAI_REASONING_EFFORT=none` is optional and validated. Model syntax is validated at startup; actual provider support is checked only by a live request. The adapter requests the Standard service tier and rejects an unexpected returned tier to avoid silently applying the wrong price.
- The adapter uses the provider's reported input and output token totals. It records cached input, cache write, and reasoning counts when supplied. Reasoning tokens are a subset of output tokens and are **not** charged twice. Invalid or absent usage fails closed into the queue's conservative uncertain-charge path.
- Measured cost uses separately configured ordinary, cached, cache-write, and output rates. If the cache breakdown is absent, it prices all input at the highest configured input rate. It rounds each reported category up to whole microdollars. Usage events and the organization usage dashboard retain the breakdown; historical events display zero for fields that did not exist when they were written.
- The existing MongoDB transaction reserves a conservative maximum in both daily and monthly budget windows before the provider call, then settles actual estimated cost and releases the rest. If actual usage exceeds the reservation, settlement fails and the full reservation remains an uncertain charge. The SDK does not automatically retry; the queue retries only a definitive 429 once. Timeouts and ambiguous failures are not replayed.
- The local HTTPS script requires three explicit opt-in flags, a non-placeholder dedicated key, the Luna model, reasoning effort `none`, a low output cap, and low organization budgets. It creates synthetic data, sends at most one provider request, checks persistence, token/cost ledger, both budget windows and a zero-budget rejection, scans logs for configured secrets, and deletes its synthetic tenant. It prints metadata only. Its latency measurement runs from widget submission to completed request polling, so it includes queue and network time.

For example, a synthetic provider result of 1,000 input tokens (400 cached, 100 cache-write, 500 ordinary), 200 output tokens (including 50 reasoning) costs `ceil(500×0.10) + ceil(400×0.01) + ceil(100×0.125) + ceil(200×0.50) = 167` microdollars at the configured per-million USD rates. Without a cache breakdown, the same totals cost a conservative 225 microdollars. These are unit-test fixtures, **not live measurements**.

## Verification

| Status | Check | Result |
| --- | --- | --- |
| PASS | `npm run typecheck`; `npm run brand:check`; `npm run build` | API/web typechecks and production builds passed. Production Docker API and static web images also built on Node 22. The host runs Node 26, outside the declared Node 22/24 support range. |
| PASS | `npm test` | 21 API tests passed against an ephemeral MongoDB replica set, including tenant isolation, concurrent budgets, failure/retry handling, and four new model-accounting tests. Provider responses are fake. |
| PASS | `npm run test:browser -w apps/web` | Seven browser tests passed with mocked widget API, including reload behavior, Turkish, dark theme, mobile navigation, verification link, and error state. |
| PASS | `npm audit --audit-level=low` | Zero reported vulnerabilities. No new npm packages. |
| PASS | Local HTTPS staging smoke | Production images, authenticated MongoDB replica set, STARTTLS Mailpit, TLS account links, secure cookies, CSRF, role and tenant checks, widget origin, and zero-budget block passed. `/app`, direct `/app/assistants`, `/embed.js`, and `/health/live` returned 200; public `/health/ready` returned 404; unauthenticated `/api/auth/me` returned 401. HSTS, CSP, no-sniff, and referrer policy were present. |
| PASS | Production browser and web serving | After the fixed auth window reset, `node deploy/local-https/browser.mjs` passed trusted HTTPS, registration/verification, login/logout, secure cookie flags, mobile keyboard navigation, English/Turkish, light/dark, and axe accessibility checks. `nginx -t` and Caddy validation passed. |
| PASS | Cleanup and log review | API logs contained neither configured provider-key nor session-secret values. The browser test's initially orphaned synthetic tenant was removed through its authenticated owner API. Authenticated MongoDB counts were zero for organizations, users, assistants, conversations, and messages. Containers were stopped and local CA trust removed; ignored secrets and the local MongoDB volume remain for deliberate reuse. |
| BLOCKED | One live OpenAI conversation | The opt-in script stopped before network access without flags, and stopped again with flags against the placeholder key. Dedicated project access, price recheck, and spending authorization are missing. |
| PASS-LIVE | Real provider verification | No PASS-LIVE result was obtained. |
| NOT TESTED | Live latency and token/cost measurements | No provider call was made. Input, output, cached, reasoning counts, latency, and live estimated cost are **not available**. The fixture above must not be treated as a live result. |
| BLOCKED | External SMTP delivery | Mailpit local delivery passed; no external provider or inbox was configured. |

The first local production browser run after the HTTPS smoke test hit the unchanged 15-minute authentication rate limit. It did not pass its dashboard assertions and left one synthetic organization. After the fixed window expired, that organization was deleted through its owner API and the browser run passed. The limiter was not bypassed or weakened.

## Security and release blockers

The key remains in an ignored, server-only environment file; no key value is in source, output, or reports. The staging stack exposes only loopback TLS and Mailpit UI ports. The token and cost records are tenant scoped. The Caddy edge still blocks public readiness. The current price estimate assumes Standard tier, nonregional processing, current bounded context, and current published pricing. Provider billing and entitlement remain unverified. Before any real-business pilot, obtain a dedicated project/key and explicit one-call authorization, reconcile a successful live response with the provider billing dashboard, verify external SMTP delivery, and complete the public TLS, monitoring, backup, recovery, and privacy gates listed in the Phase 4A report.

## Final verification addendum

The final production Chromium rerun passed. No local synthetic tenant remains. The local HTTPS containers are stopped and the browser CA trust entry was removed. No real provider call or external SMTP delivery was performed.
