# ASTRA operational release readiness

**Operational release recommendation: NO-GO.** The pinned stack passed the booking and operator workflows, but the tested production Nginx CSP blocks the widget’s stylesheet. Human and business approvals remain separate release gates. The previous GO for a private synthetic rehearsal still applies.

## Candidate and scope

The source manifest recomputed to the live candidate `62484deb41b3462a5fdbca843d86cc3d38658cee07c7b089511854013fd741c7`. Both application images were rebuilt from that checkout, labeled with the manifest, and pinned by their Docker image IDs. The dashboard and widget were built together into the web image.

| Artifact | Pinned Docker image ID |
| --- | --- |
| API | `sha256:13fc79854bffc2262736bb169b3bcf97bd8d23c486aac395675248b8b26b8aa3` |
| Dashboard and widget | `sha256:ca3ebe4526ebe93421801fbd79af2dbe0ff13bec2fddb5df3d51425754b9c0a9` |
| Caddy | `sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9` |
| MongoDB and initializer | `sha256:e16e606f792ea89d2b4907b54e5e31eb86a7a23e27231dce3a982cc8f2d73cd2` |
| Mailpit | `sha256:e22dce5b36f93c77082e204a3942fb6b283b7896e057458400a4c88344c3df68` |

These are local image pins. The intended release host and any copied registry artifacts remain unverified. Two isolated Compose projects used separate authenticated MongoDB volumes and loopback ingress at `https://ai.localhost`. The ordinary API entrypoint ran the account smoke. Booking and provider interruption used a bind-mounted fixture entrypoint on the same pinned API image. It ran the normal application routes and durable worker, required an inert key, and blocked external fetch. The synthetic website used the built widget bundle via Caddy and Nginx. The running private demo was untouched.

## Requirements and evidence

| Requirement | Classification | Evidence |
| --- | --- | --- |
| Release source and image integrity | **PASS** | Reproduced the live source digest. Both images were rebuilt and started with explicit local image pins, without a pull or rebuild at startup. |
| Configuration and secret separation | **PASS** | Runtime credentials and disposable certificates were generated outside the repository. Docker excludes local dotenv and staging secret files. The provider key was an inert placeholder. API and Mongo published no host ports. |
| Trusted HTTPS ingress | **PASS** | Validated the disposable CA without disabling certificate checks. Caddy delivered HTTPS to the real Nginx and API containers. App and liveness endpoints returned 200 with one HSTS header. |
| Widget presentation under release CSP | **FAIL** | Chromium reported that `style-src 'self' https://fonts.googleapis.com` blocked the widget’s injected shadow-root stylesheet. The launcher computed to `position: static` in all three browser sessions, while the stylesheet specifies `position: fixed`. Controls still functioned. The CSP was left unchanged. Validate the actual host page with CSP-compatible widget styling before release. |
| Widget origin restrictions | **PASS** | The HTTPS smoke exercised origin rejection and permitted requests. The browser widget used the approved synthetic origin. |
| Sessions and authentication | **PASS** | HTTPS smoke passed account verification, reset links, STARTTLS to Mailpit, Secure and HttpOnly flags, CSRF checks, roles, sessions and logout. Chromium authenticated to the real dashboard. |
| Tenant isolation | **PASS** | HTTPS smoke verified cross-tenant assistant, budget and conversation-export access denial. |
| Booking contact policy and database persistence | **PASS** | The browser flow required a name, one contact method, booking-specific permission and a separate final confirmation. Ambiguous permission failed. Deferral survived reload. Explicit confirmation created one appointment visible in the authorized dashboard. Duplicate confirmation returned the same ID. Refusal handed off the thread with no new booking. |
| Staff takeover and return to bot | **PASS** | The owner took over the exact thread in the dashboard and posted a reply that appeared in the widget. Confirmation returned 403 during takeover. A visitor turn during takeover cleared the draft. After return to bot the stale proposal still returned 403, a new question was answered, and no additional booking appeared. |
| Rate limits | **PASS** | A single widget session accepted ten turns and the eleventh returned 429 with a seven-second Retry-After header. The earlier auth smoke also exhausted the normal shared authentication window. A second disposable database supported the separate browser rehearsal. No limits were changed. |
| Application budgets | **PASS** | Production HTTPS smoke rejected an AI-bound request at zero budget before provider use. |
| Provider failure | **PASS** | The synthetic provider exception returned HTTP 502 with `provider_unavailable` through the real queue. |
| Local backup and restoration | **PASS** | Authenticated archive restored into a separate temporary database. Two synthetic tenant scopes, Phase 5/6 records and unique indexes verified in **6 seconds**. |
| Off-host backup custody and recovery objectives | **BLOCKED** | Requires intended storage, key custody, operator access and business recovery targets. |
| Release host and public TLS | **NOT TESTED** | Only isolated loopback ingress was exercised. |
| Turkish human review package | **PASS** | Prepared the unsigned [Turkish review](/home/krr/Projects/OpenStackTools-AI/ASTRA_TURKISH_HUMAN_REVIEW.md) with the two live turns, raw decisions, recovery and pass/fail questions. |
| Completed Turkish human review | **BLOCKED** | A human reviewer has yet to issue a decision. Raw Luna acceptance remains 1/2. |
| Business acceptance package | **PASS** | Prepared a separate [business checklist](/home/krr/Projects/OpenStackTools-AI/ASTRA_BUSINESS_ACCEPTANCE_CHECKLIST.md). |
| Business and staff approval | **BLOCKED** | Owners must approve notices, retention, coverage and escalation, and staff must complete their walkthrough. |

