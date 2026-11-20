# ASTRA real-estate booking contact verification

## Policy and workflow

New real-estate assistants created through the assistant API default to requiring a name and one contact method. The offline demo explicitly enables that policy. Owners and admins can choose phone, email, either, or no contact requirement, toggle the name requirement, and decide whether to offer staff takeover. Existing assistants with no new contact setting retain their existing behavior until changed.

Selecting a verified slot starts a conversation-scoped intake. The visitor supplies their name if the conversation has no name already established through booking intake. The assistant explains that the authorized team uses the data to manage the viewing and notify the visitor of changes. The visitor supplies one allowed contact value, gives a separate affirmative instruction permitting contact for this appointment, reviews the property, consultant, local time and duration, then explicitly confirms the booking. Declining stops intake and offers or starts takeover according to the assistant's setting. No appointment is created at the slot, name, contact, consent, or deferral step.

### Customer-visible example

1. Visitor selects a verified time.
2. Assistant asks “Yetkili ekip bu bilgiyi yalnızca gösterim randevunuz için kullanır. Adınız ve soyadınız nedir?”
3. Visitor provides a synthetic name. The assistant asks for phone or email and explains the purpose.
4. After the visitor provides one method, the assistant asks for “İletişime izin veriyorum” and explains that this is separate from appointment confirmation.
5. The assistant gives the existing verified proposal summary. “Kesinleştirmeyelim” leaves it pending. “Evet, randevuyu onaylıyorum” confirms it through the existing booking transaction.

## Validation and privacy

- The intake recognizes a bounded, alphabetic name with supported separators. The visitor can explicitly introduce a lowercase name with “Adım”. Email uses the server email validator. Phone accepts 7–15 digits with optional leading plus and strips common separators. These checks validate format and the visitor's stated choice. They do not verify legal identity or channel ownership by OTP.
- Intake is short-lived conversation state and excluded from normal projections. The queue's private intake turns are replaced by a placeholder during finalization. A keyed digest preserves duplicate-message and conflicting-replay detection. The queued value exists transiently in server storage until it is processed. The model receives neither those intake turns nor the private draft. Ordinary contact-shaped text submitted outside the intake on contact-required assistants is redirected and redacted.
- The final transaction checks the policy, action identity, tenant, assistant, visitor, current bot ownership and draft expiration. Existing scheduling checks and the unique slot reservation remain authoritative. The transaction reuses a customer only within the same tenant, visitor and conversation and refuses conflicting details. New contact records write booking-specific method and permission time and leave the separate general consent field unset. The appointment stores the customer link; the public proposal and booking response contain no contact value.
- Appointment contact and name are available to authorized owner, admin and agent roles. Viewer and cross-tenant responses cannot retrieve them through the appointment endpoint. Existing tenant export, deletion and retention apply to the linked customer. Expired drafts are removed by the existing retention worker and completed drafts are cleared during booking.

## Source changes

- `apps/api/src/services/booking-intake.ts`, `widget-queue.ts`, `agent-actions.ts`, `appointments.ts` and `retention.ts` implement validation, routing, privacy, confirmation and expiry.
- `apps/api/src/models/index.ts`, `routes/assistants.ts` and `routes/receptionist.ts` add settings, private state, contact linkage and scoped dashboard projections.
- `apps/web/src/App.tsx`, `api.ts` and `Receptionist.tsx` add settings and authorized display. Existing real-estate assistants can opt in through assistant settings.
- `apps/api/test/receptionist.test.ts`, `apps/web/test/dashboard.spec.ts`, `astra-offline-demo.mts`, `astra-offline-demo-smoke.mjs` and `ASTRA_OFFLINE_DEMO.md` cover and document the synthetic walkthrough.

No paid model requests were made. Project review remains outstanding. Source changed, so the previous frozen live-source digest cannot be reused.

## Executed verification

| Check | Result |
| --- | --- |
| `npm test` | 191 passed. The MongoDB-backed contact intake test covers incomplete details, invalid contact method, consent, history redaction and reload, declining, expired intake, staff takeover, idempotent duplicate messages and confirmations, and tenant isolation. Existing booking and concurrency tests also ran. |
| `npm run test:browser -w apps/web` | 20 passed. The dashboard test saves the email-only setting and retains Turkish accessibility coverage. |
| `node astra-offline-demo-smoke.mjs <private-login-file>` | Passed on Chromium against the actual local widget, API and MongoDB. The walkthrough collects one fictional contact and distinct consent, reloads the pending booking, confirms it and checks the name and contact on the authorized dashboard endpoint. Zero external browser requests. |
| `npm run eval:deterministic -w apps/api` | 128 scenarios, zero failures, four intentional backend skips. |
| `npm run typecheck`, `npm run eval:typecheck -w apps/api`, `npm run build`, `git diff --check` | Passed. |
