# Conversational intelligence refactor

## Professional receptionist extension (2026-11-12)

The earlier synthesis layer improved listing prose but still left appointment replies close to raw action output. A time-only answer or a customer name after a listing viewing request could lose the selected property and date. A generic assent could also be confused with transaction approval. This extension adds a bounded `Conversation.workflow` record to the existing queue rather than creating another conversation engine. It stores the selected listing, requested local date/time, verified slot, staff, configured duration, known visitor name, and current focused question. The workflow is scoped by organization, assistant, visitor, and conversation. Earlier listing IDs are re-read from current tenant listings before use.

For a viewing request that identifies a previously displayed listing and a date, the queue asks for a missing time. A time-only reply performs the backend availability check using the organization's timezone and configured duration. If the assistant requires a name, it asks for that after a verified slot; otherwise it asks whether the offered slot suits the visitor. Supplying a name or accepting the slot stages the existing expiring `create_appointment` action. The booking is still absent until the visitor explicitly confirms that exact pending action. Changed date, time, or listing details invalidate pending appointment actions and their callback tokens; the confirmation transaction still rechecks schedule and occupancy. A topic interruption can run through normal AI retrieval while the bounded workflow remains available for a later time reply.

Assistant owners/admins can now set fallback language, tone, greeting style, emoji usage, whether a name is required for booking, and default appointment duration in the existing settings form. These settings affect runtime prompts or the guided booking path. The mandatory platform rules precede tenant-authored instructions. A narrow, server-side pre-tool guard rejects some clearly operational requests for prohibited activity; it is deliberately conservative and **is not comprehensive moderation**. Stored knowledge and listings remain untrusted data. Telegram sends plain text with basic Markdown markers stripped, avoiding raw `**` in customer replies.

Backend-authored appointment proposals and confirmations now format the verified date in the organization's local timezone, omit internal IDs and UTC strings, strip demo-data prefixes from displayed names, and include staff/listing/duration only when verified. They never imply that a proposal is already booked. A declared visitor window shorter than the configured appointment duration receives a focused clarification without a provider call or booking attempt. The short-window detector currently recognizes explicit start/end clocks and departure language; it is not a general natural-language interval parser.

### Verification and evaluation scope

`apps/api/evals/receptionist-quality.ts` inventories 25 synthetic EN/TR scenarios with an explicit deterministic, integration, or live-model gate. Its companion test checks the dataset and representative deterministic cases. The MongoDB-backed Telegram test exercises a listing search, property/date selection, interruption, time-only availability, name collection, staged proposal, explicit text confirmation, persisted booking, stale-proposal invalidation, and a tenant-authored safety-override attempt. Browser tests verify assistant configuration persistence, widget confirmation, theme, and mobile navigation. These are fixture-backed checks; they do not establish real-provider conversational quality.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS, API and web |
| `npm test` | PASS, 57 API tests |
| `npm run test:browser -w apps/web` | PASS, 15 Chromium tests |
| `npm run build` | PASS, API and web/widget production bundles |
| `npm run brand:check` | PASS |
| `npm audit --omit=dev --audit-level=moderate` | PASS, zero production dependency findings |
| `npm audit --audit-level=moderate` | PASS, zero findings across installed dependencies |
| `git diff --check` | PASS |

No live Telegram message, real appointment mutation, paid model request, deployment, or remote push was made in this work. The isolated tests use synthetic identities and an ephemeral MongoDB replica set. They do not prove that GPT-6 Luna follows the new personality prompts, that all languages are natural, or that the guard catches every harmful request. Subjective naturalness, broad safety, complex rescheduling language, and live provider latency need controlled evaluation before a customer pilot.

### Safe manual Telegram check

Use a test bot bound to a synthetic tenant, synthetic listings and consultant schedule, and a fresh test conversation. Confirm that a listing request followed by “İlkini yarın görmek istiyorum”, a time-only answer, and an optional name produces one focused question at a time. Check the proposed local date, staff, duration, and listing against the dashboard. Send a neutral topic interruption and return to the booking. Verify that a bare “olur” does not book the appointment, that changing the date invalidates the old proposal, and that an explicit confirmation creates exactly one synthetic booking visible in the dashboard. Inspect usage and action history; do not use real customer data or production credentials. This procedure is **not yet executed**.

## Root cause and architecture

The widget queue previously treated the deterministic `actionReply` for `search_listings` and `get_business_knowledge` as the final customer answer. That protected factual data but presented records as lists and often repeated fields. Prior retrieval messages were excluded from model history for prompt-injection safety, so follow-up references also depended on a narrow prior-result formatter.

The API now separates tool choice, backend retrieval, and customer wording. The first model call may select one of the existing fixed tools. The backend validates its arguments and performs tenant-scoped retrieval. For an eligible nonempty read-only result, it builds a selected-field JSON fact set of at most 6 KB. A second, tool-free model call can write a reply in the visitor's language using those facts, the assistant's instructions, response-length setting, and at most 12 recent non-retrieval turns. There is no model/tool loop. Output checks reject selected unsupported claims and technical text; the precomputed deterministic reply is used if synthesis is skipped, fails, or is rejected. Empty results, transactional actions, and appointment outcomes stay backend-authored.

Recent tenant-scoped search results also provide up to ten IDs, prices, and validated filters as bounded reference context. The queue can reuse a prior result to sort or resolve “the cheaper one,” conduct a fresh search for changed filters, and return to an earlier nonempty search after a no-match search. Raw retrieval replies remain excluded from subsequent model history. Text that resembles instructions in retrieved records prevents a synthesis call.

