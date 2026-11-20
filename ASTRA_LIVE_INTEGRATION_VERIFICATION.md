# ASTRA live integration verification

**FAIL.** Both authorized Luna calls completed. The live widget stopped at the compound furnishing and weekend-viewing checkpoint because a rejected plan produced a generic clarification.

## Frozen candidate and envelope

- Base commit d55ec119bd5811094e2ae0095150aa4b1968a745. Source manifest SHA-256 c7b5f194dbf0056d829649a57b3f9ced4881b57cb1fade9550a4e66428e45caa, computed over tracked and non-ignored files in apps, deploy, brand, .github and root build inputs.
- Corpus SHA-256 56be9bf296f5f8b1eeeb9d195272a0794897bef23d21567cfa82de02277bb823. The harness freezes the Turkish prompts and expected labels. The appointment turn selects the first verified offered slot and formats it in Europe/Istanbul.
- Exactly two GPT-6 Luna Standard Responses calls, reasoning none, 512 output tokens and a conservative 40,000 input token cap per call. The SDK uses a 30-second timeout and zero retries. Synthesis is disabled.
- **$0.010259 maximum per call and $0.020518 maximum overall.** Global and per-model application caps are both $0.021. The observed synthetic input bounds, including schema, were 18,912 and 19,704, with reservations of $0.004987 and $0.005185. The approved maximum remains the fixed conservative ceiling. The calculation uses registry openai-2026-11-13-standard-v1.

## Provider-free preflight

Ran the dedicated launcher in preflight mode, using an in-process widget HTTP client and isolated MongoDB 8.0.12 replica set. All ten checkpoints passed with **zero provider requests**. The fixture used the actual dispatcher, shared queue, widget origins and booking handlers. It reached the model adapter only for the second listing’s fee and deposit question and the compound furnishing and weekend question.

| Layer | Offline result |
| --- | --- |
| Model | Two expected synthetic plans passed validation. Fresh intent, reference and compound accuracy remain unmeasured. |
| Application | The dispatcher returned facts separately, retained both alternative neighborhoods and room layouts without a new search, composed furnishing and verified weekend options, and reconciled the simulated ledger. |
| Customer | The widget displayed two verified properties, the 7,000 TL comparison, a 0 TL fee and an unverified deposit. Deferral survived history reload and left the action pending. Explicit confirmation created one appointment, and duplicate confirmation returned its ID. |
| Efficiency | Eight checkpoints used no model inference. There is no measured provider latency, usage or cost. |

Evaluation typecheck and git diff --check passed. Negative gate verification showed that prior structured-intent and Luna A/B approvals could not start the integrated suite. Application source and production settings were left as found. This work adds only the evaluation runner and launcher entry.

## Authorized live result

The source and corpus digests matched. The standalone and launcher preflights each passed 10/10 with zero provider requests. Read-only Luna model metadata returned HTTP 200. Dedicated project, quota and spending controls were operator-attested. The latest available operator billing confirmation covered a larger envelope than this run, with subsequent observed internal settlements well within that headroom. No billing dashboard balance or invoice was independently reconciled. The registry stayed on the approved conservative reservation. [Official Luna pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)

The launcher ran exactly once and exited 1 at checkpoint five, with two completed provider responses and no retry.

| Live prompt | Raw Luna decision | Server and customer result |
| --- | --- | --- |
| Second listing's deposit and maintenance fee | Correct property-fact intent, position 2 and both attributes. Quoted the latest message verbatim. | Accepted. The widget reported the second listing’s verified 0 TL fee and separately stated that its deposit was unverified. |
| Furnishing and weekend viewing | Identified both intents, used the correct existing focus for both, and marked time as missing. Quoted “Eşyalı mı?” even though the latest message had “Eşyalı mı,”. | Evidence validation rejected the plan. The widget asked “Tam olarak neyi öğrenmek veya yapmak istediğinizi netleştirir misiniz?” It delivered neither the verified furnishing answer nor weekend availability. |

Raw semantic intent and reference recognition were **2/2**. Raw compound intent coverage was **1/1**. Complete plans passing the current-turn evidence contract were **1/2**, and the compound customer response passed **0/1**. The current-turn validator rejected the punctuation change. The app recovered no compound answer on that turn. The deterministic search, 7,000 TL comparison and alternative-preference update passed before the failure.

