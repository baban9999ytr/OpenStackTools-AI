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
