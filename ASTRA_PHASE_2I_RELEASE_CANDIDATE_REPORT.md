# ASTRA Phase 2I release candidate

**Offline engineering PASS · Release candidate NOT READY · Live model quality NOT REVERIFIED · Staff acceptance PENDING · Operational readiness PARTIAL · Supervised website pilot NO-GO**

The candidate passed local technical verification. The release decision still needs current Luna quality evidence, an independent Turkish review, a real employee's acceptance, and operational verification on the intended environment.

| Candidate component | Value |
| --- | --- |
| Base Git revision | 0c23578e49af837243f6909611303e266d85de88 |
| Initial worktree | 32 modified tracked paths and 27 untracked paths. The baseline included Phase 2F–2H work. |
| Exact local source manifest SHA-256 | 3ff611af0d06144709495b106dbf8c8319c7caa888dd9770ce235b473cd8cff6 |
| Manifest scope | Git-listed and non-ignored files in apps, deploy, brand, .github and root build inputs. Reports and secret files excluded. See the private candidate.sha256 in the local evidence directory. |
| Build | Workspace version 0.1.0. Node 24.22.2 and npm 11.19.1 for host checks. Lockfile SHA-256 bb3bf0e9951569b2bf1a41f05a668b7d024dde80e73c87744fcb2d87e334645c. |
| Key dependencies | Express 5.3.0, Mongoose 9.11.4, OpenAI SDK 7.50.0, React 19.3.1, Vite 8.3.5 |
| Configuration | Local loopback HTTPS, Caddy, production API/web images, isolated MongoDB 8 authenticated replica set, local STARTTLS Mailpit and synthetic provider fixture. Website only. |
| Local API image | sha256:4b695e3e0c85029f71490d2a2c3e4e0cd17ca9a45fd71ccb5896fabb9ddba78c |
| Local web image | sha256:1ae8c82c8535ac752f4838abd050875abb8cb4d4a100e16a65359bf776f6a132 |
| Database assumptions | Existing Mongoose schema, replica-set transactions, tenant scope, unique appointment slots and action idempotency indexes. No Phase 2I model or schema change. |

This is a local source identity. The intended deployment must pin the reviewed source revision, image digests and environment profile before acceptance.

## Changes and verification

- Applied one deferred HSTS policy at the Caddy edge and explicitly blocked public readiness. Added HTTPS regression assertions for live health, the SPA and private readiness.
- Repaired two obsolete HTTPS rehearsal expectations. A stale listing search must return the current grounded no-match reply and stored instruction text must stay out of the customer's response.
- Added Phase 2I-specific authorization to the existing Luna launcher and admission layer. Existing approval flags cannot authorize the new suite. No prompt or premium-routing policy changes.
- Added an operator-only Mongo snapshot for queue and failure counts and extended restore checks to cover scoped preferences, audit records and action idempotency.
- API 127/127, browser 20/20, deterministic scenarios 128 with four intentional no-action backend skips, and two replay/fixture suites with zero harness failures. Typechecks, production builds, brand check, workflow lint, whitespace check and dependency audit passed.

## Fresh Luna verification proposal

Run phase2i-rc once after separate approval. It reuses the same seven matched prompts and one deterministic setup turn, allowing comparison on the current code. Coverage includes alternative preferences, precise contact follow-up, comparison, second listing maintenance fee, first listing deposit correction, unresolved property and compound viewing. Offline frozen replay also covers known erroneous tool proposals. A fresh run observes whatever Luna actually proposes.

| Control | Value |
| --- | --- |
| Provider and model | Standard Responses API, gpt-6-luna only, reasoning none, no synthesis or automatic retry |
| Planned provider requests | 7, at most one per model turn, 40,000 input bound and 512 output cap |
| Internal reservation | $0.010259 per call and $0.071813 maximum under registry openai-2026-11-13-standard-v1 |
| Spending caps | $0.08 global and $0.08 per model |
| Stop | Admission or safety check fails, bound or cap exceeded, uncertainty or invalid usage. Preserve uncertain reservation and inspect private evidence before any further run. |

The existing launcher passed provider-free preflight with seven planned calls, eight synthetic turns and zero provider requests. The admission output records operator-attested entitlement. The operator must recheck current applicable pricing, project quota, Luna access and provider controls before authorizing execution.

Preflight command

    env -u NODE_OPTIONS node --env-file=apps/api/.env apps/api/evals/launch-luna.mjs --preflight --suite=phase2i-rc

Use the same launcher with the new EVAL_2I_EXECUTE_APPROVED flag and --execute only under separately approved execution. The report separates proposed tool and arguments, executed action, validation and final reply.

## Model cost and capacity

The completed historical 2G run recorded 13,332 input tokens, 348 output tokens and zero reasoning tokens over seven calls. Its internal estimate was $0.003512 for seven calls, or approximately $0.000502 per call. The 2F run estimated $0.004179 over nine calls. Both samples used short synthetic conversations. Invoice charges were unverified.

| Daily conversations | Calls per 30 days at assumed 2 calls/conversation | Monthly model estimate | Monthly sensitivity at 1–4 calls/conversation |
| ---: | ---: | ---: | ---: |
| 10 | 600 | $0.30 | $0.15–$0.60 |
| 50 | 3,000 | $1.51 | $0.75–$3.01 |
| 100 | 6,000 | $3.01 | $1.51–$6.02 |

The model projections scale the historical mean without adding synthesis, longer prompts or uncertainty reserves. Hosting, MongoDB, monitoring, off-host backup and staff costs need operator quotes and staffing assumptions. Website embedding has no separately measured channel fee. No throughput or staffing SLA was validated from these estimates. Tenant admission budgets continue to apply.

[Acceptance matrix](ASTRA_PHASE_2I_ACCEPTANCE_MATRIX.md) · [Operational evidence](ASTRA_PHASE_2I_OPERATIONAL_VERIFICATION.md) · [Human review](ASTRA_PHASE_2I_HUMAN_REVIEW_PACKAGE.md) · [Launch checklist](ASTRA_PHASE_2I_PILOT_LAUNCH_CHECKLIST.md)
