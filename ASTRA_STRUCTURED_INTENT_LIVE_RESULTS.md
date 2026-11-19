# ASTRA structured-intent live results

**PARTIAL. Six of six Luna calls completed. Three of six plans were fully correct semantically and admissible. Keep the adapter opt-in. Pilot NO-GO.**

The fixed candidate used base commit 0c23578e49af837243f6909611303e266d85de88 and source manifest SHA-256 a6622c37a1de43e0824c9d406d2d1d4ea4dc80f5938939e3136a7f2c7098aa2e. The fixture and label digest was 532b7478a134e4b11d61c43113eccc2a93fb51da805cf2d7eda11e7c672243aa. Changes were restricted to the launcher, evaluation runner and moving the existing fixtures into shared evaluation input. The application adapter and its disabled-by-default configuration were preserved.

Both the standalone and launcher preflight admitted six calls with zero provider requests. The six actual fixture bounds totaled $0.022720 in reservations. The approved worst-case envelope remained $0.004259 per call and $0.025554 total, within the $0.03 global and per-model caps. Earlier approval flags were rejected. The dedicated credential returned HTTP 200 on Luna metadata. Dedicated project, quota and spending controls were verified by operator attestations. The operator's same-day credit confirmation covered the higher $0.143626 envelope for the preceding A/B run, which settled at $0.007984 internally. Direct provider billing and invoice settlement were outside this evidence. [OpenAI Luna model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)

## Six fresh decisions

All six outputs satisfied the JSON schema. The server's separate reference and current-evidence validator admitted five. The semantic column is an engineering review of the raw plan against the frozen input and the expected behavior. Independent human scores are blank.

| Prompt | Raw model decision | Server validation and semantic review |
| --- | --- | --- |
| 1. “Eşyalı mı?” | Property question about furnishing. Marked the fact missing. Emitted a focused reference and position 2 together. | **Partial, rejected.** Understood the question and selected the intended context conceptually. A focused reference requires a null position, so the combined reference was unusable. |
| 2. Furnished and balcony preference | Two preference entries covering furnishing and balcony. | **Correct, accepted.** Kept both preferences. The exact fixture metric marked compound detail false because Luna explicitly included the furnished attribute alongside the correct true furnishing value. That redundant attribute did not change the meaning. |
| 3. Second property’s deposit and fee | A property question about position 2 with both attributes and a missing-fact signal. | **Correct, accepted.** Preserved the explicit ordinal and asked facts. The snapshot has a verified zero fee and an unknown deposit. The plan made no claim about either amount. |
| 4. Balat or Kültür, 1+1 or 2+1 | A listing-search intent in preference mode with both location and room alternatives. | **Partial, accepted.** All four alternatives survived. The frozen intent was to express flexible criteria. The search label could initiate an action if a future consumer trusted it. This adapter grants no such authority. |
| 5. Weekday viewing and business phone | Separate viewing and contact intents, with a missing-time signal. | **Correct, accepted.** Preserved both asks and left timing open. No slot or business contact value was asserted. |
| 6. “Olur gibi ama kesinleştirmeyelim.” | Unclear viewing intent with uncertainty and missing time. | **Partial, accepted.** Did not propose a booking and conveyed uncertainty. It categorized a clear request to defer confirmation as viewing and did not explicitly represent the deferment. |

The strict scorer measured **3/6 intent**, **3/5 validated question-versus-preference**, **1/2 reference**, and **1/3 exact compound detail**. Reading raw mode separately, all **5/5 applicable turns** distinguished questions from preferences. Raw property attributes were preserved on **3/3 applicable turns**, with **2/3** of those plans passing server validation. The model mentioned both requested components on **3/3 compound turns**. Two compound turns were fully correct in semantic review. No plan asserted an unsupported price or slot, exposed a private fact, or authorized a transaction.

The run was advisory-only. It executed zero application actions, applied zero application corrections, and delivered zero customer-visible replies. The generic clarification shown in the private transcript is a preview of server-owned text. Zero-call comparisons did not enter any model-accuracy denominator.

## Usage and decision

| Measure | Actual |
| --- | ---: |
| Completed and attempted | 6 / 6 |
| Input / output / reasoning tokens | 2,858 / 576 / 0 |
| Reported cached input tokens | 0 |
| Provider latency, min / median / max | 2.214 / 3.070 / 4.874 s |
| Internal estimated settlement | $0.001007 |
| Provider errors, retries, safety violations | 0 / 0 / 0 |

Cache-write detail was unavailable. The internal estimate used conservative settlement for that breakdown. Per-call estimates were $0.000168, $0.000174, $0.000176, $0.000162, $0.000175 and $0.000152. They reconciled to the internal meter. Evaluation typecheck and five targeted offline tests passed. The one live invocation exited successfully and made no additional inference requests.

The result supports structured output as a viable advisory interface and exposes reference and intent errors that make it unsuitable as the default today. **Single next action: make focused and ordinal references mutually exclusive in the provider schema and add the exact rejected plan as an offline regression.** Six prompts establish no production-readiness claim.

[Private JSON evidence](/tmp/astra-luna-cXzySK/luna.json) · [Private review transcript](/tmp/astra-luna-cXzySK/luna.md)

Independent reviewer ____________________