Earlier completed checkpoints verified no appointment. The live run stopped before slot selection, deferral, reload, explicit confirmation and duplicate confirmation. Those steps retain only their provider-free evidence. No provider error, safety violation, invalid token usage or budget violation was observed. The stop prevented the final complete-run ledger assertion from executing. The two recorded per-call estimates sum to the internal meter total.

| Call | Input / output / reasoning tokens | Latency | Internal estimate |
| --- | ---: | ---: | ---: |
| Fee and deposit | 700 / 86 / 0 | 4.627 s | $0.000218 |
| Furnishing and weekend | 781 / 125 / 0 | 3.589 s | $0.000259 |
| Total | 1,481 / 211 / 0 | 4.108 s median | **$0.000477** |

The defect is reproducible with the saved raw plan. Use that exact response in an offline widget regression and verify that rejected advice still reaches the independently grounded furnishing and availability handlers. Keep the adapter opt-in. The evidence does not support proceeding to supervised channel integration.

Private report directory mode 0700, JSON mode 0600. [Private run evidence](/tmp/astra-luna-VHkWsp/luna.json)

## Execution boundary used for this run

Preflight command

    env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --preflight --suite=luna-integrated-widget

The single-run authorization was consumed. The dedicated approval flag and corpus digest gated the invocation. Model plans, customer replies and usage are stored separately. Independent review remains blank.

Independent reviewer ____________________

## OFFLINE REPAIR — Recorded compound response

**Offline replay PASS. Historical live result remains FAIL.** No provider requests were made for this repair. Independent human review remains blank.

### Reproduction and correction

Both raw responses were copied unchanged from the private live JSON into the synthetic replay fixture and compared byte-for-byte with the original strings. The frozen conversation digest stayed the same. The synthetic listings now have an explicit freshness order so that “the second listing” stays stable across database runs. Before changing the application, the replay reached checkpoint five and reproduced the generic reply “Tam olarak neyi öğrenmek veya yapmak istediğinizi netleştirir misiniz?” with zero provider calls.

The server previously required every proposed quote to be a literal substring. Luna had correctly identified furnishing and weekend viewing, but the quote “Eşyalı mı?” differed from the visitor's “Eşyalı mı,”. The mismatch discarded the entire plan, and the old fallback lost both requests.

- Evidence must identify one unique, bounded span in the latest visitor turn. The sole punctuation exception lets a model quote a deterministically recognized Turkish yes/no property question ending in `mı?`, `mi?`, `mu?` or `mü?` where the original has a comma followed by whitespace and another clause. Spelling, spacing, case, and accents inside the quote must still match exactly. Repeated matches and partial words or numeric values are rejected. Ordinal and focus checks still apply. The validator keeps the original quote, matched span and offsets in metadata. Operational logs include the match kind and offsets only.
- Rejected plans contribute no intent, action or reference. The dispatcher independently uses current-turn hints and tenant-scoped verified records to answer supported questions or ask for missing details. It can offer verified times but cannot stage or authorize a booking from rejected advice. An independent recovery test deliberately rejects the furnishing proposal and still returns both grounded answers. When no viewing consultant schedule is verified, the reply keeps the furnishing answer and explains the schedule gap without offering times.

### Exact widget replay

| Evidence | Result |
| --- | --- |
| Raw model quality | The two historical Luna decisions remain 2/2 for semantic intent and references, with both compound intents present. The historical server acceptance was 1/2 and historical compound reply success was 0/1. |
| Repaired server validation | 2/2 recorded plans accepted, including the exact formerly rejected plan. This is a server validation result. |
| Separate application recovery | Invalid furnishing wording and an omitted viewing intent were discarded. The current visitor turn still produced the verified furnishing result and weekend availability. The cross-tenant regression did not reveal the foreign, archived or deleted listing. |
| Customer reply and state | Ten frozen widget API checkpoints passed on isolated MongoDB. Two listings appeared, the verified price difference was 7,000 TL, and the second listing's 0 TL fee and unverified deposit were stated separately. Alternative preferences did not issue another search. Both parts of the compound reply passed. |
| Booking and takeover | The consultant and local weekend time were verified. Slot selection staged a pending proposal, deferral survived reload, explicit confirmation created one appointment, and duplicate confirmation returned the same ID. Separate MongoDB tests verified staff takeover, a takeover race and tenant isolation. |
| Usage | Two fixture inference boundaries, zero provider requests, and a reconciled synthetic ledger. No new provider latency, usage or cost was measured. |

