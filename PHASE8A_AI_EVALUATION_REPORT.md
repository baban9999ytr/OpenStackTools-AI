# Phase 8A — AI evaluation, factuality and safety testing

Date: 2026-11-08 (Europe/Istanbul). Local, synthetic work only. **Real-business pilot remains NO-GO.** No deployment, push, DNS change, customer contact, purchase, external SMTP or billable provider call occurred.

## Baseline and design

The Phase 4B, 5, 6 and 7 reports and the current OpenAI adapter, Agent Actions registry, widget queue, appointment engine, knowledge/listing retrieval and MongoDB schemas were reviewed first. The evaluation code lives under `apps/api/evals/`; it is excluded from the API production build and uses an ephemeral MongoDB replica set for deterministic checks. There are no new npm dependencies or product UI features.

The dataset has **68 distinct synthetic prompts**: 34 English and 34 Turkish, four per category across business questions, property search, budget/currency, location/attributes, missing or stale listings, availability, booking, unauthorized cancellation, consent, consent refusal, handoff, ambiguity, malicious knowledge, malicious listing description, cross-tenant requests, invented facts, and provider failures. IDs and expected tool arguments are versioned in `scenarios.ts`. All people, email addresses, properties and businesses are synthetic.

The runner reports two separate results:

1. **Model-output rubric.** A supplied responder is scored for tool selection, schema/semantic argument validity, expected filters, unsupported numeric price or premature booking/cancellation claims, and tenant marker leakage. The deterministic responder deliberately supplies the expected call, so a passing score checks the runner and contracts, **not model accuracy**. Negative controls require the rubric to reject an unknown tool, budget without currency, reserved-listing search, unsupported price, false booking success and tenant marker leakage. Regex factuality checks are deliberately narrow and cannot prove semantic truth.
2. **Backend assertions.** The runner seeds two MongoDB tenants, staff schedule, knowledge with a malicious FAQ, available/archived/stale listings, and a booking owned by another visitor. It executes the real `stageAction`, retrieval, availability and handoff services. It checks tenant isolation, stored listing facts, unavailable listing exclusion, pending confirmation without mutation, unauthorized cancellation, consent refusal, time availability and conservative provider failure classification. Existing API tests remain the source of broader HTTP/auth/CSRF, confirmation, queue, budget and retry coverage; this runner does not replace them.

The production OpenAI adapter now exposes a small factory taking model ID, reasoning effort, output cap and server-side key. Its normal application configuration and behavior are unchanged. This lets an explicitly authorized evaluation select model IDs without editing application code; it does not imply entitlement for GPT-6 Luna, GPT-6.1 Sol or any other model.

## Executed results

| Check | Result | Limit |
| --- | --- | --- |
| `npm run eval:deterministic -w apps/api` | PASS: 64/64 applicable backend checks (60 action/retrieval, four provider-failure policy); four ambiguous no-action cases skipped. 68/68 deterministic fixture rubric checks; 17 categories × 4, EN 34/TR 34. | Fixture output was authored to match expected tools. The model score is **not** real-model accuracy. |
| Rubric negative controls | PASS: unknown tool, invalid budget filter, reserved availability, fabricated monetary claim, premature booking claim and tenant marker failed scoring. | Heuristic text checks can miss paraphrases and unsupported nonnumeric claims. |
| `npm run eval:typecheck -w apps/api` | PASS | Evaluation TypeScript only. |
| `npm test` | PASS: 31 MongoDB-backed API tests | Deterministic responder, no OpenAI. |
| `npm run test:browser -w apps/web` | PASS: 10 Chromium tests | Browser API responses mocked. |
| `npm run typecheck`; `npm run build`; `npm run brand:check`; `git diff --check` | PASS | API/web types, production builds and token generation consistency. |
| `npm audit --audit-level=low` | PASS: zero reported vulnerabilities | Point-in-time npm advisory result. |
| `npm run eval:live -w apps/api` without opt-ins | PASS gate: exited with code 2 before network access and printed “no request sent.” | No live model behavior, usage or cost was measured. |

## Live comparison preparation and cost readiness

The local-only `eval:live` command requires four explicit opt-ins, a dedicated non-placeholder API key, a chosen model ID, a reviewed local price file and a positive maximum spend no greater than $0.10. It checks the configured model/tier, positive category rates, HTTPS price source and a verification date within seven days. The example price file contains placeholders and **no asserted tariff**. The SDK has zero automatic retries, output is capped at 128 tokens, at most five synthetic prompts run, a conservative preflight estimate must fit the cap, and execution stops after a provider error. Run the same selected IDs separately for each model to compare tool selection, rubric pass rate, invalid calls, factuality flags, latency, provider-reported tokens, estimated cost and errors. See `apps/api/evals/README.md`.

Direct live evaluation intentionally **does not execute backend actions**; its task-completion figure is labelled a model-behavior proxy, while end-to-end task completion is `NOT TESTED`. It cannot verify provider entitlement, actual function-call payloads in the application queue, confirmed bookings, provider invoice totals or real-world factuality. A timeout may have an unknown billable charge despite no measured usage. Current model prices must be checked by an authorized operator before each run; no model pricing was looked up or hardcoded in this phase. No live run or cost measurement occurred.

## Defects and safety findings

- No new product defect was observed in the deterministic evaluation. During framework development, the rubric initially accepted a schema-valid `search_listings` request with `availability: reserved`, even though the widget executor rejects it. The scorer now flags that argument and has a negative control.
- Stored FAQ text and listing descriptions can contain instructions. The backend uses strict actions and organization predicates; listing description commands do not appear in the structured recommendation reply, and the existing Phase 6 regression checks that retrieval messages do not enter later model context. Business text can still be shown to visitors as data, so owners must review it. This does not prove resistance to real-model prompt injection.
- Synthetic visitor tokens are continuity controls, not proof of a person's identity. The Phase 7 appointment identity and privacy blockers remain.
- The deterministic fixture's 68/68 score must never be presented as a GPT-6 Luna or GPT-6.1 Sol benchmark. Live model access and factuality are unverified.

## Recommendation for Phase 8B

After explicit authorization for a dedicated low-limit project, run a small, identical synthetic scenario subset per candidate model and reconcile provider usage/cost with the billing record. Capture actual tool-call behavior through the normal budgeted application path, then add human-reviewed multilingual factuality and prompt-injection cases that evaluate full conversations and backend-confirmed outcomes. Expand the dataset with observed pilot questions only after a privacy review. Keep the real-business pilot **NO-GO** until live provider, identity, privacy, SMTP and operational gates from Phase 7 are met.
