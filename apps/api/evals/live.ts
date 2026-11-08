import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runEvaluation } from "./runner.js";
import { scenarios } from "./scenarios.js";

const flags = ["EVAL_LIVE", "EVAL_SPEND_APPROVED", "EVAL_DEDICATED_PROJECT_CONFIRMED", "EVAL_PRICES_VERIFIED"];
if (flags.some((name) => process.env[name] !== "1")) {
  console.error("Live evaluation requires dedicated-project, current-price and spending opt-ins; no request sent.");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") throw new Error("Live evaluation is local-only");
const key = process.env.OPENAI_API_KEY ?? "";
if (!key || key.startsWith("local-") || key.startsWith("replace-") || key.startsWith("unused-")) throw new Error("A dedicated non-placeholder key is required");
const model = process.env.EVAL_MODEL_ID ?? "";
if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model)) throw new Error("Set a valid EVAL_MODEL_ID; availability is not assumed");
const reasoningEffort = process.env.EVAL_REASONING_EFFORT ?? "none";
if (!["none", "low", "medium", "high", "xhigh", "max"].includes(reasoningEffort)) throw new Error("Invalid reasoning effort");
if (model === "gpt-6-luna" && reasoningEffort !== "none") throw new Error("This application's GPT-6 Luna tool mode requires reasoning effort none");
const maxCompletionTokens = Number(process.env.EVAL_MAX_COMPLETION_TOKENS ?? 128);
if (!Number.isSafeInteger(maxCompletionTokens) || maxCompletionTokens < 1 || maxCompletionTokens > 128) throw new Error("Output cap must be 1..128");
const ids = (process.env.EVAL_LIVE_SCENARIOS ?? "business-1,property-1,budget-1,knowledge_injection-1,invented_facts-1").split(",").map((item) => item.trim());
if (!ids.length || ids.length > 5 || new Set(ids).size !== ids.length || ids.some((id) => !scenarios.some((scenario) => scenario.id === id))) throw new Error("Select 1..5 distinct synthetic scenario IDs");
const selectedIds = scenarios.filter((scenario) => ids.includes(scenario.id)).map((scenario) => scenario.id);
const capUsd = Number(process.env.EVAL_MAX_SPEND_USD ?? "0");
if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 0.10) throw new Error("Set a positive EVAL_MAX_SPEND_USD no higher than 0.10");
const pricePath = process.env.EVAL_PRICE_FILE;
if (!pricePath) throw new Error("Set EVAL_PRICE_FILE to a reviewed local price configuration");
type Prices = { model: string; serviceTier: string; verifiedAt: string; source: string;
  inputUsdPerMillion: number; cachedInputUsdPerMillion: number; cacheWriteUsdPerMillion: number; outputUsdPerMillion: number };
const prices = JSON.parse(await readFile(pricePath, "utf8")) as Prices;
assert.equal(prices.model, model, "Price configuration model does not match");
assert.equal(prices.serviceTier, "default", "Only default service tier is evaluated");
if (!/^https:\/\//.test(prices.source)) throw new Error("Price source must be an HTTPS URL");
const verified = new Date(`${prices.verifiedAt}T00:00:00Z`).getTime();
if (!Number.isFinite(verified) || Date.now() - verified > 7 * 86400000 || verified > Date.now()) throw new Error("Prices must have been checked within seven days");
for (const field of ["inputUsdPerMillion", "cachedInputUsdPerMillion", "cacheWriteUsdPerMillion", "outputUsdPerMillion"] as const)
  if (!Number.isFinite(prices[field]) || prices[field] <= 0) throw new Error(`Invalid ${field}`);

// USD per million tokens equals microdollars per token. Round each category up
// as the application's accounting path does; this remains an estimate.
const estimatedCost = (input: number, output: number, cached = 0, written = 0, breakdown = false) =>
  (breakdown ? Math.ceil((input - cached - written) * prices.inputUsdPerMillion) +
    Math.ceil(cached * prices.cachedInputUsdPerMillion) + Math.ceil(written * prices.cacheWriteUsdPerMillion) :
    Math.ceil(input * Math.max(prices.inputUsdPerMillion, prices.cachedInputUsdPerMillion, prices.cacheWriteUsdPerMillion))) +
    Math.ceil(output * prices.outputUsdPerMillion);
const capMicros = Math.floor(capUsd * 1_000_000);
let estimatedSpentMicros = 0;
const timings: number[] = [];
let inputTokens = 0, outputTokens = 0, invalidToolCalls = 0, providerErrors = 0;
const { createOpenAIResponder } = await import("../src/services/ai.js");
const responder = createOpenAIResponder({ model, reasoningEffort, maxCompletionTokens, apiKey: key });
const wrapped = async (instructions: string, history: Parameters<typeof responder>[1]) => {
  const worstInputTokens = (Buffer.byteLength(instructions) + history.reduce((sum, turn) => sum + Buffer.byteLength(turn.text), 0)) * 4 + 4096;
  const worstCost = estimatedCost(worstInputTokens, maxCompletionTokens);
  if (estimatedSpentMicros + worstCost > capMicros) throw new Error("Local evaluation spend cap would be exceeded before request");
  const start = performance.now();
  try {
    const reply = await responder(instructions, history);
    timings.push(Math.round(performance.now() - start));
    inputTokens += reply.inputTokens; outputTokens += reply.outputTokens;
    estimatedSpentMicros += estimatedCost(reply.inputTokens, reply.outputTokens,
      reply.cachedInputTokens ?? 0, reply.cacheWriteTokens ?? 0, reply.usageBreakdownKnown);
    return reply;
  } catch (error) {
    providerErrors++;
    if (error instanceof SyntaxError || (error instanceof Error && /AI action|Multiple AI actions/.test(error.message))) invalidToolCalls++;
    throw error;
  }
};
const summary = await runEvaluation({ responder: wrapped, modelOnly: true, ids: selectedIds });
console.log(JSON.stringify({ model, serviceTier: "default", scenarioIds: selectedIds.slice(0, summary.total),
  toolSelectionAccuracy: `${summary.model.toolSelection}/${summary.total}`,
  modelTaskCompletionProxy: `${summary.model.passed}/${summary.total}`, endToEndTaskCompletion: "NOT TESTED", invalidToolCalls,
  factualityFailures: summary.total - summary.model.factuality,
  providerErrors, latencyMs: timings, inputTokens, outputTokens, estimatedCostMicros: estimatedSpentMicros,
  priceVerifiedAt: prices.verifiedAt, backendResults: "NOT TESTED in direct model mode" }, null, 2));
if (summary.model.passed !== summary.total) process.exitCode = 1;
