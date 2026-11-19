# Telegram live delivery diagnostic — 2026-11-12

## Executive summary and verdict

**NO-GO for live Telegram messaging.** The immediate failure is upstream of the API: the public `https://api.openstacktool.com/health/ready` returned Cloudflare HTTP 530 while local `http://127.0.0.1:5000/health/ready` returned 200. `cloudflared.service` was repeatedly exiting because `/etc/cloudflared/token` did not exist. The registered bot's official `getWebhookInfo` returned the expected webhook URL, `pending_update_count=2`, `last_error_date=2026-11-12T07:28:50Z`, and a last-error category of HTTP 530. The connected Telegram record had zero inbound updates, requests, and deliveries. These observations establish that the test messages did not enter the API. A dashboard status of **Connected / Verified** reflected successful webhook registration, not current public reachability.

No tunnel credential, webhook, database record, bot, DNS setting, or provider configuration was changed. The operator must restore the existing tunnel's token file through the approved secret-management process, confirm the service is active and public health returns 200, then send a fresh message from an authorized Telegram account. A live reply has **not** been verified.

## Lifecycle evidence

| Stage | Status | Evidence |
| --- | --- | --- |
| Telegram accepts `/start` and `Merhaba` | PARTIAL | Provider reported two pending updates; their bodies were not inspected. |
| Telegram posts to registered webhook | FAIL | Official `getWebhookInfo` showed expected URL but HTTP 530 last error and two pending updates. |
| Cloudflare forwards to local API | FAIL | Public health 530; `cloudflared.service` auto-restarting with missing token file. Local API health 200. |
| Webhook secret authentication | NOT VERIFIED LIVE | No inbound record. Mocked route tests accept the correct secret and reject an absent one. |
| Connection and tenant resolution | NOT VERIFIED LIVE | Connection and assigned assistant are active in MongoDB; no live update reached them. Mocked tenant tests pass. |
| Normalization and persistence | NOT VERIFIED LIVE | Zero live `channelinbounds` for this connection. Mocked private-message tests pass. |
| Conversation and request queue | NOT VERIFIED LIVE | Zero live `widgetrequests` for this connection. Mocked tests create tenant-scoped conversations and requests. |
| Shared AI worker and provider | NOT VERIFIED LIVE | `src/index.ts` starts the worker in the running API process, but no live Telegram request reached it. No paid AI call was made. |
| Assistant tool execution | NOT VERIFIED LIVE | Existing deterministic appointment/callback tests pass; no live invocation. |
| Assistant response persistence | NOT VERIFIED LIVE | No live request; mocked processing persists the response. |
| Outbox job and worker | NOT VERIFIED LIVE | `src/index.ts` starts the Telegram worker; zero live deliveries. Mocked tests pass. |
| Bot API `sendMessage` and Telegram receipt | NOT VERIFIED LIVE | No live delivery was attempted. Mocked success, 429 retry and uncertain-send cases pass. |

The official Bot API diagnostic call was read-only. Its token and response error text were not printed or stored in this report. The public health check did not include credentials. The tunnel service startup error was read from local systemd logs.

## Code repair

- `apps/api/src/services/widget-queue.ts`: Telegram `/start` now produces a short EN/TR greeting from the assigned assistant without a model call or budget reservation. Other slash commands receive safe guidance; normal text still follows the AI pipeline. The response uses the existing durable request/message/outbox path, so retries do not create duplicate replies.
- `apps/api/src/services/channels/telegram-service.ts`: the Telegram worker now recovers older `received` inbound records after an interrupted webhook request. Existing idempotent request and delivery keys still govern replay. Added safe queue, delivery and worker-start diagnostics keyed by MongoDB IDs.
- `apps/api/src/routes/telegram.ts`: added safe webhook rejection, ignored-update, persisted-update and accepted-update events. These events contain no body, contact information or credentials.
- `apps/api/test/channel-onboarding.test.ts`: added `/start` with zero AI calls, duplicate-update delivery dedupe, and stranded-inbound recovery through a mocked provider. Existing normal message, callback, role, tenant, credential and retry checks remain.
- `README.md` and `docs/DEPLOYMENT.md`: documented all long-running processes, local topology, tracing and troubleshooting.

The API process started by `src/index.ts` already launches the shared AI worker and Telegram delivery worker. There is no missing standalone worker process in the current topology. The locally running `tsx` API process predates these source changes; restart it only after the approved tunnel configuration is restored and the operator is ready to conduct a live test.

## Verification performed

| Command or check | Result |
| --- | --- |
| `curl` local API `/health/ready` | 200 |
| `curl` public HTTPS `/health/ready` | 530 |
| `systemctl status cloudflared.service` and sanitized journal | Auto-restart; configured token file absent |
| Read-only MongoDB connection/queue counts | Connected, active assistant; zero inbound, requests and outbound |
| Read-only Bot API `getWebhookInfo` | URL matches, two pending, latest error HTTP 530 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS, 53 API tests |
| `npm run test:browser -w apps/web` | PASS, 15 browser tests including widget |
| `npm run brand:check` | PASS |
| `npm audit --audit-level=low --json` | PASS, zero reported vulnerabilities |
| `git diff --check` | PASS |

All automated Telegram provider and AI calls above were mocked. Tests prove the application behavior under those fixtures, not live delivery. No real Telegram user message was sent by this investigation, and no paid OpenAI request was made.

## Operator recovery and live acceptance

1. Restore the existing tunnel token at the configured systemd path through the approved secret-management workflow. Do not paste it into chat, logs, shell history or source control. Confirm the existing tunnel service becomes `active (running)` and public `/health/ready` returns 200 from the intended API instance.
2. Recheck official `getWebhookInfo`: URL still matches the connection webhook, pending count decreases, and no fresh delivery error appears. Keep `allowed_updates` as `message` and `callback_query`.
3. Restart the local API to load the repaired build, then send `/start` and one ordinary message from an authorized Telegram account. Follow `inboundId → requestId → deliveryId` in redacted logs and database statuses. Confirm exactly one response reaches the same private chat for each update and the assigned assistant is used.
4. Check budget/AI provider errors, outbound 429/5xx retries and any `uncertain` delivery before pilot use. Reconcile ambiguous sends manually; do not blindly replay them.

Until these steps succeed, Telegram live messaging and provider tool execution remain **NOT VERIFIED**. The missing tunnel credential is an external operational blocker, not a reason to weaken webhook authentication or change the bot's configuration.
