# ASTRA long-conversation verification

## Root cause

The website widget sends turns to `POST /api/widget/messages`. The handler enqueues each turn and runs the shared durable worker. The worker loads the conversation workflow and stored search result, then rereads current listings before composing a reply. The MongoDB reproduction confirmed that two listings remained available and the first comparison succeeded.

The property-fact resolver matched full titles, ordinals and a cheaper-option phrase. It never considered the neighborhood in “23 Nisan'daki ev.” A separate neighborhood matcher ran later for scheduling and could not supply the property-fact handler. The missing reference meant the fee question could not persist a focus for “o ev.” Two explicit titles also collapsed into the same undefined result as an absent reference, with no route for a turn that only named listings.

The demo's advisory fixture emits `other` for unrecognized prompts. The dispatcher appended a generic capabilities statement for that label even when its verified comparison or clarification had already answered. The property-facts extractor also omitted heating and parking, so the compound question could not address them individually.

## Repair

- `conversation-flow.ts` resolves references against the bounded displayed order using exact or distinctive partial titles, neighborhood, ordinals and unique price comparison. It distinguishes ambiguous and missing references. The scheduling reference lookup uses the same matcher and retains stale entries' ordinal positions without using stale facts.
- `widget-queue.ts` rereads matched records within the organization, applying availability, archival and freshness checks. The read-only route handles newly recognized fact requests before scheduling date and contact processing. It writes property focus alongside the reply in the queue finalization transaction. A comparison leaves focus and displayed order intact. When two names are supplied without a question, the reply names both and asks whether to compare them or examine one. It also identifies the last discussed listing when it is one of the two.
- `property-facts.ts` treats each requested attribute independently. It preserves verified zero fees and negative furnishing values. Heating and parking have no verified structured fields in the current listing model, so both are reported as unverified. A deposit mentioned only in a description is also unverified.
- `receptionist-intent-dispatch.ts` suppresses generic or clarification filler when there is already a substantive response. A request without a safe answer still gets a clarification. The existing injection response remains separate.

## Customer-visible example

| Turn | Before | After |
| --- | --- | --- |
| Comparison | The reported conversation included a generic capabilities statement after the correct calculation. The fallback path was covered with the fixture's `other` label. | “Fiyat önceliğinizse Görükle konumundaki 27.500 TL tutarındaki ilanı öneririm; 23 Nisan konumundaki seçeneğe göre 1.500 TL daha uygun.” |
| 23 Nisan fee and deposit | Reproduced in MongoDB: “Hangi ilanı kastettiğinizi söyler misiniz?” followed by the generic capabilities statement. | “DEMO — Örnek Bahçe Dairesi — aidat: 0 TL.” The demo then marks the deposit unverified. The API regression also covers a description that mentions a deposit without verifying it. |
| Both names | The demo reported a capabilities response. | The answer names both listings, identifies Örnek Bahçe Dairesi as the last discussed property, and asks whether to compare them or discuss one listing's details. |
| “O ev” after reload | The earlier reference failure left the turn without a usable focus or complete attribute coverage. | “DEMO — Örnek Bahçe Dairesi — Kayıtlara göre ilan eşyasız. ısınma tipi bilgisi doğrulanmamış. otopark bilgisi doğrulanmamış.” When neither listing has focus, the bot asks which one. |

## Verification

The new MongoDB 8.0.12 regression sends the Turkish conversation through actual widget session, message and history endpoints. It verifies the 1.500 TL difference, the zero fee, the unknown deposit, reference persistence after reload, and the compound property answer. A similarly named foreign-tenant listing with conflicting facts never appears, and a second visitor cannot read the first history. A fresh conversation with no focus asks for clarification. The first conversation generates no appointment, pending booking action, booking intake, or model invocation. A separate wording of the comparison exercises the dispatcher with an offline `other` fixture.

| Command | Result |
| --- | --- |
| `npm run test:browser -w apps/web` | 20 passed, 0 failed. |
| `MONGOMS_RUNTIME_DOWNLOAD=false npm test` | 192 passed, 0 failed. Includes existing booking, consent, deferral, idempotency and takeover regressions. |
| `MONGOMS_RUNTIME_DOWNLOAD=false npm run eval:deterministic -w apps/api` | 128 scenarios. All fixture contracts passed, with 64 backend checks passed and four intentionally skipped. |
| `node --import tsx astra-offline-demo.mts`, then `node astra-offline-demo-smoke.mjs <private demo login file>` | Chromium passed the full Turkish listing conversation with a real page reload against the local API and MongoDB. A separate widget session passed booking deferral, reload, consent and explicit booking, with the appointment visible in the dashboard. The script observed zero external browser requests. |
| `npm run typecheck`, `npm run build`, `npm run brand:check`, `git diff --check` | Passed. |

