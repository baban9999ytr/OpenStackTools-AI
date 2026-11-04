# Architecture

## System boundary

The API is an Express 5 TypeScript service. MongoDB stores organizations, users, memberships, assistants, conversations, messages, sessions, and usage events. React serves the business dashboard and a separately bundled website widget. The OpenAI key stays in the API process. `src/services/ai.ts` defines the responder contract and isolates the provider call from HTTP handlers. Tests inject a fake responder through `createApp`.

```
Website -> embed.js -> /api/widget -> widget session -> conversation service -> AI responder
Staff browser -> dashboard -> /api/auth + /api/organizations -> membership authorization
                                             |                  |
                                          MongoDB          OpenAI API
```

The website widget is script-based so a browser request carries the actual host page `Origin`. Assistants explicitly list allowed origins. The API checks this origin before issuing a widget session; CORS is also restricted to the dashboard or origins configured for an active assistant. The widget token is random, stored only as an HMAC hash, scoped to organization/assistant/visitor/origin, and expires in 24 hours. It is held in widget memory rather than persisted in browser storage. Reloading starts a fresh visitor session.

## Tenant boundary

Every organization dashboard route requires an authenticated user and a `Membership` lookup for the route's organization ID. Every assistant, conversation, message, and usage query includes `organizationId`. Widget requests derive organization and assistant IDs from a server-side widget session; clients cannot choose them. Conversation reads additionally filter visitor ID. `owner`, `admin`, `agent`, and `viewer` roles gate management actions. Cross-tenant API and widget tests run against a real MongoDB replica set.

## Current REST surface

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/organizations/:organizationId`, `GET/POST /api/organizations/:organizationId/members`
- `GET/POST /api/organizations/:organizationId/assistants`, `PATCH /api/organizations/:organizationId/assistants/:assistantId`
- `GET /api/organizations/:organizationId/conversations`, `GET /api/organizations/:organizationId/conversations/:conversationId/messages`, `PATCH .../status`, `POST .../reply`
- `GET /api/organizations/:organizationId/usage`
- `POST /api/widget/sessions`, `POST /api/widget/messages`, `GET /api/widget/conversations/:conversationId/messages`
- `GET /health/live`, `GET /health/ready`

## Future channel adapter contract

Future WhatsApp, Instagram, Telegram, and Messenger adapters should implement `verifyWebhook(rawBody, headers)`, `normalizeIncoming(event)`, `send(outgoing)`, and `mapDeliveryStatus(event)`, plus a capability descriptor for templates, attachments, reply windows, and rate limits. Normalize to a tenant-scoped message envelope before dispatching through the shared conversation/AI service. Store provider event IDs with unique indexes, acknowledge webhooks quickly, queue work, and use an outbox for retries. None of these adapters or queues are implemented yet. Official API access, permissions, and costs must be checked when each channel is scheduled.

## Intentional scope limits

Only website conversations exist. There is no billing, self-service invitation, knowledge retrieval, model fallback, cross-channel identity linking, or platform administration. Usage events record provider token counts but the dashboard only totals its latest 100 events and no budget is enforced. The AI request is synchronous. These limits are tracked in the roadmap.
