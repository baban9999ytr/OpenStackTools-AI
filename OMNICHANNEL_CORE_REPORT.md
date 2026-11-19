# Omnichannel core and universal confirmation

## Architecture audit

Before this change, the website bearer session and `widget.ts` route were the only customer ingress. `widget-queue.ts` already provided durable per-conversation ordering, AI orchestration, tenant-scoped knowledge/listings, appointment actions, handoff, and daily/monthly budget reservations. `AgentAction` and `AppointmentSlot` already provided pending actions and transactional booking safety. These parts were reused. The coupling was the queue's requirement for `WidgetSession`, the `web`-only conversation schema, and website-only confirmation entry point.

## Implemented boundary

- `enqueueConversationMessage` accepts a validated website or external-channel identity and feeds the existing `WidgetRequest` queue. The website still calls it through `enqueueWidgetMessage`; Telegram uses a tenant-owned connection and identity. No second AI engine, appointment engine or budget system was added.
- `ChannelAdapter` defines normalized inbound messages, capabilities, outbound text, interactive confirmation and callback acknowledgement. The first implementation handles Telegram private text and callback updates. WhatsApp and Instagram have contracts only.
- Telegram webhook requests require the configured `X-Telegram-Bot-Api-Secret-Token` and an active assistant/connection binding. The bot token and webhook secret are environment references stored on the server. A local operator binds a bot ID, and a separate opt-in command verifies it with `getMe` before installing a public HTTPS webhook. Neither command was run against a provider for this report.
- Unique inbound update IDs and queued message IDs prevent repeated webhooks from creating duplicate requests. The existing conversation lease serializes AI processing. Outbound replies are staged in a MongoDB outbox; explicit 429/5xx errors are retried with backoff. Network uncertainty and expired send leases stop automatic replay and require operator reconciliation.
- Website buttons, Telegram callback tokens and narrow explicit text approval use the same `confirmAction` transaction. Tokens are random, short-lived, scoped to tenant/assistant/conversation/visitor/connection and hashed for validation. Transient inbound/outbox copies are AES-GCM sealed; owner export strips them. A bare “yes” asks for clarification. Appointment schedule and slot claims are rechecked at commit, and completed action replays do not book twice.
- The new channel collections are included in owner export, tenant deletion and retention. Customer replies for handoff, budget exhaustion and failure are localized to EN/TR.

## Verification

Executed against the working tree with fake AI and fake Telegram delivery, using an ephemeral MongoDB replica set:

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS, API and web |
| `npm run build` | PASS, API and web production builds |
| `npm test` | PASS, 51 API tests |
| `npm run test:browser -w apps/web` | PASS, 14 Chromium browser tests |
| `npm run brand:check` | PASS |
| `npm audit --audit-level=low --json` | PASS, zero reported vulnerabilities |
| `git diff --check` | PASS |

The new integration test covers the fictional Nilüfer real-estate search, comparison, unverified balcony detail, afternoon availability, pending appointment, callback and explicit text confirmation, duplicate webhook and token replay, ambiguous text, wrong sender, cross-tenant token, handoff, provider 429 retry, uncertain network delivery, expired token and budget exhaustion. It verifies one booking per accepted confirmation and no provider call for text confirmation. Existing widget button tests remain passing. This is deterministic integration coverage, not evidence of live Telegram or OpenAI behavior.

## Security and operational review

Organization and assistant IDs are resolved from the active channel connection, never from webhook JSON. Only private Telegram chats whose chat and sender IDs match are accepted. Callback authorization includes visitor, conversation and connection scope; action execution also requires the originating request to have completed. MongoDB unique indexes and appointment slot claims are the final replay and double-booking barriers. The API keeps existing rate limits and AI budgets for both channels. Telegram's `sendMessage` response provides a provider message ID for successful deliveries. Outbound network timeouts are intentionally marked `uncertain` to avoid an unsafe duplicate resend.

Remaining release gates: no Telegram bot token or reachable public HTTPS endpoint was provided, so `setWebhook`, live send/callback delivery, rate-limit behavior and provider identity were not verified. A human must review `uncertain` outbox rows, callback acknowledgement failures, and stored personal data/backup access. The session secret is also the key source for transient token sealing; rotation requires draining or invalidating pending channel deliveries. No live OpenAI tool calling was exercised. This change does not make the product ready for a real-business pilot on its own.

## WhatsApp and Instagram readiness

The common inbound/outbound contract and tenant connection mapping can be reused. Each future adapter still needs provider-specific webhook authenticity verification, account and permission setup, supported interactive formats, message-window policy, delivery receipts, rate limits, retries, and an end-to-end live test. The project does not currently send or receive WhatsApp or Instagram messages. Meta's current official requirements could not be verified in this session; no provider capabilities or costs are asserted here.

## Local setup

The optional Telegram environment variables, binding command, HTTPS webhook setup command and worker monitoring notes are in [README.md](README.md#telegram-channel-optional). Ordinary API and browser tests need no Telegram credentials. The webhook setup command is explicitly opt-in and makes live Bot API calls only when an operator invokes it. The [official Telegram Bot API](https://core.telegram.org/bots/api) documents `setWebhook`, secret headers, update IDs, inline callback data, `sendMessage` and callback acknowledgement.
