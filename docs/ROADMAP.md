# Implementation roadmap

## Shipped foundation

Organizations, roles, verified accounts, invitations, session revocation, assistants, website widget, tenant-scoped conversations, human handoff, budgets, durable message queue, rate limits, retention/export/deletion, appointments, business knowledge, listings, and local Docker tests. Telegram now has a shared-channel adapter and self-service owner/admin onboarding behind an operator feature flag. WhatsApp and Instagram remain unimplemented.

## Before a real-business Telegram pilot

1. Provision a public HTTPS API route, authenticated private MongoDB, dedicated credential keys in a secret manager, key backup, worker monitoring, exact dashboard origin and retention policy. Complexity: medium, operational.
2. Exercise onboarding, callback confirmation, token revocation, reconnect and disconnect with a dedicated real Telegram test bot. Verify provider-side webhook state and send/receive behavior. No live provider verification has been completed in this repository task. Complexity: medium.
3. Rehearse key rotation and backup restore, reconcile uncertain outbound deliveries, alert on stuck inbound updates and decryption failures, and review privacy notices for channel customer data. Complexity: medium.
4. Complete live OpenAI tool-calling and cost-accounting evaluation, accessibility checks with assistive technology, and a controlled end-to-end business workflow before changing the pilot decision. Complexity: medium to high.

## After pilot validation

5. Add operational support for large-tenant deletion and legal holds; consider MFA for channel administrators. Complexity: medium.
6. Validate demand and official business authorization requirements before implementing WhatsApp or Instagram. Build provider-specific OAuth/authorization, permissions, webhook verification, messaging policy, delivery receipts and recovery; do not copy Telegram's token-paste flow. Complexity: high.
7. Add billing, platform administration and broader self-service features only after repeatable paid use. Complexity: high.
