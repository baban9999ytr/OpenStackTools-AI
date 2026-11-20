# OpenStackTools AI

An independently implemented TypeScript foundation for business AI assistants. This repository contains an organization dashboard, staff roles, assistant configuration, a website chat widget, human handoff, tenant-scoped conversation storage, and OpenAI integration. It is a foundation for commercial development, **not a finished self-service SaaS**.

This repository was created in a new directory from the product requirements. No source, components, CSS, prompts, configuration, or assets were copied from the previously evaluated tutorial. See [provenance](docs/PROVENANCE.md) and [third-party licenses](docs/THIRD_PARTY_LICENSES.md). Third-party obligations still apply.

## Requirements

- Node.js 24 LTS and npm (CI uses Node 24)
- Docker Engine with Compose, or a MongoDB replica set (transactions are required for account creation)
- A server-side OpenAI key with access to the chosen model for live replies. Local tests use synthetic replies.

## Start locally with Docker

```bash
cp apps/api/.env.example apps/api/.env
# Set SESSION_SECRET, OPENAI_API_KEY, OPENAI_MODEL, budgets, model token prices, and SMTP settings.
docker compose up --build
```

Open `http://localhost:5173/app` and use Mailpit at `http://localhost:8025` to open verification and invitation email. The web image builds static assets and serves them with Nginx, including an `/app` SPA fallback and same-origin `/api` proxy. MongoDB is initialized as a single-node replica set for development. The Docker configuration binds API and web ports to localhost; MongoDB is reachable only inside the Compose network. Data persists in a Docker named volume. Do not use this Compose file as a production deployment.

## Run from Node.js

Start a local MongoDB replica set and set `MONGODB_URL` to its connection string. Then:

```bash
npm ci
cp apps/api/.env.example apps/api/.env
npm run dev:api
npm run dev:web
```

Use separate terminals for the two dev commands. Vite proxies `/api` to the backend by default; `API_PROXY_TARGET` can change that target. `VITE_API_BASE_URL` is optional for the dashboard and is empty by default.

## First use

1. Register an organization and owner account in the dashboard, then verify the email link. Staff join through owner-sent invitations and set their own passwords.
2. Create an assistant with instructions and an allowed website origin such as `http://localhost:5173`. An editable EN/TR real-estate instruction template is available in the form. In **Business**, add only customer-safe knowledge and, if needed, current real-estate listings. Staff can track consented customer opportunities and follow-ups there. Listing recommendations use stored available records updated within 30 days; they never scrape external sites.
3. Add the following script to a site hosted at one of that assistant's allowed origins, using the assistant's public key:

```html
<script src="https://YOUR-WEB-HOST/embed.js"
        data-ost-assistant="YOUR_ASSISTANT_PUBLIC_KEY"
        data-ost-api="https://YOUR-API-HOST"
        defer></script>
```

Serve `embed.js` and `embed.css` together from the same directory. The script loads its sibling stylesheet into the widget’s Shadow DOM. On the customer website, allow the exact widget asset origin in `script-src` and `style-src`, and the configured API origin in `connect-src`. If the site sets `script-src-elem` or `style-src-elem`, put the asset origin there as well. Inline script and stylesheet permissions are unnecessary. Keep the customer website’s exact origin in the assistant’s allowed origins.

The public key is an identifier, not a credential. The browser requests a short-lived, origin-bound widget session. The widget is an original React component mounted in Shadow DOM. It does not use third-party artwork.

For local testing, add the dashboard's exact origin (for example `http://localhost:5173`) to the assistant's allowed origins. The dashboard then shows **Test assistant**, which opens a same-origin page using the real widget, session, message queue and budgets. The preview is limited to loopback hosts. Inspect saved messages in **Conversations** and usage in **Usage**. A 429 pauses polling and honors `Retry-After`; a message retry keeps the same client message ID.

The widget follows the embedding page's `lang` and `data-theme` where set. Optional `data-ost-lang="tr"` or `"en"` and `data-ost-theme="dark"` or `"light"` override those choices. The dashboard stores its language and theme locally. The versioned framework-independent brand contract is [`brand/tokens.json`](brand/tokens.json); run `npm run brand:generate` after changing it, then commit both generated stylesheets.

## Assistant models and conversation strategy

The dashboard groups assistants, conversations and staff takeover, business knowledge and listings, receptionist schedules and appointments, usage budgets, and Telegram connections by organization. Website chat and private Telegram chats use the same durable MongoDB request queue. Pending booking actions require matching visitor confirmation and a fresh conflict check before a slot is committed.

