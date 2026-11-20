# ASTRA intent dispatcher verification

The starting tree was clean at d55ec119bd5811094e2ae0095150aa4b1968a745. A read-only GitHub lookup returned the same origin/master revision. The verified implementation source manifest is SHA-256 19e977f75943c2f7d0de90ea256a9209651ffa63c00aaa6b2f1db0dd59c73146. It covers Git-listed and non-ignored files in apps, deploy, brand, .github and root build inputs. This report is outside the manifest.

## Root cause and execution flow

The queue parsed the structured response and replaced every valid plan with clarification text. The legacy function-action branches then worked only if they independently recognized the request. A second model intent could disappear even when a validated plan contained it.

The opt-in queue now parses and checks the current evidence, then dispatches supported intents to the existing verified listing formatter, factual response formatter, scoped knowledge reader, preference merge, availability service and existing handoff action. It combines and deduplicates read-only replies, and can recover an omitted secondary request that the current text independently establishes. Unavailable or ambiguous references remain in their original display positions and cannot shift to another listing. Comparison requires two eligible records with comparable currency and transaction type. Contact fields are scoped to the actual request, and a model search label cannot initiate retrieval without a current search request.

Unsupported or uncertain plans return a clarification or describe the supported operations. Invalid schema or evidence follows the existing deterministic fallback. Booking labels cannot create, reschedule, cancel or confirm. The existing pending-action and explicit confirmation paths stay ahead of interpretation. Deferral, complete comparisons and narrowly recognized facts and contact queries can skip inference. Structured provider failures retain the existing classification and accounting with retries disabled. The queue finalizer suppresses stale bot replies and workflow writes when staff take over.

## Changed files

- apps/api/src/services/receptionist-intent-dispatch.ts
- apps/api/src/services/widget-queue.ts
- apps/api/src/services/conversation-flow.ts
- apps/api/test/receptionist.test.ts
- ASTRA_INTENT_DISPATCHER_VERIFICATION.md

## Integrated evidence

The synthetic website conversation used the real widget HTTP routes, MongoDB and shared queue, with an injected deterministic provider. It displayed two listings, compared the prices, returned 0 TL and an unverified deposit for the second listing, preserved both alternative neighborhoods and room layouts without a second search, and provided an email with other fields withheld. The compound furnishing and weekend request produced both a grounded furnishings answer and checked weekend options. The fixture deliberately omitted viewing from the raw model plan.

A verified slot produced a pending action. Deferral left that action and workflow intact, and a widget history reload returned the deferral reply. Fresh explicit text confirmation created one appointment. A duplicate confirmation returned the same appointment. Staff could read the conversation, take over and reply, after which the queue suppressed further bot responses.

| Measurement | Evidence |
| --- | --- |
| Model | Two calls to the fake adapter. Its fact plan carried the correct ordinal and attributes. Its compound plan missed viewing. Neither fixture establishes Luna accuracy. |
| Application | Both plans produced grounded replies. The dispatcher recovered the independently stated viewing request and used scoped staff availability. Only the explicit confirmation path created an appointment. |
| Customer | The widget displayed both compound answers, the deferred state survived reload and one appointment was recorded after confirmation. |
| Efficiency | Two fixture calls and two measured usage records across ten visitor messages. Local timing is test-environment timing. Provider latency and cost were unmeasured. |

A second MongoDB test pushed Telegram-tagged requests through the same queue. It covered cross-tenant, archived and deleted display references, a wrong ordinal with safe deterministic recovery, invalid JSON, a provider 429 with one attempt, takeover during inference, and a generic web assistant retaining the ordinary function path. The existing Telegram webhook, outbox, expiry and idempotency regressions use controlled adapters and made no external delivery.

Historical raw Luna 3/7 and structured semantic 3/6 results were preserved. Application recovery is recorded separately.

## Verification

- 188 API tests and 20 browser tests passed. The API run included real MongoDB replica-set tests for tenant isolation, confirmation expiry, concurrent booking, idempotency and staff takeover.
- 128 deterministic scenarios ran with four intentional backend skips and zero failures. The deterministic cases include contradictory budget, room and furnishing preferences, and stale current-turn evidence is rejected by the intent validator tests.
- Phase 2G Milestone C, Phase 2G replay, and both Luna contract fixture suites passed offline. No provider-backed execution ran.
- API, web and evaluation typechecks, both production builds, brand check and git diff --check passed. Dependency audit reported zero vulnerabilities.

## Remaining limits

The guarded fallback still asks for clarification when the latest utterance cannot independently establish a reference, field or date. It does not persist partial compound preference changes, and multi-property references beyond the scoped display remain unresolved. The adapter stays disabled by default. A small separately authorized fresh-model integrated widget test is justified to measure whether Luna preserves compound requests and references without fixture assistance. It should assert delivered text and booking state as well as raw model quality. This work made zero paid calls.
