# Live provider verification gates

The local HTTPS stack defaults to inert OpenAI credentials and STARTTLS Mailpit. **No real OpenAI call or external SMTP inbox delivery is implied by local smoke tests.** Use dedicated staging accounts only after the operator approves spending and the recipient. Do not use customer data or production credentials.

## OpenAI: one application conversation

1. Choose a currently supported, inexpensive Chat Completions model and verify its current input and output prices in official provider documentation. Treat the provider project's billing limit and this application's organization budget as separate controls. Set a small provider project spending target and review who can access its API key.
2. In the ignored `deploy/local-https/.secrets/api.env`, replace `OPENAI_API_KEY`, `OPENAI_MODEL`, and both price values. Keep `OPENAI_MAX_COMPLETION_TOKENS` at 128 or less, `DEFAULT_DAILY_BUDGET_USD` at 0.10 or less, and `DEFAULT_MONTHLY_BUDGET_USD` at 0.50 or less. Do not paste the key into commands, reports, browser code, or Git.
3. Recreate only the private API container: `docker compose -f deploy/local-https/compose.yaml up -d --no-deps --force-recreate api`. Confirm private `/health/ready` is 200. Verify the API can still send only to the synthetic Mailpit recipient allowlist.
4. After explicit approval, run **once**: `OPENAI_LIVE_TEST=1 LIVE_SPEND_APPROVED=1 LIVE_PRICES_VERIFIED=1 python3 deploy/local-https/live-openai-conversation.py`. The script checks the ignored settings, creates a synthetic account through HTTPS and Mailpit, sends one short widget message, and never retries a failed call. On success it verifies persisted customer/assistant messages, actual token usage, estimated cost, day/month budget settlement, and a second message blocked by zero budget before the provider. It removes its test tenant. It prints usage metadata, not the reply, key, or customer text.
5. Review the provider's actual usage/billing dashboard and reconcile with the recorded estimate. A timeout may have a provider charge even when the application cannot confirm usage; inspect `billingStatus=uncertain` and logs by request ID before considering any new request. Restore placeholder credentials or stop the local stack when done.

The older `npm run test:openai:live -w apps/api` exercises only the adapter and does **not** verify conversation persistence or budgets. Do not substitute it for the application-level check above.

## SMTP: external inbox delivery

1. Obtain authorization for a sandbox SMTP account and a dedicated mailbox you control. Verify sender domain policy, TLS requirements, recipient restrictions, and that the mailbox is not a customer address.
2. Configure the ignored local `api.env` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optional `SMTP_USER`/`SMTP_PASSWORD`; keep `SMTP_REQUIRE_TLS=true`. Recreate only the API container. The local Mailpit service can remain unused. Never put SMTP credentials in a command line or report.
3. Register a new synthetic account using **only the approved dedicated mailbox**, then inspect the received inbox message and its `https://ai.localhost/app/#verify=…` link. Confirm verification, reset, and staff invitation/acceptance. Check one-hour verify/reset expiry, 72-hour invite expiry, single-use behavior, and generic reset response for an unknown address. Test SMTP rejection/timeout only in the sandbox. Delete the synthetic tenant afterward.
4. `SMTP_LIVE_TEST=1 SMTP_TEST_RECIPIENT_CONFIRMED=1 SMTP_TEST_RECIPIENT=<dedicated mailbox> npm run test:smtp:live -w apps/api` is an optional one-message transport check when the host process receives the approved SMTP configuration securely. It establishes server acceptance only. **A human must confirm the message actually arrived in the intended inbox** and inspect the link. Do not treat Mailpit acceptance as external delivery.

No real-provider verification is authorized by this document. If credentials, spending approval, recipient approval, or inbox access are absent, record **BLOCKED** and continue local checks.
