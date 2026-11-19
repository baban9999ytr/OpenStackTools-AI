# ASTRA Phase 2G regression results

## Recorded-decision replay

The replay exercised the durable request worker and a disposable MongoDB replica set. It supplied nine recorded Luna decisions at the existing responder boundary. Ten turns include the deterministic search that seeded the listing comparison. The original live run and the offline replay use distinct scoring contracts.

| Measurement | Phase 2F live | Phase 2G offline replay |
| --- | ---: | ---: |
| Provider calls | 9 | 0 |
| Replayed provider decisions | — | 9 |
| Scenarios passing the respective harness | 1/4 | 4/4 |
| Delivered reply patterns | 7/10 | 10/10 |
| Hard safety checks | 10/10 | 10/10 |
| Listing reference checks | 2/2 | 2/2 |
| Raw selection under the original strict contract | 3/9 | Historical score retained |
| Raw selection under the new contract | — | 4/9 |
| Exact raw argument matching | 0/2 | Historical score retained |
| Semantic arguments on selected and scored calls | — | 3/3 |
| Contact field-precision checks | Not measured | 2/2 |

The new raw contract credits the original preference interpretation choice because it supplied valid evidence for both alternatives. The two contact paraphrases pass after strict schema validation. The model's five remaining proposals still fail selection under the new contract, regardless of the application response. The four passing scenarios measure application behavior under replay. Human ratings remain blank.

| Scenario | Historical application behavior | Offline result with the same recorded decisions |
| --- | --- | --- |
| Turkish clarification | Rejected the flexible preferences and asked what to change. | Stored both neighborhoods and rooms, kept budget unknown and asked whether the visitor wants to rent or buy. |
| Bilingual contact | Repeated the website alongside the requested email. | Returned both verified fields on the first request and only the email on its repeat. |
| Verified listing references | The application supplied correct comparison and reference replies despite unsuitable proposals. | Preserved both focused references, compared verified 27,000 and 34,000 TRY prices and disclosed missing fees. The deposit correction omitted the earlier maintenance fee. |
| Unknown facts and viewing | Executed generic business lookups and missed the customer's requests. | Disclosed the transit verification limit, withheld owner identity, and asked which listing was meant before a furnishing or weekend availability check. |

## Performance and cost

A serial replay with the Standard output profile made four MongoDB listing `find` operations across ten turns. Three of those reads refreshed the displayed records for comparison and attribute follow-ups. One seeded the search. The worker batches focus and displayed listing refreshes into one scoped read, so property attributes need no separate collection lookup. The missing-listing branch made no listing read. An accepted known-listing weekend check can read up to two staff schedules across two local dates, with a three-slot result limit.

Local queue latency was **36 ms minimum, 54 ms median, 131 ms maximum**. The conservative input bounds for the nine replayed calls ranged from **19,952 to 23,828 tokens**, below the 40,000-token historical cap. The summed request-specific upper-bound reservation was **$0.050418**. The fixtures provided fixed usage and incurred **$0** in provider charges. The latency excludes any network/model processing and the token bounds are reservation estimates. The business-contact, property-fact and known-listing weekend paths added no model calls. Retained listing context is capped at ten IDs and prices. Property facts are rendered without adding raw listing descriptions or retrieved prose to future decision context.

## Executed verification

| Command | Result |
| --- | --- |
| `npm test` | 120 API tests passed; 0 failed or skipped. Includes isolated MongoDB integration and existing tenant, budget, confirmation and handoff regressions. |
| `npm run test:browser -w apps/web` | 17/17 passed. Fixed the model-settings test to wait for the save to finish before reopening the form. |
| `npm run eval:deterministic -w apps/api` | 128 total scenarios. The base set passed 68/68, with 64 executed backend checks and four intentional skips. Continuity passed 24/24 and business-state checks passed 36/36. |
| `npm run eval:benchmark -w apps/api` | 60/60 comparison turns across 15 scenario/model pairs. |
| `npm run eval:benchmark -w apps/api -- --suite=luna-smoke` | 9/9 offline turns. |
| `npm run eval:benchmark -w apps/api -- --suite=conversation-quality` | 80/80 offline turns across 15 scenarios. |
| `npm run eval:benchmark -w apps/api -- --suite=luna-quality` | 10/10 fixture turns across four scenarios. |
| `EVAL_OUTPUT_PROFILE=standard npm run eval:benchmark -w apps/api -- --suite=phase2g-replay` | 10/10 turns across four scenarios. Nine frozen model decisions. |
| `npm run eval:live -w apps/api -- --suite=phase2g-replay` | Expected rejection at the offline-only gate. Zero provider calls. |
| `npm run typecheck`, `npm run eval:typecheck -w apps/api`, `npm run build` | Passed. |
| `npm run brand:check`, `git diff --check`, `actionlint` | Passed. |
| `npm audit --audit-level=moderate` | 0 vulnerabilities reported. |

The focused API tests exercised scoped business contact, unknown contact, exact OR filtering, preference replacement and removal, hidden-tenant rejection, verified zero-valued fees, reference persistence through unrelated turns, and viewing constrained to real weekend openings with no appointment created. The replay keeps historical fixture errors visible while testing new application expectations. Provider entitlement, fresh Luna decision quality and a production pilot were outside this offline verification.

[Tool intelligence report](ASTRA_PHASE_2G_TOOL_INTELLIGENCE_REPORT.md) · [Proposed live verification](ASTRA_PHASE_2G_LIVE_VERIFICATION_PLAN.md)
