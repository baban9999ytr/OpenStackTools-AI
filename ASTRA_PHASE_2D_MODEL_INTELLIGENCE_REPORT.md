# ASTRA Phase 2D model intelligence report

**LIVE MODEL QUALITY NOT YET VERIFIED.** The implementation and its local verification use simulated model boundaries and disposable MongoDB tenants. No provider requests were sent.

## Architecture and changes

- `apps/api/evals/benchmark-admission.ts` validates explicit approval, dedicated credentials and synthetic tenancy attestations, candidate entitlement attestations, applicable Standard rates, global and per-model caps and request counts. It tracks reservations, settles confirmed usage and stops on uncertainty or a bound violation.
- `apps/api/evals/benchmark.ts` runs the shared application queue on pinned ephemeral MongoDB. It reserves a private report file before starting a paid run and checks model capabilities and registry pricing before client creation. The optional preflight-only mode exits without opening a file, starting a replica set or constructing the SDK client. Live entry is denied in CI and production.
- `apps/api/evals/benchmark-cases.ts` extends the bilingual suite to five conversations and 20 turns per candidate. Reports expose provider-visible history divergence, expected versus actual checks, provider and queue latency, cache and reasoning token fields, spend and successful conversation counts, and independent reviewer fields.
- `apps/api/src/services/automatic-routing.ts` adds policy v2 and complexity classification. Complexity uses bounded recognized intents, ambiguity, active workflow and prior references. The future premium selector requires explicit approval, read-only complex work, evidence, known rates, compatible capabilities, allowlists, verified project access, enough time and an affordable reservation. The initial evidence thresholds are 30 or more samples, a five percentage point improvement and zero observed safety failures. Review these thresholds before activation.
- `apps/api/src/services/widget-queue.ts`, `budget.ts`, `apps/api/src/config/env.ts` and `apps/api/.env.example` connect v2 to Automatic. The queue passes the explicit premium gate as false and supplies the current Luna configuration only. It uses a tenant-scoped budget snapshot and the optional per-request `AI_AUTOMATIC_MAX_REQUEST_USD` cap. The atomic reservation remains authoritative when concurrent requests compete for funds. Existing model, rate, reason, reservation, failure and usage records are joined by request ID. Decision logs now include tenant ID, processing latency, cache and reasoning tokens.
- `apps/api/src/services/business-conversation.ts`, `business-conversation-runtime.ts` and `customer-listings.ts` fix two observed defects. An explicit budget withdrawal clears the stale active ceiling and asks for a replacement when appropriate. An ordinal listing reference beginning with Turkish capital İ resolves correctly, and a dues question reports the field as unverified.
- `apps/api/test/benchmark-admission.test.ts`, `automatic-routing.test.ts` and `tenancy.test.ts` exercise denial, caps, provider uncertainty, routing and queue policy.
- `README.md`, `apps/api/evals/README.md`, this report, the model comparison report, the architecture report and the SaaS readiness report document the process and remaining pilot work.

GitHub Actions already runs the offline benchmark and deterministic suite with synthetic infrastructure. The workflow and permissions required no edits. No hosted run of the Phase 2D working tree took place.

## Budget and routing controls

Declared spend is an operator-supplied USD allowance entered in integer microdollars. The benchmark requires a global cap of up to 1,000,000 microdollars, a per-model cap no larger than the global value, and 1–18 calls per model. At each provider boundary both caps must cover the maximum estimated reservation. Tenant daily and monthly windows also enforce the per-model cap. The queue worker handles provider usage settlement, and the run-wide meter reconciles independently. An uncertain outcome retains reservation and aborts later calls. The fixed benchmark settings use 128 maximum output tokens, a 40,000 conservative input bound, a 30-second SDK timeout, zero retries and no synthesis. The application keeps its existing production token limit.

The production Automatic path deliberately has no trusted premium approval or evidence source connected. Its active behavior remains eligible Luna or denial. A denied Luna request is never replaced by a premium model. Activation will require an explicit reviewed evidence source and separate approval after real task-level head-to-head tests, safety and accounting reconciliation, latency review and failure rehearsals. Routing never grants permission to execute an appointment or other mutation.

## Executed verification

| Check | Result |
| --- | --- |
| `npm ci` | Passed with the committed lockfile |
| `npm test` | 109 passed, zero skipped |
| `CI=true npm run test:browser -w apps/web` | 17 passed |
| `npm run eval:deterministic -w apps/api` | 128 scenarios, 64 backend checks passed and four intentionally skipped no-action checks |
| `npm run eval:benchmark -w apps/api` | 60 simulated turns in 15 candidate conversations, zero failing turns |
| App and evaluation typechecks, build and brand check | Passed |
| `npm audit --json` | Zero vulnerabilities reported |
| Actionlint and `git diff --check` | Passed |
| Live CLI denial and provider-free preflight | Passed via inert fixtures |

The first expanded benchmark failed three equivalent candidate assertions on the capitalized Turkish ordinal. The same cases passed after the reference fix. No existing behavioral assertion was weakened. The API integration suite covers duplicate bookings, tenant isolation, model policy and explicit confirmation.

## Live approval and pilot limits

A first billable benchmark requires explicit authorization for the dedicated provider project and intended candidate IDs, approved global and per-model dollar ceilings and request counts, actual project access and quota verification, and a current confirmation of Standard pricing. Supply a new private report path and run local preflight before supplying the separate execution flag `EVAL_EXECUTE_APPROVED=1`. Review provider invoices, uncertainty and human ratings before interpreting quality or activating routing changes. [Operator procedure](apps/api/evals/README.md) · [Capabilities and review rubric](ASTRA_MODEL_COMPARISON_REPORT.md)

The offline set is a targeted smoke benchmark. It cannot support model rankings, commercial savings or pilot guarantees. General semantic grounding, independently measured tool latency, longer-turn reliability, equivalent histories after divergent replies, actual price accounting and production-load behavior remain empirical work. Public and customer pilot gates also include monitored hosting, restore and deletion rehearsals, verified channel delivery, staff takeover and support. [SaaS pilot plan](SAAS_RELEASE_READINESS_REPORT.md)
