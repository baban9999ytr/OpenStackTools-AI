# OpenStackTools ecosystem UI and branding assessment

Observed 2026-11-04. Evidence: local main-site source at `/home/krr/Projects/OpenStackTools/OpenStackTools`, live `https://openstacktool.com/` HTTP response, AI source in this repository, and the separate Bilgi product source at `/home/krr/Projects/BilgiOpenStackTool`. The local main-site copy is read-only for this assessment. The public website was reachable; `/products/ai` returned 404 and `bots.openstacktool.com` did not respond from this environment. Those responses establish current reachability, not ownership or a deployment schedule.

## What exists

| Element | Main website | AI platform today | Direction |
| --- | --- | --- | --- |
| Type | Inter for body/display, JetBrains Mono for small technical labels; plain HTML, CSS, JS and Tailwind build | Inter/system stack, no mono role | Match the type roles and hierarchy. Keep local fallbacks and check font loading/privacy policy. |
| Color | Zinc near-black `#09090b`/`#18181b`, white `#ffffff`, zinc text/borders, sky `#0369a1` (`#7dd3fc` in dark) | Navy `#142d54`, blue `#315bd4`, pale blue-gray surfaces | Use neutral zinc surfaces and sky accents for ecosystem identity, retaining a distinct AI accent only if approved. Check WCAG contrast in both themes. |
| Mark/icons | Compact square “OST” text mark in monospace; inline stroke SVGs and numbered product cards; favicon | Plain text wordmark and decorative ✳ mark; no external logo asset | Create an original OST + AI lockup using the site's mark convention. Use accessible inline SVGs with a consistent stroke. Do not copy another product's illustrations. |
| Navigation | Sticky translucent top bar, desktop grouped menus, mobile `<details>` menu; EN/TR labels, theme toggle and font-scale control | Auth split panel, fixed dark sidebar, assistant/inbox/team/usage/sessions tabs | Keep a compact product header and clear back-to-ecosystem link. Rework the AI sidebar as responsive product navigation; preserve task labels and role gating. |
| Layout | `max-w-6xl` content, light/dark sections, high-density utility cards, restrained borders/radii | Large rounded cards, two-column forms, conversation split view | Align spacing, type scale, focus and button patterns. Preserve the useful inbox two-pane structure and mobile single-pane fallback. |
| Messaging | Main site's “no account / no server file uploads” claims describe its browser utilities | AI accounts and server-side conversation storage are required | Give AI its own data-handling copy. Never apply the utility site's privacy claims to AI chat. |

Main-site evidence: `index.html` header around lines 121–139, ecosystem section around 750–990, `css/style.css` beginning and ecosystem styles around 1110; `wrangler.toml` and `.github/workflows/static.yml`. AI evidence: `apps/web/src/style.css`, `apps/web/src/App.tsx`, `apps/web/src/embed.tsx`, `apps/api/src/middleware/security.ts`.

## Authentication and deployment boundaries

The main utilities site has no account requirement or application auth. It is a Cloudflare Worker serving static assets on the `openstacktool.com/*` route. The separate Bilgi product is a React/Vite app using Supabase Auth and Cloudflare static assets, with its own theme tokens. The AI platform is React/Vite plus Express/MongoDB, with its own email-verified opaque cookie sessions and role checks. These are three different systems. Shared visual language does not imply shared sessions, user IDs, databases, or permissions.

The AI repository currently builds an embeddable widget separately, but the web Dockerfile runs the Vite development server. Production serving, SPA fallback for `/app`, and mail links into `/app` need explicit work before the proposed host is usable. The API currently requires an exact `DASHBOARD_ORIGIN` and origin headers on dashboard mutations; widget bearer sessions are separately bound to registered customer website origins.

## Proposed visual contract

Create a small, versioned, framework-independent **token specification** in this repository: semantic colors (page, surface, text, muted, border, action, danger, success), type roles, spacing, radii, focus ring, and light/dark variants. The values should be reviewed against the main site, then copied or published as a static CSS artifact into each independently deployed application. Avoid importing the main website's entire stylesheet, Tailwind output, or React components. Tokens can evolve under version control without coupling release cycles.

For AI, use the OST square and “OpenStackTools AI” wordmark, sky action color, zinc surfaces, 6–8 px spacing rhythm, compact rounded controls, and a clear status language. Preserve familiar AI behaviors: organization picker, assistant settings, human handoff, budget visibility, and widget session recovery. Test keyboard focus, screen-reader labels, reduced motion, mobile navigation, and both theme contrast modes before release.