## Operational exercises

| Requirement | Classification | Evidence |
| --- | --- | --- |
| Health and readiness | **PASS** | Stopping the isolated MongoDB flipped private API readiness to HTTP 503 in about **1 second**. Public readiness stayed 404 and public liveness stayed 200. Starting MongoDB restored private readiness to 200 in **8 seconds**. |
| Local incident signal and alert delivery | **PASS** | A synthetic readiness probe sent a data-free alert through validated STARTTLS. The local Mailpit API showed it in the synthetic on-call inbox. The read-only MongoDB monitor ran and reported zero active jobs and expired leases after recovery. |
| Monitoring uncertain provider usage | **FAIL** | The read-only monitor reported `failedWithRetainedReservation: 0` while a separate MongoDB query found **two** uncertain usage events. Queue finalization moves the charge into `usageevents` and clears the request’s reservation field. The existing monitor misses those terminal uncertain charges. The worker retained the charges correctly. Release monitoring needs a signal for the persisted uncertain ledger records. |
| Alert ownership and escalation | **BLOCKED** | Sandbox delivery was verified. No named primary or backup, production destination, acknowledgement or escalation drill was supplied. The unsigned business checklist captures these assignments. |
| Interrupted in-flight processing | **PASS** | Killed the isolated API after the first attempt had reserved 1,308 microdollars. After restart the job became terminal `lease_expired` in **124 seconds**, with one attempt, no reply and no booking. The synthetic usage event retained the uncertain amount. Replaying the original message ID returned the existing failure. A new visitor message in the same thread succeeded. |
| Pinned image rollback and forward recovery | **PASS** | Swapped both images to local Phase 2I pins, verified private readiness and HTTPS dashboard, then restored the current image pins. The same synthetic booked appointment IDs survived both changes. Round trip **6 seconds**. No database migration or volume replacement was needed for these two image pairs. |
| Startup and idle shutdown | **PASS** | The candidate’s ordinary production entrypoint started on the authenticated replica set and was restored after fixture testing. Docker stopped the idle API in **1 second**, exit 143, with no OOM or forced-kill exit. Both disposable projects were taken down without deleting their volumes. |
| Graceful in-flight draining on SIGTERM | **NOT TESTED** | The lease recovery test used SIGKILL deliberately. The idle stop verifies termination but does not establish drain semantics. |

### Rehearsed operating procedure

