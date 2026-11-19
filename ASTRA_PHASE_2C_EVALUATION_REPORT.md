# ASTRA Phase 2C evaluation

The offline evaluation retains 128 scenarios and adds a separate three-conversation comparison suite. Each of the three candidate configurations runs 13 turns against independently seeded MongoDB organizations with matching listings, staff hours and initial state. The benchmark verifies completed requests, selected tools and arguments, preference and refusal state, verified reply fragments, tenant marker exclusions, follow-up repetition, handoff, availability windows, forbidden transactions and usage settlement. It records proposal output separately from executed actions.

| Evidence | Result |
| --- | --- |
| Original synthetic model fixtures | 68 of 68 passed |
| Original backend outcomes | 64 passed, four intentionally skipped for no-action cases |
| Deterministic continuity and business contracts | 24 and 36 passed |
| Queue comparison | Three conversations per candidate, 39 total turns, zero failing turns |
| Live benchmark admission without authorization in CI | Rejected with exit 2 before provider execution |
| Live provider and human evaluation | Pending separately authorized execution and review |

The comparison exercises corrected rent/sale intent, budget and currency retention, exact-room filtering, phone refusal, handoff, viewing without booking, qualifying questions, informal Turkish, unsupported proximity requests, mixed-language locale, evidence-linked model interpretation and tenant scope. Existing integration tests cover explicit confirmation and duplicate prevention through booking completion. The offline comparison uses known synthetic replies at provider boundaries. Regex and state assertions cover selected factual claims. General semantic accuracy, naturalness, product suitability and recommendation quality require human review.

The JSON report includes scenario IDs and version, candidate settings, observed preferences, final reply, model proposal, executed action, elapsed and provider latency, provider-reported tokens or synthetic equivalents, reservation estimates and per-conversation usage totals. Naturalness, relevance, helpfulness, clarity, repetitiveness, groundedness and follow-up ratings are left null. The live summary sent to the console contains run status and cost metadata. The private JSON output is intended for synthetic-data review.

## Live prerequisites and limits

The official catalog confirms Responses function calling and structured outputs for the three candidate identifiers. Public capabilities and Standard token pricing are documented per model. Account entitlement, regional rates, working invocation and quality still require operator verification. [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) · [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) · [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) · [OpenAI pricing](https://developers.openai.com/api/docs/pricing)

Separate project credentials and explicit spend authorization are required. The run uses disposable synthetic tenants, the application budget reservation and a second serial aggregate spend guard. Provider errors stop the run and retain the uncertain reservation. The 128-output-token benchmark cap and 30-second SDK deadline are held constant, with SDK retry and benchmark synthesis disabled. The production output cap is unaffected. The cap may truncate reasoning-heavy cases. Live candidate outputs can change subsequent history in the same conversation, even though each starts with the same initial fixtures and customer turns. An interrupted comparison may have partial coverage. Reconcile provider invoices independently and review responses before drawing conclusions. [Evaluator guide](apps/api/evals/README.md)