| Mode | Standard model |
| --- | --- |
| Normal | GPT-6 Luna |
| Powerful | GPT-6.1 Sol |
| Very Powerful | GPT-6 Astra |
| Automatic | GPT-6 Luna only, subject to policy and budget |

New assistants currently default to an eligible preset. Saved Economical, Balanced (Terra), Advanced and custom configurations retain their compatibility. Product modes and saved preset/custom selections use Responses. Older assistants without a saved selection use the configured Chat Completions model and environment rates.

Public documentation establishes an identifier and supported API capabilities. The application registry maps that identifier to supported settings and Standard prices. Platform and organization policy authorize its use, while the operator verification record attests to access in the actual provider project. A successful Responses call verifies invocation. Quality, latency and billed cost require a separate review with synthetic conversations.

The queue intersects platform and organization reasoning ceilings, reserves worst-case spend against daily and monthly organization budgets before calling the provider, and reconciles reported tokens against the selected model's prices. Usage is an estimate in integer microdollars. Booking, idempotency and tenant permissions are enforced by the application.

Enable **Conversation strategy → Real estate preferences and follow-up** to retain bounded preferences with evidence, ask for missing information and offer verified viewing slots. Listing searches use current tenant records. Furnishing, balcony and other unverified features require clarification or staff confirmation. Existing assistants use the reactive strategy until changed in settings.

## Configuration

| Variable | Purpose |
| --- | --- |
| `MONGODB_URL` | MongoDB replica set URL |
| `SESSION_SECRET` | Secret used to hash opaque session tokens; never expose to the browser |
| `OPENAI_API_KEY` | Server-side provider key |
| `OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` | Legacy Chat Completions fallback and optional reasoning effort when an assistant has no saved selection |
| `AI_ENABLED_MODELS` | Operator allowlist for explicit selections. Defaults to Luna. Organizations may narrow it. |
| `AI_VERIFIED_MODELS` | Empty by default. Add documented model IDs only after verifying project entitlement, Responses capabilities and applicable Standard pricing. Required for product modes in addition to both allowlists. |
| `AI_AUTOMATIC_MAX_REQUEST_USD` | Optional ceiling for the full Automatic request reservation. If omitted, remaining daily and monthly tenant budget determines the ceiling. |
| `AI_MAX_REASONING_EFFORT` | Platform ceiling for tenant-selected reasoning; defaults to `medium`. Organization policy may set a stricter limit. |
| `OPENAI_MAX_COMPLETION_TOKENS` | Maximum output including reasoning tokens (1–800) |
| `APPOINTMENT_MORNING_WINDOW` / `APPOINTMENT_AFTERNOON_WINDOW` / `APPOINTMENT_EVENING_WINDOW` | Business-local, nonoverlapping 15-minute aligned periods for natural-language availability requests; defaults `09:00-12:00`, `12:00-17:00`, `17:00-21:00`. Organization and staff hours further restrict them. |
| `DEFAULT_DAILY_BUDGET_USD` / `DEFAULT_MONTHLY_BUDGET_USD` | New-organization AI spend caps in USD |
| `OPENAI_INPUT_USD_PER_MILLION_TOKENS` / `OPENAI_OUTPUT_USD_PER_MILLION_TOKENS` | Legacy fallback model prices. Explicit selections use the versioned model registry. |
| `OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS` / `OPENAI_CACHE_WRITE_USD_PER_MILLION_TOKENS` | Cache rates; if omitted, both use the ordinary input rate conservatively |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | Account email; optional `SMTP_USER` and `SMTP_PASSWORD` |
| `DASHBOARD_ORIGIN` | Exact dashboard browser origin (without `/app`) used for CORS, CSRF, and account links |
| `PORT` | API port, default 5000 |
| `NODE_ENV` / `COOKIE_SECURE` | Enable Secure cookies for HTTPS production |
| `TRUST_PROXY` | Exact count of trusted proxy hops, default 0 |
| `API_PROXY_TARGET` | Vite development API proxy destination |
| `API_UPSTREAM` | Nginx production web container's private API URL |
| `VITE_API_BASE_URL` | Optional public API origin for dashboard build |

Frontend environment variables are public. Store credentials only in the API environment or a production secret manager. Do not put production secrets in `.env.example`, source control, or build arguments.

