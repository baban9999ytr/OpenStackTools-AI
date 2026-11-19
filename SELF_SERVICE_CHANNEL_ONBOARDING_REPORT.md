# Phase 9 — self-service channel onboarding

## Architecture audit and decision

The existing Telegram adapter already authenticated webhooks, normalized messages, resolved tenant-owned channel identities, used the shared AI conversation queue, and delivered replies through a MongoDB outbox. Website and Telegram confirmations already reached the same transactional `AgentAction` executor. Existing developer-operated connections stored environment-variable references and had no dashboard lifecycle. They were not suitable for an owner to configure a bot without terminal access. The new work adds a control plane and managed credential storage to that data plane; it does not introduce another AI engine or change website conversations.

The audit covered `OMNICHANNEL_CORE_REPORT.md`, README, architecture/schema/security/roadmap docs, channel models and routes, webhook/outbox, confirmation logic, dashboard authorization, and tenant export/deletion/retention. Existing uncommitted changes were preserved.

## Implementation and files

- API: `apps/api/src/routes/channels.ts` adds organization-scoped list, connect, verify, repair, assistant reassignment, disable and disconnect routes. `app.ts` mounts them under the existing dashboard Origin/CSRF and staff audit middleware. `config/env.ts` gates self-service on explicit operator configuration.
- Provider boundary: `services/channels/telegram-management.ts` contains official Bot API `getMe`, `setWebhook`, `getWebhookInfo` and `deleteWebhook` calls with safe error categories, 10-second timeouts and one bounded retry for definitive 429/5xx responses. Tests inject a fake provider and make no live calls.
- Secrets: `services/channels/credentials.ts` stores bot tokens and webhook secrets with Node AES-256-GCM using a dedicated 32-byte key, 12-byte random nonce, authentication tag, versioned key ID and connection/purpose-bound authenticated data. `CHANNEL_CREDENTIAL_ACTIVE_KEY_ID` selects the write key; historical `CHANNEL_CREDENTIAL_KEY_<ID>` values remain readable until rewrapped. The key is never stored in MongoDB and is separate from `SESSION_SECRET`.
- Persistence: `models/index.ts` extends `ChannelConnection` with lifecycle, provider identity and health fields and adds `ChannelCredential`. Existing unique bot-ID and environment-reference indexes remain unchanged, avoiding an index replacement on legacy databases. Managed records use unique internal markers in the legacy reference fields. `routes/telegram.ts` and `telegram-service.ts` resolve either legacy environment credentials or encrypted managed credentials.
- Lifecycle: `routes/assistants.ts` marks managed connections needing attention when their assistant is disabled. `routes/operations.ts` excludes credentials and internal references from exports, deletes credentials with a tenant, and requires channel disconnection before tenant deletion. The verified disconnect transaction removes the encrypted credential and releases the bot ID while preserving historical conversations.
- UI: `apps/web/src/Channels.tsx` adds a responsive EN/TR Channels dashboard with website, Telegram, WhatsApp and Instagram cards. `App.tsx`, `preferences.tsx` and `style.css` integrate navigation, themes and accessibility. WhatsApp and Instagram are explicitly unavailable.
- Tests: `apps/api/test/channel-onboarding.test.ts` and a mobile browser scenario in `apps/web/test/dashboard.spec.ts`. README and architecture/schema/security/roadmap documentation were updated.

## Dashboard workflow and API

An owner/admin selects an active assistant, follows the official BotFather steps, and submits only the bot token. The server checks `getMe`, obtains bot ID/name/username, creates the connection and encrypted credential in a MongoDB transaction, generates a unique webhook secret, calls `setWebhook` using the operator's public HTTPS API origin, then checks `getWebhookInfo`. Only this confirmed state is shown as **Connected**. A timeout or mismatch produces **Needs attention** with ingress disabled. The owner can check or repair the same connection, optionally supply a replacement token for the same bot, reassign an assistant, disable, or disconnect after password confirmation. The dashboard never receives a stored token or secret.

All paths below are under `/api/organizations/:organizationId`:

