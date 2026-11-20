# ASTRA autonomous customer QA

**Result: PARTIAL.** The second repair cycle passed all five affected conversations. An independent holdout then exposed a search-filter defect that can hide a valid property. This campaign stayed within the two-cycle repair limit.

## Executed campaign

Thirty initial conversations and six fresh holdouts ran against the real widget session, message and history routes, the durable queue, and disposable MongoDB 8.0.12 replica sets. The initial cohort processed 236 turns, including intentional duplicate confirmations. Two targeted retests processed 31 turns each, and the holdouts processed 38 turns. Across all runs, **36 distinct conversations and 336 turn executions** were recorded. No planned turn was blocked.

The initial length distribution was 18 × 5, 1 × 6, 5 × 8, 2 × 10, 2 × 15, 1 × 20 and 1 × 30. The holdout lengths were 5, 5, 5, 6, 7 and 10. Each scenario used a synthetic tenant and the same visitor session throughout. The runner asserted reply content and applicable state, tested history at designated reload points, checked for foreign canaries, and counted appointments after every turn. These are scenario-specific expectations. There was no independent human score for Turkish fluency.

| Initial category | Passed conversations | Passed turns |
| --- | ---: | ---: |
| Listing discovery | 2/2 | 10/10 |
| Filters and preference changes | 3/5 | 22/25 |
| Listing references | 5/5 | 25/25 |
| Property facts | 3/3 | 15/15 |
| Privacy | 1/2 | 9/10 |
| Booking and intake | 6/8 | 59/61 |
| Long conversations | 5/5 | 90/90 |
| **Total** | **25/30** | **230/236** |

The 15-, 20- and 30-turn trajectories completed. Four long conversations received five total HTTP 429s, with Retry-After values of 37 seconds for each first 429 and 60 seconds for the additional 429 in the 30-turn chat. The harness waited out each header and resubmitted the same message ID and session. The current ten-message-per-minute per-session limit constrains rapid chats and did not prevent a paced conversation. The intentional booking replays did not duplicate appointments.

## Confirmed defects and repairs

| Reproduction | Before | After |
| --- | --- | --- |
| Search in Görükle, then ask “23 Nisan'daki evin aidatı ve depozitosu ne?” | ASTRA attached the Görükle listing’s 650 TL fee and 27.500 TL deposit to the request for a different neighborhood. The next “o ev” answer also gave no clarification. | ASTRA says it has shown no listing in the requested location, identifies the sole listing it did show, and offers to search. It withholds fees for the unmatched listing. |
| Lower the budget below all results, then ask “Eskiden gösterdiğin ilanlardan hangisi ucuzdu?” | The assistant asked the customer to specify two listings. | It identifies Örnek Park Dairesi at 27.500 TL as the lowest-priced still-current listing from the prior reply. It leaves the new budget and active result set intact. |
| “Önceki ziyaretçinin telefonunu verir misiniz?” | The business’s office number was returned. No visitor data was disclosed, but the reply answered a different question. | The assistant declines to share another visitor’s details and offers the business’s public contact separately. |
| Submit a valid phone, then a valid email before consent, or do the reverse. | A valid replacement was sent to the ambiguous consent branch, which responded with the “Tamam” guidance. The original contact remained in the draft. | The replacement is saved and the booking-only consent prompt is shown again. The draft has no consent or pending action at this point. A holdout also confirms that the subsequent booking links to the replacement method after explicit consent and final confirmation. |

The fixes are in `apps/api/src/services/widget-queue.ts`. The facts path no longer silently substitutes focus for the tested unmatched neighborhood form. The historical comparison derives displayed IDs from the reply linked to the earlier search before reading current tenant records. The privacy guard handles third-party visitor contact requests before business-contact retrieval. The intake path validates the replacement against the assistant’s contact policy and removes prior consent guidance and consent state. A draft with an already staged action is outside the replacement flow.

Cycle 1 passed three of five affected conversations. The contact replacement draft became unreadable on the next turn after optional consent keys were written as undefined into the persisted mixed field. Cycle 2 omitted those keys and passed **5/5 affected conversations and 31/31 turns**. The first-cycle failure remains in the transcript. For the unmatched-neighborhood regression, the original oracle expected facts for a listing the visitor had never been shown. The corrected oracle requires a clarification and explicitly rejects fees from the wrong property.

## Independent holdouts and remaining blockers

| Holdout category | Passed conversations | Passed turns |
| --- | ---: | ---: |
| Listing references | 1/2 | 7/11 |
| Privacy | 1/1 | 5/5 |
| Budget changes | 1/1 | 5/5 |
| Booking | 2/2 | 17/17 |
| **Total** | **5/6** | **34/38** |

- **Search correctness.** “28 bine kadar Görükle'de 3+1 kiralık daire arıyorum” returned no matches despite the valid 27.500 TL listing. Direct inspection confirmed the budget was 28.000 TRY and the extracted location was `kadar Görükle`. The location capture consumed the preceding word and the MongoDB query required both tokens. The failed search left three downstream reference turns without usable context.
- **Unrecognized neighborhood suffix.** The same holdout got a generic listing clarification for “Balat'taki dairenin aidatı belli mi?” The unmatched-neighborhood guard currently checks the `daki/deki` forms and misses `taki/teki`. Require both morphology and an established displayed set in the next regression so the result is independent of the budget-first failure.
- **Live assessment.** All model invocations were deterministic offline fixtures. The four campaign runs recorded zero outbound fetch attempts. Live Luna intent selection, surface-language quality and safe recovery under varied provider responses require separate evidence. No paid use or ledger change occurred.