The initial expanded browser smoke exceeded the existing ten-message session limit by combining the listing and booking walkthroughs. The passing run exercises both workflows with separate visitor sessions using the active rate limits. The API test uses its own synthetic client IP so unrelated widget tests cannot exhaust its IP allowance.

## Remaining limitations

References are bounded to the displayed results and persisted focus. A partial title needs at least two consecutive title words with a distinctive term. Shared or conflicting matches require clarification. The conversation does not search arbitrary listings to resolve an uncertain reference. Heating and parking remain unverified until supported by authoritative structured listing data. The local demo and all tests here used synthetic data and offline fixtures. Luna behavior was not measured.

## Follow-up — cross-intent consistency

The new MongoDB regression reproduced the first reply with the 32.000 TL listing and repeat budget and furnishing questions. The search was deterministic. The colloquial ceiling did not produce a usable budget and currency, so the query stayed open. Its neighborhood parser expected a joined pair of single-word names, so it missed the two separately accepted clauses, including numeric “23 Nisan.” Its furnishing extractor treated “eşyalı” as a positive preference without accounting for “şart değil.”

The next two failures came from different branches. The detailed recommendation did not qualify for the standalone comparison route. The advisory comparison required exactly two displayed candidates, while the first reply had recorded three. The reference resolver had no exact-price syntax for “29 binlik olan.” A starting focus was therefore insufficient to establish the property for the requested fees.

- `listing-money.ts`, `business-conversation.ts`, and `business-data.ts` carry a visitor-stated monetary ceiling through workflow state into MongoDB. “Kadar” and “en fazla” include the boundary. “Altı” and “altında” exclude it. The Turkish budget forms without a currency in this regression use TRY. The recognized district and accepted neighborhoods constrain the same query. Explicit furnishing flexibility clears the preference and suppresses the repeated question.
- `business-conversation-runtime.ts` records the displayed result set even when a search returns no matches. A corrected boundary can trigger a new search even when the amount stays the same.
- `widget-queue.ts` uses the ordered displayed IDs and fresh tenant-scoped records for comparison and property facts. Two eligible listings can be compared without a provider call. A broader set gets a specific clarification. `customer-listings.ts` describes each property's verified area, location and cost without assigning subjective qualities to the neighborhoods.
- `conversation-flow.ts` resolves exact price references within the current displayed set. A shared price or conflicting reference stays ambiguous. Archived, unavailable, stale or tenant-external records cannot resolve a price. A resolved facts reply persists the new focus without starting booking.

| Turn | Before | After |
| --- | --- | --- |
| Search | Included the 32.000 TL listing and asked again about budget and furnishing. Reproduced before the repair. | Shows Görükle at 27.500 TL and 23 Nisan at 29.000 TL. No repeat questions. |
| Compare | “Karşılaştırmak istediğiniz iki güncel ilanı belirtir misiniz?” | Compares the verified 115 m² and 125 m² areas, identifies the recorded locations, and recommends Örnek Park Dairesi if price is the priority because it is 1.500 TL cheaper. |
| Identify and ask fees | “Hangi ilanı kastettiğinizi söyler misiniz?” | “DEMO — Örnek Bahçe Dairesi (29.000 TL) — aidat: 0 TL. depozito bilgisi kayıtlarda yok ve doğrulanmamış.” |

The test submits the exact three turns through real widget routes and the durable queue with an isolated MongoDB replica set. It reloads history between comparison and the fee question, asserts the displayed count, reply order and independent focus, and then switches focus using “27.500'lük.” Separate conversations verify duplicate price ambiguity, three eligible results, the exact 30.000 TL boundary, and a foreign-tenant listing at the same price. The regression asserts zero model invocations and zero appointments. No live or paid provider requests were made.

The monetary parser handles bounded, recognizable Turkish forms and explicit supported currencies. Other phrasings may still need clarification. A price reference is limited to currently eligible displayed results.

Follow-up verification passed with 193 API tests and 20 browser tests. The deterministic suite covered 128 scenarios, with 64 backend checks passed and four intentionally skipped. Commands were `MONGOMS_RUNTIME_DOWNLOAD=false npm test`, `npm run test:browser -w apps/web`, and `MONGOMS_RUNTIME_DOWNLOAD=false npm run eval:deterministic -w apps/api`. Typechecks, production builds, the brand check and `git diff --check` also passed. The exact new transcript ran as a MongoDB-backed widget API regression. The browser suite separately covered the widget interface and reload behavior.
