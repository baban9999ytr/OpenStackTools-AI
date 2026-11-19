import { createHash } from "node:crypto";
import { open, rename, writeFile } from "node:fs/promises";
import { benchmarkPreflight, createBenchmarkMeter } from "./benchmark-admission.js";
import { privateReportDestination, redactSyntheticReport } from "./benchmark-smoke.js";
import { unseen } from "./receptionist-intent-cases.js";
import { scoreIntentAdvice } from "./receptionist-intent-scoring.js";
import { intentClarification, intentPlanSchema, parseIntentAdvice, receptionistIntentFormat,
  receptionistIntentInstructions } from "../src/services/receptionist-intent.js";
import { receptionistDecisionSnapshot } from "../src/services/receptionist-decision.js";
import type { AIReply, Turn } from "../src/services/ai.js";

const model = "gpt-6-luna";
const suite = "luna-structured-intent";
const calls = 6;
const inputLimit = 16_000;
const outputLimit = 512;
const callCap = 4_259;
const runCap = 25_554;
const applicationCap = 30_000;
const operator = { ...process.env };
const preflight = operator.EVAL_PREFLIGHT_ONLY === "1";

if (process.argv.slice(2).join(" ") !== `--live --suite=${suite}` ||
    (!preflight && operator.EVAL_STRUCTURED_INTENT_EXECUTE_APPROVED !== "1") ||
    operator.EVAL_VERIFIED_MODELS?.trim() !== model ||
    operator.EVAL_PROVIDER_QUOTA_CONFIRMED !== "1" ||
    operator.EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED !== "1" ||
    !operator.EVAL_PRICE_CHECKED_AT?.endsWith("Z") ||
    operator.EVAL_OUTPUT_PROFILE !== "standard" || operator.EVAL_REASONING_EFFORT !== "none")
  throw new Error("Structured intent gate denied");

for (const key of Object.keys(process.env))
  if (key.startsWith("OPENAI_")) delete process.env[key];
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "/dev/null", NODE_ENV: "test",
  OPENAI_API_KEY: "unused-intent-benchmark-key", OPENAI_MODEL: "unused-intent-benchmark",
  MONGODB_URL: "mongodb://127.0.0.1:1/intent-unused", SESSION_SECRET: "synthetic-intent-benchmark-session-secret",
  DASHBOARD_ORIGIN: "http://localhost:5173", SMTP_HOST: "localhost", SMTP_FROM: "intent@example.test",
  DEFAULT_DAILY_BUDGET_USD: "1", DEFAULT_MONTHLY_BUDGET_USD: "1",
  OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1", OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1",
  AI_ENABLED_MODELS: model, AI_VERIFIED_MODELS: model, AI_MAX_REASONING_EFFORT: "none",
  AI_EXPERIMENTAL_RECEPTIONIST_INTENTS: "false", LOG_LEVEL: "silent",
});

const { resolveModel, pricingVersion } = await import("../src/services/model-config.js");
const { upperInputTokenBound, reservationForTokenBounds, measuredCostMicros } = await import("../src/services/budget.js");
const limits = benchmarkPreflight(operator, [model], pricingVersion);
if (limits.requests !== calls || limits.global !== applicationCap || limits.perModel !== applicationCap)
  throw new Error("Structured intent approval envelope differs from the fixed limits");
const configuration = resolveModel({ mode: "custom", profile: "economical", model,
  reasoningEffort: "none", processingTier: "default" });
const worst = reservationForTokenBounds(inputLimit, outputLimit, configuration);
if (worst !== callCap || worst * calls !== runCap || runCap > Math.min(limits.global, limits.perModel))
  throw new Error("Structured intent pricing reservation differs from the approved envelope");

const corpus = unseen.slice(0, calls).map((sample, i) => {
  const display = i === 0 || i === 2 ? [
    { price: 27000, currency: "TRY" },
    { price: 34000, currency: "TRY", facts: { maintenanceFee: 0 } },
  ] : [];
  const focusPosition = i === 0 ? 2 : null;
  const state = { realEstate: true, preferences: undefined, display, focusPosition,
    pendingViewing: i >= 4 ? "preferred_time" : null };
  const instructions = receptionistIntentInstructions + "\n" + receptionistDecisionSnapshot(state, "intent");
  const history: Turn[] = sample.history.map((text, j) => ({
    role: i === 3 || (i === 0 && j === 0) ? "customer" : "assistant", text,
  }));
  history.push({ role: "customer", text: sample.latest });
  const expected = { intents: sample.plan.map((entry) => ({ ...entry })) };
  if (!parseIntentAdvice(JSON.stringify(expected), sample.latest, display.length, focusPosition !== null))
    throw new Error("Fixture labels failed current-turn validation");
  const inputBound = upperInputTokenBound(instructions + JSON.stringify(receptionistIntentFormat), history);
  const reservation = reservationForTokenBounds(inputBound, outputLimit, configuration);
  return { id: i + 1, history, instructions, inputBound, reservation, expected,
    displayedCount: display.length, hasFocus: focusPosition !== null };
});
const corpusSha256 = createHash("sha256").update(JSON.stringify(corpus)).digest("hex");
if (corpus.length !== calls || corpus.some(({ inputBound, reservation }) => inputBound > inputLimit || reservation > callCap) ||
    corpus.reduce((sum, item) => sum + item.reservation, 0) > runCap)
  throw new Error("Structured intent fixture exceeds the approved call, token or spend limits");

