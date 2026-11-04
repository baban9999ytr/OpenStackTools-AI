# MongoDB schema and indexes

`apps/api/src/models/index.ts` is the source of truth. Transactions require a replica set. Collection names below are Mongoose defaults.

| Collection | Key fields and indexes |
| --- | --- |
| `users` | Unique normalized email; bcrypt password hash selected only for authentication; verification timestamp |
| `organizations` | Name, daily/monthly budget in USD micros, retention days |
| `memberships` | Unique `(organizationId,userId)` and `(userId,organizationId)`; owner/admin/agent/viewer role |
| `assistants` | Unique public key; `(organizationId,createdAt)` and `(allowedOrigins,active)` |
| `conversations` | `(organizationId,updatedAt)`; `(organizationId,assistantId,visitorId)`; processing request lease |
| `messages` | `(organizationId,conversationId,createdAt)`; unique partial client message ID and unique partial `(requestId,role)` |
| `sessions` | Unique HMAC token hash; expiry TTL |
| `accounttokens` | Unique HMAC token hash; purpose, email, expiry TTL, used timestamp |
| `widgetsessions` | Unique HMAC token hash; origin/visitor/assistant/organization; expiry TTL |
| `widgetrequests` | Unique `(organizationId,assistantId,visitorId,clientMessageId)`; status and conversation queue indexes |
| `budgetwindows` | Unique `(organizationId,kind,periodStart)`; spent, reserved, and limit micros |
| `usageevents` | `(organizationId,createdAt)`; `(requestId,billingStatus)`; model, tokens, measured or uncertain cost |
| `ratecounters` | Unique hashed window key; expiry TTL |
| `auditevents` | `(organizationId,createdAt)`; actor, action, target, result |

All tenant-owned reads and mutations require an organization predicate. MongoDB does not provide application row-level security. The daily retention worker removes expired conversations, messages, and requests; usage and audit ledgers remain until full tenant deletion. Backups have separate retention.
