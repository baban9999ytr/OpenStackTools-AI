# Project Astra — implementation checkpoint

2026-11-13. **Project Astra is not complete.** This checkpoint records research, the executed existing evaluation baseline, and two implemented repairs. It is not a production-readiness report. Existing uncommitted work was preserved. No provider call, live service restart, deployment, commit, customer-data change or webhook change occurred.

## Evidence and architecture

The existing website and Telegram adapters feed the durable WidgetRequest queue. The queue loads scoped messages and workflow state, handles deterministic confirmation/resume/correction paths, builds bounded model context, reserves organization budget, invokes the configured responder, validates and executes AgentActions, optionally synthesizes listing/knowledge results, settles usage and persists the reply. Telegram delivery uses its separate durable outbox. Booking mutations remain under confirmation and MongoDB slot-claim authority.

The recent model configuration report and Conversational Intelligence V2 report were inspected with the current model registry, queue, interpreter, appointment formatter, action composer and Phase 8A runner. The model interpretation parser exists but is not connected to a provider-assisted interpretation call. Existing synthesis is limited to listing/knowledge results. Availability responses are backend-generated.

Confirmed causes:

- Robotic scheduling: `availableSlotSummary` explicitly generated ranges ending in “arası 15 dakikada bir”. It was a deterministic formatter, not a model response.
- Combined name/feature and resume: the V2 implementation already retains bounded workflow names and pending actions; its existing integration tests remain relevant. Flexible scheduling across multiple future dates is not established by those tests.
- Policy defect: an organization effort ceiling could replace and exceed the platform ceiling. The resolver now intersects the two ceilings and rejects unknown organization limits; model-options reports the effective ceiling.
- Baseline drift: four Phase 8A budget cases required an unformatted price string even though the customer formatter now localizes numbers. The repaired assertions check the structured stored amount/currency and the rendered amount, without relaxing price correctness.
- A legitimately occupied slot is a business constraint. No live bookings were inspected or changed during this checkpoint.

## Public research

These sources describe documented patterns, not private competitor implementations:

