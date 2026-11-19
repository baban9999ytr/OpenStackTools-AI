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

- `EVAL_LIVE=1`, `EVAL_SPEND_APPROVED=1`, `EVAL_DEDICATED_PROJECT_CONFIRMED=1` and `EVAL_SYNTHETIC_TENANT_CONFIRMED=1`.
- `EVAL_PROJECT_API_KEY` for a dedicated OpenAI project and `EVAL_VERIFIED_MODELS` listing the three reviewed candidate IDs. These attestations rely on the operator to verify actual entitlement.
- `EVAL_PRICE_VERSION` matching the registry and `EVAL_PRICE_CHECKED_AT` set to a UTC timestamp in the preceding seven days after checking applicable Standard prices and cache ceilings. If prices differ from the registry, update and review the registry before running.
- `EVAL_MAX_SPEND_MICROS` between 1 and 1000000, `EVAL_MAX_REQUESTS_PER_MODEL` between 1 and 18, and a private, unused `EVAL_REPORT_PATH`.

Each candidate receives the same medium reasoning setting and 128 output-token cap. The SDK uses a 30-second deadline with retries disabled. Each run uses a fresh local replica set and synthetic tenants. The existing atomic tenant budget check and a serial run-wide reservation gate both apply. A provider failure retains the uncertain reservation and stops subsequent calls. The run may end before all models if the remaining cap cannot admit the next request. Reconcile estimates against dedicated-project provider usage. The comparison fixes synthesis off and leaves naturalness and semantic factuality for human review.
