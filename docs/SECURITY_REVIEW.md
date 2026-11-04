# Security review

## Implemented controls

- Staff sessions use 32-byte random opaque tokens in host-only, HttpOnly, SameSite=Lax cookies. MongoDB stores an HMAC hash, never the raw cookie. Logout deletes the session. Secure cookies are enabled in production.
- Mutating dashboard routes require an exact `Origin` and `X-Requested-With` header. Dashboard CORS permits only the configured dashboard origin. Widget CORS separately permits registered widget origins. Widget writes use origin-bound bearer sessions rather than cookies.
- Each dashboard route resolves organization membership on the server, checks role, and scopes resource queries by organization. Widget conversations also scope by assistant and visitor. Integration tests attempt cross-tenant and cross-visitor access.
- Zod validates request bodies. JSON bodies are limited to 16 KB. Helmet sets common HTTP security headers. Auth, widget, and general requests have rate limits.
- Passwords are bcrypt-hashed. The OpenAI API key and session secret stay server-side. Logs include method, URL, status, and error details; cookie and authorization headers are not serialized.

## Open risks and release gates

1. **Customer-facing public API abuse:** IP rate limits are process-local and do not impose per-organization token budgets. Add a distributed limiter and enforce spend limits before public launch.
2. **Staff onboarding:** an owner enters and shares a temporary password; there is no invitation, password reset, email verification, MFA, or session management UI. Replace this workflow before broad commercial use.
3. **AI output safety:** assistant instructions are tenant-controlled, but there is no knowledge retrieval, tool execution, prompt injection evaluation, or content moderation workflow. Do not treat model output as authoritative.
4. **Widget token and conversation lifecycle:** tokens expire after 24 hours and are not persisted. The widget polls for agent replies. Add reconnection, pagination, and longer-term identity/retention design.
5. **Idempotency and concurrency:** client message IDs are unique within a conversation, but first-message retries may create another conversation. Concurrent messages can interleave. Add an intake idempotency record and serialized processing.
6. **Privacy and compliance:** define retention, customer consent language, access logs, export/deletion, backups, and regional processing obligations with counsel before selling to regulated customers.
7. **Deployment:** terminate TLS, configure exact origins and trusted proxy hops, use a secret manager, protect MongoDB with authentication and network controls, monitor failed logins and provider cost, and test backup restore.
8. **Licensing:** third-party package notices are inventoried. Four packages lacked a standalone notice file and use a related package license or a README notice in the generated inventory; confirm applicability before redistribution. No third-party art or copied application source is included. The MongoDB server image has separate SSPL terms; see provenance.
9. **Browser delivery:** the widget bundle is public JavaScript; use a versioned asset URL and Content Security Policy guidance for customer sites. Dynamic CORS origin lookup adds database work; measure and cache safely before high traffic.

This review is an engineering assessment, not a penetration test or legal opinion.
