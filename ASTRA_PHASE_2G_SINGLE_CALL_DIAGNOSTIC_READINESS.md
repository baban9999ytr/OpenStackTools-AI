# ASTRA Phase 2G single-call diagnostic readiness

**READY FOR LIVE AUTHORIZATION.** The configured-project preflight admitted one synthetic turn and made zero provider requests. The new execution approval is still pending. The earlier incident remains **ROOT CAUSE UNKNOWN**. Its $0.005304 retained reservation is an uncertain ledger amount, and this preparation produced no new Luna evidence.

## Scope and billing

The `phase2g-single-call` suite reuses the preceding run's first customer turn.

> Görükle de Özlüce de olur, iki ya da üç odalı olabilir. Bütçem henüz belli değil.

It exercises the existing widget queue, a disposable synthetic MongoDB replica set and the Standard Responses adapter. The scenario checks that the assistant can acknowledge the alternatives with an open budget. It checks tenant-scoped OR filtering with a foreign-tenant fixture and prohibits appointments or other consequential actions. There is one turn, with no additional synthesis or retry. The SDK timeout is 30 seconds.

| Admission setting | Configured-project preflight |
| --- | ---: |
| Model and API | `gpt-6-luna`, Standard Responses |
| Reasoning and output cap | `none`, 512 tokens |
| Conservative input bound | 40,000 tokens |
| Synthetic turns / planned calls / simulated decisions | 1 / 1 / 1 |
| Provider requests | 0 |
| Global and per-model application caps | $0.02 each |
| Maximum reservation per attempt and per run | $0.010259 each |
| Admission result | `admitted: true`, exit 0 |
| Report directory | Mode 0700, empty after preflight |

The reservation was recomputed using the current `openai-2026-11-13-standard-v1` registry. It reserves 40,000 input tokens at the conservative cache-write rate of $0.25 per million, 512 output tokens at $0.50 per million, and a three-microdollar rounding margin. This gives 10,000 + 256 + 3 = **10,259 microdollars**. On November 19, 2026, the public Luna model page listed Standard rates of $0.10 uncached input, $0.01 cached input, $0.125 cache writes and $0.50 output per million tokens. The official pricing table distinguishes cache retention durations. These are public rates. The preflight accepted the dedicated project's local pricing attestation, and the project-specific terms, any surcharge and provider invoice were not independently verified. [OpenAI Luna model reference](https://developers.openai.com/api/docs/models/gpt-6-luna) · [OpenAI Standard pricing](https://developers.openai.com/api/docs/pricing)

## Evidence and failure handling

The private JSON and Markdown reports keep the model's full parsed decision text and tool arguments separate from the application's normalized action and final reply. They record SDK latency separately from elapsed benchmark time, validation outcome, provider-reported usage when available, and internal settlement. The reports omit full provider response bodies, headers, credentials, exception messages and real customer data.

The shared diagnostics distinguish HTTP rejections, rate limits, server errors, transport failures and timeouts, incomplete responses, invalid JSON or tool arguments, unexpected model or tier, and invalid usage. HTTP status is recorded when available and valid. On a failed or uncertain attempt, the benchmark stops and retains its reservation. Simulated 503 and 429 cases verified this behavior. A 503 also retains the application ledger's uncertain reservation. A definitive 429 releases the application reservation under existing policy while the benchmark retains its own amount for the stopped run.

The one-call gate rejected execution with earlier approvals present. Preflight rejected a two-call allowance, changed global or per-model spend caps, and absent quota confirmation. The isolated SDK tests intercepted success, HTTP 503, and HTTP 429 with exactly one SDK request per case. Each produced a private report pair, both mode 0600. The success retained model text, arguments, reported usage and matched settlement. Failure reports kept sanitized status and category without the planted secret, header or error-body markers.

## Local verification

- `npm test` passed 123/123 API tests, including the new single-call regression and the existing approval and provider-error suites.
- The 128-scenario deterministic suite, the one-turn diagnostic rehearsal and the ten-turn recorded-decision replay passed. The deterministic suite retained four intentional no-action backend skips.
- Application and evaluation typechecks, production builds, the brand check and `git diff --check` passed.

## Project checks and commands

The configured preflight accepted the existing local attestations for a dedicated nonproduction project, Luna entitlement, quota, Standard pricing, a current UTC pricing review and provider spending-control review. The key was checked by presence and format. Confirm the attestations still reflect the project's current terms and capacity at execution time. The public docs and a provider-free rehearsal cannot establish live access or billing.

From the repository root, the provider-free command is:

```bash
env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --preflight --suite=phase2g-single-call
```

The following command is for one **separately authorized** execution. The launcher reruns preflight before opening a fresh private report pair. Earlier experiment approvals cannot satisfy this gate.

```bash
env -u NODE_OPTIONS EVAL_2G_SINGLE_CALL_EXECUTE_APPROVED=1 node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --execute --suite=phase2g-single-call
```

No production settings changed. The seven-call live evaluation remains stopped. A successful diagnostic would establish that the provider returned a usable response for this input. It would not establish improved Luna quality.

[Prior live failure analysis](ASTRA_PHASE_2G_LIVE_FAILURE_ANALYSIS.md)