| Method/path | Role | Function |
| --- | --- | --- |
| `GET /channels` | Any member | Safe connection status and capability flag |
| `POST /channels/telegram` | Owner/admin | Verify token and create/install |
| `POST /channels/telegram/:id/verify` | Owner/admin | Check provider identity and webhook URL |
| `POST /channels/telegram/:id/repair` | Owner/admin | Idempotent reinstall or same-bot token replacement |
| `PATCH /channels/telegram/:id/assistant` | Owner/admin | Explicit assistant reassignment; old conversations retained |
| `POST /channels/telegram/:id/disable` | Owner/admin | Stop inbound and queued outbound processing |
| `DELETE /channels/telegram/:id` | Owner/admin, password | Verify bot, remove webhook, confirm removal, revoke local credential |

The existing dashboard session, exact Origin and `X-Requested-With` CSRF check, tenant membership, distributed rate limit, and mutation audit apply. The webhook remains on the separate secret-header boundary. Connection operations use an atomic lease; the unique provider bot-ID index handles concurrent claims. No API payload can choose another organization's assistant or change a bot ID without `getMe` verification. Provider error bodies are never returned or logged.

## Verification

Executed locally with Node `v24.22.2`, ephemeral MongoDB replica sets, a fake Telegram management provider, fake delivery and fake AI. The full suite does not contact Telegram or OpenAI.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS, 53 API tests |
| `npm run test:browser -w apps/web` | PASS, 15 Chromium tests |
| `npm run brand:check` | PASS |
| `npm audit --audit-level=low --json` | PASS, zero reported vulnerabilities |
| `git diff --check` | PASS |

The new MongoDB-backed tests cover invalid tokens, duplicate concurrent bot claims, a repair/disable operation race, cross-tenant assistant and connection access, non-admin denial, encrypted storage and redacted responses/exports, automatic webhook registration, webhook secret verification, managed inbound/outbound messages, pending appointment callback replay safety, token revocation, provider failure/timeout, credential decryption failure, repair, disable, assistant reassignment, password-protected disconnect, bot-ID release and tenant-deletion guard. The browser test checks mobile navigation, light/dark, EN/TR, token-field clearing, unsupported provider labels and automated accessibility rules. The previous website widget and omnibus Telegram tests passed in the full suites.

## Security and recovery limits

The platform operator must first configure public HTTPS routing, workers, `TELEGRAM_SELF_SERVICE_ENABLED=true`, `TELEGRAM_PUBLIC_API_ORIGIN`, and a dedicated credential key in a private secret manager. Keep prior keys for reading old records; perform a controlled rewrap before retirement. Backups contain ciphertext but restoration also requires the matching key set. Do not enable the feature if key custody or recovery is undefined.

Definite provider 429/5xx responses receive a bounded retry. A timeout after `setWebhook` is ambiguous, so the connection stays inactive and **Needs attention**; repair rechecks the same bot and reinstalls the webhook. Disable and disconnect invalidate pending channel interaction tokens and fail queued deliveries. In-flight sends become uncertain and need operator reconciliation. If a token is revoked, provider webhook removal cannot be verified; the connection remains inactive with its encrypted credential until the owner supplies a valid same-bot token or an operator resolves it. Tenant deletion refuses to proceed while any channel remains undisconnected. This protects external webhook cleanup but creates an operational escalation for irrecoverable legacy/revoked credentials.

No live Telegram token, public webhook, provider callback or real OpenAI call was used. Real-provider identity, webhook installation/removal, delivery and rate behavior remain **NOT TESTED**. The new onboarding was tested under local Node 24 rather than the documented Node 22 LTS production target, and the new control plane was not exercised in a public HTTPS staging environment. These remain release checks. Possession of a bot token demonstrates API control of that bot but does not independently prove the human's ownership of the Telegram account; review the business onboarding and support policy. WhatsApp Business Platform and Instagram Messaging API remain **not implemented**; their future connection flow needs official business authorization, permissions, webhook security, messaging policy and delivery health checks. Telegram token paste is not assumed appropriate for Meta.
