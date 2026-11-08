# MongoDB schema and indexes

`apps/api/src/models/index.ts` is the source of truth. Transactions require a replica set. Collection names below are Mongoose defaults.

| Collection | Key fields and indexes |
| --- | --- |
| `users` | Unique normalized email; bcrypt password hash selected only for authentication; verification timestamp |
| `organizations` | Name, daily/monthly budget in USD micros, retention days |
| `memberships` | Unique `(organizationId,userId)` and `(userId,organizationId)`; owner/admin/agent/viewer role |
| `assistants` | Unique public key; `(organizationId,createdAt)` and `(allowedOrigins,active)` |
| `conversations` | `(organizationId,updatedAt)`; `(organizationId,assistantId,visitorId)`; processing request lease |
| `messages` | `(organizationId,conversationId,createdAt)`; unique partial client message ID and unique partial `(requestId,role)`; optional retrieval marker excluded from later model context |
| `sessions` | Unique HMAC token hash; expiry TTL |
| `accounttokens` | Unique HMAC token hash; purpose, email, expiry TTL, used timestamp |
| `widgetsessions` | Unique HMAC token hash; origin/visitor/assistant/organization, EN/TR locale; expiry TTL |
| `widgetrequests` | Unique `(organizationId,assistantId,visitorId,clientMessageId)`; status, conversation queue, and action lookup indexes; EN/TR locale |
| `budgetwindows` | Unique `(organizationId,kind,periodStart)`; spent, reserved, and limit micros |
| `usageevents` | `(organizationId,createdAt)`; `(requestId,billingStatus)`; model, total input/output tokens, reported cache-read/cache-write/reasoning tokens, usage-breakdown flag, measured or uncertain estimated cost |
| `ratecounters` | Unique hashed window key; expiry TTL |
| `auditevents` | `(organizationId,createdAt)`; actor, action, target, result |
| `staffavailabilities` | Unique `(organizationId,staffId)`; weekly local windows |
| `customers` | `(organizationId,updatedAt)` and conversation association; consent, preferences, lead status, assignment, follow-up; unique partial `(organizationId,identityKey)` for new widget records sharing one visitor and conversation |
| `businessknowledges` | Unique organization ID; bounded profile, services/prices, FAQ, policies, contact and facts |
| `listings` | `(organizationId,archivedAt,availability,price)` and `(organizationId,updatedAt)`; structured real-estate fields, update timestamp, archive marker |
| `appointments` | `(organizationId,startAt)`, `(organizationId,staffId,startAt)`, visitor; UTC start/end, booked/cancelled status |
| `appointmentslots` | Unique `(organizationId,staffId,startAt)` for 15-minute UTC occupancy; appointment reference |
| `agentactions` | Unique `(organizationId,idempotencyKey)`; validated name/arguments, pending/completed/failed status, result, confirmation expiry, actor or visitor, EN/TR locale |

All tenant-owned reads and mutations require an organization predicate. MongoDB does not provide application row-level security. The daily retention worker removes expired conversations, messages, and requests; it also removes old action/customer records, archived listings, and old appointments with their slot claims after the configured period. Current business knowledge and active listings remain until edited or full tenant deletion. Usage and staff audit ledgers remain until full tenant deletion. Backups have separate retention. Existing organizations without scheduling fields behave as UTC and closed until configured.
