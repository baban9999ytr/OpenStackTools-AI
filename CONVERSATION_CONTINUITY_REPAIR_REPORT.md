# Conversation continuity and appointment dialogue repair

Date: 2026-11-12. Scope: local OpenStackTools AI repository and read-only inspection of the local demo tenant. No API restart, live Telegram send, paid model call, existing appointment mutation, deployment, or push was performed.

## Root cause

`Conversation.workflow` retained the selected listing, date, verified slot, consultant and pending question. However, the queue only consumed it for a direct time or name answer. “Neyse, randevuya dönelim” reached the model and could be routed to `get_business_knowledge`; its empty result produced the unrelated “doğrulanmış işletme bilgisi bulamadım” reply. General availability replies also had no consistent state update for an exact, model-routed viewing slot. Broad viewing questions could be mistaken for a missing-time prompt. These routing issues, rather than lost Telegram delivery or deleted conversation state, caused the interruption failure.

The previous `check_availability` formatter rendered up to eight raw starts, repeated listing/location and consultant phrases, and did not distinguish gaps when summarizing a day. The response sounded like tool output even when the slots were correct.

## Changes

- `apps/api/src/services/conversation-flow.ts`: classifies bounded Turkish and English resume/cancel intent separately from transaction confirmation.
- `apps/api/src/services/widget-queue.ts`: routes resume/cancel before model tool selection; loads only the scoped conversation workflow and re-reads its listing under the organization predicate. It rechecks the exact proposed start against the live schedule and slot claims before repeating a name question or pending confirmation. A stale slot or expired proposal is not silently restored. A cancellation clears the unfinished workflow and revokes pending actions/tokens without changing a booked appointment. A resume with no active workflow receives an appointment-specific response. Exact, verified viewing availability from the model path can update this same workflow. Broad availability requests continue through the existing tool path.
- `apps/api/src/services/appointment-presentation.ts` and `agent-actions.ts`: use local date/time, verified listing and consultant labels, and natural wording with a small formal/concise tone adjustment. Adjacent 15-minute verified starts can be summarized as a range; gaps remain separate and hidden groups are counted. No model-calculated availability is displayed.
- `apps/api/test/telegram-availability.test.ts` and `receptionist-quality.test.ts`: fixture-backed Telegram and formatter regressions for interruption, multiple unrelated turns, Turkish/English resume, no active workflow, cancellation, occupied or expired slots, confirmation-token invalidation, tenant-scoped listing restoration, and noncontiguous slot grouping.

The existing `AgentAction` confirmation transaction, occupancy index, visitor/assistant/tenant scope, queue lease, and budget controls remain in use. Resume never authorizes a booking. A pending action is reused only while valid; it is not duplicated.

## Read-only 14:00 conflict finding

The local demo organization uses `Europe/Istanbul`. Friday 2026-11-13 is open 09:00–18:00, and the only staff member whose declared services include property viewings works 09:00–17:00 and accepts 30/60-minute appointments. The local 14:00–14:30 interval is 11:00–11:30 UTC. A **booked** appointment for that staff member occupies exactly that interval. Stored `check_availability` actions show an earlier 14:00 query at 12:09 UTC returning one slot, followed by a 12:44 UTC query with the same date, staff, 30-minute duration and 14:00–14:30 window returning `no_slots`. A separate 10:30 exact query returned one slot. Thus the later 14:00 refusal was correct conflict prevention, not a timezone or schedule regression. No existing appointment or slot was changed during this inspection.

## Verification

The API regression suite uses ephemeral MongoDB and deterministic AI/Telegram fixtures. It proves queue routing, backend availability recheck, persisted test bookings, token invalidation and tenant predicates under those fixtures. It does **not** prove live provider tool choice or wording.

| Command | Result |
| --- | --- |
| `node --import tsx --test apps/api/test/telegram-availability.test.ts` | PASS, 2 tests |
| `node --import tsx --test apps/api/test/receptionist-quality.test.ts` | PASS, 2 tests |
| `npm test` | PASS, 57 API tests |

| `npm run typecheck` | PASS, API and web |
| `npm run build` | PASS, API and web/widget production bundles |
| `npm run test:browser -w apps/web` | PASS, 15 Chromium tests |
| `npm run brand:check` | PASS |
| `npm audit --audit-level=moderate` | PASS, zero findings |
| `git diff --check` | PASS |

## Limits and safe live check

Resume expressions are intentionally bounded, not a complete multilingual intent model. A request that changes an appointment without an explicit, parseable date/time may still need clarification. Availability can change between a resume response and confirmation; the transaction rechecks it and can reject the booking. The deterministic formatter has a limited set of tone variations and does not infer gendered forms of address. No real Telegram conversation was sent during this repair.

For a safe manual check, use a test bot and synthetic tenant only. Restart or deploy only after separate authorization. Search a test listing, request a viewing date, select a verified time, ask an unrelated listing question, then say “Neyse, randevuya dönelim.” Compare the resumed listing, local date/time and consultant with the dashboard. Try a second unrelated question, English “Where were we?”, an expired proposal, and “Randevudan vazgeçtim.” Verify that no appointment appears before explicit confirmation and that a changed or occupied slot is rejected. Do not alter the existing demo booking to free 14:00.
