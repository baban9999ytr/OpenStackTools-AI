# Phase 2F conversational evaluation plan

Run the existing queue benchmark with `npm run eval:benchmark -w apps/api -- --suite=conversation-quality`. The suite rejects live execution. It uses disposable MongoDB tenants, synthetic listings and a simulated provider. The corpus has 80 turns in 15 conversations, including 75 Turkish-locale turns and five English or mixed-language controls. Twenty turns reuse prior benchmark cases. The other 60 cover flexible requirements, budget and furnishing corrections, ordinal and attribute follow-ups, missing facts, availability, colloquial language, refusals, handoff, tenant boundaries and compound requests.

| Category | Evidence and scoring |
| --- | --- |
| A · Application | Compare actual stored preferences, scoped retrieval, requested filters, resolved listing, availability window and handoff with the contracts. Fail unexpected consequential actions or bookings. Booking confirmation, cancellation, conflict and rescheduling also run in the existing regression suites. |
| B · Model decision | Save a copy of the proposed tool and arguments before application normalization. Compare selection and structured arguments against declared contracts only. Count provider-boundary turns separately from tool-scored turns. Simulated responses verify the harness. Live decision quality remains pending. |
| C · Customer experience | Record delivered text and its source. Score the declared reply and non-repetition checks. Keep replaced text, discarded tool proposals and normal tool rendering separately labeled. A safe delivered answer can pass while the proposed action fails. |

Use the JSON's request and provider-boundary latency, usage, cost and error fields to investigate anomalies. Simulated timings and token counts describe the fixture path only. Use the stored case and turn to replay an issue. Compare raw proposal, executed action and reply before attributing a failure to the model. Keep application correctness, fixture failures and human review separate.

## Human review

Review synthetic transcripts independently. Leave scores blank until review. Score each dimension from 1–5, where 1 is materially misleading or unusable, 3 is adequate with limitations, and 5 is clear, grounded and helpful. Use notes for the exact turn and evidence. Mark a missing or unsupported fact separately even when prose reads well.

| Dimension | Reviewer question |
| --- | --- |
| Natural Turkish | Does the reply sound idiomatic and suit the customer's register? |
| Relevance and completeness | Did it address each supported question or explicitly defer it? |
| Context understanding | Did it carry the right budget, location, reference and consent? |
| Helpfulness and professional tone | Does it give a useful next step in plain language? |
| Groundedness | Can the business facts be traced to the fixture? |
| Appropriate clarification and repetition | Does it ask the minimum useful question and avoid repeating answered or refused requests? |

Coverage is intentionally bounded. The suite tests asking about room alternatives without silently narrowing them. It does not prove persistent OR filters, complete handling of a compound request, or robust pronoun tracking after several interruptions. A time-of-day offer test establishes behavior against the configured window, not whether noon fits every Turkish interpretation of “öğleden sonra”. Production readiness requires a larger representative synthetic sample and separate operator approval for live tests.
