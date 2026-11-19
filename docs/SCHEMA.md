# MongoDB schema and indexes

`apps/api/src/models/index.ts` is the source of truth. Transactions require a replica set. Collection names below are Mongoose defaults.

| Collection | Key fields and indexes |
| --- | --- |
| `users` | Unique normalized email; bcrypt password hash selected only for authentication; verification timestamp |
| `organizations` | Name, daily/monthly budget in USD micros, retention days |
| `memberships` | Unique `(organizationId,userId)` and `(userId,organizationId)`; owner/admin/agent/viewer role |
| `assistants` | Unique public key; `(organizationId,createdAt)` and `(allowedOrigins,active)`; response length, fallback language, tone, greeting, emoji, booking-name requirement and default duration settings |
| `conversations` | `(organizationId,updatedAt)`; `(organizationId,assistantId,visitorId)`; processing request lease; bounded embedded viewing workflow with selected listing, local date/time, proposed slot, staff, duration, visitor-supplied booking name and source request ID, and pending question |
| `messages` | `(organizationId,conversationId,createdAt)`; unique partial client message ID and unique partial `(requestId,role)`; optional retrieval marker excluded from later model context |
| `sessions` | Unique HMAC token hash; expiry TTL |
| `accounttokens` | Unique HMAC token hash; purpose, email, expiry TTL, used timestamp |
| `widgetsessions` | Unique HMAC token hash; origin/visitor/assistant/organization, EN/TR locale; expiry TTL |
| `widgetrequests` | Unique `(organizationId,assistantId,visitorId,clientMessageId)`; status, conversation queue, and action lookup indexes; EN/TR locale |
| `budgetwindows` | Unique `(organizationId,kind,periodStart)`; spent, reserved, and limit micros |
| `usageevents` | `(organizationId,createdAt)`; `(requestId,billingStatus)`; model, total input/output tokens, reported cache-read/cache-write/reasoning tokens, usage-breakdown flag, measured or uncertain estimated cost |
| `ratecounters` | Unique hashed window key; expiry TTL |
| `auditevents` | `(organizationId,createdAt)`; actor, action, target, result |
| `staffavailabilities` | Unique `(organizationId,staffId)`; weekly local windows, services, and allowed appointment durations |
| `customers` | `(organizationId,updatedAt)` and conversation association; consent, preferences, lead status, assignment, follow-up; unique partial `(organizationId,identityKey)` for new widget records sharing one visitor and conversation |
| `businessknowledges` | Unique organization ID; bounded profile, services/prices, FAQ, policies, contact and facts |
| `listings` | `(organizationId,archivedAt,availability,price)` and `(organizationId,updatedAt)`; structured real-estate fields, optional `listingType` (`rent`/`sale`), update timestamp, archive marker |
| `appointments` | `(organizationId,startAt)`, `(organizationId,staffId,startAt)`, visitor; UTC start/end, booked/cancelled status, optional tenant-validated listing and visitor name |
| `appointmentslots` | Unique `(organizationId,staffId,startAt)` for 15-minute UTC occupancy; appointment reference |
| `agentactions` | Unique `(organizationId,idempotencyKey)`; validated name/arguments, pending/completed/failed status, result, confirmation expiry, actor or visitor, EN/TR locale |
| `demoseeds` | Local demo seed marker, tenant and owner IDs, version; never used to grant production access |
| `channelconnections` | Unique `(channel,externalAccountId)`; tenant/assistant binding, operator env references or managed credential marker, provider bot name/username, lifecycle status, webhook state/check times, operation lease and active flag. A verified disconnect changes the account ID to a unique released marker, preserving history while freeing the bot ID. |
| `channelcredentials` | Unique `connectionId`, indexed `(organizationId,connectionId)`; AES-256-GCM ciphertext, nonce, tag and versioned key ID for bot token and webhook secret; excluded from tenant export and deleted with tenant or verified disconnect |
| `channelidentities` | Unique `(channelConnectionId,externalConversationId,senderId)`; tenant-owned visitor mapping and current conversation |
| `channelinbounds` | Unique `(channelConnectionId,externalMessageId)`; tenant-scoped normalized webhook update and processing status |
| `interactiontokens` | Unique token hash, action and tenant/conversation/visitor/connection scope, expiry TTL and consumed timestamp |
| `actionconfirmationaudits` | Unique `(organizationId,dedupeKey)`; method, channel, action and confirmation outcome |
| `channeldeliveries` | Unique `(channelConnectionId,dedupeKey)`; tenant conversation, outbox state, attempts and provider message ID |

All tenant-owned reads and mutations require an organization predicate. MongoDB does not provide application row-level security. The daily retention worker removes expired conversations, messages, requests, channel deliveries, interaction tokens and confirmation audit entries; it unlinks channel identities from removed conversations and deletes old inbound updates. It also removes old action/customer records, archived listings, and old appointments with their slot claims after the configured period. Current business knowledge and active listings remain until edited or full tenant deletion. Usage and staff audit ledgers remain until full tenant deletion. Tenant deletion requires channel disconnection first, then deletes encrypted credentials and other tenant records in a transaction. Backups have separate retention. Existing organizations without scheduling fields behave as UTC and closed until configured.

## Demo and response style additions

`Assistant.responseLength` is `short | balanced | detailed` with a schema default of `short`. Older documents without the field are interpreted as `short` by the widget worker and dashboard. `DemoSeed` records the local seed marker, organization ID, owner ID and version. The seed creates only separate demo-owned `Organization`, `User`, `Membership`, `Assistant`, `BusinessKnowledge`, `Listing`, `StaffAvailability`, `Conversation`, `Message`, `Customer`, `Appointment`, and `AppointmentSlot` records. Synthetic usage is not placed in `UsageEvent`.
# Model configuration additions

- `organizations.allowedModels` (optional string array) and `organizations.maxReasoningEffort` (optional): operator policy caps, read during configuration save and every queued request. Empty or absent allowlist uses the platform allowlist.
- `assistants.modelSelection` (optional validated preset or custom object): absent means legacy server configuration. `settingsVersion` supports optimistic concurrency on dashboard edits; existing records without it count as version zero.
- `widgetrequests.aiModel` and `aiPricingVersion`: selected before budget reservation to attribute uncertain provider outcomes.
- `usageevents.requestedTier`, `actualTier`, and `pricingVersion`: record what was requested, delivered, and priced. Existing entries may omit these fields.
