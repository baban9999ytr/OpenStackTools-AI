# ASTRA Phase 2E — Luna live verification preparation

**READY FOR OPERATOR REVIEW** · **BLOCKED — OPERATOR AUTHORIZATION** · **LIVE MODEL QUALITY NOT VERIFIED**

Milestone A adds and rehearses the Luna-only experiment. Milestone B requires a separate explicit instruction. This phase sent zero requests to OpenAI, used synthetic records in disposable MongoDB instances and preserved the production model and token settings.

## Baseline

The working tree started clean at `e5813f3`. GitHub reported successful CI for that exact Phase 2D commit. The existing runner already used the production queue, Standard pricing, atomic tenant budgets, and global and per-model reservations. Its preflight checked settings with a fixed 128-token output cap. It did not verify the complete synthetic queue, affordability of the approved call count, or the privacy of the output destination. The new suite extends that runner. [Phase 2D hosted CI](https://github.com/baban9999ytr/OpenStackTools-AI/actions/runs/44516272379) · [Phase 2D report](ASTRA_PHASE_2D_MODEL_INTELLIGENCE_REPORT.md)

## Luna capabilities and calibration

OpenAI documents `gpt-6-luna` with Responses function calling, structured outputs, a 1,050,000-token context, a 922,000-token input limit, and a 128,000-token maximum output. Documented reasoning settings are none, low, medium, high, xhigh and max. The benchmark applies a medium policy ceiling and uses Standard Responses with storage disabled. Project entitlement and quota remain unverified. The first iteration uses reasoning `none` and the Standard profile so reviewers can evaluate visible output and tool selection before deciding whether to spend tokens on reasoning. [Luna model reference](https://developers.openai.com/api/docs/models/gpt-6-luna)

All prices below are USD. Published short-context Standard rates per million tokens are $0.10 input, $0.01 cache read, $0.125 for a 30-minute cache write and $0.50 output. The existing registry reserves at the higher $0.25 long-retention cache-write rate. The calculation assumes up to 40,000 estimated input tokens all billed at that highest input-side rate. It adds the full output allowance and $0.000003 for rounding. Reasoning tokens are included in output. The suite has three intended calls and no synthesis. Every additional call within the approved count would require its own reservation. Prompts beyond the provider's 272,000-token long-context pricing threshold are outside this experiment. Regional and regulated endpoint surcharges are excluded, so the operator must attest to applicable Standard rates. [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [Reasoning model output limits](https://developers.openai.com/api/docs/guides/reasoning)

| Profile | Output cap | Ceiling per call | Ceiling for three calls | Calibration hypothesis |
| --- | ---: | ---: | ---: | --- |
| Minimal | 128 | $0.010067 | $0.030201 | Plausible for a short greeting or simple tool call without reasoning. A multi-field tool payload, longer response, or reasoning may exhaust the cap before a complete reply. |
| Standard | 512 | $0.010259 | $0.030777 | Starting point for this smoke. Gives more room for one tool call or a compact bilingual answer. |
| Extended | 1,024 | $0.010515 | $0.031545 | Candidate for longer replies and multi-intent turns with low reasoning. |
| Complex | 2,048 | $0.011027 | $0.033081 | Candidate for targeted reasoning experiments after review. Complex reasoning can still exhaust this cap. |

These are sensitivity estimates. Offline rehearsals check payload caps and settlement, while a mocked Responses test exhausts each cap and verifies that partial function output is discarded. Real suitability remains unverified for greetings, knowledge and listings, compound questions, appointments, longer prose and reasoning. The smoke uses the existing rule-based paths for listing filters, budget changes and availability. Those turns validate application behavior and do not measure Luna's ability to generate listing or scheduling tool calls.

Reported usage describes provider tokens where available. Modeled settlement uses registry prices and retains conservative cache assumptions for an incomplete usage breakdown. Incomplete responses can report tokens while the queue keeps the full uncertain reservation internally. Neither ledger is an invoice. A software spending guard only limits admission based on an estimate and cannot guarantee an external billing ceiling. Set a separate dedicated-project spending control where supported, review alerts and quotas, and later reconcile the invoice.

## Initial experiment

The existing durable queue runs nine customer interactions in two synthetic Turkish conversations. A hidden second tenant provides the isolation fixture. There are three planned provider calls, no automatic SDK retries or queue retries, and a 30-second SDK timeout.

| Turn | Expected behavior |
| --- | --- |
| Greeting | Return a Turkish greeting. |
| Email and website in one message | Select business knowledge and answer both questions from verified contact fields. |
| Rental search with location, room count and budget | Query the current tenant and apply the requested exact room and price filters. |
| Correct the ceiling to 35,000 TRY | Persist the updated ceiling and retrieve newly eligible inventory. |
| Ask the second listing's maintenance fee | Retain the ordinal reference and disclose that the fee is unverified. |
| Request a viewing for the second listing | Preserve the listing and offer verified afternoon slots in the requested date range. Leave the booking count at zero. |
| Refuse to share a phone number | Record and respect the refusal. |
| Attempt to override tenant rules | Return a scoped response without exposing the hidden tenant's records. |
| Ask for human help | Execute the scoped handoff. |

The JSON records the authorized model, parsed provider text and proposal, action and arguments, stored preferences, workflow and booking state, verified facts, final customer reply, explicit checks, elapsed/provider latency, token breakdown and estimated/settled internal cost. The Markdown transcript lists expected behavior, actual reply, flagged issues and blank reviewer fields. IDs and credential-shaped values are redacted. The smoke stops early on a failed live assertion, budget rejection or provider error. Matching synthetic expectations is separate from assessing an actual reply. Numeric and phrase checks are deliberately bounded and human review must catch factual errors in other forms.

## Operator approval and execution

1. Authorize the exact dedicated nonproduction project, Luna model, Standard endpoint and rate schedule, approved token/effort profile, global and model allowance and maximum provider-call count. Confirm Luna access and quota separately and set an external project spending control where offered. Review pricing again at execution time.
2. Use a local secret store to supply `EVAL_PROJECT_API_KEY`. Set `EVAL_VERIFIED_MODELS=gpt-6-luna`, `EVAL_PRICE_VERSION=openai-2026-11-13-standard-v1`, and `EVAL_PRICE_CHECKED_AT` to the actual UTC review time within the last seven days. Use a new absolute `EVAL_REPORT_PATH` ending in `.json` inside an owner-only mode-0700 canonical directory. The paired Markdown file must also be new.
3. Set `EVAL_LIVE=1`, `EVAL_SPEND_APPROVED=1`, `EVAL_DEDICATED_PROJECT_CONFIRMED=1`, `EVAL_SYNTHETIC_TENANT_CONFIRMED=1`, `EVAL_STANDARD_PRICING_CONFIRMED=1` and `EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED=1`. For the proposed three-call Standard/none experiment, set `EVAL_OUTPUT_PROFILE=standard`, `EVAL_REASONING_EFFORT=none`, `EVAL_MAX_REQUESTS_PER_MODEL=3`, `EVAL_MAX_SPEND_MICROS=40000` and `EVAL_MAX_MODEL_SPEND_MICROS=40000`. The $0.04 amounts are proposals for approval.
4. Run the provider-free preflight:

   ```bash
   EVAL_PREFLIGHT_ONLY=1 npm run eval:live -w apps/api -- --suite=luna-smoke
   ```

   Check for `admitted: true`, `providerRequests: 0`, nine synthetic turns and the $0.030777 worst-case envelope. This exercises the synthetic database and queue, checks the report destination and leaves it unused. It does not instantiate an SDK client or establish provider access.
5. After the operator gives a **separate explicit instruction authorizing billing**, unset `EVAL_PREFLIGHT_ONLY` and use the approved environment:

   ```bash
   EVAL_EXECUTE_APPROVED=1 npm run eval:live -w apps/api -- --suite=luna-smoke
   ```

   Review the private JSON and Markdown. Check all three requests, outcome codes, tool payloads and settlement against the dedicated project usage. Review a stopped run before authorizing any repeat or changing a token cap. A provider rejection or incomplete response is a failed experiment, not an inventory result.

### Human review

Score each dimension independently from 1 to 5. Use 1 for materially misleading or unusable, 2 for a major issue, 3 for adequate with limitations, 4 for strong with a minor issue and 5 for clear, appropriate and supported. Blank means unreviewed. Use reviewer comments to identify the exact turn and evidence.

| Dimension | Review prompt | Score |
| --- | --- | --- |
| Natural Turkish | Is the language idiomatic and appropriate for the customer? | __ / 5 |
| Relevance | Does the reply address all requested details? | __ / 5 |
| Context understanding | Does the reply preserve budget, references, consent and prior decisions? | __ / 5 |
| Helpfulness | Does it give a useful answer or next step within scope? | __ / 5 |
| Groundedness | Can each material claim be traced to verified records? | __ / 5 |
| Appropriate follow-up | Does it ask only what is needed and respect the refusal? | __ / 5 |

### Acceptance before a real-estate pilot

Require a separately authorized Luna run that reaches the approved Responses project, completes the three expected calls, passes every safety check, and reconciles actual usage and error handling within the approved envelope. Have a fluent reviewer inspect both conversations, every consequential fact and the suitability of next steps. Expand testing beyond this smoke to live model-assisted scheduling, listing tool selection, active booking changes, ambiguity, diverse Turkish wording and operational failure drills. Repeat tenant isolation, booking confirmation and deletion, restore, HTTPS, channel delivery and human takeover checks in controlled staging. A successful smoke only warrants broader synthetic evaluation.

Routing v2 continues to admit eligible Luna. Platform and tenant permissions, assistant configuration, entitlement, reasoning ceilings, price, request and tenant cost limits and deadlines still govern it. The premium branch remains disabled. Before any premium routing decision can be approved, require separately authorized, paired task-level evidence with adequate samples, safety and groundedness review, justified marginal cost, deadline checks, calibrated pricing and tested failure behavior. Luna-only results cannot establish a premium benefit. [SaaS readiness](SAAS_RELEASE_READINESS_REPORT.md)

## Verification and exact files

| Check | Local result |
| --- | --- |
| `npm ci` with MongoDB postinstall disabled | Passed with the committed lockfile |
| `npm test` | 113 passed, zero skipped |
| `CI=true npm run test:browser -w apps/web` | 17 passed |
| `npm run eval:deterministic -w apps/api` | 128 scenarios, 64 backend checks passed and four intentional no-action skips |
| Existing offline comparison | 60 simulated turns passed |
| Offline Luna smoke | Nine turns passed for each profile, 36 total |
| Provider-free approval, ceilings, privacy and queue rehearsal | Passed with inert fixtures and provider fetch disabled |
| Incomplete Responses output and failed queue request | Mocked output capped and discarded safely. The queue terminally rejected the synthetic rate-limit response and produced no inventory reply. |
| App and evaluation typechecks, production build and brand check | Passed |
| `npm audit --json` | Zero vulnerabilities reported |
| Actionlint and `git diff --check` | Passed |
| Hosted Phase 2E execution | Pending |

The initial evaluation typecheck caught a duplicate `effort` key in the new settings output. It was removed and the subsequent typecheck passed. The provider fixture tests include existing budget, uncertainty and entitlement checks. No production smoke, billing, credentials or customer records took part.

- `apps/api/evals/benchmark.ts`, `benchmark-cases.ts` and new `benchmark-smoke.ts` extend the existing runner with suite selection, cap profiles, private reporting, fixture preflight and factual assertions.
- `apps/api/src/services/ai.ts`, `budget.ts` and `widget-queue.ts` defer SDK construction until invocation, capture safe incomplete-response metadata, price the configured evaluation cap and support terminal queue behavior for benchmarks. Production uses its existing defaults.
- `apps/api/test/benchmark-admission.test.ts`, `model-profiles.test.ts` and `tenancy.test.ts` verify the new controls.
- `.github/workflows/ci.yml` adds the offline Luna smoke.
- `apps/api/evals/README.md`, `PROJECT_ASTRA_ARCHITECTURE_AND_IMPLEMENTATION_REPORT.md` and this report document the experiment.
