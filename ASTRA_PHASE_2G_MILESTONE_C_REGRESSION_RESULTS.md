# ASTRA Phase 2G Milestone C regression results

## Frozen evidence and results

The replay uses seven preserved model responses from the actual Phase 2G live report and one deterministic listing setup turn. The source JSON SHA-256 is `440e5e99fe906a151314cfa69077fd0450948b2a47f4cab32002baebf3aee1ec`. All seven frozen prompts, raw texts and tool proposals matched the private source artifact. The original report and its published outcomes were preserved. The replay rejects live mode before creating any provider client.

| Measure | Historical Phase 2G live | Milestone C offline replay |
| --- | ---: | ---: |
| Provider requests | 7 | 0 |
| Frozen decisions supplied to the queue | — | 7 |
| Passing conversations | 3/4 | 4/4 |
| Customer-visible replies passing fixture checks, model turns | 6/7 | 7/7 |
| Customer-visible replies passing fixture checks, with deterministic setup | 7/8 | 8/8 |
| Correct raw model tool selections | 3/7 | 3/7 |
| Correct raw tool arguments among scored matching selections | 1/2 | 1/2 |
| Verified listing identity and persisted focus | 1/2 | 2/2 |
| Preference state unchanged for non-intake and non-search turns | — | 6/6 |
| Verified contact field precision | 1/1 | 1/1 |
| Unknown facts and viewing coverage | 2/2 | 2/2 |
| Transaction, tenant-sentinel and bounded delivery safety | 8/8 | 8/8 |

Five advisory proposals were rejected. The application reconstructed flexible preferences from the customer's evidence on one turn and handled the comparison and three fact or viewing requests on four turns. A separate email tool call used authorized normalization, and the app grounded the first-listing deposit answer after a correct raw no-tool decision. With the deterministic search setup, all eight replay turns met the expected executed-action check. Repairs received no credit in the model selection or argument scores.

The unfixed queue reproduced the exact failure on C2. It emitted “Hangi tercihi değiştirmek istediğinizi netleştirir misiniz?” and failed the delivered-reply, listing-identity and focus checks. After the patch, these three checks passed with unchanged preferences. Model scoring for that turn remained incorrect.

## Coverage

| Case | Actual offline outcome |
| --- | --- |
| A. Exact maintenance-fee failure | Second displayed listing selected, unknown aidat disclosed, no preference or budget mutation. |
| B. Deposit correction | First listing selected and persisted. The new reply covered deposit without repeating aidat. |
| C. Email-only request with unrelated preference proposal | Tenant's verified email only. No website or phone and no preference update. |
| D. Viewing with unrelated preference proposal | Asked for a listing when none was identified and a day/time when only the date was missing. Checked a verified 14.00 slot with viewing staff for the resolved listing. No appointment or pending create action. The frozen compound viewing turn also passed. |
| E. Genuine preference changes | OR matches for both alternate locations and room counts, unknown budget without invented value, and existing valid current-turn interpretation, replacement and removal all passed. |
| F. Ambiguous references | Missing ordinal and invalid prior focus required listing clarification. No automatic substitution of the remaining valid listing. |
| G. Tenant and listing eligibility | Stale, deleted, sold, archived and foreign-tenant display IDs disclosed no facts or titles. Scoped lookup and guarded output used the existing tenant boundary. |

## Executed verification

| Command | Result |
| --- | --- |
| `npm test` | 125 API tests passed, including the MongoDB-backed routing, tenant, budget and booking regressions. |
| `npm run test:browser -w apps/web` | 17/17 passed, including confirmation and session behavior. |
| `npm run eval:deterministic -w apps/api` | 128 scenarios. The baseline retained four intentional no-action backend skips. |
| `npm run eval:benchmark -w apps/api -- --suite=<suite>` | Comparison 60 turns, Luna smoke 9, conversation quality 80, Luna quality 10, Phase 2G prior replay 10, Phase 2G seven-call rehearsal 8, single-call rehearsal 1 and Milestone C 8. All passed offline. |
| Direct runner with Milestone C and `--live` | Rejected by the offline-only guard with no credentials loaded. |
| `npm run typecheck`, `npm run eval:typecheck -w apps/api`, `npm run build` | Passed. |
| `npm run brand:check`, Actionlint, `git diff --check` | Passed. |
| `npm audit --audit-level=low` | Zero vulnerabilities reported. |

The earlier and fresh raw Luna decisions remain distinct from deterministic application behavior. Independent human scores remain blank. **Live model quality NOT REVERIFIED. Pilot readiness NO-GO.**

[Routing fix report](ASTRA_PHASE_2G_MILESTONE_C_ROUTING_FIX_REPORT.md)
