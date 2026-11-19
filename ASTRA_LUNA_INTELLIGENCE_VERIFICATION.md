# Luna decision verification

**Root cause PARTIAL · Architecture IMPROVED TOOLS · Offline engineering PASS · Model quality improvement NOT VERIFIED LIVE · Existing safety regressions PASS · Supervised pilot NO-GO**

Base Git revision 0c23578e49af837243f6909611303e266d85de88. The working-tree source manifest SHA-256 is **3c88805bdc22ee24134fea7afc13be35fea6739308c1692f5e7aae2d90082f16**, calculated over Git-listed and non-ignored files in apps, deploy, brand, .github and root build inputs. This is an uncommitted candidate identity. The Phase 2I manifest and original reports remain historical. Its seven-call live gate is retired on this source revision.

## Results executed locally

| Verification | Result |
| --- | --- |
| API suite | 177/177, including MongoDB-backed tenant, budget, provider error, booking confirmation, idempotency, concurrency, stale state and handoff regressions |
| Luna decision regression file | 50/50. The evaluation dataset covers 48 cases or replay-oriented assertions, including eight held-out checks, plus an SDK request comparison and an approval-isolation check. |
| Browser suite | 20/20 |
| Deterministic scenarios | 128 cases, four intentional backend no-action skips, zero failures |
| Offline benchmark suites | Eleven passed, including frozen Phase 2G and both A/B arms. All provider boundaries used synthetic fixtures. |
| Types, production builds, brand, workflow and dependency checks | API, web and eval typechecks, both builds, brand check, actionlint, git diff --check and npm audit passed. Audit reported zero vulnerabilities. |

Added decision tests cover Turkish and mixed-language wording, references, sorting, missing facts, multiple requests, OR criteria, follow-up contact, booking language, privacy and unrelated topics. The new tests caught two real parser defects. The server previously missed natural location alternatives with “veya” and a mixed-spelling furnishing question. An initial budget concurrency regression found that applying the expanded instructions to generic assistants changed admission requirements. The decision prompt and strict preference tool are now limited to real-estate requests. The original concurrent-budget assertion passes.

## Frozen behavior and scoring

| Evidence | Historical result | Current-source offline result |
| --- | --- | --- |
| Seven actual Phase 2G decisions | 3/7 raw tool selections and 1/2 semantic arguments | 3/7 and 1/2 unchanged |
| Customer pattern checks, seven model turns | 6/7 | 7/7 after the existing Milestone C application recovery |
| Passing conversations | 3/4 | 4/4, with 8/8 reply and safety checks including setup |
| Raw reference and context evidence | 2/4 context indicators | 2/4 raw indicators. The application persisted correct listing focus on 2/2 checked turns. |
| Compound and grounding checks | Limited to the benchmark | 2/2 delivered compound checks, 8/8 bounded price/time/booking and hard safety checks including setup |

The unchanged A1 decision still has an invalid room string in the frozen transcript, while its application reply retains both alternatives. B1 still scopes contact to email. C1 still requires app recovery to produce the verified comparison. C2 still proposes a stale preference change in the recorded decision but its reply now uses the second property's fee status as in Milestone C. C3 still has a correct raw no-tool decision. D1 and D2 still require the app to enforce the privacy boundary and acknowledge both parts of each turn.

The additional decision dataset checks behavior against explicit per-turn expectations across historical state, current-turn extraction, type safety, reference order, clarification boundaries and allowed actions. The paired simulator injects identical expected provider decisions in each arm. Its 7/7 selections, 2/2 semantic argument checks, 5/5 correct no-tool choices, zero of five unnecessary tools, 2/2 raw property and compound signals, and zero of seven unauthorized actions are fixture and harness checks. They provide no model accuracy measure. A live reviewer must evaluate raw relevance and factual completeness separately, particularly when the model chose no tool. Recovery is scored only on wrong raw choices and only when the application produces a safe relevant reply. There were no wrong choices in the paired fixtures. The historical frozen replay provides the application recovery evidence.

## Bounded live experiment

| Arm | Contract | Reasoning | Status |
| --- | --- | --- | --- |
| A | Previous function-calling prompt and schema on current application | none | Provider-free preflight passed |
| B | Improved prompt, snapshot and typed preference tool | none | Provider-free preflight passed |
| C | Structured multi-intent output | none | Design-only comparator. No runtime replacement implemented. |
| D | Same as C | low | Design-only comparator. Luna publicly supports low via Responses. A separate candidate, authorization and budget are required. |

A and B use the same seven matched prompts, same case-level state setup, same model, fixtures and code revision, with one deterministic listing setup per arm. Prior delivered context may evolve during a real run and the harness captures its fingerprint. Record raw selection, semantic arguments, reference and compound evidence, unnecessary proposals, groundedness and complete customer relevance per turn. Compare paired outcomes and label application corrections separately. Capture actual SDK latency, provider-reported input, output and reasoning usage, and settled or retained estimates. Independent Turkish grades stay blank. The seven paired turns are diagnostic evidence. Hold out the additional scenarios for independent generalization review or a separately bounded future comparison.

Each arm admits at most seven Standard Responses calls, 40,000 input tokens and 512 output tokens per call, reasoning none, no synthesis, zero SDK retries and a 30-second deadline. Each has $0.08 global and per-model application caps and a $0.071813 conservative maximum reservation. Both arms combined would reserve at most $0.143626 against two independent $0.08 ceilings. Stop on provider uncertainty, unsafe outcomes, invalid usage, or failed admission. Keep uncertain reservations and stop the comparison if either arm fails its safety conditions. Each arm requires its own approval variable and one separately approved launcher invocation. The earlier Phase 2I, Phase 2G, and other arm gates cannot authorize it.

Provider-free commands

    env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --preflight --suite=luna-contract-a
    env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --preflight --suite=luna-contract-b

Both returned admitted true, providerRequests 0, plannedCalls 7 and worstCaseRunMicros 71813. For separately authorized execution, set only the selected arm's EVAL_LUNA_CONTRACT_A_EXECUTE_APPROVED or EVAL_LUNA_CONTRACT_B_EXECUTE_APPROVED and replace --preflight with --execute. Recheck dedicated project access, region, Standard pricing, quota and provider spending controls before authorizing. Public Luna pricing lists $0.10 input, $0.01 cached input, $0.125 cache writes and $0.50 output per million Standard tokens at the published base rates. The registry's conservative envelope remains above the published base-rate estimate. Public capability and pricing leave project entitlement and invoice settlement unverified. [Official Luna model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)

The improved prompt adds bounded input and no model round trip. The historic seven-call Phase 2G sample had 13,332 input, 348 output and zero reasoning tokens, median provider latency 2.894 seconds, and a $0.003512 internal estimate. The current provider-free runs measure no new provider latency, token usage or cost. No paid requests were made.

## Release gate

**Next required action:** authorize one paired A/B experiment on this exact source after confirming the dedicated project. Repeat production-image staging checks against a rebuilt candidate and complete independent Turkish review, staff acceptance and operational gates before pilot use.