Recorded customer-visible replay reply

> Synthetic Garden Flat — Kayıtlara göre ilan eşyasız. Synthetic Garden Flat için gösterim saatleri: 21 Kasım Cumartesi saat 14.00 veya 21 Kasım Cumartesi saat 14.30 veya 21 Kasım Cumartesi saat 15.00. Hangisi size uyar?

### Verification

| Command or suite | Result |
| --- | --- |
| `env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --preflight --suite=luna-integrated-widget` | 10/10 frozen checkpoints passed. Both raw fixture strings match the private report. Zero provider requests. |
| `npm test` | 190 passed, including MongoDB-backed widget, booking, tenant and staff regressions. |
| `npm run test:browser -w apps/web` | 20 passed. |
| `npm run eval:deterministic -w apps/api` | 128 scenarios. The 68 base model fixtures, 24 continuity cases and 36 business cases passed. Of the base backend checks, 64 passed and four intentional skips were reported. |
| `npm run eval:benchmark -w apps/api -- --suite=<suite>` | Provider-free `phase2g-replay`, `phase2g-milestone-c`, `luna-contract-a` and `luna-contract-b` passed. |
| `npm run typecheck`, `npm run eval:typecheck -w apps/api`, `npm run build`, `npm run brand:check`, `git diff --check` | Passed. |
| `npm audit` | Zero vulnerabilities reported. |

The dispatcher remains opt-in. A fresh live repetition would require separate authorization for the repaired candidate. The offline pass establishes recovery for the recorded response and completion of the synthetic workflow. Supervised channel integration and production readiness remain unverified.

## Final live verification preparation — 20 November 2026

**Provider-free preflight PASS. Live execution awaits separate authorization and a current project review.** The historical live FAIL and offline repair PASS above remain the recorded results.

| Candidate item | Frozen value |
| --- | --- |
| Repaired source manifest SHA-256 | `5053f438a07967e1b1340e3622de972e267ddcfe71ad229c5f9dd702e11cdfda` |
| Corpus SHA-256 | `56be9bf296f5f8b1eeeb9d195272a0794897bef23d21567cfa82de02277bb823` |
| Suite | `luna-integrated-widget` |
| Offline result | 10/10 MongoDB-backed widget checkpoints, two fixture inference boundaries, zero provider requests |
| Live envelope | At most two GPT-6 Luna Standard Responses calls. Reasoning none, 40,000 input and 512 output tokens per call, 30-second timeout, zero retries, no synthesis. |
| Maximum internal reservation | $0.010259 per call, $0.020518 combined. The global and per-model app caps are $0.021 each. |

The manifest covers tracked and non-ignored local source, tests, deployment and build inputs. It excludes private dotenv files. Both recorded synthetic fixture responses are covered by the source manifest. The corpus digest covers the frozen prompts and expected outcomes. The launcher reruns preflight with both approved digests before live execution, and the runner checks them again before initializing the provider. A previous paid-run approval alone was rejected. Deliberately wrong source and corpus digests also failed in preflight. Evaluation typecheck and `git diff --check` passed.

OpenAI lists Standard Luna prices of $0.10 input and $0.50 output per million tokens for this context size. The published 12-hour cache write rate is $0.25 per million. Reserving every input token at that higher rate plus 512 output tokens and $0.000003 rounding headroom yields the per-call maximum. The preflight's two prompt bounds reserved $0.004987 and $0.005185 respectively. Those figures are estimates from synthetic prompts. The full fixed ceiling governs the live run. [OpenAI Standard pricing](https://developers.openai.com/api/docs/pricing) · [GPT-6 Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna)

