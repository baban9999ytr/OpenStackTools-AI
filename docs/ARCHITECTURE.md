# Pilot architecture

The API is Express 5 and TypeScript; the dashboard and embeddable widget are React. MongoDB stores all tenant and queue state. OpenAI is called only from the API. A fake `AIResponder` is injected into integration tests. Website channel only; WhatsApp, Instagram, Telegram, and Messenger adapters remain future interfaces, not implementations.

## Message path

A website origin registered on an assistant exchanges its public key for a 24-hour, origin-bound visitor bearer session. The widget stores that session in tab-scoped `sessionStorage`, and submits a UUID per message. MongoDB uniquely indexes `(organizationId, assistantId, visitorId, clientMessageId)`, including first messages. A transaction creates the initial conversation and request together. The request queue serializes processing through a conversation lease. A worker recovers expired leases. SDK retries are disabled; the queue retries only an explicit provider 429 once, releasing that rejected attempt's reservation. A timeout, connection failure, or expired reserved lease is charged conservatively as uncertain and is not replayed automatically. The client polls request status and conversation messages after an accepted/queued response.

Before calling OpenAI, the API reserves a conservative maximum against UTC daily and monthly organization budget windows in a MongoDB transaction. Both windows count spent plus reserved amounts. After success, usage and estimated cost settle the reservation; after provider uncertainty, the full reservation is charged. Limits and per-token prices are configured server-side. A separate MongoDB counter collection enforces distributed request rate limits across API instances.

## Staff path and tenant boundary

An owner registers and verifies an email. Owner-created invitations are emailed as single-use 72-hour tokens; an invitee sets their own password. Password reset tokens expire after one hour and revoke sessions. Staff sessions are opaque cookies. Every organization route validates the authenticated membership and role; queries include the organization ID. Widget conversation reads additionally require assistant and visitor IDs from the widget session. Owner-only export, retention settings, and confirmed tenant deletion are scoped to the organization. Staff mutations create audit events without request bodies.

## Current REST surface

- Auth: `/api/auth/register`, `/verify-email`, `/resend-verification`, `/login`, `/request-password-reset`, `/reset-password`, `/accept-invitation`, `/me`, `/sessions`, `/logout`.
- Organizations: members, invitations, assistants, conversations, usage, budgets, retention, paged export, and tenant deletion under `/api/organizations/:organizationId`.
- Widget: `/api/widget/sessions`, `/sessions/current`, `/messages`, `/requests/:requestId`, and `/conversations/:conversationId/messages`.
- Health: `/health/live`, `/health/ready`.

## Future adapters

A future channel adapter should verify provider webhook signatures on the raw body, normalize inbound messages, emit outbound messages, map delivery status, and declare channel capabilities. Provider event IDs need tenant-scoped unique indexes and queued idempotent processing. These adapters are not in the pilot.

## Phase 5 receptionist actions

The existing website message queue and budget reservation remain the entry point for model requests. The Chat Completions adapter advertises six named function tools; it treats a returned tool call as data and never runs model-supplied code. The backend validates the name and strict Zod arguments, then creates a tenant-scoped `AgentAction` keyed by the durable widget request ID. Only one function call is accepted per response. Availability is computed from configured IANA time zone, organization opening windows, staff windows, and occupied 15-minute slot claims. The backend formats availability and action results; it does not copy the model's success claim into the answer.

Booking, rescheduling, cancellation, and customer-record creation become 15-minute-expiring proposals. A visitor must press Confirm in the origin-bound widget session. Confirmation checks that the originating widget request completed, rechecks the visitor and assistant, and runs the operation and action-state update in a MongoDB transaction. Staff use role-checked organization routes with an explicit confirmation field. Repeated action keys return the same result; changed arguments under a reused key are rejected. A unique `(organizationId,staffId,startAt)` slot index prevents simultaneous bookings. The action history omits raw arguments from the staff list response; tenant export remains owner-only. Existing human handoff state and inbox are reused.

The initial dashboard exposes appointments, a backend availability search, business hours, staff availability, customer requests, and action history. Staff schedules start closed until an owner or admin configures them. No external calendar, WhatsApp, or billing integration exists.
