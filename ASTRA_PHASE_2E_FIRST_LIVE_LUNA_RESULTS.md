# ASTRA Phase 2E — First live Luna experiment

**Decision: BLOCKED.** The operator explicitly authorized one billable run. This time the ignored application dotenv file contained an `EVAL_PROJECT_API_KEY` entry, but the benchmark process did not inherit it. The entry matches the application's `OPENAI_API_KEY`. This does not establish that the runtime key is a production key, but there is no project-specific evidence confirming its dedicated nonproduction scope, Luna quota, or spend-control review. No credential values were displayed.

The public Luna model page confirms short-context Standard input at $0.10 and output at $0.50 per million tokens, with cache reads at $0.01 and 30-minute cache writes at $0.125. These are public rates. The applicable project pricing terms could not be verified. [Official Luna model reference](https://developers.openai.com/api/docs/models/gpt-6-luna)

| Item | Result |
| --- | --- |
| Authorized scope | Luna only, `luna-smoke`, reasoning `none`, 512 output tokens, at most three calls, $0.04 global and per-model application ceilings |
| Provider-free preflight | Not started with unverified project configuration |
| Live calls, spend and reports | Zero provider calls and zero spend from this attempt. No runtime JSON or transcript was produced. |
| Model output, tools, preferences and business facts | Unmeasured |
| Booking safety and tenant isolation | Unmeasured in this live experiment |
| Latency, provider token usage, internal settlement and invoice cost | Unmeasured |
| Budget envelope | Previously calculated worst-case estimate of $0.030777. No live reservation or settlement was made. |
| Readiness for a larger controlled evaluation | Undetermined pending the first live run |

The authorized run remains unused. The prerequisite is to make the dedicated project credential available securely as `EVAL_PROJECT_API_KEY` and confirm Luna entitlement, quota and applicable Standard pricing for that project. See the [operator procedure](ASTRA_PHASE_2E_LIVE_VERIFICATION_PREPARATION.md#operator-approval-and-execution).

## Local launcher follow-up

`apps/api/evals/launch-luna.mjs` loads the operator dotenv through Node's direct `--env-file` invocation. The actual dotenv reached launcher validation. It was blocked by missing dedicated-project, model-access, provider-limit and Standard-pricing attestations and a missing UTC pricing review timestamp. The matching runtime key still needs project-specific confirmation of nonproduction scope and available quota. Public pricing was reviewed, but no project attestation or timestamp was generated from the public rates.

An inert fixture passed provider-free preflight with nine synthetic turns, three planned calls and a $0.030777 reservation ceiling. The actual credential did not reach benchmark preflight or provider execution. The authorized run remains unused. [Launcher instructions](ASTRA_PHASE_2E_LIVE_VERIFICATION_PREPARATION.md#local-dotenv-launcher)