- Probe edge liveness externally and API readiness on the private network. During database degradation, pause admission and confirm MongoDB state before restoring traffic. Page the assigned primary operator and use the backup escalation route if the alert is unacknowledged.
- After an interrupted provider request, check the request ID, lease status and uncertain usage event privately. Do not replay an uncertain operation with a new idempotency key. Escalate unresolved usage separately from visitor support.
- Keep the release and rollback pins beside the intended environment configuration. In the rehearsal, Compose started the previous API and web pins, the edge was restarted to refresh upstream connections, then readiness, the SPA and an unchanged booking invariant were checked. Repeat those checks after restoring the current pins. Treat an incompatible schema or a changed booking invariant as a rollback abort condition.
- Restore an authenticated backup into a distinct database, verify tenant scopes and appointment-slot/idempotency indexes, and compare representative records before any cutover. The rehearsal did not test production storage, retention or encrypted off-host recovery.

## Evidence and disposition

The stage is stopped. Private evidence is at `/tmp/astra-release.jg6e96/`, including the source and image pins, `smoke.log`, `pilot-browser-verified.log`, `widget-limits.log`, `interrupt.log`, `backup-restore.log`, `monitor.json`, `uncertain-counts.json` and `ops.log`. The staged widget SHA-256 was `e77e3967b4f1ce45525cd87ada621fe328647983945c1b68b2cbdea0828ae25e`, matching the prior acceptance build.

The stock staging browser script reached mobile navigation and accessibility checks but failed its final login locator while the application restored the Conversations tab. A second run of a corrected local locator did not finish registration. Neither run is counted as a full browser-suite pass. The separate targeted Chromium booking and takeover suite passed through the production ingress. Production-image builds, Compose validation and `git diff --check` passed.

No paid provider calls, real customer traffic or public deployment occurred. The standing test ledger remained **$0.199493** available with no pending or uncertain entries. The uncertainty recorded in the staging queue is a synthetic application record.

The technical release blockers are the widget stylesheet rejection and the monitoring gap for uncertain charges. Real-visitor approval also requires the named human and business sign-offs, intended host verification, production alert ownership and off-host restore custody. The packets remain unsigned.

## Release blocker repair — 20 November 2026

**Both previously confirmed technical defects are fixed and verified on isolated production-equivalent staging.** The historical FAIL evidence above is preserved. This does not complete the human, business, or intended-host release gates.

### Widget stylesheet — PASS

React inserted a literal `<style>` element inside the widget’s Shadow DOM. Chromium enforced the embedding page’s `style-src` there and blocked that element. The old launcher rendered as `position: static` under the production Nginx policy.

The widget build now emits `embed.js` and `embed.css`. It loads the sibling CSS URL from the script host through a stylesheet link inside the same Shadow DOM. The existing brand tokens generate a stylesheet alongside the widget selectors. Nginx serves the paired asset with the same revalidation policy as the script. The CSP and script policy remain unchanged. Installation and deployment docs specify the script and style asset origin, any element-specific CSP directives, the API connection origin, and the exact allowed customer origin.

The corrected launcher computed to `position: fixed` at `right: 24px` in all three Chromium workflow sessions through real Nginx/Caddy HTTPS ingress. A separate approved customer origin on port 8443 used a strict CSP and the same hosted assets. At 320×640 the panel stayed within the viewport, opened normally, and submitted a real widget message that received a reply. The cross-origin browser check observed no stylesheet CSP violation. The normal production smoke also reverified rejection of unauthorized widget origins and cross-tenant requests. The final pin served `/embed.css` as `text/css` with the same CSP.

### Uncertain provider charges — PASS

Finalization charges the conservative amount to the UTC budget windows, writes an uncertain `usageevents` record, and clears `widgetrequests.reservedMicros`. The old monitor looked at the cleared failure record field. On the same database and data, the old monitor again returned zero while two uncertain usage events remained.

