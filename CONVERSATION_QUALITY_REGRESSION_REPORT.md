# Conversation quality regression fixes

## Root causes and changes

1. `services/agent-actions.ts:actionReply` treated `search_listings` results as a finished answer and printed database-like fields. `services/customer-listings.ts:formatListingReply` now renders verified title, location, price, room count and rental/sale status in the visitor's language. TRY uses localized numeric formatting. It never prints raw listing types or timestamps, and it distinguishes zero matches from an action or provider failure. Short limits the number displayed and offers the rest; Detailed includes verified area and public URL when stored.
2. `services/widget-queue.ts:processWidgetRequest` excludes retrieval messages from model history to keep untrusted listing text out of later prompts. The queue supplies at most ten prior listing IDs and numeric prices plus validated search criteria as bounded context. Sorting and named or ordinal references use the previous tenant-scoped `AgentAction.result` directly. A request for other neighborhoods executes a new validated search and compares IDs. A later conversational architecture change added one bounded, separately metered model synthesis call for eligible read-only results; see `CONVERSATIONAL_INTELLIGENCE_REPORT.md` for current behavior.
3. `services/business-data.ts:retrieveKnowledge` used literal topic matching, so an English topic such as `services` could miss Turkish records. It now routes common EN/TR intents to profile, services, contact, hours, policies and FAQ fields. The widget passes the current visitor question as the bounded topic and infers the reply language from the current turn. The `actionReply` introduction includes the assistant name when verified profile data exists. Unknown topics retain a missing-information response.

## Deterministic conversation evidence

The API test uses a real ephemeral MongoDB replica set, the two fictional Nilüfer listings, seeded-style Turkish services and a deterministic model fixture. The visitor starts with an English widget locale and asks the five requested Turkish turns.

| Turn | Before | After verified in the API test |
| --- | --- | --- |
| Introduction | Model greeting only | Turkish greeting; verified profile available through the business tool |
| Rental 3+1 search | `Matching stored listings`, `27500 TRY`, `rent`, update dates | `Güncel uygun ilanlar` with `27.500 TL`, `29.000 TL`, `3+1`, `kiralık` and stored locations |
| Detailed services | English “couldn't find verified business information” | Both verified Turkish rental and sale service descriptions appear |
| Cheapest first | Repeated the raw result order | `Önceki uygun ilanları fiyatlarına göre ucuzdan pahalıya sıraladım` with 27.500 TL before 29.000 TL; no new search action |
| Other Nilüfer neighborhoods | Repeated the same raw list | `...ek bir seçenek bulamadım`; a fresh scoped search confirms no additional listing IDs |

The test also checks five persisted assistant messages, two actual search actions, and five metered provider responses. Separate regressions cover English price formatting, Short/Detailed fields, named listing references, changed budget and room count, no matches, cross-tenant queries, budget limits, booking confirmation and provider failures.

## Verification

- `npm test`: 44 API tests passed, including the five-turn customer-visible conversation.
- `npm run test:browser -w apps/web`: 14 Chromium tests passed.
- `npm run typecheck` and `npm run build`: passed.
- No paid OpenAI call, database reset, credential change, commit or deployment occurred.

## Remaining limitations

- The deterministic fixture proves backend selection, formatting, persistence and accounting. Live GPT-6 Luna tool selection, language choice and free-text accuracy still require an authorized provider test.
- The prior-result context contains bounded IDs and numeric values. It omits untrusted listing descriptions and raw tool output, so nuanced references may still require a fresh validated search.
- Geographic hierarchy is still free text. The backend handles the tested Nilüfer expansion and compares result IDs, but other regional phrases may need clarification or a structured location schema.
- The knowledge formatter uses verified stored wording. It does not translate a business's English source text into Turkish without a model pass.
