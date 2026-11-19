# Phase 8A AI evaluation

Project Astra baseline checkpoint: the existing 68-case runner initially failed four outdated unformatted-price assertions. The listing assertions now verify structured price/currency and localized rendering. The repaired baseline passes 64 applicable backend checks and skips four no-action cases. The continuation suites below bring the offline evaluation total to 128.

`npm run eval:deterministic -w apps/api` runs 68 original synthetic scenarios (34 English, 34 Turkish) against a deterministic responder and an ephemeral MongoDB replica set. The first score checks selected tools, strict argument syntax, expected filters and unsupported raw model claims. The second score has 60 tenant-scoped action/retrieval checks, four provider-failure policy checks and four intentionally skipped backend actions for ambiguous requests. It covers pending confirmations, visitor booking authorization, consent refusal, stale and archived listings, handoff and availability. The deterministic responder intentionally emits each scenario's expected call, so its 68/68 model score is a runner sanity check, **not model accuracy**. Negative controls verify that the scorer rejects invalid tools, malformed filters, unsupported prices, false booking claims and tenant marker leakage. No persistent database or real provider is used.

`npm run eval:typecheck -w apps/api` typechecks the evaluation code separately from the production build.

ASTRA continuation adds `continuity.ts` to `eval:deterministic`: 24 pure interpretation/state-plan contracts alongside the original 68 scenarios (92 total). They assert date horizons, periods, mixed intents, evidence validation and no confirmation without a verified slot. Contract tool-policy metadata is descriptive; MongoDB queue tests verify actual booking authority and tenant isolation. Neither group measures live-model quality. No live evaluation runs as part of this command.

Phase 2B adds 36 business preference/question contracts in `business-continuity.ts`, bringing the combined count to 128 (68 provider fixtures + 60 pure contracts). Real queue/state/tool authority is covered separately by MongoDB-backed tests in `telegram-availability.test.ts`. Literal evidence, refusal, correction, no-inference and bounded follow-up assertions do not establish live-model quality.

## Versioned queue comparison

Run `npm run eval:benchmark -w apps/api` for the default offline smoke check. It runs the same versioned turn sequences, listing fixtures and staff hours for Luna, Sol and Astra using synthetic provider replies. It exercises the actual queue, database tools, model resolver, organization budgets and settlement. Each model starts with empty history and receives identical customer turns. In live runs subsequent assistant history can differ with the candidate's previous output.

The JSON contains expected and observed preferences, tool calls, arguments, workflow and final replies, alongside rule checks and token/cost totals. Human review fields are nullable and separate from machine checks. Use `EVAL_REPORT_PATH` for an exclusive mode-0600 file outside the repository.

For separately authorized experiments use `npm run eval:live -w apps/api`. This supersedes the historical direct model-only command. The runner requires:

- `EVAL_LIVE=1`, `EVAL_SPEND_APPROVED=1`, `EVAL_DEDICATED_PROJECT_CONFIRMED=1`, `EVAL_SYNTHETIC_TENANT_CONFIRMED=1` and `EVAL_STANDARD_PRICING_CONFIRMED=1`.
- `EVAL_PROJECT_API_KEY` for a dedicated OpenAI project and `EVAL_VERIFIED_MODELS` listing the three reviewed candidate IDs. These attestations rely on the operator to verify actual entitlement.
- `EVAL_PRICE_VERSION` matching the registry and `EVAL_PRICE_CHECKED_AT` set to a UTC timestamp in the preceding seven days after checking applicable Standard prices and cache ceilings. If prices differ from the registry, update and review the registry before running.
- `EVAL_MAX_SPEND_MICROS` between 1 and 1000000, `EVAL_MAX_MODEL_SPEND_MICROS` between 1 and the global limit, `EVAL_MAX_REQUESTS_PER_MODEL` between 1 and 18, and a private, unused `EVAL_REPORT_PATH`.

Each candidate receives the same medium reasoning setting and 128 output-token cap. The SDK uses a 30-second deadline with retries disabled. Each run uses a fresh local replica set and synthetic tenants. The existing atomic tenant budget check and a serial run-wide reservation gate both apply. A provider failure retains the uncertain reservation and stops subsequent calls. The run may end before all models if the remaining cap cannot admit the next request. Reconcile estimates against dedicated-project provider usage. The comparison fixes synthesis off and leaves naturalness and semantic factuality for human review.


## Phase 2D operator procedure

