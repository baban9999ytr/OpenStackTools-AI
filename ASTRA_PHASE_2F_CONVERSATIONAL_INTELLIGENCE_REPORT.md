# ASTRA Phase 2F — conversational intelligence

**Decision: PARTIAL. LIVE MODEL QUALITY: NOT VERIFIED.** The new offline evaluation and targeted application fixes are in place. Persistent alternative filters, robust reference tracking after multiple interruptions, compound viewing requests and naturalness on actual model output still need verification. Phase 2E verified basic integration only. No billable provider requests occurred in Phase 2F.

## Baseline and improvements

The Phase 2E run made three Luna calls across nine turns. One answer was Luna-authored, one selected the knowledge tool, and one proposed a generic search for an unknown maintenance fee. The application reused the second verified listing instead. Reported usage was 5,287 input tokens and 92 output tokens, with zero reasoning tokens, $0.001369 internal settlement and 3.245–3.497 seconds provider latency. [Phase 2E evidence](ASTRA_PHASE_2E_FIRST_LIVE_LUNA_RESULTS.md)

| Reproduced issue | Before | After and evidence |
| --- | --- | --- |
| Mechanical contact reply | Raw `email:` and `website:` labels in the live transcript | The formatter uses plain Turkish and English sentences for known contact fields. The queue verifies both contact fields against synthetic records. |
| Generic search for a prior listing's fee | Luna proposed a full listing search in 2E | Prompt guidance now says to resolve a specific prior reference and disclose unavailable attributes. The offline negative control still injects a search proposal and verifies that it is discarded and scored separately. Prompt effect on Luna is pending. |
| Alternative rooms | The application called 2+1 or 3+1 conflicting preferences | It acknowledges flexibility and asks which layout to prioritize. It does not store an arbitrary room or budget. Persistent multi-option search remains a gap. |
| Furnishing correction | The parser could retain the old furnished preference | A narrow correction pattern preserves the unfurnished choice while location and budget stay intact. The reply explains that furnishing cannot be confirmed from stored data. |
| Deposit follow-up | The previous maintenance-fee prompt leaked into the current question and selected the wrong attribute | The queue carries the reference selector alone. The fixture verifies the first displayed listing, independent of database order, and reports its deposit as unverified. The older “cheaper one” reference regression remains covered. |
| Evaluation harness | The first scoped grounding pass treated the verified 7,000 TRY comparison difference as an invented price | Only the declared two-listing comparison admits the computed difference. The amount is derived from the authorized fixture rows. |

## Offline evidence and denominators

The benchmark replayed 80 turns across 15 conversations through the durable queue and disposable MongoDB, with 34 simulated provider-boundary turns. All 15 conversations passed the application and delivered-reply contracts. The initial expanded run surfaced three conversation failures. The integration suite subsequently caught a regression in indirect cheaper-listing references and the compiler caught a listing-type mismatch. Both were fixed before the final runs. No existing assertion was dropped.

| Layer | Result |
| --- | --- |
| Application | 27/27 declared preference checks, 2/2 explicit reference checks, 2/2 availability checks, 6/6 refusal checks, 10/10 handoffs, 80/80 tenant-scope/sentinel and zero-unauthorized-transaction checks |
| Simulated decisions | 34/34 fixture boundary calls returned, 11/12 scored selections, 7/7 scored argument sets. The wrong fee search is a deliberate failed selection with a correct delivered reply. Other turns have no tool expectation and are excluded from the tool denominators. |
| Delivered replies | 67/67 reply patterns, 4/4 declared non-repetition checks and 80/80 bounded price, time and booking-claim checks |
| Interventions | Two proposals not executed, nine free-text replies replaced, six normal tool replies rendered. These are observable differences between proposal and action or input and output, not a semantic measure of model fault. |
| Accounting | 408 fixture input tokens and 204 fixture output tokens across 34 calls, zero provider transport errors in the fixture, $0.000204 internally estimated. This is approximately $0.0000136 per simulated completed conversation. |

Reply patterns and bounded numeric checks do not score all claims or identify naturalness. Human review scores remain blank. Multi-intent coverage is represented by the case contracts, including both requested contact fields and a combined furnishing/viewing prompt, with no aggregate accuracy claim. Relevant clarification is sampled through explicit reply contracts, not an agent-wide rate. Per-call and total timings in JSON are simulated runtime measurements. Model-specific latency and cost projections use the earlier live baseline and stated limits rather than fixture speed.

## Verification and changed files

- **113 API tests and 17 browser tests passed**, zero skipped.
- **128 deterministic scenarios** passed, with 64 backend checks passed and four intentionally skipped backend checks for no-action cases.
- **60 comparison turns, nine Luna smoke turns, and 80 conversation-quality turns** passed offline. The quality suite rejects live execution.
- App and evaluation typechecks, production build, brand check, Actionlint and `git diff --check` passed. The npm audit returned zero vulnerabilities.
- Hosted CI for these changes remains unverified.

The queue suite changes are in `apps/api/evals/benchmark.ts`, `benchmark-cases.ts` and `benchmark-quality-cases.ts`. Application fixes are in `apps/api/src/services/agent-actions.ts`, `business-conversation.ts`, `business-conversation-runtime.ts`, `customer-listings.ts` and `widget-queue.ts`. `.github/workflows/ci.yml` adds the offline quality command. `apps/api/evals/README.md` and the Phase 2F reports describe the contracts and review gates.

Keep the real-estate pilot gated. The next milestone is a separately approved, narrow Luna evaluation with independent Turkish review, followed by focused work on alternative filters, reference persistence and compound scheduling. [Evaluation plan](ASTRA_PHASE_2F_EVALUATION_PLAN.md) · [Live approval proposal](ASTRA_PHASE_2F_LIVE_APPROVAL_PROPOSAL.md)

## Milestone B live evaluation

**PARTIAL.** One authorized nine-call Luna run completed with no provider errors, zero retries, $0.004179 internally settled and 10/10 bounded safety checks. One of four scenarios passed the harness. Strict tool selection was 3/9. The application preserved tenant scope and corrected several model proposals, while flexible preferences, unknown facts and compound viewing handling remain weak. Independent human scores remain blank. [Complete live results](ASTRA_PHASE_2F_MILESTONE_B_LIVE_RESULTS.md)
