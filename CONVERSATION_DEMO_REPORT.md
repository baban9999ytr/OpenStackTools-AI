# Conversation controls and fictional company demo

## Implemented

- Assistants store `responseLength` (`short`, `balanced`, `detailed`) in MongoDB. Authenticated owner/admin create and edit requests validate it. New assistants default to Short; existing documents without the field are read as Short. The dashboard has a labeled EN/TR select. Model instructions carry the style, while explicit visitor requests and safety, consent, confirmation, and verified facts take precedence. No model output is cut to a word limit. Generic business introductions use a shorter selection of verified information; specific policy questions retain policy content.
- The receptionist prompt includes the current UTC time, the organization-local date and time zone, configured staff IDs, prior search filters and the previous verified result count. The server resolves an omitted “tomorrow/yarın” date using the business time zone and uses a 30-minute availability check when duration is omitted. A missing staff choice selects a configured consultant and names that consultant in the validated availability reply. Tool argument validation, booking confirmation and server-side availability remain authoritative.
- Search follow-ups retain budget, currency, property type, room count and rent/sale intent. An explicit request for another neighborhood without a new location removes the previous free-text location filter; verified searches are run again. Turkish `3+1` is mapped to at least three rooms. Invalid model action arguments now produce a focused clarification rather than an internal validation phrase.
- A development-only, explicitly opted-in seed creates **DEMO — Nilüfer Demo Emlak**: 13 fictional listings (rental/sale, multiple neighborhoods and sizes, reserved/sold and stale cases), three fictional consultants with services, weekly windows and supported 30/60-minute appointments, two occupied appointment fixtures, business knowledge, one consented synthetic customer request and two synthetic conversations. A pair of current rental 3+1 apartments in Bursa Nilüfer match a 30,000 TRY maximum. All records are visibly marked DEMO. No synthetic usage is inserted into actual model-usage accounting.

## Files changed in this phase

- API: `apps/api/src/models/index.ts`, `routes/assistants.ts`, `routes/receptionist.ts`, `services/widget-queue.ts`, `services/agent-actions.ts`, `services/appointments.ts`, `scripts/demo-data.ts`, `scripts/seed-demo.ts`, and `apps/api/package.json`.
- Dashboard: `apps/web/src/App.tsx`, `apps/web/src/api.ts`, and `apps/web/src/preferences.tsx`.
- Tests: `apps/api/test/receptionist.test.ts`, `apps/api/test/demo-seed.test.ts`, and `apps/web/test/dashboard.spec.ts`.
- Documentation: `README.md`, `docs/SCHEMA.md`, `docs/SECURITY_REVIEW.md`, and this report.

Other uncommitted changes from the preceding debugging/widget session were preserved and verified together; the preexisting `apps/web/public/chat-test.html` was not edited.

## Account and provisioning status

A read-only query against the configured **local** MongoDB found `test@gmail.com` already registered. No account, password, membership or organization belonging to that address was modified or granted demo access. The alternative identity is `demo-owner@openstacktools.test`; it is created only when the developer runs `npm run demo:seed -w apps/api` with `DEMO_SEED_CONFIRM=local-demo-only` and a private `DEMO_OWNER_PASSWORD`. See [README.md](README.md) for the non-echoing terminal setup. The command refuses production mode, nonlocal MongoDB hosts, and conflicting synthetic identities. It checks the seed marker before a repeat run and never resets or deletes existing records. The owner account is marked verified only inside this local synthetic workflow; production registration still requires email verification.

The command was executed twice in an **ephemeral MongoDB replica set** during automated tests: first creation and then a no-change repeat. Those tests created 13 listings, three staff schedules and two occupied appointments. The persistent local development database was **not seeded** because no developer-selected demo password was supplied. No real email, SMS or OpenAI call occurred. The demo owner email is a reserved `.test` address; there is no claim of inbox ownership.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | PASS — 41 MongoDB-backed API tests |
| `npm run test:browser -w apps/web` | PASS — 14 Chromium tests, including responsive EN/TR dark-theme assistant control and accessibility scan |
| `npm run typecheck` | PASS — API and web |
| `npm run build` | PASS — API and production web/widget bundles |
| `npm run brand:check` | PASS |
| `npm run eval:deterministic -w apps/api` | PASS — 68 synthetic scenarios; 64 applicable backend assertions, four skipped backend checks |
| `npm run eval:typecheck -w apps/api` | PASS |
| `npm audit --audit-level=low` | PASS — zero reported vulnerabilities |

Tests cover response modes, legacy default handling, tenant authorization, seed idempotence, existing-account protection, listing filters and freshness, business-zone date calculation, staff schedule checks, confirmation, booking conflicts and handoff. Browser API routes use mocks; MongoDB API tests use a real ephemeral replica set and deterministic AI fakes. Deterministic evaluation scores do **not** establish live model accuracy.

## Security and remaining limitations

- All demo users, listings, conversations and appointments are tenant-scoped. The seed uses a transaction and refuses an identity or organization name collision without its own marker. It does not provide cleanup, and it never overwrites changed demo records.
- Free-text location hierarchy remains ambiguous. Broadening “another neighborhood” can include adjacent districts unless the visitor or model supplies a narrower parent area. A structured city/district/neighborhood schema would improve this without relying on model interpretation.
- The assistant picks a configured consultant for an otherwise unspecified availability query. The validated reply names that consultant; the visitor must still explicitly confirm a booking. Appointment fixtures represent occupied 30-minute slots on the next working day; availability is computed from the real slot index.
- Live GPT-6 Luna tool selection, wording, latency and provider billing remain unverified without approved credentials. No paid provider call was made. The seeded dashboard shows zero AI usage until actual metered requests occur.
- The local seed is a development aid, not production onboarding. Production email verification and authorization remain required. No deployment or commit was made.
