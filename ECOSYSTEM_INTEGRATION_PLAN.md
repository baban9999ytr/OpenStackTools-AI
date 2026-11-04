# OpenStackTools AI ecosystem integration plan

Status: **discovery and design proposal, awaiting approval for main-website changes**. Prepared 2026-11-04. No production DNS, deployment, SSO, or main-website source was changed. See [UI assessment](docs/ECOSYSTEM_UI_ASSESSMENT.md) for observed patterns and evidence.

## Recommendation

Treat OpenStackTools AI as a distinct product with a shared visual language and independent runtime. Put its public product explanation at `https://openstacktool.com/products/ai` in the main static Cloudflare Worker site. Serve the AI app and API from `https://bots.openstacktool.com`, with the authenticated dashboard at `/app`. Use links between properties, not shared cookies or user tables. Future SSO requires a separate security design and explicit approval.

The main site is static HTML/CSS/JS with Tailwind and a Cloudflare Worker route; the AI app is React/Vite, Express, and MongoDB. The unrelated Bilgi product uses Supabase Auth. Do not force a common framework or identity system to achieve visual consistency.

## URL and application boundaries

| URL | Owner and behavior | Proposed hosting |
| --- | --- | --- |
| `openstacktool.com/products/ai` | Main-site product landing page, EN/TR, indexed, no AI API/session | Existing main-site Worker/static assets, after separate approval |
| `bots.openstacktool.com/` | AI product welcome/sign-in entry; route users to `/app` | AI web deployment |
| `bots.openstacktool.com/app` and `/app/*` | Authenticated business dashboard and email-action links | AI web deployment with SPA fallback |
| `bots.openstacktool.com/api/*` | AI REST API through same-origin reverse proxy | Independent AI API deployment, private upstream |
| `bots.openstacktool.com/embed.js` | Versioned public widget bundle; optionally redirect stable URL to versioned asset | AI web/static deployment |
| `bots.openstacktool.com/health/*` | Health probes, preferably restricted to infrastructure | API or edge health routing |

Live discovery: the main homepage returned HTTP 200, `/products/ai` returned 404, and the bots hostname did not respond from this environment. These are implementation targets, not existing deployments.

## Experience design

1. **Product landing page:** use the existing OST mark, compact header, Inter/JetBrains Mono roles, zinc/sky palette, ecosystem card language, light/dark and EN/TR support. Sections: headline and honest capability statement; website widget demonstration using synthetic content; how setup works; assistant, inbox, and budget features; privacy/data-handling summary; pilot eligibility; FAQ; “Request a pilot” and “Sign in” calls to action. State that AI chats are stored and processed server-side. Keep the main utilities site's “no account/no upload” claims scoped to those utilities.
2. **Assistant creation:** an owner/admin step flow: business name and assistant purpose; instructions and sample answers; exact allowed website origins; preview on a controlled test page; save inactive or activate; copy embed snippet. Show validation, unsaved changes, and a test-mode warning. Retain server-side organization authorization and origin validation.
3. **Business dashboard:** overview of active assistants, open handoffs, today's/month's estimated AI spend, budget remaining, and queue failures. Organization switcher and role-aware navigation remain. No cross-tenant aggregate queries in staff views.
4. **Conversations inbox:** responsive list/detail view with status, assistant, last activity, and unread/pending indicator; searchable or filterable within one organization only. Clear handoff/reopen/close actions; accessible message timeline and composer; preserve order and agent attribution. Pagination is needed before large volumes.
5. **Usage and budget:** daily/monthly committed spend, measured vs uncertain cost, token counts, configured model and prices, clear UTC reset times, and owner-only budget editing. Distinguish internal estimates from provider invoices. Show 402 exhaustion and retry guidance without implying the platform can override a tenant cap.
6. **Staff:** member list, role explanations, invitation status and expiry, resend/revoke invitation, and session controls. Keep invitee password selection and verified email. Owner-only invitation and role changes; do not put credentials in email or client bundles.
7. **Widget customization:** scoped assistant name, greeting, color theme, corner, and optional logo upload only after asset ownership/storage policy is approved. Start with safe presets and constrained colors; no arbitrary HTML, CSS, JavaScript, remote image URLs, or prompts in public styling config. Preview on light/dark test pages, test contrast, and isolate widget CSS in Shadow DOM. Existing origin and tenant checks remain authoritative.

The present AI UI has the core forms and inbox but not these polished flows, theme/i18n coverage, invitation management, or widget appearance settings. This document is a design specification; it does not claim those features are implemented.

## Brand implementation without release coupling

Define a versioned semantic token file in the AI repository (`brand/tokens.json` plus generated CSS) covering page/surface/text/border/action/status colors, type roles, spacing, radii, and focus ring. Review the values with the main-site owner. Publish or vendor a pinned CSS artifact into each product rather than loading runtime styles from another app. Keep product-specific layouts and business logic local. Do not transplant the main site's entire CSS, markup, or current font-scale/theme script. Main-site edits require their own review and release; AI can adopt approved tokens independently.