Rental and sale searches use the listing's optional `listingType`. New dashboard listings require a selection; older records remain unclassified until staff review them. A rent or sale request never treats an unclassified listing as a verified match. A 3+1 request uses `minRooms=3`, so staff must also enter the room count for matching listings.

The current adapter uses Chat Completions function tools. Configuration rejects models whose tool calling requires the Responses API. A configured key and model name do not prove project access; live provider calls require the existing explicit opt-in verification flow.

For nonempty listing or business-knowledge results, the API can make one additional tool-free model call to write a natural answer from bounded verified facts. It checks selected factual claims and falls back to the backend formatter if synthesis fails or is rejected. Daily and monthly budget reservations include both calls, and the usage ledger sums their reported tokens. Appointment changes and confirmations remain backend-controlled. This feature has deterministic test coverage; live model quality and complete free-text factuality are not yet established.

## Local fictional real-estate demo

The demo seed creates **DEMO — Nilüfer Demo Emlak** with 13 fictional listings, three fictional consultants, two occupied appointment fixtures, business knowledge, and two synthetic conversations (one in handoff). It never uses `test@gmail.com` as a login or modifies an existing account. The alternative login identity is `demo-owner@openstacktools.test`. This reserved `.test` address is for local development only; no email is sent and no real inbox is assumed. Staff fixtures cannot sign in because their passwords are randomly generated and not exposed.

Start the local MongoDB replica set and configure `apps/api/.env` for development. In a private terminal, enter a password without echoing it:

```bash
read -rs -p 'Local demo password: ' DEMO_OWNER_PASSWORD; echo
export DEMO_OWNER_PASSWORD DEMO_SEED_CONFIRM=local-demo-only
npm run demo:seed -w apps/api
unset DEMO_OWNER_PASSWORD DEMO_SEED_CONFIRM
```

Sign in at `/app` with the `.test` identity and the password entered locally. The seed refuses production mode, nonlocal MongoDB hosts, and preexisting demo identities or organization names without its marker. Repeating a successful seed verifies the marker and leaves records unchanged. It does not reset or delete data. Never use real customer details in the demo. The demo organization has its own AI budget, but synthetic usage is **not** inserted into the actual provider-usage ledger; the dashboard starts at zero until a real request is processed. The widget preview requires the local dashboard origin in the assistant's allowed origins. Do not use the demo seed on shared or production databases.

Assistant settings now include **AI response length**: Short (default), Balanced, or Detailed. Existing assistants without the field behave as Short; editing them stores the chosen value. This is a model instruction, not a hard output cutoff. Verified listing, safety, privacy, consent, and appointment details retain priority.

Assistant settings also offer Economical (Luna), Balanced (Terra), and Advanced (Sol) model profiles plus compatible reasoning choices. A new assistant defaults to Balanced only when the operator has enabled Terra; otherwise it defaults to Economical. Existing assistants retain their server-configured legacy model until an owner or admin explicitly changes it. New profile requests use the Responses API for tool calling. The advanced processing selector currently offers Standard only; faster tiers require separate account and pricing validation. The backend validates combinations and reserves daily/monthly budget using the selected model's versioned rate table. See [model configuration report](MODEL_PROFILES_AND_ADVANCED_CONFIGURATION_REPORT.md).

Owners and admins can also set the assistant's fallback language, tone, greeting, emoji use, whether a visitor name is needed for a booking, and default appointment duration. A guided viewing conversation keeps a verified listing and date through time selection and optional name collection. The server checks availability before proposing a booking; explicit confirmation is still required. These settings cannot override tenant access, platform safety rules, or booking controls. See the [conversational intelligence report](CONVERSATIONAL_INTELLIGENCE_REPORT.md) for evaluated behavior and limits.

## Telegram channel (optional)

The website widget and Telegram private chats use the same tenant-scoped conversation queue, assistant, appointment actions and AI budget. Telegram is not required for local development. The integration has deterministic tests with a fake adapter; real Telegram delivery has not been verified here.

For a live local Telegram test, run the authenticated MongoDB replica set, API process (`npm run dev:api`), dashboard (`npm run dev:web`), and the approved HTTPS tunnel that forwards `/api/channels/telegram/*` to this API. The API process starts both the shared AI request worker and Telegram inbound recovery/outbound delivery worker; running only the web dashboard or a route-only test server will not deliver replies. Keep the API and tunnel running continuously. `/start` returns a short greeting without an OpenAI call; ordinary private text enters the assistant queue. The API logs only connection, inbound, request and delivery IDs, status and safe failure categories for tracing.

