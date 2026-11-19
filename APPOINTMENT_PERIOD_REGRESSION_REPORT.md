# Appointment period and context regression

## Confirmed root cause

The affected visitor message was stored at 2026-11-11 17:30:50 UTC (20:30 in the demo organization's `Europe/Istanbul` zone). A read-only inspection of its completed `AgentAction` found `check_availability` with staff Deniz Yalın, date `2026-11-12`, and 30-minute duration. Deniz's declared services include rental homes and property viewings. The date, time zone, and consultant were correct. The action had **no afternoon constraint**. `checkAvailability` therefore queried the full business day and returned 28 slots. `actionReply` displayed the first eight, which were morning slots, and printed the IANA zone identifier. No synthesis step handles appointment availability; this was the deterministic action path. Historical logs do not expose the provider's raw tool-call payload, but the persisted normalized action proves the range was absent before backend execution.

## Implemented behavior

- `appointment-language.ts` parses Turkish and English morning, afternoon, and evening phrases and resolves tomorrow, today/this evening, and next weekday from the **persisted request timestamp** in the organization's time zone. Defaults are 09:00–12:00, 12:00–17:00, and 17:00–21:00 local time. `APPOINTMENT_*_WINDOW` variables configure nonoverlapping, 15-minute-aligned periods.
- Explicit visitor dates and periods override missing or contradictory model arguments. A clear availability request can route to `check_availability` even when the model returns no action or selects a listing search. A viewing request chooses a scheduled staff member with a declared showing service; if none is verified, the assistant offers human help rather than inventing a consultant.
- `checkAvailability` filters candidate slots by local start and end minutes **before** applying its result cap and before returning any slots. Organization hours, staff windows, appointment duration, and occupied slot claims remain in force. The staff dashboard's unrestricted availability query still works when no period is supplied.
- The reply names the selected date and period, uses local display times, preserves a uniquely resolved prior property reference, and omits `Europe/Istanbul`. If no slots exist in the requested period, it says so and asks whether to check another time. Availability checks do not book anything. Appointment creation still requires the existing explicit confirmation and rechecks bookability; an explicitly stated booking period/date cannot be contradicted by a model-selected booking time.
- Structured AI diagnostics now include the normalized availability date, period, minute bounds, selected staff ID, returned slot count, and whether a prior property was resolved. They do not include message text or credentials.

## Regression evidence

Deterministic API tests use an ephemeral MongoDB replica set and a mocked model. The widget test deliberately supplies a wrong date, morning range, and sales-only staff ID for a Turkish tomorrow-afternoon viewing. The persisted action is corrected to the visitor's next local day, 12:00–17:00, and the viewing-capable staff member. Every returned slot starts and ends within that period; an occupied slot is excluded. The reply mentions Görükle and contains no morning times or IANA zone name.

The same suite covers Turkish tomorrow morning, English tomorrow afternoon, no available afternoon slots, business closing before afternoon, a prior property reference, and no implicit booking. Pure date tests cover a request near Istanbul midnight, New York local date resolution, “this evening,” and next Monday in English and Turkish. DST tests check New York's spring gap and autumn repeated hour using a fixed clock. Existing appointment confirmation, double-booking, tenant-isolation, and budget tests remain in the full suite.

## Verification

Executed locally from the repository root on 2026-11-11:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS, API and web |
| `npm run build` | PASS, API and web/widget production bundles |
| `npm test` | PASS, 50 API tests |
| `npm run test:browser -w apps/web` | PASS, 14 Chromium tests |
| `git diff --check` | PASS |

The local API was restarted after the source changes and `/health/live` and `/health/ready` returned 200. No billable OpenAI call was made, so live model tool selection and wording for the new flow remain unverified. The tests establish backend filtering and customer-visible replies with deterministic model actions.

## Manual local widget verification

1. Confirm the local API was restarted after this change and `http://localhost:5000/health/ready` returns 200. Open the synthetic assistant preview from the dashboard at `http://localhost:5173/app`.
2. In a fresh chat, search for the fictional Görükle rental, then ask: “Peki, Görükle'deki daireyi görmek istiyorum. Yarın öğleden sonra müsait bir danışmanınız var mı?”
3. Check that every displayed time is on the next **Istanbul local date** and between the configured afternoon bounds and closing time. Morning slots and `Europe/Istanbul` must not appear. The action log's `availabilityDecision` should show `period: afternoon`, local minute bounds, selected staff, and slot count.
4. Ask for a morning period and compare. If the requested period has no slots, the assistant should offer another time without showing morning alternatives unprompted. Booking must remain a separate pending action requiring an explicit Confirm click.

No database was reset, no demo fixture or credential was modified, and nothing was committed, deployed, or pushed. Live provider behavior still needs an authorized test; staff capability labels are maintained in existing schedule records and must be reviewed for each business.
