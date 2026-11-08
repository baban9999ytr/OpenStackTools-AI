# Phase 6 — Business knowledge, lightweight CRM and real-estate assistant

Date: 2026-11-08 (Europe/Istanbul). Local implementation only. No deployment, DNS change, push, purchase, customer contact, external platform integration or live OpenAI call occurred.

## Architecture and reuse

The existing Express/Mongoose organization and role checks, origin-bound widget sessions, durable request queue, usage budgets, appointment actions, customer consent confirmation, staff audit middleware and handoff path remain in use. No new infrastructure or npm dependency was added.

One `BusinessKnowledge` document per organization stores bounded public-facing profile, services/prices, FAQ, policies, contact details and custom facts. Owner/admin staff can replace its validated contents. An optional `Listing` collection stores structured real-estate records. Staff can create, update, archive and search; the dashboard shows stale nonarchived records so they can be corrected. The widget's `search_listings` action returns at most ten available, nonarchived records updated within 30 days. A budget ceiling requires a currency, preventing direct comparison of different currencies. Listing title, price, URL and update date in a widget answer come from database results.

The existing `Customer` record now supports requirements, budget range, locations and property preferences, lead status, staff assignment, notes and follow-up time. Only records with recorded consent can be edited as leads. Staff assignment checks membership in the same organization. New widget customer records have a unique partial key based on visitor session and conversation; a repeat confirmed request reuses the record only when the supplied name and contact match. Names or unverified contact strings are never used to merge identities. Existing records without that new key remain readable.

Two fixed AI actions, `get_business_knowledge` and `search_listings`, accept strict backend-validated arguments. The model cannot submit a database query or choose an arbitrary action executor. The server performs retrieval with an organization predicate and sends a deterministic result to the visitor. Knowledge text is not inserted into the system instructions; retrieval response messages are omitted from later model context. The dashboard's conversation summaries are recent message excerpts and are labelled as such, not AI-generated summaries.

## Security and data lifecycle

All staff endpoints require an authenticated organization role; business knowledge changes require owner/admin, listing and lead mutations require owner/admin/agent. Widget retrieval uses the session's organization ID. Inputs have fixed field lengths and counts. Search location is escaped before use in a bounded case-insensitive regex. Active knowledge and listings persist until edited or tenant deletion. Archived listings follow the organization's configured retention window. Owner export and confirmed tenant deletion include both new collections.

Staff-entered knowledge is untrusted and can be returned to a visitor as business-provided data. It cannot change backend authorization, action schemas, or system instructions. Excluding retrieval messages from subsequent model history reduces prompt-injection carryover; it does not guarantee safe or accurate free-text model output. Staff must review information before publishing it to the widget.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 29 API tests pass against ephemeral MongoDB replica sets, including Phase 5 appointment and budget regressions, knowledge CRUD/roles, listing filters, stale and archived behavior, widget retrieval, tenant isolation, consent, duplicate customer prevention, lead updates and stored prompt-injection carryover. AI replies are deterministic fakes. |
| `npm run test:browser -w apps/web` | 10 Chromium Playwright tests pass. The new test covers the mobile Turkish/dark Business screen, a knowledge save, responsive width and axe accessibility. Dashboard/widget APIs are mocked in browser tests. |
| `npm run typecheck`; `npm run build`; `npm run brand:check` | API and web TypeScript, production builds and brand token consistency pass. |
| `npm audit --audit-level=low` | Zero reported vulnerabilities. |
| Live GPT-6 Luna tool calling | **Not verified.** No approved provider credentials were configured or used. |

The API tests use real ephemeral MongoDB replica sets, while the browser test uses mocked API responses. The production-image HTTPS smoke from Phase 5 was not repeated for Phase 6; the current Docker image, reverse proxy and external SMTP behavior still require a staging rehearsal before pilot use.

## Limitations and pilot blockers

- The knowledge catalog is structured and small; no document uploads, vector search, semantic ranking or source verification. Topic matching uses bounded substring matching. The editor replaces the whole knowledge record, so concurrent staff edits can overwrite each other.
- Listing freshness is a fixed 30-day rule. Staff must verify listing availability and price independently. No scraping, external inventory sync, currency conversion or automated notifications exist. The dashboard search shows up to 100 nonarchived records per query; there is no pagination yet.
- Customer identity remains the origin-bound visitor session. Consent is the existing confirmation flow, not independent legal identity or external proof. The CRM is intentionally small: no deal pipeline, email automation or cross-channel identity matching.
- The model may still produce unsupported free-text claims outside fixed retrieval action results. Run prompt-injection and factuality evaluation with real provider access before a customer pilot. Live tool calling, provider cost reconciliation and external SMTP remain Phase 4B/5 blockers.
- Production-like staging still needs index rollout review, backup/restore rehearsal with the new collections, multi-instance retry/failure drills, privacy review of knowledge and lead data, and monitoring of stale listings and follow-ups.

## Recommended Phase 7

First validate one bounded real-estate workflow with a consenting business using synthetic or approved pilot data and human review. Verify GPT-6 Luna function calls and costs in a dedicated project, rehearse the current Docker image over HTTPS, and test inaccurate/malicious knowledge cases. Then add pagination, listing freshness controls and a simple lead workflow based on observed needs. Defer external property feeds, messaging channels, billing and enterprise CRM features.