If a bot shows **Connected** but does not answer, check public `/health/ready`, the tunnel process, and Telegram `getWebhookInfo` pending count, last delivery error and expected URL first. Then inspect MongoDB `channelinbounds`, `widgetrequests` and `channeldeliveries` by connection ID and status. No inbound record means the update has not reached this API; a queued request points to the shared worker; a completed request without a delivery points to the outbox worker; a failed or uncertain delivery needs provider-error review. Do not log or paste bot tokens, webhook secrets, full message bodies or customer contact details while troubleshooting. A verified webhook URL only proves registration, not successful delivery. See [live delivery diagnostic](TELEGRAM_LIVE_DELIVERY_DIAGNOSTIC_REPORT.md).

### Self-service dashboard onboarding

The **Channels** section lets organization owners and admins connect a BotFather bot to an active assistant, check the connection, repair or replace a token, disable it, reassign the assistant and disconnect after password confirmation. WhatsApp and Instagram cards are marked **Coming soon**. Existing operator-managed connections remain visible but cannot be modified through the self-service controls.

Self-service remains disabled until the platform operator configures a public HTTPS API origin and a dedicated 32-byte credential encryption key in the API secret environment. Set `TELEGRAM_SELF_SERVICE_ENABLED=true`, `TELEGRAM_PUBLIC_API_ORIGIN=https://YOUR-PUBLIC-API-ORIGIN`, `CHANNEL_CREDENTIAL_ACTIVE_KEY_ID=V1`, and `CHANNEL_CREDENTIAL_KEY_V1` to a fresh random 32-byte value encoded as standard Base64. Generate and store the key in a secret manager; never put it in source control or the browser. Keep previous `CHANNEL_CREDENTIAL_KEY_<ID>` values available while any credential encrypted under those key IDs remains, then rewrap credentials by reconnecting them before retiring an old key. This key is separate from `SESSION_SECRET`. Do not enable self-service until the HTTPS route and workers are operating and monitored.