const reportPath = operator.EVAL_REPORT_PATH!;
await privateReportDestination(reportPath);
const summary = { suite, model, pricingVersion, corpusSha256, plannedCalls: calls, maxInputTokens: inputLimit,
  maxOutputTokens: outputLimit, reasoning: "none", timeoutMs: 30_000, retries: 0, synthesis: false,
  perCallWorstMicros: worst, totalWorstMicros: runCap, globalCapMicros: limits.global, perModelCapMicros: limits.perModel,
  fixtureInputBounds: corpus.map(({ inputBound }) => inputBound),
  fixtureReservationMicros: corpus.reduce((sum, item) => sum + item.reservation, 0) };
if (preflight) {
  console.log(JSON.stringify({ ...summary, admitted: true, providerRequests: 0 }));
} else {
  const { createOpenAIResponder, providerFailureDiagnostics } = await import("../src/services/ai.js");
  const interpret = createOpenAIResponder({ model, apiKey: limits.key, maxCompletionTokens: outputLimit }).forModel!(configuration).interpretIntent;
  if (!interpret) throw new Error("Structured intent adapter is unavailable");
  const meter = createBenchmarkMeter(limits);
  const results: Record<string, unknown>[] = [];
  let attempted = 0;
  let completed = 0;
  let inFlight: { id: number; reservedMicros: number } | null = null;
  const mdPath = reportPath.replace(/\.json$/, ".md");
  await (await open(reportPath, "wx", 0o600)).close();
  await (await open(mdPath, "wx", 0o600)).close();
  const persist = async () => {
    const evidence = redactSyntheticReport({ ...summary, execution: "live", attempted, completed,
      stopped: meter.stopped ?? null, estimatedOrReservedMicros: meter.total, inFlight, results }, limits.key);
    const temporary = reportPath + ".tmp";
    await writeFile(temporary, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, reportPath);
    await writeFile(mdPath, [
      "# Luna structured intent private transcript",
      "",
      "Advisory-only. Independent human review fields are blank.",
      "",
      ...evidence.results.flatMap((result) => [`## Prompt ${result.id}`, "", "~~~json", JSON.stringify(result, null, 2), "~~~",
        "", "Independent review: ____________________", ""]),
    ].join("\n"), { mode: 0o600 });
  };
  await persist();
  for (const sample of corpus) {
    const currentTurn = sample.history.at(-1)!.text;
    const base = { id: sample.id, history: sample.history, instructions: sample.instructions, expected: sample.expected,
      inputTokenBound: sample.inputBound, reservedBeforeCallMicros: sample.reservation, authorizedActions: [],
      applicationCorrection: null, customerVisibleReply: null, humanReview: null };
    let rawReply: AIReply | undefined;
    let failure: unknown;
    const started = performance.now();
    inFlight = { id: sample.id, reservedMicros: sample.reservation };
    await persist();
    try {
      const response = await meter.run(model, sample.reservation, sample.inputBound, async () => {
        attempted++;
        rawReply = await interpret(sample.instructions, sample.history);
        if (rawReply.action) {
          meter.halt("unexpected_provider_tool");
          throw new Error("Unexpected provider tool");
        }
        if (rawReply.inputTokens > sample.inputBound || rawReply.outputTokens > outputLimit ||
            rawReply.reasoningTokens !== 0 || rawReply.model !== model || rawReply.actualTier !== "default") {
          meter.halt("usage_or_configuration_violation");
          throw new Error("Usage or provider configuration violation");
        }
        return rawReply;
      }, (reply) => measuredCostMicros(reply.inputTokens, reply.outputTokens, reply, configuration));
      completed++;
      let rawPlan: unknown;
      try { rawPlan = JSON.parse(response.text); } catch {}
      const validSchema = intentPlanSchema.safeParse(rawPlan).success;
      const advice = parseIntentAdvice(response.text, currentTurn, sample.displayedCount, sample.hasFocus);
      results.push({ ...base, rawResponse: response.text, schemaValid: validSchema, serverAccepted: advice !== null,
        score: scoreIntentAdvice(sample.expected, advice), clarificationPreview: intentClarification(advice, currentTurn, "tr"),
        providerLatencyMs: Math.round(performance.now() - started), usage: response,
        settledMicros: measuredCostMicros(response.inputTokens, response.outputTokens, response, configuration) });
      if (!validSchema) meter.halt("unexpected_invalid_structured_output");
    } catch (error) {
      failure = providerFailureDiagnostics(error);
      results.push({ ...base, providerFailure: failure, providerLatencyMs: Math.round(performance.now() - started),
        usage: rawReply ?? null, rawResponse: rawReply?.text ?? null });
    }
    inFlight = null;
    await persist();
    if (meter.stopped || failure) break;
  }
  console.log(JSON.stringify({ ...summary, attempted, completed, stopped: meter.stopped ?? null,
    estimatedOrReservedMicros: meter.total, reportSaved: true }));
  if (completed !== calls || meter.stopped) process.exitCode = 1;
}
