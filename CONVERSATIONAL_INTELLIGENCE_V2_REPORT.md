# Conversational Intelligence 2.0

Date: 2026-11-12. This change extends the existing OpenStackTools AI queue and appointment action framework. It does not add another conversation engine, a provider call, a dependency, or a persistent customer profile.

## Root cause and existing architecture

The live Telegram example combined a booking name with a balcony question. The prior queue only accepted a whole-message name answer while `workflow.pendingQuestion` was `customer_name`. Because the message contained a property question, it took the listing follow-up path; the name was neither extracted nor saved. Resume then correctly restored the unfinished workflow but asked for the name again. A single-intent model tool response could not repair the missing structured slot.

The existing durable `WidgetRequest` queue already serializes turns per conversation, reserves AI budget, stores tenant-scoped messages, and stages `AgentAction` proposals. MongoDB slot claims and the confirmation transaction are the booking authority. The new interpretation is a bounded step inside that queue, before optional model tool selection. It does not execute model-generated code or treat an interpretation as consent.

## Implemented design

`turn-interpretation.ts` defines strict Zod schemas for a small taxonomy: supplied booking name, listing feature, listing price, unfinished-booking cancellation, name refusal, another-person name, corrected date and corrected time. Deterministic extraction records high-confidence names with the source `WidgetRequest` ID. It only infers an unintroduced name when the immediately pending question asks for one; names introduced explicitly can be collected during an active booking. Another person's name and ambiguous text require clarification. The schema also rejects malformed, oversized or extra-field model interpretation proposals, although no additional model interpretation call is made in this version.

A validated response plan records whether the turn needs a verified listing answer, a schedule correction, a name acknowledgement, a clarification or a new confirmation proposal. Cancellation has precedence. The queue applies changes using the existing scoped workflow and action services. A name plus feature question reads the current tenant listing, says an unsupported feature is unverified, stores the supplied name and its source, and stages the existing expiring appointment proposal. The reply asks for explicit confirmation; it does not create an appointment. A later resume reuses that pending action and its confirmation button. If staging fails, the reply retains the collected name while saying the time must be checked again.

Date/time corrections invalidate old pending actions and callback tokens, perform a new backend availability check, and preserve unrelated name/listing context. A corrected booking with a known name becomes a new proposal only after a verified slot is returned. A too-short visitor window can collect an explicitly supplied name but cannot book a duration that will not fit. Cancellation plus a price question stops only the unfinished booking and answers from the listing's structured price. Confirmed appointments still require their separate authorized cancellation/rescheduling flow. Tenant-owned listings are re-read under the organization predicate and freshness/availability rules before reuse.

Listing search now accepts up to three alternative neighborhoods, optionally constrained by the main location. The backend enforces the same tenant, freshness, availability, room, type and budget predicates across alternatives. Turkish “30 bin lira” is converted to a TRY ceiling. A balcony preference is acknowledged, but cannot be guaranteed as a filter because the listing schema has no verified balcony field. No balcony claim is inferred from free-text descriptions.

The booking name remains temporary conversation workflow data, not an automatic CRM customer record. It is removed with the conversation under the existing retention and tenant-deletion processes. Telegram profile labels are not treated as verified identity.

## Security, cost and response quality

The pre-tool safety check still runs before interpretation. Visitor and tenant text cannot change platform confirmation, tenant predicates or action schemas. Information retrieval does not authorize a transaction. Pending actions remain idempotent and are rechecked at confirmation. Old tokens are revoked when a tentative date, time or booking name changes. A read-only information failure cannot turn into a successful booking claim.

Common mixed turns use deterministic extraction and verified fields, so they add **zero provider calls** relative to the queued turn and can avoid the previous model call for a simple property feature. The bounded search alternative list adds no provider round trip. Corrections may execute one availability action and one proposal action against MongoDB, but do not call OpenAI. Existing provider calls remain subject to daily/monthly organization budgets and usage accounting. Actual latency and model naturalness require separate live evaluation.

The quality rubric is: intent coverage, context preservation, question efficiency, naturalness, groundedness, transactional safety and recovery. Deterministic tests check the first, second, third, fifth, sixth and parts of the seventh. Naturalness is a human judgment and has **not** been scored with a real model or real Telegram conversation in this work.

## Verification

The MongoDB-backed Telegram fixture exercises the reported name-plus-balcony turn, persisted source metadata, no booking before confirmation, resume without a repeated name question, one confirmed booking, date-plus-price correction, time-plus-name correction, name correction, cancellation-plus-price, short visitor window, stale token invalidation and tenant isolation. A separate test file exercises 32 bounded interpretation and response-plan cases. These are synthetic fixtures, not live provider tests.

| Command | Result |
| --- | --- |
| `npm test` | PASS, 89 API tests |
| `npm run typecheck` | PASS, API and web |
| `npm run build` | PASS, API and web/widget production bundles |
| `npm run test:browser -w apps/web` | PASS, 15 Chromium tests |
| `npm run brand:check` | PASS |
| `npm audit --audit-level=moderate` | PASS, zero findings |
| `git diff --check` | PASS |

## Remaining limits and safe live check

The grammar is deliberately bounded; it does not understand every colloquial correction, every language, or overlapping contradictory requests. Ambiguous names and another-person bookings ask for clarification. Structured property attributes beyond the listing schema, including balcony, cannot be confirmed. If the database fails before the scoped workflow is loaded, the queue's retry/failure path applies; it cannot guarantee a partial name acknowledgement. The narrow safety guard is not comprehensive moderation. No new real-model conversational accuracy or production readiness claim follows from the fixtures.

For a manual test, use an authorized test Telegram bot, a synthetic tenant and a known free consultant slot. Ask for a viewing, then send “Mustafa Göksal, bu arada dairenin balkonu var mı?” Confirm the reply addresses both items, the dashboard shows no appointment yet, and “Neyse, randevuya dönelim” retains the name and offers the same still-valid proposal. Verify the button or explicit text confirmation creates one booking. In separate fresh test conversations, try date/time/name corrections, a short visitor window and cancellation-plus-price. Compare every offered slot and price with dashboard records. Do not free the existing 14:00 demo booking or use real customer data. This procedure has **not** been executed in this work.
