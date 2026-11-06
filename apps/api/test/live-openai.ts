// Explicit opt-in: this sends one benign request to the configured model.
if (process.env.OPENAI_LIVE_TEST !== "1")
  throw new Error("Set OPENAI_LIVE_TEST=1 to authorize one provider request");
if (
  !process.env.OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY.startsWith("replace-") ||
  !process.env.OPENAI_MODEL ||
  process.env.OPENAI_MODEL.startsWith("replace-") ||
  !process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS ||
  !process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS
) throw new Error("Configure a real server-side key, model, and both model prices first");

// The provider adapter imports the application configuration. These values are
// inert for this test; no database, SMTP connection, or server is started.
process.env.MONGODB_URL ??= "mongodb://127.0.0.1:27017/unused-live-test";
process.env.SESSION_SECRET ??= "live-test-only-session-placeholder-32-characters";
process.env.DASHBOARD_ORIGIN ??= "https://staging.example.invalid";
process.env.DEFAULT_DAILY_BUDGET_USD ??= "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD ??= "1";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_FROM ??= "OpenStackTools AI <no-reply@example.invalid>";

const { openAIResponder } = await import("../src/services/ai.js");
const { measuredCostMicros } = await import("../src/services/budget.js");
const answer = await openAIResponder(
  "Reply with one short, harmless sentence. Do not use tools.",
  [{ role: "customer", text: "This is an authorized provider integration check." }],
);
if (
  !answer.text.trim() ||
  !Number.isSafeInteger(answer.inputTokens) ||
  !Number.isSafeInteger(answer.outputTokens) ||
  answer.inputTokens <= 0 ||
  answer.outputTokens <= 0
) throw new Error("Provider did not return a usable answer and measured token usage");
console.log(JSON.stringify({
  status: "provider response received",
  model: process.env.OPENAI_MODEL,
  inputTokens: answer.inputTokens,
  outputTokens: answer.outputTokens,
  estimatedCostMicros: measuredCostMicros(answer.inputTokens, answer.outputTokens),
}));
