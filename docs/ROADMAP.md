# Implementation roadmap after pilot readiness

## Shipped foundation

Organizations, roles, verified accounts, owner invitations, reset and session revocation; assistants and website origins; tenant-scoped conversations; human handoff; budget and cost ledger; durable idempotent widget queue; tab-scoped widget restoration; MongoDB-backed rate limits; retention/export/deletion/audit; local Docker and tests.

## Before the first business pilot

1. Configure real provider model/prices, SMTP, budgets, TLS, private MongoDB, backup/restore, exact origins, monitoring, and privacy notice. Exercise the full journey with the pilot business. Complexity: medium, operational.
2. Test multi-instance worker recovery, provider timeouts, invoice reconciliation, and production-like traffic. Add alerts for budget exhaustion, uncertain charges, queue age, and failed email. Complexity: medium.
3. Add a staff session management screen and perform an accessibility review with assistive technology. Endpoints and initial widget states exist; the dashboard session UI remains. Complexity: low to medium.

## After pilot validation

4. Add tenant-scoped knowledge retrieval and evidence evaluation only when real customer documents justify it. Complexity: high.
5. Stage tenant deletion for larger volumes, refine retention/legal-hold rules, add MFA and support procedures. Complexity: medium to high.
6. Build channel adapter interfaces and implement one official channel after confirming customer demand and platform permissions. Complexity: high.
7. Add billing, self-service onboarding, platform administration, and support tooling after repeatable paid use. Complexity: high.

Do not implement WhatsApp, Instagram, Telegram, or Messenger before validating demand and operating economics.
