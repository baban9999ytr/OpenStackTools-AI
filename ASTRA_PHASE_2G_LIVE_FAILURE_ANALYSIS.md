# ASTRA Phase 2G live failure analysis

**ROOT CAUSE UNKNOWN.** The first provider attempt failed before the benchmark obtained a usable Luna response. The old report preserved the broad `provider_unavailable` policy label, with no HTTP status or transport or decoder classification. The diagnostics gap is confirmed. The provider-side or transport cause remains undetermined.

## Confirmed facts

| Field | Evidence |
| --- | --- |
| First and only attempted conversation | `phase2g-live`, `2g-a-flexible-preferences` |
| Provider-boundary elapsed time | 3,739 ms, measured by the benchmark around admission and the provider boundary |
| Run outcome | `provider_unavailable`, stopped with `provider_uncertain` |
| Usable provider decisions and reported token usage | 0 decisions, usage unavailable |
| Billing evidence | 5,304 microdollars ($0.005304) retained. The usage ledger marks it `uncertain`. Its zero token counts are placeholders. Invoice amount is unknown. |
| Customer and application state | Empty reply, no persisted preferences, zero bookings, and no unauthorized transaction in the run |
| Report privacy | Original directory was mode 0700 and both files were mode 0600 |

The JSON contains only `reason` in its provider-failure object. The Markdown contains no HTTP status or diagnostic category. Both files were last written at 16:05:02 UTC on November 19, 2026. The other local files matching the elapsed-time digits were earlier API test logs. The benchmark configured `LOG_LEVEL=silent`. The inspected evidence has no matching SDK class, timestamped transport error, or provider request identifier that can recover the lost cause. The original reports were left intact.

## How the label was produced

The local launcher chose the benchmark's Responses adapter with OpenAI SDK 7.50.0, a 30-second SDK timeout and `maxRetries: 0`. The benchmark also disabled durable widget retries and supplied no synthesis callback. When the responder threw, the meter retained the full request reservation and stopped further attempts.

The original HTTP policy emitted `provider_rate_limited` for 429, `provider_model_unavailable` for 404 and `provider_rejected` for 400, 401, 403 and 422. Everything else used `provider_unavailable`, including errors with no status. A typed incomplete Responses result had separate handling in the benchmark. The old catch serialized only the policy label for the other exceptions.

| Possible failure class | What the existing evidence permits |
| --- | --- |
| HTTP 5xx, 408, 409 or another status outside the explicit branches | Compatible. The actual status was discarded. An HTTP outage or rejection is unconfirmed. |
| Network interruption or native transport timeout | Compatible. The SDK can raise a connection or timeout error without an HTTP response. The measured interval is shorter than the configured 30-second SDK deadline and cannot rule out an earlier transport failure. |
| Response decode or validation error | Compatible. Malformed JSON, an unexpected model or tier, invalid tool arguments, and invalid or missing usage formerly used the same label. |
| Received 400, 401, 403, 404, 422 or 429 on the error inspected by the policy | These numeric statuses would have produced different labels. The transcript does not establish project access or quota from that distinction. |
| Local benchmark or accounting guard failure | Some errors in the same catch also carried the generic label. There is no evidence identifying one as the trigger here. |

## Corrective actions

- Introduced bounded failure categories and integer HTTP statuses in the JSON and Markdown reports. SDK transport classes distinguish timeout, network failure and cancellation. Diagnostics identify known HTTP classes, malformed JSON, decode errors, invalid Responses shape, unexpected model or tier, invalid function calls, invalid usage, empty output and typed incomplete output. Unknown errors stay unknown.
- The Responses adapter obtains the status from the SDK's existing HTTP request before attempting its cached decode. This preserves a received status on decode and validation failures without issuing a second request. A post-header decoder type error identifies the failing stage. It can still require further evidence to separate body transfer from payload shape.
- SDK logging is disabled. Diagnostics serialize only the static category, sanitized status and validated usage for incomplete Responses when available. They exclude exception messages, headers, response bodies, arbitrary provider codes and causes. Benchmark admission and usage guard errors have separate categories. Failed provider calls remain unscored for model selection or context.
- Billing and retry policy is unchanged. Transport uncertainty, a 5xx or invalid Responses data retains the application reservation. The benchmark meter retains its reservation when a provider attempt throws, including a documented 429, and stops. The application releases its own reservation for a definitive 429. The benchmark continues to disable queue retries even for that response class.

## Offline verification

- `npm test` passed 122/122 API tests. Mock SDK cases covered HTTP errors, connection failure, timeout, malformed JSON and Responses validation. Each case asserted a single intercepted request and bounded metadata.
- The Phase 2G benchmark tests intercepted both a 503 and a 429. Each stopped after one request with no reply or retry. Both reports preserved the category and status, kept the benchmark reservation, and omitted the mock response body and header markers. The 503 also kept the application's uncertain ledger entry.
- `npm run eval:deterministic -w apps/api` completed 128 scenarios, including four intentional no-action backend skips. `npm run eval:benchmark -w apps/api -- --suite=phase2g-live` passed eight rehearsal turns with seven simulated decisions and zero provider requests.
- Application and evaluation typechecks, production builds and `git diff --check` passed.

## Decision on another run

A separately authorized, tightly scoped diagnostic run is justified after confirming the dedicated project's access, quota, applicable pricing and spending controls, and after a provider-free preflight. Start with a single synthetic decision under a separately reviewed envelope, then inspect the new diagnostic and billing evidence before considering all seven calls again. The one failed attempt does not establish a Luna quality outcome. The original execution authorization was consumed. No live rerun or billable provider call occurred during this investigation.

[Phase 2G regression results](ASTRA_PHASE_2G_REGRESSION_RESULTS.md)