1. Run the offline benchmark and use the per-turn reservations to size the global and per-model allowance. Estimates can vary with generated history. Use a fresh, dedicated provider project and review its billing limits, entitlements, endpoint and Standard rates.
2. Inject the dedicated key using a local secret store. Supply the explicit flags and amounts above in the process environment. The benchmark does not source opt-ins from application dotenv files.
3. Run `EVAL_PREFLIGHT_ONLY=1 npm run eval:live -w apps/api` to validate local admission. This command exits before opening the report, starting the replica set or constructing the provider client. Entitlement remains an operator attestation.
4. After separate authorization for billable requests, unset `EVAL_PREFLIGHT_ONLY`, set `EVAL_EXECUTE_APPROVED=1` and run the live command. Use a new private report path. The isolated application sets both tenant budget windows to the per-model cap. It also enforces the configured request count, a conservative 40,000-input-token bound, 128 maximum output tokens and the SDK's 30-second timeout.
5. Compare identical customer turns and note any model-visible history divergence. Reconcile reported token totals and uncertain reservations against the dedicated project invoice. Keep automated assertions separate from human judgments. Review rubric and capability verification are in the [comparison report](../../../ASTRA_MODEL_COMPARISON_REPORT.md).

## Luna-only Phase 2E smoke

Run the simulated smoke through the same queue with:

```bash
npm run eval:benchmark -w apps/api -- --suite=luna-smoke
```

The smoke defaults to output profile `standard` and reasoning `none`. The full comparison still defaults to `minimal` and `medium`. Use `EVAL_OUTPUT_PROFILE=minimal|standard|extended|complex` for 128, 512, 1,024 or 2,048 output tokens and `EVAL_REASONING_EFFORT` for a supported effort within the medium policy ceiling. These settings are evaluation-only.

The Luna live preflight uses the same `--suite=luna-smoke` option on `eval:live`, with `EVAL_PREFLIGHT_ONLY=1`. In addition to the shared flags, it checks the dedicated project spending review attestation, a private report destination, full call envelope and synthetic queue. It writes no files and constructs no provider client. For optional rehearsal output, supply a new `EVAL_REPORT_PATH` for JSON and its paired Markdown transcript. See the exact approval and execution sequence, cost calculations and review rubric in the [Phase 2E report](../../../ASTRA_PHASE_2E_LIVE_VERIFICATION_PREPARATION.md).

## Phase 2F conversation quality

Use `npm run eval:benchmark -w apps/api -- --suite=conversation-quality` for the offline Turkish-first corpus. It preserves the raw simulated proposal and the executed action separately and reports application, fixture-model and delivered-reply denominators. This suite rejects `--live`. See the [evaluation plan](../../../ASTRA_PHASE_2F_EVALUATION_PLAN.md) for the rubric and interpretation limits.

### Phase 2F nine-call subset

The offline `--suite=luna-quality` command rehearses the nine planned Luna calls and one deterministic setup turn. The secure launcher supports provider-free preflight for this suite. Its paid path requires separate Phase 2F authorization and the `EVAL_2F_EXECUTE_APPROVED=1` flag in addition to the existing gates. [Envelope and operator commands](../../../ASTRA_PHASE_2F_MILESTONE_B_LIVE_READINESS.md)

## Phase 2G recorded decision replay

Run `EVAL_OUTPUT_PROFILE=standard npm run eval:benchmark -w apps/api -- --suite=phase2g-replay` from the repository root. The runner uses a disposable MongoDB replica set and the nine frozen synthetic provider decisions. The historical Phase 2F reports retain their strict metrics. The replay checks semantic contact arguments, stored alternatives, current listing references and final reply completeness independently of whether the raw proposal was suitable. This suite rejects `--live`.

## Phase 2G Milestone B

Run `npm run eval:benchmark -w apps/api -- --suite=phase2g-live` for the provider-free eight-turn rehearsal. It uses seven fixture decisions and a deterministic inventory setup, with a separately seeded contact prelude. For a private rehearsal pair, set `EVAL_REPORT_PATH` to a new absolute JSON path in an operator-owned mode 0700 directory. The launcher preflight validates the configured project attestations and creates no report files. The approved live path requires a separate `EVAL_2G_EXECUTE_APPROVED=1` gate. See [Milestone B readiness](../../../ASTRA_PHASE_2G_MILESTONE_B_LIVE_READINESS.md).