## Deployment and security architecture

```text
Browser ── HTTPS ── bots.openstacktool.com edge/reverse proxy
                     ├─ /app, /assets, /embed.js → AI web static build
                     ├─ /api/*                  → private Express API
                     └─ /health/*               → restricted API probes
                                       │
                                       ├─ private authenticated MongoDB replica set
                                       ├─ OpenAI (server-side key, budget guard)
                                       └─ SMTP provider (server-side credentials)

Browser ── HTTPS ── openstacktool.com/products/ai → existing independent Worker/static page
```

- Deploy web and API independently from the main website. The current web Dockerfile runs the Vite dev server; replace it with a production static-server image or platform asset deployment before launch. Implement `/app` SPA fallback while keeping `/api` and `embed.js` routing explicit. Set long immutable caching for fingerprinted assets and short caching for HTML and stable entry scripts.
- Set `DASHBOARD_ORIGIN=https://bots.openstacktool.com`; leave `VITE_API_BASE_URL` empty for same-origin `/api`. Route `/api` to the private API upstream and preserve the request `Host`, `Origin`, real client IP, and trusted proxy chain. Configure `TRUST_PROXY` to the actual hop count. The reverse proxy must not cache authenticated API responses.
- Keep the AI cookie host-only (no `Domain=.openstacktool.com`), `Secure`, `HttpOnly`, and `SameSite=Lax`. The existing exact-Origin and `X-Requested-With` mutation checks remain; test them through the proxy. Main-site and Bilgi auth sessions stay separate. Update email verification/reset/invitation links to `/app/#...` and test fragment handling after the new route is introduced.
- Widget calls from customer websites remain cross-origin bearer requests. Keep each assistant's exact allowed origins, origin-bound sessions, CORS restrictions, distributed rate limits, budgets, and request idempotency. Do not allow a wildcard origin. Publish a CSP integration guide for customers.
- Use separate secrets, database credentials, logs, backups, and rollback controls for AI. TLS at the edge and to origin where supported. Add security headers for both properties, inspect CSP and third-party font loading, and test link transitions. No SSO in this phase. A later SSO proposal must define issuer, account linking, organization provisioning, logout semantics, token audience, and migration before implementation.

## Implementation order and reviewable commits

| Order | Proposed change | Main site approval? | Verification gate |
| --- | --- | --- | --- |
| 1 | Approve visual tokens, copy boundaries, and URL topology | Founder/brand owner | Contrast and content review |
| 2 | Add token artifact and original AI header/nav/theme in AI repo | No main-site edit | Typecheck, build, visual/keyboard review |
| 3 | Add `/app` routing and email link updates in AI repo; prepare production web server and reverse-proxy example | No main-site edit | Auth, CSRF, cookie, SPA fallback, widget and tenant tests |
| 4 | Refine assistant setup, inbox, usage, staff, and safe widget customization in small UI/API commits | No main-site edit | Role/tenant tests, browser tests, accessibility checks |
| 5 | Add the `/products/ai` page and ecosystem navigation to main-site repo | **Yes, explicit approval before editing** | EN/TR, dark/light, mobile, links, privacy wording, Worker preview |
| 6 | Stage host routing and pilot smoke test | Separate deployment/DNS authorization | HTTPS, proxy, mail, backup, monitoring, rollback |

The approval gate for step 5 is the reviewed landing-page design and copy, including whether a pilot request form exists and where it sends data. This plan does not authorize a main-site change, production DNS update, or deployment.

## Decisions requiring approval

1. Confirm `openstacktool.com/products/ai` and `bots.openstacktool.com` ownership, hosting provider, and intended launch sequence.
2. Approve the AI visual token palette, OST + AI lockup, EN/TR scope, and whether theme preference should follow the main site on navigation (without sharing auth storage).
3. Approve landing-page claims, pilot CTA destination, privacy notice, and whether customer logos/testimonials can be used.
4. Approve the first widget customization set and whether customer-uploaded logos are allowed; asset storage and moderation would need a separate design.
5. Decide whether future SSO should use a central identity provider or account linking; no SSO implementation is included here.

## Verification and known limits

The plan changes documentation only. On 2026-11-04, `npm run typecheck` and `npm run build` passed; `npm test` passed 11 API tests against an ephemeral MongoDB replica set; `npm run test:browser -w apps/web` passed one Chromium widget test; `npm audit --audit-level=low` found zero vulnerabilities; and `git diff --check` passed. The tests use a fake AI responder and mocked browser API, so they do not verify a live OpenAI call. Live production routing, DNS, TLS, proxy behavior, main-site build, and visual accessibility have not been verified by this plan.
