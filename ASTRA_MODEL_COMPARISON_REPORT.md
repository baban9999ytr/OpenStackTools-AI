# ASTRA model comparison

**LIVE MODEL QUALITY NOT YET VERIFIED.** No paid model calls or authenticated entitlement checks took place. Candidate eligibility, quality, latency, and billed cost remain unscored.

## Verified public specifications

Prices below are USD per million text tokens for short-context Standard processing. The operator must confirm actual project rates and terms before a run.

| Mode | API model ID | Reasoning settings | Input | Cached input | 30-minute / 12-hour cache write | Output |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Normal | `gpt-6-luna` | none, low, medium, high, xhigh, max | 0.10 | 0.01 | 0.125 / 0.25 | 0.50 |
| Powerful | `gpt-6.1-sol` | low, medium, high, xhigh, max | 2 | 0.10 | 2.50 / 5 | 10 |
| Very Powerful | `gpt-6-astra` | low, medium, high, xhigh, max | 10 | 1 | 12.50 / 25 | 50 |

All three list Responses, Chat Completions and Batch endpoints with published function calling and structured output support. The benchmark uses Responses for all three. Luna documents Chat Completions function calling at reasoning `none` only, and Sol requires Responses for tools. Each lists a 1,050,000-token context, 922,000 maximum input tokens and 128,000 maximum output tokens. The app reserves using the higher reviewed cache-write ceiling. Above 272,000 input tokens, the published Standard rates double input and cache prices and increase output prices by 50% for the full request. The benchmark bounds its estimated input at 40,000 tokens. [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) · [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) · [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) · [Pricing](https://developers.openai.com/api/docs/pricing)

OpenAI lists project usage-tier limits per model and regional processing eligibility. The pricing page specifies a 10% surcharge for applicable regional and FedRAMP endpoints. The benchmark uses the standard OpenAI API endpoint and asks the operator to attest to Standard pricing. Actual quota, availability and invoice terms depend on the dedicated project. [Model rate limits and regional notes](https://developers.openai.com/api/docs/models/gpt-6-luna) · [Provider pricing terms](https://developers.openai.com/api/docs/pricing)

## Comparison method

Run `npm run eval:benchmark -w apps/api` for synthetic fixtures. Suite `astra-conversations-v2` runs 20 customer turns in five conversations per candidate, with matching starting records, customer turns and configuration. Each candidate gets its own tenant. The report flags when earlier assistant output changes the model-visible history relative to Luna. Dates and database identifiers are generated for each isolated run. Business operations still go through tenant and confirmation controls. Deterministic paths are part of the end-to-end operational checks and contribute no model-quality evidence.

Separate machine checks cover stored preferences and removals, allowed and proposed tools, selected arguments, known reply fragments, unsupported features, appointment window, forbidden mutations, scoped inventory, handoff and accounting. Reports record queue elapsed time, provider latency, reasoning and cache token fields when available, estimated cost, and estimated spend per successful conversation. Tool latency and invoice cost require separate measurement. Tests for booking, expiry, rescheduling and duplicate confirmation also run in the API suite. No model is ranked based on synthetic outputs.

## Human review rubric

Use the per-turn `humanReview` fields in the private JSON report. Keep each dimension independent and leave it null when unreviewed or inapplicable. Give a score of 1 for a material problem, 2 for an adequate reply and 3 for a strong reply. Record evidence in the reviewer notes alongside the score. Keep reviewer notes separate from machine check results.

| Dimension | Review question |
| --- | --- |
| Naturalness and professional tone | Does the language fit a real customer exchange in Turkish or English, with a respectful tone? |
| Clarity, relevance and helpfulness | Is the answer clear, responsive and useful given the verified records? |
| Follow-up and repetition | Does it advance the task with a relevant next question while respecting prior answers and refusals? |
| Recommendation quality | Are trade-offs explained using actual listing facts and the customer's stated priorities? |
| Groundedness | Can each consequential claim be traced to a verified record? Flag unsupported claims regardless of the other scores. |

Before an empirical comparison, agree on task-level outcomes and review matched turns without identifying the candidate. Reconcile token estimates against the dedicated project invoice and record any inconclusive cases. [Operator procedure](apps/api/evals/README.md)
