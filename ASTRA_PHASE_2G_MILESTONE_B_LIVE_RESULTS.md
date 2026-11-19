# ASTRA Phase 2G Milestone B live results

**PARTIAL.** The single authorized seven-call run completed all seven Luna requests. Three of four conversations passed. The only failing turn concerned the second listing's maintenance fee. Luna selected a preference tool using stale search criteria. The application rejected the proposal but returned an unrelated clarification before its property-fact handler could answer. All eight turns passed the bounded safety checks. The real-estate pilot remains **NO-GO**.

## Admission and execution

The preceding single-call diagnostic completed with valid usage and a measured application entry. Its 1,797 input tokens were charged internally at the registry's conservative input rate because the cache-write breakdown was unavailable. Rounding yielded 450 microdollars for input and 42 for 84 output tokens. The resulting **$0.000492** matched the diagnostic meter and usage ledger.

The ignored local configuration supplied current operator attestations for the dedicated nonproduction project, Luna access and quota, Standard pricing, and provider spending controls. The diagnostic confirmed usable access for that attempt. Provider account limits, project-specific charges and invoice data were outside the local evidence. Review of public Standard pricing and the unchanged conservative registry yielded a $0.010259 maximum per-call estimate and **$0.071813** for seven calls under each **$0.08** application cap. [OpenAI Luna pricing](https://developers.openai.com/api/docs/models/gpt-6-luna) · [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)

The standalone preflight and the automatic preflight inside the launcher each admitted seven simulated decisions across eight queue turns with zero provider requests. One live execution then used synthetic data and Standard Responses with reasoning `none`, a 512-token output cap and synthesis disabled. The runner completed seven usable decisions with zero provider errors, timeouts or retries. Exit status 1 reflected the failed maintenance-fee turn, which had three failing assertions.

## Seven overlapping decisions

The matched comparison uses the same seven customer prompts. Phase 2F also had a live greeting and a full contact question. Phase 2G seeded the earlier contact exchange deterministically. The 2F strict scores remain historical. Re-scoring the frozen 2F decisions under the current tool-selection contract gives 2/7 on the overlapping turns. The fresh 2G decisions scored 3/7 under that contract. This is a descriptive comparison of two small runs with different prompts around the shared requests and different response paths.

| Turn | Phase 2F raw decision | Fresh Phase 2G raw decision | Application outcome and assessment |
| --- | --- | --- | --- |
| A1. Flexible preferences | Correctly extracted both neighborhoods and each room count as its own numeric value. The old application rejected repeated preference fields. | Selected `interpret_business_preferences`. Correctly extracted Görükle and Özlüce, and represented both room counts in a single string, “2 veya 3 oda”. Supplied no budget. The arguments failed the evidence-backed exact-membership check. | Deterministic recovery persisted both neighborhoods and numeric room alternatives with budget open. The scoped OR inventory check passed. The reply acknowledged both alternatives and asked whether the customer intended to rent or buy. Application recovery earned no model credit. |
| B1. Email only | `get_business_knowledge` with topic “contact email”. The app returned email and website. | Same tool and topic. The request's narrow scope was understood and passed semantic argument validation. | The application normalized the topic and rendered only the verified email. The improvement was in application field projection. |
| C1. Compare and recommend | Proposed a fresh `search_listings` using prior filters. | Proposed `get_business_knowledge` with topic “compare listings recommendation”. It recognized the comparison request but gave no comparison or property references in the proposal. | Both runs intercepted the inappropriate tool. The 2G reply recommended the verified 27,000 TRY listing if price mattered and computed the 7,000 TRY difference. This was application output. |
| C2. Second listing's maintenance fee | Proposed generic knowledge for dues and mixed in the earlier comparison. The application still resolved the second listing and disclosed the missing fee. | Proposed `interpret_business_preferences` with six fields copied from the earlier search, including budget, room count and neighborhood. It omitted the second listing and the fee question. | The evidence check rejected the proposal and left the preferences unchanged. The preference branch replied “Hangi tercihi değiştirmek istediğinizi netleştirir misiniz?” and prevented the later property-fact branch from running. The reply and both reference assertions failed. |
| C3. First listing's deposit correction | Recognized the first listing and deposit but proposed generic knowledge. The application corrected it. | Used no tool and answered “İlk ilanın depozito bilgisi doğrulanmış kayıtlarda yer almıyor; bu nedenle tutarı teyit edemiyorum.” It followed the correction and avoided inventing a deposit. | The application independently resolved and persisted the first listing, and rendered the grounded deposit disclosure. Both raw decision and delivered result were relevant. |
| D1. Transit and ownership | Proposed generic knowledge for both subjects. The application returned an unrelated business profile. | Proposed `search_listings` with only `availability: "available"`, without addressing walking time or privacy. | The application discarded the proposal, disclosed the transit information gap, withheld owner identity and asked which listing the customer meant. |
| D2. Furnishing and weekend viewing | Proposed generic knowledge, included both current intents and carried over prior transit and ownership questions. | Proposed generic knowledge with topic “property viewing”. It omitted furnishing and the weekend preference. | The application discarded the proposal and used a single listing clarification that mentioned furnishing and weekend viewing. It gave no slot and made no booking. |

Only C3 returned Luna-authored prose. Its Turkish was clear and somewhat formal. The other six decisions produced tool proposals without free text. Application text was generally relevant and understandable. The comparison repeated the neighborhood phrase, and the deposit response repeated the missing-information point. C2's Turkish sentence was fluent but off-topic. These observations do not substitute for independent review. Reviewer fields remain blank in both private artifacts.

## Results and costs

| Measure | Phase 2F, seven matched calls | Phase 2G, seven fresh calls |
| --- | ---: | ---: |
| Usable provider calls | 7/7 | 7/7 |
| Raw tool selection under the Phase 2G contract | 2/7 | 3/7 |
| Semantic arguments on matching tool choices with arguments | 2/2 | 1/2 |
| Delivered replies passing each run's recorded pattern on matched calls | 4/7 | 6/7 |
| Verified listing-reference replies | 2/2 | 1/2 |
| Provider-reported input / output / reasoning tokens | 12,572 / 365 / 0 | 13,332 / 348 / 0 |
| Benchmark provider latency, min / median / max | 2.448 / 3.806 / 7.424 s | 1.734 / 2.894 / 5.691 s |
| Internal estimated settlement | $0.003330 | $0.003512 |

The old pattern count credited the email-only reply even though it also contained the website. Phase 2G checks that scope explicitly. The Phase 2G raw context indicators passed 2/4 evaluated turns. The program verified persisted property focus on 1/2 required turns, narrow contact scope on 1/1, both compounds on 2/2, and the preference inventory probe on 1/1. Overall delivery passed 7/8 including the deterministic listing setup. Phase 2F's published full-run results remain 3/9 strict selection, 7/10 delivered patterns, and 1/4 conversations.

Phase 2G recorded seven application interventions. One recovered preferences, one normalized a correct tool topic, four suppressed unsuitable proposals, and one replaced valid raw prose with its verified property reply. The working scope and safety checks passed 8/8, with no fixture cross-tenant disclosure, unauthorized transaction, invented slot or unsupported price claim. These checks have finite coverage.

Phase 2G measured input and output usage on all seven decisions. The output ranged from 19 to 138 tokens. Cached input and reasoning were reported as zero. Cache-write classification remained unavailable and the application charged its conservative input estimate. The summed **$0.003512** is an internal estimate. No invoice reconciliation was performed. The prior uncertain incident did not recur and its original cause remains unknown.

## Remaining gap

The current queue enters the model-selected preference interpretation branch before its deterministic property-fact branch. The branch rejects stale evidence correctly, but its early return can turn an otherwise resolvable listing question into a generic clarification. A focused offline regression should replay C2 with the exact fresh proposal and verify that the listing-fact route wins without changing preferences. The same test should cover contact and viewing requests against an unrelated preference proposal. This run alone does not justify deployment or another paid experiment.

[Phase 2F live results](ASTRA_PHASE_2F_MILESTONE_B_LIVE_RESULTS.md) · [Independent review template](ASTRA_PHASE_2G_MILESTONE_B_REVIEW_TEMPLATE.md)

Private run artifacts are stored in a mode-0700 directory with mode-0600 JSON and Markdown files. They retain raw decisions, final replies, latency, usage and blank review fields.