The new monitor separates in-flight reservations from finalized uncertain usage. A single MongoDB snapshot aggregation reads both buckets, so a transactional move from a request to a usage event cannot appear in both. Measured usage does not enter the alert. The monitor emits aggregate counts, microdollars and a bounded `uncertain_ai_charges` signal. It performs no updates and exposes no tenant, request, visitor or provider data. [MongoDB snapshot read concern](https://www.mongodb.com/docs/v8.0/reference/read-concern-snapshot/)

| Isolated state | Active reservation | Finalized uncertain charges | Alert and billing evidence |
| --- | ---: | ---: | --- |
| Provider exception finalized, interrupted request awaiting expiry | 1 / 1,308 µUSD | 1 / 1,263 µUSD | Alert contained only the 1,263 µUSD finalized charge. |
| Lease expired after restart | 0 | 2 / 2,571 µUSD | Old monitor reported zero. New monitor emitted one two-event alert. Both UTC windows agreed with the usage ledger at 2,620 µUSD including 49 µUSD measured. Mailpit received the aggregate alert via verified STARTTLS. |
| First synthetic reconciliation to 107 µUSD | 0 | 1 / 1,308 µUSD | Alert remained. Both windows and the ledger agreed at 1,464 µUSD. |
| Second synthetic reconciliation to 203 µUSD | 0 | 0 | Alert cleared. Both windows and measured ledger agreed at 359 µUSD. |

Reconciliation was a test-only transaction based on synthetic known amounts, with each event and both corresponding budget windows updated together. There is no new production reconciliation path. An initial fixture query accidentally projected out the timestamp and aborted before any update. The corrected query selected the complete record and both reconciliation checks passed. The existing worker still fails an interrupted reserved request without retry. It preserved conservative usage, replayed the same terminal failure for the same message ID, and accepted a fresh turn after **123 seconds**.

### Updated release identity and regression

| Artifact | Final pin |
| --- | --- |
| Application source manifest SHA-256 | `95baa56289ec2d4d6ad4d842232fe5e913578cd74745158bb70da345dd283ab6` |
| API Docker image ID | `sha256:2c710156e8f0dca43d106cd366ca6322d810633810490cd14f04109b8cdbec48` |
| Dashboard/widget Docker image ID | `sha256:38fa30e342634b55ce5370e0b11d8a14f942c17e13f8b52a1cf475988f102ae6` |
| Served widget script SHA-256 | `281104505c98bc18c32aac2ecfbd45b72666463e6b38d475895e7e74ad0e1388` |
| Served widget stylesheet SHA-256 | `658921d873ef2207c4df797718558db2ea11430663386f3c7b72cf6ee12536b4` |

The manifest was computed with the existing algorithm using a private Git index copy that accounts for the removed generated TypeScript stylesheet. The working index was untouched. Final image layers were byte-identical to the Chrome-tested images after a monitor-only revision changed the labels. The final pins were started and verified after rollback. Caddy, MongoDB and Mailpit pins above are unchanged.

- **Automated** — 195 API tests and 21 browser tests passed. Deterministic evaluation covered 128 scenarios, with 64 backend checks passed and four intentionally skipped. Application and evaluation typechecks, production builds, brand check, Compose validation and whitespace checks passed. npm audit reported zero vulnerabilities.
- **Pinned HTTPS regression** — origin and tenant isolation, account and cookies, zero-budget rejection, consent refusal, deferral and reload, final confirmation and idempotency, staff takeover and return to bot passed. The customer-facing widget was rendered using the unmodified ingress CSP.
- **Recovery** — authenticated backup and restore verified two synthetic tenants, Phase 5/6 data and unique indexes in 5 seconds. The pinned image rollback and forward recovery preserved the booked appointment IDs in 5 seconds. MongoDB outage detection, sandbox alert receipt and restart were also repeated.
- **Evidence** — private directory `/tmp/astra-release-fixed.Tticlf/`, including `pilot-browser.log`, `smoke.log`, `monitor-old.json`, `monitor-snapshot-active.json`, `monitor-finalized.json`, reconciliation and billing snapshots, `backup-restore.log`, `ops.log` and image manifests. The corrected stage is stopped.

No paid calls were made, the private demo was untouched, and the standing test ledger still shows **$0.199493** available. The two local technical blockers are closed. The intended release host, customer-site CSP, production alert ownership and routing, off-host recovery, human Turkish review, and business/privacy acceptance remain open for a real-visitor launch. Graceful draining with a request in flight on SIGTERM remains untested.