The existing private project credential returned HTTP 200 with the exact Luna ID on a read-only model metadata request. The dedicated nonproduction designation and existing project controls are operator attestations. Before paid execution, the project owner must verify that this credential has Responses write permission in the dedicated project, that Standard global pricing applies, and that quota, billing headroom, and the intended provider spend controls are current. Record the actual review time (UTC, within 24 hours) as `EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT`. Keep `EVAL_PRICE_CHECKED_AT` tied to an actual published pricing review within seven days. Model metadata cannot establish those project settings. [OpenAI spend limit documentation](https://developers.openai.com/api/docs/guides/spend-limits)

After separate authorization for these exact digests and limits, with the reviews recorded in the ignored dotenv or exported in the operator shell, run once from the repository root.

```bash
env -u NODE_OPTIONS \
  EVAL_REPAIRED_WIDGET_APPROVED_SOURCE_SHA256=5053f438a07967e1b1340e3622de972e267ddcfe71ad229c5f9dd702e11cdfda \
  EVAL_INTEGRATED_WIDGET_CORPUS_SHA256=56be9bf296f5f8b1eeeb9d195272a0794897bef23d21567cfa82de02277bb823 \
  node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --execute --suite=luna-integrated-widget
```

### Remaining blockers for a private synthetic owner demo

- Complete the authorized two-call run and review the actual Turkish model decisions and customer-visible replies, including the compound turn and booking confirmation.
- Pin this candidate on the isolated local HTTPS stack and rehearse the actual demo tenant, widget origin, budget, and operator takeover. The integrated preflight uses the widget API and an isolated MongoDB replica set. It does not exercise the demo's browser or TLS entry point.
- Set a named demo operator and confirm one private viewing session. The existing staging surface is loopback-only. A browser session on the operator's machine can support an operator-led walkthrough. A direct remote browser walkthrough would additionally need an approved private access path and origin checks.

[Local HTTPS runbook](LOCAL_HTTPS_STAGING_RUNBOOK.md) · [Synthetic demo seed](README.md#local-fictional-real-estate-demo)

## Standing budget execution check — 20 November 2026

**Live run BLOCKED on current project verification.** The project owner authorized $0.20 total in new nonproduction ASTRA tests, including this one two-call experiment. The pre-existing per-run limits and frozen digests still apply.

- The first provider-free run stopped at reload after seven checkpoints. The frozen runner did not record which reload assertion failed. A single diagnostic preflight with the same digests passed all ten checkpoints with zero provider requests. It replayed verified furnishing and weekend availability, preserved deferral through reload, booked only after explicit confirmation, and returned the same appointment on duplicate confirmation. The first reload failure's underlying cause remains unconfirmed.
- Current Standard model pricing still supports the $0.020518 maximum reservation. The dedicated credential returned HTTP 200 and the exact Luna model ID on the read-only metadata request. The Platform billing view redirected to sign-in. The current integrated project-review attestation is absent. The credential's Responses write permission, available quota and billing headroom, and current provider-side spending controls still require the project owner's review.
- No paid calls or pending reservations were recorded. No new live model accuracy, booking behavior, or invoice cost was measured. The private standing ledger starts with the full $0.200000 remaining.
- The ledger and utility are local under `~/.local/state/openstacktools-ai/astra-budget`, outside the frozen source. Reserve each experiment's full maximum in microdollars before invoking its existing launcher. Use a stable unique experiment ID. Run only after reservation succeeds. Record the measured internal estimate when usage is complete and a verified charge when separately corroborated. For incomplete or uncertain outcomes, leave the full reservation charged until verified. A crash after reservation also leaves the full amount pending. Do not recreate the ledger between experiments.

## Conversation reload instability — 20 November 2026

**Offline verification PASS. One controlled live run remains BLOCKED on project review.** Historical live, offline repair and standing-budget results above are preserved.

### Reproduced cause and correction

The reload assertion expected the most recent message to be the assistant's deferral reply. Before the fix, the history query sorted by `createdAt` and then `_id`. The visitor message was created by an upsert using a MongoDB-generated ObjectId. The reply used an application-generated ObjectId. When both writes received the same millisecond timestamp, the two unrelated ObjectId generators could sort the reply first.

The failure reproduced at `reload / history_latest_is_deferral_reply` in forced-timestamp runs 4, 7 and 8. Each returned HTTP 200 with 14 messages, including both deferral messages in reverse order at the same timestamp. The POST had returned both messages and a completed request. The persisted response ID matched, the widget session and conversation matched, no requests or leases remained active, the appointment action was pending, and the booking count was zero. The original uninstrumented incident cannot be reconstructed exactly. The reproduction matched its checkpoint and failure signature.

The queue now assigns each new assistant reply a timestamp at least one millisecond later than its persisted visitor message, for both control and inferred replies. It does this within the existing finalization flow. The harness records the prior response state, history HTTP status and order, persisted message order and timestamps, matching session and response identity, leases and pending work, and appointment state. It checks that the expected persisted reply is last and that deferral leaves the appointment pending. The diagnostic clock can force a timestamp tie before finalization in standalone preflight only. Existing stored messages were left intact.

### Repeatability and verification

Every run started a fresh isolated MongoDB 8.0.12 replica set. All runs made zero provider requests. No requests were retried within a run.

| Runs | Per-run results |
| --- | --- |
| Before fix, natural clock, runs 1–12 | All 12 passed 10/10. |
| Before fix, forced tied clock, runs 1–8 | 1 PASS, 2 PASS, 3 PASS, 4 FAIL, 5 PASS, 6 PASS, 7 FAIL, 8 FAIL. Failures stopped at 7/10. |
| After fix, natural clock, runs 1–8 | All eight passed 10/10. |
| After fix, forced tied clock, runs 1–8 | All eight passed 10/10. Each persisted reply was exactly 1 ms after its customer message. |
| After fix, new source and corpus pinned | Passed 10/10. The previous source digest was rejected. |

The post-fix runs verified exact deferral history, zero bookings before explicit confirmation, one booking afterward and the same appointment on duplicate confirmation. The two recorded Luna strings were unchanged and matched byte-for-byte between the before and after rehearsals. The original private live JSON was unavailable for a fresh comparison during this investigation. The earlier offline repair recorded the original comparison.

Ran `npm test` (190 passed), `npm run test:browser -w apps/web` (20 passed), and `npm run eval:deterministic -w apps/api` (128 scenarios, four intentional backend skips, zero failures). The provider-free `phase2g-replay`, `phase2g-milestone-c`, `luna-contract-a` and `luna-contract-b` benchmark runs passed. API, web and evaluation typechecks, production builds, brand checks and `git diff --check` passed. `npm audit` reported zero vulnerabilities.

### Updated candidate and remaining account checks

| Input | Frozen value |
| --- | --- |
| Source SHA-256 | `27a7c02a724a92a8502b41b22b44a339de14f68014dde00f5d8884995690c00f` |
| Corpus SHA-256 | `56be9bf296f5f8b1eeeb9d195272a0794897bef23d21567cfa82de02277bb823` |
| Envelope | Two Luna Standard Responses calls, $0.020518 maximum reservation, $0.021 global and per-model app caps, zero retries. |

Use the existing launcher with the new source digest and the same corpus digest. The dedicated nonproduction project's Responses write access, current request and token quota, billing headroom, provider spending controls and applicable project/model limits remain unverified. The model metadata endpoint is insufficient evidence for those checks. Only record `EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT` after a genuine current project review. The standing ledger was left intact with $0.20 available and no pending or uncertain reservations. No paid calls were made.

### Final execution gate recheck

**BLOCKED.** The owner reported completing a project review. The provider-free run on source `27a7c02a724a92a8502b41b22b44a339de14f68014dde00f5d8884995690c00f` and the unchanged corpus passed 10/10 with zero provider requests. Reload returned HTTP 200, placed the deferral reply last, and showed the action pending with zero appointments before confirmation.

A separate read-only Luna metadata request returned HTTP 401 using the credential loaded from the ignored local dotenv. The shell had no overriding credential. This probe did not establish the reason for the 401. The execution environment also lacked a current `EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT`. The check requires a usable dedicated-project credential and the actual review time and scope for the same project and key. No provider generation was attempted, no reservation was made, and the standing ledger still has $0.20 available. Demo preparation remains contingent on successful live verification.

### Owner review follow-up and offline demo

The project owner confirmed that a current review cannot yet establish Responses write access, request and token quota, at least $0.020518 in available billing headroom, or applicable project and model spend limits. The owner reported a successful separate model metadata read. This does not change the preceding local HTTP 401 observation or establish generation entitlement. No project-review timestamp was set. No paid run or reservation was initiated.

The private synthetic demo uses a separate loopback launcher, a disposable local MongoDB replica set, and the existing widget, dashboard, and appointment handlers. Two saved Luna responses are replayed as local fixtures. The demo launcher does not load project credentials. See [the offline demo guide](ASTRA_OFFLINE_DEMO.md).
