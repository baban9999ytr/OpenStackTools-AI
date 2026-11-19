# Phase 2F controlled live evaluation proposal

**PENDING LIVE VERIFICATION.** The Phase 2E approval was consumed. Obtain separate approval for this proposal before enabling or starting a billable run. The 80-turn quality suite is intentionally offline-only.

| Limit | Proposed value |
| --- | --- |
| Model, endpoint and project | `gpt-6-luna`, Standard Responses, dedicated nonproduction project only |
| Reasoning and output | `none`, 512 output tokens per call |
| Input and call ceiling | Existing 40,000 conservative input-token bound, at most nine provider calls |
| Application budget | $0.10 global and per-model |
| Provider spending controls | Review dedicated-project quota and pricing, set a project cap where supported, and review uncertainty and billing before any further run |
| Retry and synthesis | Existing 30-second SDK timeout, zero retries and no extra synthesis calls |

The existing registry reserves up to $0.010259 per call at these bounds. Nine calls reserve at most **$0.092331** under the same Standard-rate assumptions as Phase 2E. The estimate includes the conservative cache-write rate and rounding. Invoice charges require separate reconciliation. [Phase 2E cost method](ASTRA_PHASE_2E_LIVE_VERIFICATION_PREPARATION.md)

The existing runner now has a separately gated narrow selection with the following nine decision opportunities. It awaits live approval. Supply synthetic histories where needed and count only turns that reach Luna. Keep deterministic setup and safety checks in the same execution log.

1. Two turns for a colloquial greeting and relevant clarification of flexible location and room preferences.
2. Two turns for the contact tool with both fields requested and a mixed Turkish/English follow-up.
3. Three turns for a verified comparison, unknown maintenance fee, and corrected first-listing deposit reference.
4. Two turns testing unknown transit or ownership facts and a grounded next step for a compound viewing and furnishing request.

Record tool selection, argument validity, assumptions, carried facts, unsupported claims, clarifying questions and application alterations before deciding whether Luna handled each opportunity. Ask an independent fluent reviewer to score the transcript with the rubric. Stop on a failed authorization, budget or token check, unexpected consequential action, cross-tenant result, fabricated verified fact, incomplete response, or uncertain provider outcome. Review the full run before another request allocation.
