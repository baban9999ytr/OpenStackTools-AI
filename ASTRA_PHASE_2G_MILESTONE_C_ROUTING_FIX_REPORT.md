# ASTRA Phase 2G Milestone C routing fix

**PASS for the offline scope.** The exact live maintenance-fee failure was reproduced and corrected with the same frozen Luna decision. **Live model quality remains NOT REVERIFIED. Pilot readiness remains NO-GO.**

## Confirmed route failure

The queue reads the current message, the conversation's persisted display order and property focus, and the tenant's current listing rows. It recognizes “aidatı” as a maintenance-fee request and resolves “İkinci ilan” against the second displayed position. Listing facts come from a scoped query that requires the record to be available, recent and unarchived.

The old queue then received Luna's `interpret_business_preferences` proposal. Its six evidence spans referred to earlier search criteria, including location, budget, currency, room count, property type and rental intent. The current-turn check rejected those spans. The preference branch nevertheless finalized a generic clarification and returned before the property-fact handler. Preferences were safe. The customer's request was lost.

## Before and after

| Stage | Before | After |
| --- | --- | --- |
| Customer intent | Recognized the second listing's maintenance fee | Same recognition and scoped display-order resolution |
| Raw Luna recommendation | `interpret_business_preferences` with stale search criteria | Identical frozen proposal |
| Authorized operation | Rejected the proposal and returned from the preference branch | Discarded the unrelated proposal and entered the existing property-fact route |
| Focus and preferences | No second-listing focus recorded. Preferences unchanged. | Persisted the verified second listing as focus. Preferences and their evidence unchanged. |
| Customer reply | “Hangi tercihi değiştirmek istediğinizi netleştirir misiniz?” | “Synthetic flat 34000 — aidat bilgisi kayıtlarda yok ve doğrulanmamış.” |

## Implementation and boundaries

The queue now checks whether the current customer turn can be handled by an existing independent property-fact, contact, or real-estate viewing route before entering business preference interpretation. Those routes use the current utterance and tenant data. The raw recommendation and the chosen application path remain separate in existing diagnostics. Genuine preference processing retains current-utterance evidence validation, deterministic extraction and the existing recovery for multi-location and multi-room intake.

A discarded proposal on a contact turn reaches verified field projection. A viewing turn with no reliable property asks which listing the customer means. A resolved viewing with no date asks for a day and time, preserving an active booking workflow. For a resolved dated viewing, the existing read-only availability path requires a viewing-capable consultant and uses the requested local date and time. The change adds no booking action and leaves confirmation, admission, usage settlement and failure handling in place.

Unresolved ordinals, including uppercase dotted Turkish `İ`, cannot fall back to a different record. An invalid persisted focus cannot silently bind a pronoun to a sole displayed listing. The tenant, freshness, archive and availability filters are unchanged. Stale, deleted, unavailable, archived and foreign identifiers were tested against that boundary.

## Files changed

| Path | Change |
| --- | --- |
| `apps/api/src/services/widget-queue.ts` | Gate business preference interpretation by independent current-turn routing. Preserve property identity and viewing safety during recovery. |
| `apps/api/evals/phase2g-observed-decisions.ts` | Freeze the seven synthetic live decisions and historical outcomes with the original private JSON hash. |
| `apps/api/evals/benchmark-phase2g-cases.ts`, `apps/api/evals/benchmark.ts` | Replay the exact decisions in a provider-free suite and check preference state integrity separately from raw model scores. |
| `apps/api/test/receptionist.test.ts` | Test stale preference proposals against contact and viewing routes and test unavailable and cross-tenant property references. |
| `.github/workflows/ci.yml` | Add the offline Milestone C replay to CI. |

The frozen replay delivered 7/7 relevant replies and 4/4 passing conversations. Raw Luna selection remains 3/7. Luna still misroutes comparison and compound questions and can emit unsupported or insufficiently structured preference arguments. The corrected fallback does not establish better model intelligence. Before a controlled pilot, verify this routing change with independent Turkish review and broader appointment, privacy and operational evidence. A fresh provider comparison requires separate authorization. No paid requests or deployment occurred.

[Milestone C regression evidence](ASTRA_PHASE_2G_MILESTONE_C_REGRESSION_RESULTS.md) · [Historical Phase 2G live results](ASTRA_PHASE_2G_MILESTONE_B_LIVE_RESULTS.md)