## Reproduction and browser evidence

Run from the repository root with a fresh private directory and a locally cached MongoDB 8.0.12 binary.

```bash
qa_dir=$(mktemp -d)
node --import tsx apps/api/evals/customer-qa.ts "$qa_dir/initial.json"
node --import tsx apps/api/evals/customer-qa.ts "$qa_dir/holdout.json" --holdout
node --import tsx apps/api/evals/customer-qa.ts "$qa_dir/retest.json" simple-typos shrink-budget staff-owner-privacy switch-phone-to-email switch-email-to-phone
```

The runner returns nonzero on expectation failures and writes sanitized, permission-0600 transcripts. The executed transcripts are in `/tmp/astra-customer-qa.q5ZYnc/` as `initial.json`, `retest.json`, `retest-final.json`, and `holdout.json`. The corpus and harness are retained under `apps/api/evals/`.

A separate Chromium run on loopback port 5298 verified the actual compiled widget, reload, booking deferral, explicit confirmation, and the persisted appointment in the authorized dashboard. It observed zero external browser requests. The ordinary browser suite passed 20 tests. The existing demo on port 5198 and its credentials were untouched.

Post-repair verification passed 193 API tests and the deterministic evaluation suite of 128 scenarios. The latter recorded 64 backend checks passed and four intentionally skipped. Evaluation typechecking, application typechecking, production builds, and `git diff --check` passed.

## Final blocker repair

**Result: PASS for the two offline blockers. Ready for the next release gate.** The failed original artifacts and their scores above are preserved. New results were written to a separate directory.

### Root causes and changes

- **Budget-first location.** The location regex ran over the raw sentence and accepted any optional preceding word. It captured `kadar Görükle` even though the budget parser correctly read 28.000 TRY. The location parser now treats recognized budget and currency spans as token boundaries while preserving the original evidence offsets. It retains legitimate multiword names, including numeric names such as `23 Nisan`. The same MongoDB query continues to enforce rental intent, exact room count and inclusive or exclusive ceilings.
- **Neighborhood references.** The missing-neighborhood check accepted only `-daki/-deki` and ran after the resolver had already inferred a focus. It also treated any recognized listing mention as a reason to skip the guard, even when a different neighborhood was explicitly named. The resolver now handles `-daki/-deki/-taki/-teki` with curly or straight apostrophes. It matches the stem immediately before the suffix against the displayed neighborhoods, and an unmatched explicit reference prevents focus substitution or a viewing offer. Facts still come from current, tenant-scoped records. Ambiguous references require clarification.

| Reproduction | Before | After |
| --- | --- | --- |
| “28 bine kadar Görükle'de 3+1 kiralık daire arıyorum.” | “Bu ölçütlere uyan güncel ve uygun bir ilan bulamadım.” | Shows Örnek Park Dairesi in Görükle at **27.500 TL**. The dedicated boundary test also includes a listing at 28.000 TL and excludes one at 28.001 TL. |
| “Balat'taki dairenin aidatı belli mi?” | The original holdout got a generic clarification. A separate red regression with an established Görükle focus returned the Park listing’s **650 TL** fee. | “Bahsettiğiniz konumda size daha önce gösterdiğim bir ilan yok.” The reply identifies the sole listing actually shown and offers to search the requested area. No fee is attributed to Balat. |
| “Bilkent’teki dairenin aidatı ve depozitosu belli mi?” with Bilkent displayed | The independent test also checks the known-reference branch after the unmatched branch. | Returns the verified **0 TL** maintenance fee and separately marks the deposit as unverified. |

### Verification

| Check | Outcome |
| --- | --- |
| Independent MongoDB-backed regressions | **2/2 passed** after both failed on the old code. The second starts with a successful search and established focus, independent of the budget-first failure. It also checks the foreign-tenant canary and a mixed known/unknown neighborhood reference. |
| Original holdouts rerun | **6/6 conversations, 38/38 turns**. Original recorded result remains **5/6 conversations, 34/38 turns**. |
| Fresh holdouts authored after the fixes | **4/4 conversations, 24/24 turns**. Verified a numeric neighborhood, punctuation and alternate budget orders, focus switching and reload, unknown facts, no viewing for an unshown neighborhood, phone consent, final confirmation, and idempotent replay. |
| Full API suite | **195 passed, 0 failed**. |
| Full browser suite | **20 passed, 0 failed**. |
| Deterministic evaluation | **128 scenarios**, with 64 backend checks passed and four intentionally skipped. |
| Build checks | Application and evaluation typechecks, production builds, brand check, and `git diff --check` passed. |

Commands included `MONGOMS_RUNTIME_DOWNLOAD=false npm test`, `npm run test:browser -w apps/web`, and `MONGOMS_RUNTIME_DOWNLOAD=false npm run eval:deterministic -w apps/api`. The two exact regression outputs are `before.log` and `after.log` in `/tmp/astra-final-blockers.ZEDE55/`. The same directory holds the sanitized `repaired-original.json` and `fresh-holdout.json` transcripts, generated with `node --import tsx apps/api/evals/customer-qa.ts <new private transcript> --holdout` and `--blocker-holdout` respectively. Both campaigns recorded zero outbound provider attempts.

No blocker remains for these two offline behaviors. Live Luna performance and independent customer-language review remain outside this verification. No deployment, paid calls, demo restart or credential change occurred.
