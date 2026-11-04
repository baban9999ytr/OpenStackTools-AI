# MongoDB schema and indexes

The source of truth is `apps/api/src/models/index.ts`. Each document uses Mongoose timestamps. MongoDB is retained for this foundation. Account and staff creation use transactions and therefore require a replica set, including in local development.

| Collection | Key fields | Indexes |
| --- | --- | --- |
| `users` | email, name, selected passwordHash | unique email |
| `organizations` | name | default `_id` |
| `memberships` | organizationId, userId, role | unique `(organizationId,userId)`; `(userId,organizationId)` |
| `assistants` | organizationId, name, instructions, publicKey, allowedOrigins, active | unique publicKey; `(organizationId,createdAt)`; `(allowedOrigins,active)` |
| `conversations` | organizationId, assistantId, visitorId, channel, status, assignedTo | `(organizationId,updatedAt)`; `(organizationId,assistantId,visitorId)` |
| `messages` | organizationId, conversationId, role, text, clientMessageId | `(organizationId,conversationId,createdAt)`; unique partial `(organizationId,conversationId,clientMessageId)` |
| `sessions` | HMAC tokenHash, userId, expiresAt | unique tokenHash; TTL expiresAt |
| `widgetsessions` | HMAC tokenHash, organizationId, assistantId, visitorId, origin, expiresAt | unique tokenHash; TTL expiresAt |
| `usageevents` | organizationId, assistantId, conversationId, model, token counts | `(organizationId,createdAt)` |

Tenant IDs are required in every tenant-owned collection and in all read/write predicates. The application enforces this boundary; MongoDB has no row-level security. Backups, restore tests, tenant export/deletion, and retention policies remain production work. The partial unique message index reduces duplicate deliveries within a conversation; it does not yet cover a retried first message that creates a second conversation.
