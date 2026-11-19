# ASTRA Phase 2H pilot runbook

Use synthetic customers and properties for rehearsal. A release owner must clear the blockers before this procedure is used for a live pilot. Open with a single approved website origin and named staff coverage during published hours.

## Before opening

1. Confirm the expected organization in the dashboard, then have the owner or administrator verify business hours, IANA timezone, consultant availability, viewing capability, and duration in **Receptionist**. Run a test search during a known working interval and a blocked interval.
2. In **Business**, match each proposed listing against the business's verified records. Record the correct currency, deposit, maintenance fee and furnishing where known. Leave unavailable facts blank. Mark sold or unavailable properties accordingly and archive obsolete entries. Check that the widget excludes them while returning a current eligible listing.
3. Have the operator confirm the approved assistant, Luna policy and exact surface origin. Check tenant budget, deployment project and provider-side access. The release owner checks the deployed build, public liveness and private readiness, current backup and alert delivery.
4. Sign in with each staff member's own verified account. Rehearse one inquiry, one takeover and reply, one confirmed viewing, and one cancellation using synthetic records. Verify the activity in the inbox and Receptionist.

## Managing conversations and viewings

1. Open **Conversations**, select the request, and refresh the thread to see current messages. Use the preferences panel as a summary and the conversation as the record of what the customer agreed to. Respect refusal of a phone number or consent withdrawal. Use the business's approved follow-up method.
2. If the assistant cannot verify a fact, check the source listing record and correct it in **Business**, or tell the customer that the fact is unconfirmed. Compare available listings by matching criteria and currency.
3. For a viewing, check the property, consultant, business-local date, start time and duration. A time offered in chat is provisional. Ask the customer to confirm before creating or changing the booking. A checked box in Receptionist records staff confirmation after the customer's agreement. If the slot changes, obtain confirmation again.
4. Check the appointment in **Receptionist** before telling the customer it is booked, rescheduled or cancelled. If another visitor books the slot first, recheck availability and offer a verified alternative. Use **Action history** to investigate outcome and time.
5. Select **Take over**, then send a staff reply in the dashboard. The appointment confirmation requirement and ability to identify the correct customer and booking still apply. Keep coverage until handoff is resolved.

## When something fails

| Signal | Response |
| --- | --- |
| Provider unavailable, uncertain completion, or an interrupted request | Check recent failure categories and whether the appointment exists. Take over if needed. Escalate a repeated failure to the operator with time and correlation IDs. Leave uncertain requests and reservations for reconciliation. Avoid replaying them. |
| Budget exhausted | Continue through staff takeover and alert the owner. Review tenant accounting and budget policy before reopening automated replies. |
| Booking mismatch or unavailable listing | Stop quoting the offer, check the appointment or property record and notify the business owner. Offer currently verified times or listings after checking them. |
| Wrong tenant, unexpected personal data, or unauthorized action | Pause the affected assistant where supported and escalate immediately. Restrict access and preserve relevant audit evidence according to the data-handling policy. |
| Prolonged outage or missing staff coverage | Pause affected assistants through assistant settings and use the agreed staffed intake route. Record current booking state before changing infrastructure. |

Operators monitor public liveness, private readiness, API errors, durable queue age, uncertain requests and usage reservations, budget rejects, handoff age, authentication errors, availability conflicts and channel delivery if enabled. Use counts, bounded error categories and correlation IDs in alerts. Escalate with timestamps and IDs and keep private messages, contact details, credentials and provider response bodies out of shared channels.

## Recovery and rollback

1. Log the incident, affected tenant, deployed image, scope, times, and confirmed or uncertain booking states. Keep access to existing appointment records and assigned staff during the incident.
2. Check the application and MongoDB replica set before selecting a recovery action. For a code regression, use the last reviewed image compatible with the current schema, verify it in staging, and follow the approved rollback procedure. Avoid replaying ambiguous provider actions or overwriting newer appointments.
3. Follow the authenticated backup and isolated-restore procedure in [Deployment](docs/DEPLOYMENT.md). Restore to a fresh target, then verify tenant isolation, relevant indexes, appointments, listing facts, usage and audit state. Use separately agreed recovery-point and recovery-time targets before considering a live restore.
4. Reopen only after the operator checks health, controlled login, inbox, listing retrieval, authorized booking with confirmation, takeover and budget enforcement. Assign ownership for any remaining uncertainty.