An owner opens [BotFather](https://t.me/BotFather), sends `/newbot`, chooses a name and a unique username ending in `bot`, then pastes **only the bot token** into Channels. The backend calls the official Bot API `getMe`, stores the verified bot ID and username, creates a per-connection webhook secret, calls `setWebhook`, and checks `getWebhookInfo` before showing **Connected**. The dashboard never asks for a Telegram account password, login code, webhook URL or personal session. A timeout or webhook mismatch displays **Needs attention** and can be repaired without creating another connection. These calls occur only when an authorized owner/admin uses the dashboard and the operator has enabled self-service; this repository verification did not make live Telegram calls.

When a bot token is revoked, check or reconnect it with a new token for the **same bot ID**. Disabling a connection blocks new inbound messages locally. Disconnect requires the staff member's current password, confirms the bot identity, removes the provider webhook, checks that it is gone, then removes the encrypted credential; historical conversations remain subject to tenant retention. Ambiguous provider outcomes remain **Needs attention** with inbound processing disabled. Monitor connection health, unhandled inbound updates, failed/uncertain outbound deliveries and decryption errors without logging tokens or message bodies. Customers must initiate their bot conversation before it can reply.

The previous operator-managed environment-variable workflow remains available below for legacy connections. No existing operator-managed binding is migrated automatically.

1. Configure a public HTTPS API origin with `/api/channels/telegram/*` forwarded to the API. Keep MongoDB, dashboard sessions and bot credentials private. Set an `OST_TELEGRAM_BOT_TOKEN_PILOT` and a random `OST_TELEGRAM_WEBHOOK_SECRET_PILOT` in the API secret environment. The webhook secret must use Telegram's allowed letters, digits, underscores or hyphens and be at most 256 characters. Never put these values in frontend environment variables.
2. With MongoDB connected, bind an existing assistant public key to the verified Telegram bot account ID. This changes local configuration and requires an explicit operator command:

   ```bash
   npm run telegram:bind -w apps/api -- --confirm=bind --assistant=ASSISTANT_PUBLIC_KEY --botId=TELEGRAM_BOT_ID --credentialEnv=OST_TELEGRAM_BOT_TOKEN_PILOT --webhookSecretEnv=OST_TELEGRAM_WEBHOOK_SECRET_PILOT
   ```

3. After the public HTTPS endpoint is reachable, set the official Bot API webhook. The command checks `getMe` against the stored bot ID before calling `setWebhook`; it prints no token or secret:

   ```bash
   npm run telegram:webhook -w apps/api -- --confirm=set-webhook --connection=CONNECTION_ID --publicOrigin=https://api.example.invalid
   ```

Use a real HTTPS origin in place of the placeholder. The webhook consumes private text messages and callback confirmations. Explicit phrases such as “Evet, randevuyu onaylıyorum” and “Yes, confirm the appointment” also confirm the matching pending appointment; a bare “yes” asks for clarification. The MongoDB outbox retries definite 429/5xx rejections, while uncertain delivery requires operator review. In production, monitor `channeldeliveries` with `status=uncertain` and `channelinbounds` that remain unhandled. A bot cannot receive customer messages until its official webhook is installed and Telegram can reach the endpoint. No live provider call is made by ordinary tests.

WhatsApp Business Platform and Instagram Messaging API are planned adapters only. Their credentials, permissions, webhook verification and outbound formats must be implemented and tested separately.

## Verification

```bash
npm run typecheck
npm run brand:check
npm run build
npm test
npm run eval:deterministic -w apps/api
npm run eval:typecheck -w apps/api
npm run test:browser -w apps/web
npm audit --audit-level=low
```

`GET /health/live` confirms the API process is alive; `GET /health/ready` checks MongoDB connectivity. API tests use a real ephemeral MongoDB replica set and a fake AI responder. The Chromium widget test uses mocked API responses. Neither calls OpenAI. See [pilot report](PILOT_READINESS_REPORT.md) and [security review](docs/SECURITY_REVIEW.md) for remaining release gates.

The explicit live OpenAI and SMTP checks require operator-set opt-in flags and dedicated credentials; see [staging runbook](STAGING_RUNBOOK.md). The [backup restore runbook](BACKUP_RESTORE_RUNBOOK.md) includes a local isolated restore rehearsal. Do not treat local Mailpit or mocked AI checks as proof of external delivery or billing.

The [testing guide](docs/VERIFICATION.md) explains the CI checks and fixture setup. The [evaluation guide](apps/api/evals/README.md) describes 128 offline scenarios and the separate three-candidate queue benchmark.

For deployment, use HTTPS, private authenticated MongoDB with backups, exact allowed origins, a production mail provider and restricted credentials. Telegram needs a reachable HTTPS webhook and monitored workers. Subscription billing, production incident response and verified live-model quality remain release gaps. [Deployment guide](docs/DEPLOYMENT.md) · [Commercial readiness](SAAS_RELEASE_READINESS_REPORT.md)

## Documentation

- [Architecture and API boundaries](docs/ARCHITECTURE.md)
- [Omnichannel core report](OMNICHANNEL_CORE_REPORT.md)
- [Self-service channel onboarding report](SELF_SERVICE_CHANNEL_ONBOARDING_REPORT.md)
- [Database schema and indexes](docs/SCHEMA.md)
- [Security review](docs/SECURITY_REVIEW.md)
- [Verification record](docs/VERIFICATION.md)
- [Deployment preparation](docs/DEPLOYMENT.md)
- [Phase 3 readiness report](PHASE3_PILOT_READINESS_REPORT.md)
- [Phase 4A local staging report](PHASE4A_LOCAL_STAGING_REPORT.md)
- [GPT-6 Luna verification report](MODEL_VERIFICATION_REPORT.md)
- [Phase 5 receptionist actions report](PHASE5_AGENT_ACTIONS_REPORT.md)
- [Phase 6 business knowledge report](PHASE6_BUSINESS_KNOWLEDGE_REPORT.md)
- [Phase 7 integration readiness report](PHASE7_INTEGRATION_READINESS_REPORT.md)
- [Phase 8A AI evaluation report](PHASE8A_AI_EVALUATION_REPORT.md)
- [Conversational intelligence report](CONVERSATIONAL_INTELLIGENCE_REPORT.md)
- [Conversation continuity repair report](CONVERSATION_CONTINUITY_REPAIR_REPORT.md)
- [Conversational Intelligence 2.0 report](CONVERSATIONAL_INTELLIGENCE_V2_REPORT.md)
- [Local HTTPS staging runbook](LOCAL_HTTPS_STAGING_RUNBOOK.md)
- [Live provider verification gates](LIVE_PROVIDER_VERIFICATION.md)
- [Staging runbook](STAGING_RUNBOOK.md)
- [Backup and restore runbook](BACKUP_RESTORE_RUNBOOK.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [Source and asset provenance](docs/PROVENANCE.md)
- [Dependency inventory and notices](docs/THIRD_PARTY_LICENSES.md)
