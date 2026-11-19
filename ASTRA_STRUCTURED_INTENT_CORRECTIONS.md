# ASTRA structured-intent corrections

The experimental adapter stays opt-in. The production default and explicit confirmation rules are unchanged. This work used the six original Luna responses and offline regressions. The [historical results](ASTRA_STRUCTURED_INTENT_LIVE_RESULTS.md) still record three of six semantically correct and admissible plans. No provider calls ran, and independent review remains required.

| Historical response | Revised contract and offline behavior |
| --- | --- |
| 1. Furnishing question with focused and position 2 | The exact response fails schema validation. Focused, none and unresolved references require null positions. An explicit ordinal carries an integer and still requires current-turn evidence and an in-range displayed position. |
| 2. Furnished and balcony preferences | Both preferences remain distinct. Evaluation accepts equivalent grouped or split preference entries and redundant furnishing detail that agrees with the explicit boolean. Missing or contradictory criteria still fail. |
| 3. Second house’s deposit and fee | The model identifies the requested facts and the ordinal. The revised plan omits its old missing-fact claim. The verified listing handler resolves “İkinci evin” and the widget replies with a 0 TL fee and an unverified deposit. |
| 4. Balat or Kültür, 1+1 or 2+1 | The tentative wording expresses preference alternatives. The opt-in route saves both neighborhoods and both layouts, acknowledges them and offers to search, with zero search actions and zero model calls. An explicit request to retrieve listings can be a separate intent. A model search label alone has no authority. |
| 5. Weekday viewing and phone | Both needs remain representable. Missing scheduling detail remains valid uncertainty. Contact and availability values still come from existing authorized handlers. |
| 6. Tentative yes followed by “kesinleştirmeyelim” | An explicit confirmation deferral now has its own non-authorizing intent. The opt-in widget acknowledges the pause with zero model calls, leaves the action pending, and creates no appointment. A generic unclear viewing plan is rejected for this exact explicit deferral. |

Reference variants use nested anyOf with strict objects and disjoint kind values. The root remains an object, and every branch declares its required fields. Server validation checks current-turn quotations, ordinal evidence and reference scope after schema validation. Property values and fact-availability fields stay out of the intent-only snapshot. Existing tenant-scoped handlers remain authoritative for pricing, known and unknown facts and booking state. [OpenAI Structured Outputs schema support](https://developers.openai.com/api/docs/guides/structured-outputs)

The recorded alternatives case stays a historical routing miss. The revised scorer recognizes equivalent representations of the same preferences while keeping a search intent distinct. No historical metric was recalculated.

## Verification

187 API tests passed, including the MongoDB-backed tenant, booking and safety suites. Eight targeted intent tests and 20 browser tests passed. The deterministic suite completed 128 scenarios with four intentional backend skips. Frozen Phase 2G replay retained its 3/7 raw selection count and 7/7 customer-visible checks on the model turns. API, web and evaluation typechecks, both production builds, brand check and git diff --check passed.

The widget regression inspected persisted state and displayed replies. It verified that deferral leaves the scoped pending appointment unchanged and that the tentative options do not create an additional search. The revised provider schema was checked offline against the documented subset. Live provider acceptance and fresh model behavior remain unverified.

## Integrated synthetic conversation recommendation

Use the real widget and a disposable MongoDB replica set with a fake responder that emits the frozen focused-plus-position plan once, then valid plans. Present two synthetic listings, one with a verified zero fee and an unknown deposit. Ask about furnishing, ask for the second property’s fee and deposit, and submit the tentative alternative preferences. Assert that customer-visible replies preserve the correct property, report 0 TL and the missing deposit separately, and acknowledge the alternative criteria. Then prepare a test viewing, defer it, reload the widget and verify no booking exists. Send a fresh explicit confirmation and verify one booking. Compare reply text, appointment state, search actions and model-call counts.
