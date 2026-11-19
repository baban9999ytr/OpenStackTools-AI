# Live conversation regression: repeated listing responses

## Confirmed cause

The API listener on port 5000 was a `tsx` process started at 13:55 local time on 2026-11-11, before the synthesis and queue changes were written (the synthesis file was modified at 14:12). A second later `tsx` process existed but did not own the listener. The observed conversation occurred around 14:22 local time and therefore reached the older API process. A read-only inspection of that conversation's MongoDB metadata found three completed `search_listings` actions and three measured usage events, one per turn. No synthesis call existed in the code loaded by the listening process. Historical logs cannot establish a provider success/failure category for a call that was never available; the repeated text came from the deterministic listing formatter after each search.

There was also a real code defect in the newer source: Turkish “İkisinden hangisini önerirsin?” and “Ucuz olanın balkonu var mı?” did not reliably enter the prior-result comparison and attribute paths. A model calling `search_listings` again would have produced a generic list, and a synthesis failure would have fallen back to that list. Deterministic tests for earlier, different follow-ups did not cover this exchange.

## Fix

- The queue now classifies initial search, comparison/recommendation, attribute question, sorting, broadening, changed search, and topic switching. A model-selected repeat `search_listings` cannot force a new search for a clear prior-listing recommendation or attribute question.
- Prior listing IDs are re-read from MongoDB with `organizationId`, available status, nonarchived status, and the existing 30-day freshness rule. The formatter uses those current records and calculates a same-currency price difference. A missing attribute is explicitly unconfirmed. Ambiguous property references ask for clarification.
- Recommendation synthesis receives the original question and bounded verified listing facts. A generic numbered listing dump or unsupported claim is rejected; the fallback is the recommendation, not the initial list. Attribute answers stay deterministic to avoid inventing a feature from prose.
- Every AI request now emits structured, non-content metadata: request/conversation IDs, model-selected action, executed action, follow-up intent, synthesis outcome, fallback reason, model-call count, and token counts. It does not log prompts, messages, customer contact details, authorization headers, or secrets.
- The stale local API listener was stopped and a fresh `tsx` API process started. The new listener returned HTTP 200 from `/health/live`. No provider request was sent during this restart or health check.

## Verified customer-visible examples

These are from deterministic model fixtures backed by an ephemeral MongoDB replica set, not a paid live-provider call.

| Turn | Before in observed widget | After in regression test |
| --- | --- | --- |
| Initial rental search | Two-item stored-listing list | “Bütçenize uygun iki kiralık 3+1 daire buldum: Görükle'de 27.500 TL ve 23 Nisan'da 29.000 TL.” |
| Recommendation | Same two-item list repeated | Recommends the 27.500 TL Görükle option when price is the priority and identifies the verified 1.500 TL difference. The same grounded comparison is used if synthesis is rejected. |
| Cheaper listing's balcony | Same two-item list repeated | States that the cheaper listing's balcony information is unconfirmed in stored details. |

The test deliberately makes the mocked model select `search_listings` on all three turns. Only one search action is persisted per conversation. It runs both accepted synthesis and rejected-synthesis paths, checks the original recommendation question reaches synthesis, verifies provider-token accounting, checks a separate tenant's cheaper listing is excluded, and confirms all three replies differ.

## Verification

Executed from the repository root after the fix:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS, API and web |
| `npm run build` | PASS, API and production web/widget bundles |
| `npm test` | PASS, 47 API tests |
| `npm run test:browser -w apps/web` | PASS, 14 Chromium tests |
| `git diff --check` | PASS |

Read-only local inspection identified the historical three searches and single-call usage records. The new local API process passed `/health/live`. A live OpenAI synthesis conversation was **not** run: no billable provider call was authorized. The current listener is ready for the user to test with their approved local configuration; a mocked test cannot establish live model quality or provider behavior.

## Manual local widget check

1. Confirm the API listener was restarted after these source changes and `http://localhost:5000/health/live` returns 200. Keep the existing Vite web app at `http://localhost:5173`; do not change credentials or demo data.
2. In the dashboard, open the synthetic Nilüfer assistant's **Test assistant** preview and start a fresh widget conversation.
3. Send the exact three Turkish messages from the regression request. The second answer should compare the two current listings, state the verified 1.500 TL difference when price is the priority, and avoid replaying the initial list. The third should say the cheaper listing's balcony is unconfirmed.
4. Check the API's `Widget AI decision` log entries for the conversation ID. The second turn should show `followUpIntent: recommend`, `selectedAction: reuse_listings`, and a synthesis outcome. The third should show `followUpIntent: attribute` and `synthesisOutcome: skipped_attribute_safety`. If synthesis fails or is rejected, `fallbackReason` explains why. Inspect **Usage** for metered calls.

No database was reset or deleted. No credentials, demo fixtures, production infrastructure, commits, or deployments were changed. Remaining limitation: the output guard checks selected factual categories; live-model naturalness and complete free-text grounding still need an authorized provider evaluation.