## Accuracy, safety, and cost

- The backend controls database access, tenant predicates, action validation, appointment confirmation, and consent. Model prose never confirms a transaction by itself.
- A synthesis reply is checked for unsupported monetary amounts, room counts, URLs, selected property features, transaction-status claims, technical strings, language mismatch, and requested sort order. The checks are useful but **do not prove arbitrary free-text factuality**. In particular, a fluent invented address, staff identity, policy, or availability claim may escape the current guard. That remains a pilot blocker requiring live evaluation and stronger structured attribution.
- Before the first provider call, the queue reserves a conservative maximum for **both** calls against the organization's daily and monthly budgets. After a successful second call, provider-reported token counts from both calls are combined in the usage event, including when the second reply is rejected by the output guard. A definitive synthesis rejection falls back and settles the known first-call usage. An uncertain timeout falls back and charges the full reservation internally for reconciliation. No SDK retries or paid calls were used in this work.
- The fallback uses verified stored records and localized formatting. It distinguishes missing data from provider failure; it never reports a failed booking or other transaction as complete.

## Example customer replies

These are deterministic test-fixture outputs, not evidence of live model quality.

| Request | Before | After with a mocked synthesis reply |
| --- | --- | --- |
| Turkish rental search | Numbered record list with `27.500 TL`, `29.000 TL`, and repeated fields | “Bütçenize uygun iki kiralık 3+1 daire buldum: Görükle'de 27.500 TL ve 23 Nisan'da 29.000 TL. Hangisini incelemek istersiniz?” |
| Detailed services | Dump of profile, services, staff and other records | “Kiralık konut danışmanlığıyla kayıtlı evleri gösteriyor ve görüşme saatlerini kontrol ediyoruz. Satılık konut danışmanlığında da portföyümüzü tanıtıyoruz; doğrulanmış bir ücret belirtilmemiş.” |
| Cheapest first | Repeated full listing list | “En ucuz seçenek Görükle'deki 27.500 TL'lik daire; ardından 23 Nisan'daki 29.000 TL'lik daire geliyor. Hangisini incelemek istersiniz?” |
| Missing balcony data | Potentially invented feature | “The balcony is not confirmed in this listing's stored details.” (deterministic fallback after a mocked false claim) |

The earlier regression report documents the preceding deterministic formatter and its historical test run. This report describes the current synthesis layer.

## Changed files

- `apps/api/src/services/ai.ts`: optional tool-free synthesis call and provider usage parsing.
- `apps/api/src/services/synthesis.ts`: bounded verified-fact projection, output checks, usage combination.
- `apps/api/src/services/widget-queue.ts`: two-call budget reservation, fallback, accounting, and prior-search context.
- `apps/api/src/services/customer-listings.ts`: safe follow-up references and deterministic customer fallback.
- `apps/api/test/receptionist.test.ts`: real MongoDB-backed flow with deterministic provider fixtures, including English/Turkish synthesis, budget, usage, prior references, injection, timeout, and appointment regressions.
- `docs/ARCHITECTURE.md`, `docs/SECURITY_REVIEW.md`, `README.md`, and `CONVERSATION_QUALITY_REGRESSION_REPORT.md`: current behavior and limitations.

This working tree also contains earlier, uncommitted conversation-demo and widget fixes. They were preserved. No demo data was overwritten or database reset.

## Verification

Executed locally from the repository root on 2026-11-11:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS, API and web |
| `npm run build` | PASS, API and production web/widget bundles |
| `npm test` | PASS, 46 API tests, 0 failures |
| `npm run test:browser -w apps/web` | PASS, 14 Chromium tests, 0 failures |
| `git diff --check` | PASS |

The API tests use an ephemeral MongoDB replica set and deterministic model fixtures. They establish backend behavior and customer-visible output under those fixtures, **not** live GPT-6 Luna tool choice, naturalness, latency, or factuality. No real OpenAI call was made. Browser tests exercise widget and dashboard behavior with mocked HTTP responses; they do not evaluate live provider text.

## Manual demo check

1. Start the existing local MongoDB replica set, API, and web app as documented in `README.md`; restart the API process to load this change. Use only the existing synthetic demo organization and its approved local configuration.
2. Sign in at `http://localhost:5173/app`, select the synthetic demo assistant, and use **Test assistant**. The assistant's allowed origins must include `http://localhost:5173`.
3. In the preview widget, ask the five Turkish requests listed in the task: introduction, Nilüfer 3+1 rental under 30.000 TL, detailed services, cheapest-first sort, and other Nilüfer neighborhoods. Then ask “What about the cheaper one?”, “Does it have a balcony?”, “Actually, I want to buy.”, and “Back to those apartments.”
4. Check that listed prices and locations match the synthetic records in **Business**, that an absent balcony is reported as unconfirmed, and that **Conversations** and **Usage** record the turns. Check that no appointment is changed without the widget's explicit confirmation.
5. A live synthesis check requires separately approved provider credentials and spending allowance. Do not interpret a locally mocked reply or configured model name as a successful live-model test.

## Remaining limitations

- The two-call path increases latency and potential cost for eligible retrievals. A single provider tool-call continuation could reduce both, but would require a separate bounded continuation design and accounting review.
- Output checks are selective. They cannot certify semantic grounding of every sentence, translation, address, staff name, policy, or availability statement. High-stakes business claims still need human review and further attribution work.
- Conversation references depend on bounded recent turns and a single prior nonempty search; long or ambiguous histories may need clarification. Location remains free text.
- Live model behavior, provider-reported usage, and real provider failures remain unverified without an authorized billable test.