| Source | Relevant pattern and implication |
| --- | --- |
| [Anthropic, Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) | Distinguishes code-defined workflows from dynamic agents and recommends simple composable patterns. Supports retaining explicit booking flows and adding routing only when evaluation supports it. |
| [Rasa CALM](https://rasa.com/docs/learn/concepts/calm) | Separates language understanding from deterministic business flows and handles corrections and interruptions. Supports validating interpretation proposals before workflow mutation. |
| [Dialogflow CX playbooks](https://docs.cloud.google.com/dialogflow/cx/docs/concept/playbook) | Task-oriented playbooks may delegate to flows or other playbooks. Supports explicit task state and bounded subtask handling. |
| [Microsoft generative orchestration](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-orchestration) | Describes intent interpretation, tool/knowledge selection and multistep planning with guardrails. Supports a bounded plan with authorized tools. |
| [Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) | Documents content, prompt-attack and privacy controls. These are additional safeguards, not evidence that this application's current keyword guard is comprehensive. |
| [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [model selection](https://developers.openai.com/api/docs/guides/model-selection) | Relevant to bounded orchestration, schema-constrained outputs and empirical model choice. No framework migration was made. A valid schema still cannot grant business authorization. |

The [Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) and [pricing page](https://developers.openai.com/api/docs/pricing) were opened. This checkpoint does not establish project entitlement or enable Astra. Detailed capability/price registration and account-access gating remain to be completed before selectable Astra configuration.

## Implemented repairs

1. Platform/organization reasoning ceilings now use the stricter value, both in the resolver and in dashboard options. A regression asserts that organization `max` cannot override platform `medium`, and that an organization `low` ceiling rejects a medium preset.
2. Availability summaries now choose at most three exact returned starts, sorted chronologically and preferring at least 30 minutes between suggestions. Invalid timestamps and duplicates are excluded. Multiple dates retain date labels. No intermediate times are generated. For verified 09:00, 09:15, 09:30, 09:45 starts, the Turkish summary becomes `09.00 veya 09.30`. The existing surrounding response still asks which time suits the visitor; it does not claim a booking.
3. The existing evaluation runner's price assertions now accommodate localized formatting while checking the stored numeric amount and currency.

## Executed verification

- Initial `npm run eval:deterministic -w apps/api`: FAIL, four formatting assertions. Fixture model score 68/68 is not model accuracy.
- Repaired `npm run eval:deterministic -w apps/api`: 64 backend checks passed, four intentionally skipped, zero failures; fixture score 68/68.
- `npm test`: 94 passed, zero failed, using isolated MongoDB and provider fakes.
- `npm run typecheck`, `npm run build`, `npm run eval:typecheck -w apps/api`, `npm run brand:check`, `git diff --check`: passed.
- Final added exact-slot assertions: `node --import tsx --test test/receptionist-quality.test.ts`, two tests passed.
- Browser suite and dependency audit were not rerun in this checkpoint. The preceding report's 16-browser/zero-audit results must not be presented as a fresh Astra verification.
- Live provider quality, latency, entitlement, tier delivery and actual cost: NOT TESTED.

## Outstanding work and release gates

The requested 75+ richly specified scenarios have not been implemented; the executed baseline remains 68 existing scenarios. The new four-mode UI, automatic router, Astra registry entry, monthly/model breakdown, structured model-assisted interpretation, flexible multi-day scheduling, expanded tracing and empirical model comparison remain unimplemented. Existing legacy/custom policy behavior needs a complete audit before router integration. No expensive escalation policy is enabled.

Next work should extend the existing evaluation schema with history, workflow, expected state transitions and hard safety gates; then implement flexible availability selection and mixed preference capture under that baseline. Extend the existing model registry and UI only after that safety work. Automatic routing should initially avoid model escalation absent measured benefits; every allowed call plan must reserve its full worst-case cost. The current 800-token cap needs an authorized synthetic live experiment before raising it or claiming adequacy for reasoning models.

Safe live verification requires separate explicit authorization, a dedicated project and synthetic tenant, verified prices, a strict spend cap, and actual usage reconciliation. Compare identical scenarios; retain human naturalness reviews alongside deterministic factuality and transaction checks. Do not interpret a fake provider's successful response as live model evidence.

## Continuation — evaluation and reliability foundation (2026-11-13)

This section supersedes the checkpoint's outstanding-work and verification statements where explicitly listed. Project ASTRA as a whole remains incomplete. Existing uncommitted changes were preserved; no production process was restarted, no paid provider call was made, and nothing was committed or deployed.

### Implemented

- Extended the existing evaluation command from 68 to **92 scenarios**: the original 68 tool/backend scenarios plus 24 interpretation and scheduling contracts. The additional contracts cover mixed name/feature and name/price requests, name refusal, third-party identity, correction, cancellation with a side question, workflow interruption/resumption, evidence fabrication/injection, ambiguous interpretation, flexible dates, periods, excluded tomorrow, past dates and horizon rejection. Existing scenarios cover tenant isolation, tools, missing records, failures, handoff and confirmations. Contract metadata names permitted tools and forbidden actions; actual database isolation and duplicate processing are asserted by integration tests, not inferred from metadata.
- Added `flexible-scheduling.ts`: calendar dates use the business timezone and the request creation timestamp. Searches are capped at seven local dates (today through +6), two eligible viewing consultants and three returned options. Availability comes from the existing tenant-scoped availability engine, including operating hours, staff windows, appointment duration and conflicts. Spacing selects existing starts; it does not invent intermediate availability. Days with no availability do not terminate the bounded search.
- Flexible wording handles “Gün ve saat fark etmez”, “Bu hafta herhangi bir gün olabilir”, “Yarın olmaz ama sonraki iki gün uygunum” and afternoon requests. “Sabah erken olmasın” requests an explicit earliest time instead of inventing a meaning for early. Existing configured period definitions are reused.
- Persisted bounded offered slots in conversation workflow. A later exact date/time selection must identify one returned option. Selection prepares an action through the existing authority; it cannot execute a booking. Staging and confirmation revalidate availability. Duplicate confirmation remains idempotent.
- Combined name, afternoon and balcony requests retain the selected listing, capture the supplied name, answer the feature from verified records (including unknown), and offer verified slots without a provider call.
- Added narrowly scoped `interpret_preferences` to the existing primary model call. It is admitted through existing budget reservation and token settlement, not a separate unmetered request. Strict server validation accepts only a self-name with a literal evidence span in the current customer message, only while waiting for a name and deterministic extraction has failed. Ambiguous, fabricated, malformed or out-of-workflow output cannot mutate identity. This tool cannot authorize a transaction or set arbitrary workflow fields. Provider text is replaced by a controlled reply.

### Evaluation results and verification

Before: 68 fixture scenarios, 64 executed backend checks, four deliberately skipped; 94 API tests at the earlier checkpoint.

After: 92 scenarios consisting of 68 fixture scenarios and 24 pure deterministic contracts. Original backend checks remain 64 passed / four skipped / zero failed. The 24 new contracts pass. These are **not 92 live-model tests**, and neither fixture scores nor schema validation establish real-model accuracy.

Executed commands (local synthetic fixtures only):

- `npm test`: **96 passed, zero failed, zero skipped** (94 at the previous checkpoint).
- `node --import tsx --test apps/api/test/telegram-availability.test.ts`: **four passed**, targeted scheduling and interpretation integration tests using an isolated real MongoDB replica set and fake providers.
- `npm run test:browser -w apps/web`: **16 passed**; browser fixtures exercise existing widget/dashboard behavior, not live Telegram or real-provider interpretation.
- `npm run eval:deterministic -w apps/api`: results above.
- `npm run eval:typecheck -w apps/api`, `npm run typecheck`, `npm run build`: passed.
- `npm run brand:check`: passed.
- `npm audit --json`: **zero vulnerabilities** in the installed dependency graph.
- `git diff --check`: passed.

The new scheduling integration asserts visible name/unknown balcony wording, afternoon slots, persisted offered state, no appointment before confirmation, one booking after repeated confirmation, cross-tenant denial and searching past a closed first day. The interpretation integration exercises accepted evidence and forged identity through the queue, with no action or appointment authority.

### Security invariants and limitations

Tenant-scoped availability, organization budgets, durable request ownership, explicit confirmations, booking conflict checks and existing authenticated routes remain authoritative. Model JSON is a proposal, never permission. Names are not verified identity or consent to marketing. Synthetic tests create only isolated test database records.

Interpretation is intentionally narrow: broad multilingual misspellings, arbitrary multi-intent planning and ambiguous listing resolution still rely on existing handling or clarification. No claim is made that every informal expression is understood. Flexible searches are a bounded convenience set, not an exhaustive calendar or ranking optimization. They examine at most two eligible consultants; availability outside that bound is not ruled out. Time-only selection across multiple dates asks for clarification. “Not early” requires clarification; no personalized early-hour setting was introduced. The general tool-failure queue path remains responsible for failed database queries; absence of a result never creates a slot. This continuation does not establish live-provider latency, tool-selection accuracy, naturalness or pricing accuracy.

### Automatic routing preparation — architecture contract, disabled

Existing Economical, Balanced and Advanced configurations remain unchanged; no assistant migration, new four-mode UI or automatic escalation is enabled. The future Normal, Powerful, Very Powerful and Automatic labels require an explicit mapping and migration decision. Astra remains unavailable until access, capabilities and verified prices are registered.

A future router must receive only bounded inputs: validated task/intent, ambiguity, enabled tools, channel, measured previous failure category, remaining tenant budget, configured profile and remaining latency deadline. Private conversation text must not enter routing audit logs.

1. Intersect platform allowlist, organization policy, assistant configuration and verified provider capabilities. Unknown model IDs/prices fail closed. Preserve the stricter platform/organization reasoning ceiling.
2. Reserve the full worst-case call plan (interpretation, primary, synthesis and any proposed escalation) before execution. Enforce daily/monthly budgets plus per-request cost/token caps; use integer cost units. Never treat fallback as free.
3. Set a total latency deadline and per-call timeout within it. Do not start escalation without remaining latency and reservation. Default escalation count is zero; any future nonzero limit requires benchmark approval.
4. Escalation must never retry an uncertain mutation, bypass confirmation, expand tenant access or override a grounding rejection. Prefer clarification or human handoff when facts are unavailable. Provider failure must not be rendered as no availability.
5. Emit metadata-only routing decisions: correlation ID, policy version, chosen allowlisted profile, reason category, admitted maximum cost, call count, latency, provider error category and actual usage. Existing request diagnostics/usage provide the base; a dedicated routing audit event is future work.
6. Gate enablement on identical synthetic EN/TR benchmarks across candidate models, human-reviewed factuality and naturalness, transaction/tenant safety, provider-reported usage reconciliation and measured latency/cost distributions. Mock performance is insufficient evidence.

### Remaining work and live verification requirements

The four-mode model UI, automatic routing implementation, Astra capability/pricing registration, broader structured interpretation and empirical model comparisons remain future work. Further scenario expansion should turn pure contracts into multi-turn provider evaluations, add diverse informal Turkish and ambiguity cases, and measure actual permitted/forbidden tool selection rather than trusting declared metadata.

Live verification needs separate explicit authorization, dedicated project credentials, synthetic tenant/channel fixtures, verified model entitlement and prices, a small spend cap, redacted diagnostics, and usage reconciliation. No live-provider behavior was verified here. Real-business pilot remains **NO-GO on this evidence alone**.

## Phase 2 partial checkpoint

Added an isolated, conservative routing-policy prototype in `apps/api/src/services/automatic-routing.ts` and its test in `apps/api/test/automatic-routing.test.ts`. It returns only the configured baseline when platform and organization lists, known capability, positive known prices, positive remaining budget and deadline permit; otherwise it fails closed. It does not perform cost reservation, check entitlement, select dynamically, record telemetry, or execute calls. It is **not connected to production request processing or a selectable Automatic mode** and is not a complete router. The downstream existing budget admission remains necessary before any future use.

Targeted routing test passed (one test); application typecheck and `git diff --check` passed. The first isolated test attempt failed because required synthetic environment variables were missing; the fixture was corrected. Full Phase 2 test suites, model documentation/entitlement verification, four-mode UI, multi-intent interpretation, proactive engagement and 120-scenario target have not been completed or verified in this checkpoint. Existing configurations were not changed. No live-provider calls were made. The Phase 2 definition of done is not met.

## Phase 2A investigation — incomplete

Official OpenAI documentation identifies [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), and [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra). Luna and Sol document Responses tool calling, supported reasoning settings, and published prices. Those public pages do not establish entitlement for this application's provider project. The existing `AI_ENABLED_MODELS` setting is an operator allowlist, not an entitlement verification. No credential or live provider call was used to check access. Luna's current official cache-write rate is $0.125 per million; the existing registry uses a higher conservative $0.25 estimate, so pricing metadata needs reconciliation before it can be described as exact provider pricing.

Changed only `apps/api/src/services/automatic-routing.ts` and `apps/api/test/automatic-routing.test.ts` for this checkpoint: the isolated routing prototype now rejects malformed cached-input and cache-write rates and has a test for an unknown allowlisted model. It remains disconnected from the queue and settings API. Targeted tests: two passed; application typecheck and `git diff --check` passed. No other full verification was run in this checkpoint.

Four-mode configuration, entitlement verification, authenticated persistence, runtime integration, end-to-end usage/budget verification, UI and requested full suites remain unfinished. In particular Automatic is not functional and Phase 2A is not complete. Existing assistant settings and production services were not changed.

## Phase 2A — integrated four-mode configuration (2026-11-13)

This section supersedes the isolated-prototype checkpoint. The four-mode configuration is now connected to authenticated persistence and durable runtime processing. This is local integration verification, **not live model quality or production readiness**.

### Files changed in this phase

- `apps/api/src/services/model-config.ts`: extends the existing registry with Astra; adds explicit product-mode selection, model mapping, verified-project gate, capability/pricing/policy resolution and availability descriptions. Preserves legacy, preset, custom and Terra configurations.
- `apps/api/src/routes/assistants.ts`: returns product-mode availability through existing tenant-authorized model options. Existing create/update schema and resolver now validate and persist product selections.
- `apps/api/src/services/automatic-routing.ts`: restricts Automatic to Luna, even if a caller supplies an allowed premium baseline.
- `apps/api/src/services/widget-queue.ts`: invokes the router on the actual model path, loads budget fields, revalidates selection, binds the responder to the effective model, reserves worst-case cost and records routing metadata.
- `apps/api/src/services/budget.ts`: rejects product-mode contexts whose conservative input estimate exceeds the verified short-context pricing boundary.
- `apps/api/src/models/index.ts`: optional request `aiRoutingPolicy` field. No migration or existing assistant rewrite.
- `apps/api/.env.example`: documents empty-by-default `AI_VERIFIED_MODELS`.
- `apps/web/src/api.ts`, `ModelSettings.tsx`, `preferences.tsx`: four-mode controls, availability explanations, effective reasoning restrictions, EN/TR labels, cost/latency warning and retained legacy/custom controls.
- `apps/api/test/tenancy.test.ts`, `model-profiles.test.ts`, `automatic-routing.test.ts`: authenticated persistence, MongoDB queue/Responses adapter integration, policy, budget, pricing and baseline-only regressions.
- `apps/web/test/dashboard.spec.ts`: four-mode editing, disabled choices, persistence, Turkish/dark mobile layout and accessibility.
- This report.

### Verified public capabilities and project availability

Official pages opened during this phase:

- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): identifier `gpt-6-luna`; Responses function calling; reasoning none/low/medium/high/xhigh/max; 1,050,000 context and 128,000 maximum output tokens.
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol): identifier `gpt-6.1-sol`; Responses function calling and structured outputs; reasoning low/medium/high/xhigh/max; the same published context/output limits.
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra): identifier `gpt-6-astra`; Responses function calling and structured outputs; low/medium/high/xhigh/max; the same published context/output limits.
- [Published pricing](https://developers.openai.com/api/docs/pricing?latest-pricing-expanded=true): standard short-context text input/output USD per million: Luna 0.10/0.50, Sol 2/10, Astra 10/50. Cached input: 0.01/0.10/1.00 respectively. Published 30-minute cache-write prices are 0.125/2.50/12.50; the existing accounting deliberately reserves the higher 12-hour cache-write ceilings (0.25/5/25). Unknown cache breakdown is conservatively estimated, not represented as an exact invoice.

Product-mode input estimates above 272,000 are rejected rather than undercharging long-context rates. Existing 800-token output cap remains unchanged. Only standard text processing is supported by this rollout; operator verification must include region/account pricing. Regional/FedRAMP premiums and alternate tiers are not enabled by this implementation.

**Project entitlement remains unverified.** No authenticated provider probe or billable request was made. Public documentation is not account access. New modes require an explicit operator verification record in `AI_VERIFIED_MODELS`, as well as `AI_ENABLED_MODELS`, organization permission and the effective reasoning ceiling. Empty verification configuration leaves the options visibly disabled. Tests set synthetic verification records solely within their isolated process. Existing runtime environment files and credentials were not modified. An operator must verify the actual project's entitlement, Responses capability and applicable pricing before recording any ID; this variable is an attestation, not a capability probe or access grant.

### Dashboard and compatibility

The dashboard shows Normal → Luna, Powerful → Sol, Very Powerful → Astra, and Automatic → Luna baseline only. Disabled options explain unverified access, denied policy or incompatible reasoning ceilings. New modes use medium reasoning; they remain unavailable when that exceeds the effective ceiling. Legacy custom settings retain their existing authorized advanced reasoning controls. The old profiles remain explicitly visible and selectable; no saved assistant is silently migrated. The new verification gate intentionally applies to new product modes, not retroactively to existing profiles.

Selections use the existing authenticated, CSRF-protected, owner/admin-only assistant endpoints and optimistic settings version. Tenant permission enforcement is unchanged. The UI preserves an existing configuration until the user explicitly selects another. Astra can be represented and tested without enabling it in the local environment.

### Runtime and accounting

Deterministic conversation paths still complete without unnecessary model calls. When the queue reaches a model call for Automatic:

1. Resolve the persisted product selection against project verification, platform/organization authorization, effective reasoning limit and known positive integer prices.
2. Run the conservative router, which accepts **only Luna**. A premium model is never an alternate, including when Luna is denied. Expensive escalation has no enabled code path.
3. Reject stale requests beyond the 120-second routing admission window and preliminary missing budgets. This admission window is not a new guarantee of end-to-end response latency.
4. Bind the existing Responses responder to the selected configuration.
5. Reserve worst-case primary plus possible synthesis cost through the existing atomic daily/monthly budget mechanism. Preliminary routing budget inputs are configured limits, not authoritative remaining balances; the reservation transaction checks actual spent/reserved funds.
6. Record the actual selected model/pricing version and reconcile provider usage through existing UsageEvent and BudgetWindow accounting.

Metadata-only routing logs include request/organization IDs, model, mode, reasoning, reason and policy version; admission logs record maximum reserved cost. Existing decision/usage records retain call counts and tokens. Requests persist `aiRoutingPolicy` for Automatic. No customer messages or credentials are added to these diagnostics. Existing provider failure handling, timeouts and no-retry behavior remain in place. Router approval never authorizes an AgentAction, changes tenant scope or bypasses confirmation.

### Verification

Executed after implementation:

- `npm test`: **101 passed, zero failed/skipped**; includes real isolated MongoDB replica-set integration.
- `npm run test:browser -w apps/web`: **17 passed**. Browser API responses are fixtures; API persistence/queue authority is independently tested against MongoDB.
- `npm run eval:deterministic -w apps/api`: unchanged **92 scenarios**: 68 fixture scores, 64 backend checks passed/four intentionally skipped, plus 24 deterministic contracts passed.
- `npm run eval:typecheck -w apps/api`, `npm run typecheck`, `npm run build`, `npm run brand:check`: passed.
- `npm audit --json`: zero vulnerabilities.
- `git diff --check`: passed after removing a trailing blank line.
- Targeted `node --import tsx --test apps/api/test/tenancy.test.ts` was used during debugging.

Integration verifies supported-mode creation/update and persisted selections; Astra rejection without verification and acceptance with synthetic verification; cross-tenant update denial; Automatic reaching the queue, Responses SDK adapter, reservation and usage settlement; actual Luna model/policy recorded; durable duplicate request suppression; and zero provider calls after budget, organization, platform or verification denial. Existing regression suites retain booking confirmation, duplicate booking and tenant isolation coverage.

Intermediate failures were corrected: the new test initially ran after session expiration; queue routing initially omitted budget fields from the organization projection; the synthetic Responses fixture omitted its text field; a browser fixture omitted required website origins; and shared test usage contaminated an older aggregate assertion. The integration now uses its own synthetic organization and preserves the older assertions.

### Status and release limitations

The Phase 2A configuration/runtime vertical slice is implemented and locally integration-tested, with no premium escalation. Actual project access and live Responses behavior remain **NOT VERIFIED**. New product modes therefore remain disabled in environments without an operator verification record. This is an activation prerequisite, not a mock-only router: the same saved selection and queue code exercised by integration tests handle production requests once verified and authorized.

No paid calls, deployment, service restart, commit, push, webhook change or real customer-data change occurred. Phase 2B conversational expansion and the broader 120-scenario target were deliberately not started. Project ASTRA is not production-ready on this evidence; authorized synthetic live verification and applicable billing/entitlement checks remain release gates.

## Phase 2B — grounded preference continuity and proactive assistance (2026-11-13)

### Implemented scope and files

This phase adds an **opt-in** `real_estate` conversation strategy. Existing assistants keep `reactive` behavior. Owners/admins select the strategy through existing authenticated assistant settings; the dashboard exposes EN/TR labels. No existing assistant or customer record was migrated.

Files changed:

- New `apps/api/src/services/business-conversation.ts`: strict bounded state/evidence schemas, multi-field extraction, proposal validation, preference merging, generic question planner and real-estate question configuration.
- New `apps/api/src/services/business-conversation-runtime.ts`: domain adapter composing verified searches, clarifications, refusal responses, handoff and optional viewing invitation.
- `apps/api/src/services/widget-queue.ts`: invokes the strategy in the durable queue, persists scoped preference state, handles the existing primary provider call's structured proposals, and retains the normal appointment authority.
- `apps/api/src/services/ai.ts`: bounded preference-proposal tool, intercepted and validated before any business action.
- `apps/api/src/models/index.ts`: assistant strategy and optional conversation workflow business state.
- `apps/api/src/routes/assistants.ts`: validated strategy setting.
- `apps/api/src/services/business-data.ts`: optional exact-room search filter so 3+1 does not quietly match 4+1.
- `apps/api/src/services/conversation-flow.ts`: recognizes “ikinci daire” / “ilk daire” references.
- `apps/api/src/services/appointment-language.ts`: understands a negative date followed by a named alternative, including “yarın gelemem, perşembe”.
- `apps/web/src/api.ts`, `App.tsx`, `preferences.tsx`: strategy type, selection and persistence.
- New `apps/api/evals/business-continuity.ts` and updated `evals/deterministic.ts`: 36 additional distinct deterministic contracts.
- `apps/api/test/telegram-availability.test.ts`: two MongoDB-backed end-to-end strategy/proposal tests.
- `apps/web/test/dashboard.spec.ts`: strategy persistence coverage in the existing mobile editing test.
- This report.

### Interpretation and continuity

Supported explicit fields include supplied name, location, budget/currency, exact room count, property/listing type, furnishing and balcony preferences. Each stored field retains a bounded literal evidence span and source request ID. Field count, lengths, monetary bounds, question history and refusal history are bounded. Names remain unverified customer assertions; phone strings are neither collected by this adapter nor converted into marketing consent. State remains in the existing tenant/visitor-scoped conversation, subject to existing conversation retention/export/deletion.

Deterministic extraction handles supported Turkish, ASCII-Turkish, English and mixed expressions. A single unambiguous later budget replaces the earlier active value, retaining an explicitly supplied currency; conflicting values in one turn request clarification without changing preferences. A currency is not invented for “30 bin”. Business-topic changes and factual price/furnishing questions do not overwrite active preferences.

Structured model proposals use the **already budget-admitted primary call**, never a new interpretation call. The strict schema allows only bounded preference fields and literal evidence. The server rechecks each value against the actual request; for proximity expressions it can accept a literal place span in “near Görükle” / “Görükle civarı”. Unsupported transformations, invented evidence, extra execution fields and conflicts are rejected. No provider prose can authorize a booking. This is deliberately conservative; it is not a general semantic interpreter for all informal language.

Listing references resolve only against the conversation's bounded prior result IDs, with a fresh tenant-scoped lookup. Under this strategy, a stale referenced result requests clarification instead of shifting the ordinal to a different remaining listing. Date alternatives and periods feed the existing verified bounded availability search, not generated slots.

### Proactive strategy and response composition

The shared question planner accepts domain-owned priorities; real-estate question wording lives in the adapter configuration, not the shared queue engine. It asks at most two questions, excludes known/refused fields and remembers questions already asked. It can request rental/sale intent, location, budget/currency and furnishing preference. A verified selected listing plus an explicit interest expression can offer a viewing once; it never claims urgency or available times.

Search answers are composed from backend listing records, followed by a relevant optional question. Corrections receive a short acknowledgment. A phone refusal gets an explicit acknowledgment and is retained. Explicit human requests use the existing authorized handoff action. Topic changes return to the existing knowledge/model flow rather than forcing property questions.

The listing schema does **not** certify furnishing or balcony. These preferences are stored but not falsely used as verified filters; customer replies disclose that complete feature matching cannot be confirmed. No listing, price, attribute or availability is generated from the customer's preference. Unknown or missing essential search fields cause clarification; database/tool exceptions retain the existing failure path and are not reported as zero inventory.

### Demonstrated queue workflows

MongoDB integration creates only isolated synthetic organizations, listings, staff schedules and conversations:

1. “Ben Ahmet. Görükle'de kiralık 3+1 bir daire arıyorum, 30 bin TL geçmesin. Balkon da olsun.”
   - Stores name/location/rooms/budget with provenance.
   - Returns only the two authorized 3+1 listings below 30,000 TRY.
   - Excludes a cheaper 4+1 property and another tenant's listing.
   - Discloses unverified feature matching and does not re-ask supplied location/budget.
2. “Önceki bütçemi boş ver, artık 35 bin olabilir.”
   - Replaces the active budget and returns the newly eligible stored 34,000 TRY property.
3. “Telefonumu vermek istemiyorum.”
   - Persists refusal, acknowledges no phone is necessary and continues permitted workflows.
4. “Şu ikinci daire daha iyiymiş. Ama yarın gelemem, perşembe öğleden sonra olur.”
   - Retains the correct prior-result identity and offers only verified Thursday-afternoon slots.
   - Selecting a slot creates a pending action, not an appointment.
   - Explicit confirmation persists one appointment; repeated confirmation does not duplicate it.
5. An injection attempt cannot replace the budget; a subsequent human request changes the conversation to handoff.
6. “Somewhere near Görükle would work.”
   - A simulated provider's evidence-linked location proposal passes through one reserved/settled primary call.
   - A fabricated Istanbul proposal is rejected; neither proposal creates an appointment or consequential action.

The original illustrative message without rental/sale intent or currency is intentionally clarified rather than silently assuming either. These demonstrations use real MongoDB and actual queue/action code with deterministic providers or synthetic provider results, **not live Telegram sends or live model quality tests**.

### Verification results

- `npm test`: **103 passed, zero failed, zero skipped**.
- `npm run test:browser -w apps/web`: **17 passed**.
- `npm run eval:deterministic -w apps/api`: **128 total scenarios** = 68 existing provider fixtures + 24 earlier deterministic contracts + 36 new business contracts. Original database assertions remain **64 passed, four intentionally skipped**. All 60 pure contracts pass. None of these numbers is live-model accuracy.
- `npm run eval:typecheck -w apps/api`, `npm run typecheck`, `npm run build`, `npm run brand:check`: passed.
- `npm audit --json`: zero vulnerabilities.
- `git diff --check`: passed.
- Targeted `node --import tsx --test apps/api/test/telegram-availability.test.ts` ran during integration debugging.

The new integration initially exposed a genuine continuation defect: a repeated word “daire” was mistaken for a changed property preference, causing a fresh search during scheduling. The adapter now compares values before interpreting a preference as changed. Test-only failures also included omitted required synthetic budget fields and asserting a reservation remained positive after successful settlement; fixtures now supply budgets and assert reservation during the call plus zero reservation and persisted usage after completion.

### Safety, limitations and next verification

All four product modes, project-verification gates, Luna-only Automatic routing, legacy/custom settings, atomic budgets, durable request handling, explicit booking confirmation, idempotency and tenant isolation remain in place. The 800-token cap is unchanged. Deterministic read-only turns require no provider call. Model-assisted proposals use one existing authorized call and its accounting. No unbounded tools, recursive loops, external infrastructure or premium escalation were introduced.

The implementation handles an intentionally bounded phrase set. Ambiguous dates/references, unsupported spellings, arbitrary multi-location changes or model proposals without verifiable evidence may need clarification or human help. The strategy does not certify unmodeled furnishing/feature data, perform currency conversion, verify personal identity or create CRM records. Optional viewing invitation quality and broad free-text naturalness still require human-reviewed live evaluation. Existing assistants must explicitly enable the new strategy; no silent behavior migration occurred.

Phase 2B's local vertical slice and required evaluation count are implemented and verified. Live model tool selection, naturalness, latency and entitlement remain unverified. Project ASTRA and a real-business pilot are **not production-ready on mock evidence alone**. Authorized synthetic live evaluation remains a separate release gate. No deployment, commit, push, production restart, paid API call or real customer-data modification occurred.

## Phase 2C — CI, evaluation and commercial release preparation (2026-11-19)

The working tree was clean at the start on commit `80f4dfa`. Git remote HEAD confirmed `master`. The repository had no Actions workflow. The legacy live evaluation used Chat Completions and rejected Sol and Astra. The README omitted the current product mode and strategy details. The review traced the website and Telegram paths to the shared queue, the assistant model resolver and budget accounting, the staff authorization boundaries, the MongoDB fixtures and browser test configuration.

### Changes and files

- `.github/workflows/ci.yml` adds push and PR checks for `master` and manual dispatch. The Ubuntu 24.04 job uses pinned checkout and setup-node actions, Node 24, `npm ci`, npm cache, read-only contents permission, no stored checkout credentials, a 25-minute deadline and cancellation of superseded runs. Synthetic replica sets are pinned to MongoDB 8.0.12. Playwright installs Chromium only. The workflow uses ordinary pull-request events and has no production secrets or deployment actions.
- `apps/web/playwright.config.ts` selects Playwright-managed Chromium in CI and starts a fresh Vite server. Local system and explicit executable overrides remain available.
- `apps/api/evals/benchmark.ts` and `benchmark-cases.ts` add versioned durable-queue comparison, rule checks, usage and report output. `apps/api/package.json` wires the offline benchmark and opt-in Responses benchmark. The retired direct Chat Completions CLI was removed from `apps/api/evals/live.ts`.
- `apps/api/src/services/business-conversation.ts` handles explicitly negated rental/sale types. `widget-queue.ts` recognizes common explicit English starts with Turkish place names. `flexible-scheduling.ts` handles explicit next-week dates and excludes a declined tomorrow from the following two days.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/VERIFICATION.md` and `apps/api/evals/README.md` describe the implemented channels, model activation, budgets, synthetic test commands and release prerequisites.
- This report, `ASTRA_PHASE_2C_EVALUATION_REPORT.md` and `SAAS_RELEASE_READINESS_REPORT.md` record verification, limitations and the Phase 3 plan.

### Safety and verification

The queue test and benchmark changes keep tenant and model authorization in the application. The benchmark uses production reservation and reconciliation paths in isolated MongoDB, restricts all transactions to synthetic state, checks for forbidden actions and never sends mail or Telegram delivery. Regression evidence for confirmations, expired and duplicate proposals, model restrictions, missing prices, exhausted budgets, provider failures and telemetry remains in the existing test suite. The old direct live runner lacked tenant budget authority and Responses support. Its replacement requires explicit opt-ins, reviewed registry prices, separate credentials, verified candidate IDs and request/spend bounds. CI cannot activate live mode.

Local runs used Node 24. The first new evaluator typecheck found widened listing fixture enum types, corrected with literal types. The first comparison exposed the locale defect and explicit rent/sale correction gap. The first full API run failed the Thursday scheduling regression, corrected by allowing explicit dates exactly seven days out while retaining the bounded seven-date search. No test assertions were relaxed.

| Check | Outcome |
| --- | --- |
| Locked npm install | Passed |
| API | 103 passed, zero skipped |
| Browser | 17 passed with system Chromium and 17 passed with Playwright-managed Chromium under `CI=true` |
| Deterministic evaluation | 128 scenarios, 64 backend passes, four intentional no-action skips |
| Queue benchmark | 39 simulated turns across three candidate configurations, zero failures |
| Application and evaluation typechecks, production build, brand check | Passed |
| Dependency audit | Zero reported vulnerabilities |
| Actionlint and whitespace check | Passed |
| GitHub-hosted workflow | Local syntax and constituent commands verified. Hosted execution pending. |
| Live model evaluation | Gate rejection checked locally. Provider execution and access pending. |

Public SaaS and a real-customer pilot remain gated on hosted CI, authorized live-model and channel checks, managed operations, privacy rehearsals and support ownership. Prioritize verified listing attributes, structured contact consent and staff notifications before broader self-service and billing. [Evaluation evidence](ASTRA_PHASE_2C_EVALUATION_REPORT.md) · [Phase 3 readiness plan](SAAS_RELEASE_READINESS_REPORT.md)

## Phase 2D — live benchmark preparation and adaptive routing (2026-11-19)

The existing isolated queue benchmark now has explicit preflight, per-model and global reservations, bounded context and request counts, provider uncertainty handling and reviewable bilingual reports. Five conversations and 60 simulated turns passed across three candidate configurations. Policy v2 classifies task complexity and checks actual tenant budget headroom. The production premium gate remains false, so Automatic uses authorized Luna. Budget withdrawal and Turkish ordinal/unknown dues handling received end-to-end regression coverage.

The local suite passed 109 API tests and 17 browser tests. The 128-scenario deterministic suite retained four intentional backend skips. Installation, typechecks, production builds, audit, brand check and workflow lint passed. **LIVE MODEL QUALITY NOT YET VERIFIED.** Hosted execution for these changes and authenticated provider entitlement remain pending. [Implementation and evidence](ASTRA_PHASE_2D_MODEL_INTELLIGENCE_REPORT.md) · [Model comparison and human review](ASTRA_MODEL_COMPARISON_REPORT.md)
