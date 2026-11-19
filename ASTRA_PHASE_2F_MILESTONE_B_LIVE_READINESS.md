# ASTRA Phase 2F Milestone B readiness

**READY FOR LIVE AUTHORIZATION.** The nine-call Luna evaluation is implemented in the existing benchmark and passed provider-free preflight with both an inert test fixture and the configured local launcher. Live Luna quality remains unverified. No billable execution was authorized or performed for this milestone.

The Phase 2E run exercised one model-authored greeting and two tool proposals. Phase 2F's 80-turn corpus exercised simulated provider output. The new `luna-quality` suite isolates nine model decisions through the real queue with disposable MongoDB, verified synthetic facts, and existing application authority. It runs one additional, deterministic listing-search turn to seed the comparison and reference history. No synthesis calls are scheduled. [Phase 2E result](ASTRA_PHASE_2E_FIRST_LIVE_LUNA_RESULTS.md) · [Phase 2F evaluation plan](ASTRA_PHASE_2F_EVALUATION_PLAN.md)

| Call | Opportunity | Main review question |
| ---: | --- | --- |
| 1 | Colloquial greeting | Does the response match the register without guessing intent? |
| 2 | Flexible location and room counts | Does it acknowledge both alternatives and ask a useful question without inventing a budget? |
| 3 | Business contact | Does the proposal retrieve verified email and website and does the reply include both? |
| 4 | Mixed-language follow-up | Does it understand the customer asked for email alone? |
| 5 | Compare verified listings | Does the model distinguish known facts and uncertainty before the queue composes its grounded comparison? |
| 6 | Second listing's maintenance fee | Does Luna avoid substituting a new search for an unknown attribute? |
| 7 | Correct to the first listing and ask about deposit | Does the decision respect the corrected reference and address the new attribute? |
| 8 | Unknown transit distance and ownership | Does it decline to give unsupported details? |
| 9 | Furnishing and a weekend viewing | Does it address both questions, ask for the missing listing and avoid promising a time or booking? |

## Envelope and controls

The launcher pins `gpt-6-luna` only, Standard Responses, reasoning `none`, 512 output tokens, a 40,000-token conservative input bound, and nine provider calls. The existing 30-second SDK timeout and disabled retries apply. Both application caps are $0.10. The registry's $0.010259 conservative per-call reservation gives a maximum of **$0.092331**. This is an application estimate and not a provider billing cap. OpenAI's model page lists $0.10 Standard input and $0.50 output per million tokens, $0.01 cached input and $0.125 cache writes. The registry reserves using the higher reviewed cache-write rate. Review the dedicated project's actual applicable pricing, quota, entitlement and spending controls again before execution. Public pricing and local attestation acceptance do not verify project quota or invoices. [Official Luna model reference](https://developers.openai.com/api/docs/models/gpt-6-luna)

The paid path requires the Phase 2F-specific `EVAL_2F_EXECUTE_APPROVED=1` gate in addition to existing admission. The launcher checks it before starting the benchmark. The benchmark checks it again and validates the exact envelope. The Phase 2E execution flag alone is insufficient. Existing Luna smoke settings remain available for their separate suite. Production configuration and routing were left unchanged.

The JSON and Markdown separate raw model text and arguments, executed actions and verified facts, and the final reply. Record semantic context interpretation and unsupported assumptions in reviewer notes. Tool selection does not inherit credit from the final reply. Ordinary model-quality differences remain in the report. Authorization, tenant scope, consequential action, token and spend failures, unexpected call counts and uncertain provider outcomes stop the paid run.

## Verification

- Configured local provider-free preflight admitted the run, with zero provider requests, ten synthetic turns, nine planned and nine simulated calls, and 92,331 microdollars maximum estimated reservation.
- A separate test disabled provider fetch and verified rejection of Phase 2E-only approval, an eight-call limit and a $0.04 budget. The preflight wrote no reports.
- The offline dry run completed four scenarios. It passed 10/10 tenant and no-unauthorized-transaction checks and 10/10 delivered reply contracts. No bookings were created. The deliberately wrong fee-search proposal stayed visible as the one failed selection among nine fixture decisions. The application discarded it and disclosed the unverified fee.
- The offline JSON and Markdown artifact check verified a 0700 directory and two mode-0600 files. The generated transcript includes ten blank reviewer entries, including the deterministic setup turn.
- 114 API tests and 17 browser tests passed. The existing 128 deterministic scenarios ran with four intentional backend skips. The comparison, original Luna smoke and 80-turn quality suites all passed offline. Typechecks, build, brand check, Actionlint, dependency audit and diff check passed. The dependency audit reported zero vulnerabilities. A hosted run of these changes has not been verified.

The new work is in `apps/api/evals/benchmark-luna-quality-cases.ts`, `benchmark-cases.ts`, `benchmark.ts`, `launch-luna.mjs` and the admission test. CI invokes the suite offline. Existing Phase 2F edits were preserved.

## Commands from the repository root

Provider-free, using the ignored local dotenv:

```bash
env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --preflight --suite=luna-quality
```

**Use only after separate explicit operator authorization for these nine calls**, with the existing dedicated-project attestations and actual UTC pricing review current:

```bash
EVAL_2F_EXECUTE_APPROVED=1 env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --execute --suite=luna-quality
```

The launcher repeats preflight before starting the one billable run. Review its private report with the [human review template](ASTRA_PHASE_2F_MILESTONE_B_REVIEW_TEMPLATE.md). Nine calls are a narrow comparison sample. Persistent alternative filters, multi-interruption references and compound request handling still need further evidence before a pilot.
