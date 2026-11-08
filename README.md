# OpenStackTools AI

An independently implemented TypeScript foundation for business AI assistants. This repository contains an organization dashboard, staff roles, assistant configuration, a website chat widget, human handoff, tenant-scoped conversation storage, and OpenAI integration. It is a foundation for commercial development, **not a finished self-service SaaS**.

This repository was created in a new directory from the product requirements. No source, components, CSS, prompts, configuration, or assets were copied from the previously evaluated tutorial. See [provenance](docs/PROVENANCE.md) and [third-party licenses](docs/THIRD_PARTY_LICENSES.md). Third-party obligations still apply.

## Requirements

- Node.js 22 LTS and npm
- Docker Engine with Compose, or a MongoDB replica set (transactions are required for account creation)
- An OpenAI API key and a model compatible with Chat Completions

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
2. Create an assistant with instructions and an allowed website origin such as `http://localhost:5173`. In **Business**, add only customer-safe knowledge and, if needed, current real-estate listings. Staff can track consented customer opportunities and follow-ups there. Listing recommendations use stored available records updated within 30 days; they never scrape external sites.
3. Add the following script to a site hosted at one of that assistant's allowed origins, using the assistant's public key:

```html
<script src="https://YOUR-WEB-HOST/embed.js"
        data-ost-assistant="YOUR_ASSISTANT_PUBLIC_KEY"
        data-ost-api="https://YOUR-API-HOST"
        defer></script>
```

The public key is an identifier, not a credential. The browser requests a short-lived, origin-bound widget session. The widget is an original React component mounted in Shadow DOM. It does not use third-party artwork.

The widget follows the embedding page's `lang` and `data-theme` where set. Optional `data-ost-lang="tr"` or `"en"` and `data-ost-theme="dark"` or `"light"` override those choices. The dashboard stores its language and theme locally. The versioned framework-independent brand contract is [`brand/tokens.json`](brand/tokens.json); run `npm run brand:generate` after changing it, then commit both generated stylesheets.

## Configuration

| Variable | Purpose |
| --- | --- |
| `MONGODB_URL` | MongoDB replica set URL |
| `SESSION_SECRET` | Secret used to hash opaque session tokens; never expose to the browser |
| `OPENAI_API_KEY` | Server-side provider key |
| `OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` | Chat Completions model and optional reasoning level; examples use `gpt-6-luna` with `none` |
| `OPENAI_MAX_COMPLETION_TOKENS` | Maximum output including reasoning tokens (1–800) |
| `DEFAULT_DAILY_BUDGET_USD` / `DEFAULT_MONTHLY_BUDGET_USD` | New-organization AI spend caps in USD |
| `OPENAI_INPUT_USD_PER_MILLION_TOKENS` / `OPENAI_OUTPUT_USD_PER_MILLION_TOKENS` | Current model prices used for cost estimates and budget reservations |
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

## Verification

```bash
npm run typecheck
npm run brand:check
npm run build
npm test
npm run test:browser -w apps/web
npm audit --audit-level=low
```

`GET /health/live` confirms the API process is alive; `GET /health/ready` checks MongoDB connectivity. API tests use a real ephemeral MongoDB replica set and a fake AI responder. The Chromium widget test uses mocked API responses. Neither calls OpenAI. See [pilot report](PILOT_READINESS_REPORT.md) and [security review](docs/SECURITY_REVIEW.md) for remaining release gates.

The explicit live OpenAI and SMTP checks require operator-set opt-in flags and dedicated credentials; see [staging runbook](STAGING_RUNBOOK.md). The [backup restore runbook](BACKUP_RESTORE_RUNBOOK.md) includes a local isolated restore rehearsal. Do not treat local Mailpit or mocked AI checks as proof of external delivery or billing.

## Documentation

- [Architecture and API boundaries](docs/ARCHITECTURE.md)
- [Database schema and indexes](docs/SCHEMA.md)
- [Security review](docs/SECURITY_REVIEW.md)
- [Verification record](docs/VERIFICATION.md)
- [Deployment preparation](docs/DEPLOYMENT.md)
- [Phase 3 readiness report](PHASE3_PILOT_READINESS_REPORT.md)
- [Phase 4A local staging report](PHASE4A_LOCAL_STAGING_REPORT.md)
- [GPT-6 Luna verification report](MODEL_VERIFICATION_REPORT.md)
- [Phase 5 receptionist actions report](PHASE5_AGENT_ACTIONS_REPORT.md)
- [Phase 6 business knowledge report](PHASE6_BUSINESS_KNOWLEDGE_REPORT.md)
- [Local HTTPS staging runbook](LOCAL_HTTPS_STAGING_RUNBOOK.md)
- [Live provider verification gates](LIVE_PROVIDER_VERIFICATION.md)
- [Staging runbook](STAGING_RUNBOOK.md)
- [Backup and restore runbook](BACKUP_RESTORE_RUNBOOK.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [Source and asset provenance](docs/PROVENANCE.md)
- [Dependency inventory and notices](docs/THIRD_PARTY_LICENSES.md)
