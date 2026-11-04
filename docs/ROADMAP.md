# Implementation roadmap

## Shipped foundation

Organizations and staff roles; opaque sessions; assistants with instructions and allowed website origins; tenant-scoped conversations/messages; website widget; staff handoff; token usage events; API tests; Docker local environment.

## Next, before a pilot

1. Add an invitation/password-reset flow and verified email ownership. Add a session management UI and optional MFA. Complexity: medium.
2. Add per-organization model budgets and distributed rate limiting. Include alerts and invoice reconciliation. Complexity: medium.
3. Make first-message idempotency durable, serialize conversation processing, and add retry/recovery for failed AI calls. Complexity: medium.
4. Add widget browser tests, accessibility review, CSP guidance, operational metrics, and backup restore tests. Complexity: medium.
5. Define retention, export, deletion, privacy notice, and staff audit logs. Complexity: medium to high, with legal input.

## After pilot validation

6. Add knowledge sources and retrieval with tenant/assistant filters, citation evaluation, and prompt-injection tests. Complexity: high.
7. Add asynchronous processing and a channel adapter SDK. Implement only one official messaging channel after confirming customer demand and platform permissions. Complexity: high.
8. Add plans, billing, self-service onboarding, support tools, and platform administration after repeatable paid use. Complexity: high.

Do not implement WhatsApp, Instagram, Telegram, or Messenger in this foundation. Validate customer demand and operating economics before expanding the architecture.
