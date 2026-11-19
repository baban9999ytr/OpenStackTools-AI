# Telegram appointment availability repair — 2026-11-12

## Root cause and live evidence

The webhook and conversation pipeline worked for the observed exchange. A read-only inspection of the existing local MongoDB records found one active Telegram connection, an active assigned assistant, a tenant-scoped conversation, and completed requests. The visitor's `olur` message produced a completed `check_availability` action, so the tool **did execute**. Its stored arguments were `date=2026-11-13`, `durationMinutes=60`, `startMinute=840`, `endMinute=855` (14:00–14:15 local). A 60-minute appointment cannot fit a 15-minute search window, and the tool returned zero slots. The server had trusted this contradictory model window. The later alternative request completed with no action ID; the model's “could not retrieve” wording had not been backed by an availability query.

There was a second routing defect: mentioning a previously shown listing title could cause listing follow-up formatting to replace a scheduling reply with the old listing card. A new integration test exposed this before release.

The business uses `Europe/Istanbul`. On Friday **13 November 2026 at 14:00** (11:00 UTC), the organization is open 09:00–18:00 and the viewing-capable consultant is scheduled 09:00–17:00. There is no appointment or slot conflict in the inspected tenant data. A read-only `checkAvailability` call returned the 14:00 slot. Saturday **14 November 2026** is outside the organization's configured opening days. The listing “DEMO — Örnek Park Dairesi” is current, available and unarchived. The schema has no listing-to-consultant assignment; eligibility is based on a consultant's declared property-viewing service and schedule. No real appointment was created, changed or deleted during diagnosis.

## Changes

- `apps/api/src/services/appointment-language.ts`: parse explicit Turkish dates, two requested dates, 15-minute-aligned clock times, and explicit appointment durations. Relative-date behavior remains.
- `apps/api/src/services/widget-queue.ts`: derive the date and time window from the visitor's words; use 30 minutes when no duration is stated; preserve the preceding request when the visitor accepts an offer to check; check each explicitly requested date; and keep tenant-scoped listing references without letting listing formatting override scheduling. When a specifically requested clock time is unavailable and the visitor explicitly asks for alternatives, the backend also checks verified times in that day's period. An availability request with no model tool call now reaches the backend tool. An explicit booking request still follows the pending-confirmation path. Unexpected tool failures receive a distinct retry/handoff reply where persistence remains available.
- `apps/api/src/services/appointments.ts` and `agent-actions.ts`: return a reason with the verified availability result: available, missing schedule, business closed, consultant unavailable, or no matching slots. Reject tool arguments whose time window is shorter than the requested duration. Customer replies use the appropriate reason instead of treating all empty results as equivalent.
- `apps/api/test/telegram-availability.test.ts`: isolated MongoDB and fake Telegram/AI providers cover a permission reply, malformed model window, Friday 14:00 availability, Friday/Saturday alternatives, closed Saturday, missing schedule, explicit confirmation, duplicate callback, same-day alternatives after the synthetic 14:00 booking, persistence and authenticated dashboard visibility. Existing receptionist expectations were updated for reason-specific replies.

The booking transaction, unique appointment-slot index, explicit confirmation token, tenant filters, budgets, durable request queue and outbox remain in place. No available time is generated from the model's text.

## Verification

| Check | Result |
| --- | --- |
| Read-only existing connection, listing, schedules, actions, bookings, and 14:00 availability | PASS |
| Public `/health/ready` and existing tunnel service | 200; `active` at final check |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS, 55 API tests |
| `npm run test:browser -w apps/web` | PASS, 15 browser tests |
| `npm run brand:check` | PASS |
| `npm audit --audit-level=low --json` | PASS, zero reported vulnerabilities |
| `git diff --check` | PASS |

The new end-to-end test uses a real isolated MongoDB replica set and mocked Telegram and AI providers. It proves backend orchestration and dashboard persistence for that fixture; it does **not** prove live model tool selection or real Telegram delivery after this patch. The currently running local API process may still have the earlier code until deliberately restarted. No live Telegram message, paid provider request, production appointment mutation, deployment, or push was performed.

## Safe manual verification

1. In a controlled test window, confirm the approved HTTPS tunnel is active, public `/health/ready` returns 200, and the Telegram webhook URL and pending/error diagnostics are healthy. Ensure the API process has been restarted onto the repaired build; do not alter credentials or webhook registration.
2. With an authorized **test** Telegram account and synthetic listing, ask to see the property on a future open day at a specific time. If the assistant asks permission to check, answer `olur`. Inspect redacted `requestId`, selected tool, normalized date/window, result reason, and delivery status. Every offered slot must match the backend `AgentAction.result.available` and the organization's local time.
3. Ask for two dates, one open and one closed; confirm both are checked and the closed day is described as closed. Ask for another time after blocking a synthetic slot in an isolated staging tenant, never by altering a real customer's booking.
4. To test booking, use only a disposable staging tenant and an authorized test account. Confirm there is **no** appointment before clicking the Telegram confirmation button, then exactly one booking after confirmation and exactly one record in the dashboard Appointments view. Replay the same callback and confirm no second booking. Do not run this booking step against the existing real tenant without explicit approval.

## Limitations

No per-listing consultant assignment exists; service capability is the current eligibility rule. The alternative-date parser covers ISO dates and common Turkish month names, with a bounded maximum of three dates; ambiguous natural-language date ranges still need clarification. The backend checks one selected eligible consultant per request, not every consultant. Live model behavior and live Telegram reply delivery on this repaired code remain **NOT VERIFIED**. The product should not be declared production-ready from these mocked tests.
