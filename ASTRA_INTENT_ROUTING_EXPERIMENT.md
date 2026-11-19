# ASTRA intent routing experiment

**Comparison regression fixed offline. Structured intent remains opt-in. Fresh model accuracy is unverified. Pilot NO-GO.**

## Confirmed defect and correction

The Arm B request “İki ilanı karşılaştır, hangisini önerirsin?” returned the preference clarification even though two verified listings were present. A MongoDB-backed widget regression reproduced that exact reply with an empty fields array from interpret_business_preferences. The independent-route guard recognized property facts, contact and viewing while leaving comparison vulnerable to an earlier preference handler return.

Verified comparison now takes precedence over preference advice and reaches the existing comparison handler. The regression returns the verified 27,000 TL suggestion and 7,000 TL difference with unchanged preferences, no new search action and no booking. Existing current-turn evidence validation and tenant-scoped freshness checks still apply.

When the experiment is enabled, a complete standalone comparison of exactly two current, displayed, same-currency listings skips model inference and records zero model usage. Compound wording and active booking workflows remain outside that shortcut.

## Advisory adapter

Set AI_EXPERIMENTAL_RECEPTIONIST_INTENTS=true in isolated nonproduction. The default is false. Use an existing allowed custom GPT-6 Luna configuration with Standard Responses and reasoning none. If the configured responder lacks the structured capability, the normal function-calling path remains available.

The opt-in adapter requests a strict JSON plan with up to five evidence-linked intents, including question versus preference, reference, requested attributes, location and room alternatives, furnishing, and uncertainty. It receives the current message, bounded history and a separate read-only snapshot. Its request exposes no functions. The server validates schema, current-turn quotations, explicit ordinal evidence and available reference context. Valid advice may narrow a clarification. Malformed or executable-looking advice in a completed response falls back to server-owned text. Provider errors use the existing failure policy. Actual listing, contact, schedule, preference and transaction handling remains with existing independently validated routes. The adapter uses one normal budgeted inference and disables synthesis for that branch.

## Offline evidence and limits

| Verification | Result |
| --- | --- |
| MongoDB-backed API and security regressions | 184 passed, including both comparison paths, invalid advice, valid clarification, budget ledger, tenant isolation, confirmation, idempotency and scheduling |
| Browser | 20 passed |
| Deterministic evaluation | 128 scenarios, four intentional backend skips, zero failures |
| Frozen Phase 2G replay and existing paired fixtures | Three suites passed. Frozen raw choices remained 3/7 and customer-visible replay passed 7/7 model turns. The seven frozen decisions were preserved. |
| Intent fixtures | Seven historical prompts and eight unseen Turkish turns with synthetic preceding context. Corpus, negative validation, fast-path matching, SDK request and separate scorer checks passed. |
| Build and hygiene | API, web and evaluation typechecks, production builds, brand check, dependency audit and git diff --check passed. Audit reported zero vulnerabilities. |

The structured scorer reports separate exact turn checks for intent kinds, question versus preference, reference and compound coverage. Negative controls keep the correct topic while changing the mode and ordinal, omit a secondary intent, and reject invalid advice. Customer-visible correctness, groundedness, authorized actions, application recovery and model-call counts come from the MongoDB-backed application and benchmark checks. The direct comparison used zero calls and no model ledger entries. Two ambiguous fixtures used one call each and produced two measured ledger entries. No tested advisory response authorized a booking. These fixtures exercise the contract and application consequences. They establish no fresh intent accuracy, latency or provider acceptance. Historical tool-selection numbers use a different contract.

## Proposed fresh-model check

Use the first six unseen Turkish prompts with frozen synthetic history, expected labels and listing snapshots. Run one advisory-only call per prompt in a dedicated nonproduction project. Record raw plans independently of server actions and replies. Score each intent dimension with its own denominator, manually review grounding and uncertainty, and retain private paired inputs and outputs for Turkish review. Separately exercise the comparison and guarded booking cases offline so their zero-call outcomes cannot inflate model accuracy.

Proposed control is GPT-6 Luna only, Standard Responses, reasoning none, 16,000 conservative input tokens and 512 output tokens per call, one 30-second attempt each, no synthesis and no retries. The local registry calculation is $0.004259 maximum per call and $0.025554 for six. Proposed global and per-model caps are $0.03 each. The registry uses its conservative $0.25 per million input ceiling and $0.50 output rate, plus rounding. Zero-call comparisons incur no provider cost. Production token use and actual latency remain unmeasured. [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)

Before any live execution, require separate explicit approval, project entitlement and current pricing confirmation, an immutable candidate identity, and a provider-free admission run enforcing these new six-call limits. Stop on any uncertain provider outcome, invalid usage, safety or cap failure and retain uncertain reservations. This experiment plan has no live invocation enabled by this task. Zero paid calls were made.

**Recommendation:** Retain the comparison fix. Keep the advisory adapter experimental until a fresh run shows that it distinguishes questions from preferences and preserves references and compound intent. Keep existing booked-action safeguards and the pilot gate in force.
