import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { open, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { AIReply, AIResponder } from "../src/services/ai.js";
import { benchmarkCases, benchmarkVersion, type BenchmarkTurn } from "./benchmark-cases.js";

import { benchmarkLimits, benchmarkPreflight, createBenchmarkMeter } from "./benchmark-admission.js";

const live = process.argv.includes("--live");
const candidates = { normal: "gpt-6-luna", powerful: "gpt-6.1-sol", very_powerful: "gpt-6-astra" } as const;
const choices = Object.keys(candidates) as Array<keyof typeof candidates>;
// Capture only operator-provided inputs, before dotenv can load app settings.
const operator = { ...process.env };
if (live && (operator.CI || operator.GITHUB_ACTIONS || operator.NODE_ENV === "production")) {
  console.error("Live benchmark is unavailable in CI and production.");
  process.exit(2);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  TELEGRAM_SELF_SERVICE_ENABLED: "false",
  MONGODB_URL: "mongodb://127.0.0.1:1/benchmark-unused",
  SESSION_SECRET: "synthetic-benchmark-session-secret",
  OPENAI_API_KEY: "unused-benchmark-key", OPENAI_MODEL: "benchmark-unused",
  OPENAI_MAX_COMPLETION_TOKENS: String(benchmarkLimits.outputTokens), OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1",
  OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1", DEFAULT_DAILY_BUDGET_USD: "1",
  DEFAULT_MONTHLY_BUDGET_USD: "1", AI_MAX_REASONING_EFFORT: "medium",
  AI_ENABLED_MODELS: Object.values(candidates).join(","),
  AI_VERIFIED_MODELS: live ? operator.EVAL_VERIFIED_MODELS ?? "" : Object.values(candidates).join(","),
  LOG_LEVEL: "silent",
  DASHBOARD_ORIGIN: "http://localhost:5173", SMTP_HOST: "localhost", SMTP_FROM: "benchmark@example.test",
});

const { createOpenAIResponder } = await import("../src/services/ai.js");
const { maximumReservationMicros, measuredCostMicros, upperInputTokenBound } = await import("../src/services/budget.js");
const { resolveModel, pricingVersion } = await import("../src/services/model-config.js");
const options = live ? (() => {
  try { return benchmarkPreflight(operator, Object.values(candidates), pricingVersion); }
  catch { console.error("Live benchmark preflight denied."); process.exit(2); }
})() : undefined;
const configurations = choices.map((choice) => resolveModel({ mode: "product", choice }));
const { modelRegistry } = await import("../src/services/model-config.js");
for (const id of Object.values(candidates)) {
  const model = modelRegistry[id];
  assert.ok(model.endpoint === "responses" && model.functions && model.structuredOutputs && model.efforts.includes("medium"));
}
if (operator.EVAL_PREFLIGHT_ONLY === "1") {
  if (!options) throw new Error("Preflight requires explicit live opt-ins");
  console.log(JSON.stringify({ admitted: true, candidates, limits: benchmarkLimits, global: options.global,
    perModel: options.perModel, requestsPerModel: options.requests, entitlement: "operator-attested" }));
  process.exit(0);
}
const meter = options ? createBenchmarkMeter(options) : undefined;
const output = options ? await open(operator.EVAL_REPORT_PATH!, "wx", 0o600) : undefined;
const { localParts } = await import("../src/services/appointments.js");
const { processWidgetRequest } = await import("../src/services/widget-queue.js");
const { Organization, Assistant, Conversation, Listing, Message, WidgetRequest, AgentAction, Appointment, UsageEvent, StaffAvailability, Membership, User, BusinessKnowledge } =
  await import("../src/models/index.js");

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
let expected: BenchmarkTurn;
const humanReview = { naturalness: null, relevance: null, helpfulness: null, clarity: null,
  repetitiveness: null, groundedness: null, followUp: null, professionalTone: null, recommendationQuality: null };
const results: unknown[] = [];
const economics = new Map<string, { attempted: number; successful: number; spendMicros: number }>();
let failures = 0;
const baselineHistory = new Map<string, string>();
try {
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.init()));
  const privateOrg = await Organization.create({ name: "Synthetic hidden tenant", dailyBudgetMicros: 1, monthlyBudgetMicros: 1 });
  await Listing.create({ organizationId: privateOrg._id, title: "PRIVATE_SYNTHETIC_RECORD", location: "Görükle",
    description: "Hidden fixture", price: 100, currency: "TRY", listingType: "rent", propertyType: "apartment",
    rooms: 3, areaSqm: 90, availability: "available" });
  const hours = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 720, endMinute: 960 }));
  for (const choice of choices) {
    if (meter?.stopped) break;
    const model = candidates[choice];
    const selection = { mode: "product", choice };
    const configuration = configurations[choices.indexOf(choice)]!;
    const org = await Organization.create({ name: "Synthetic benchmark tenant", timeZone: "Europe/Istanbul",
      openingHours: hours, allowedModels: [model], dailyBudgetMicros: options?.perModel ?? 1_000_000, monthlyBudgetMicros: options?.perModel ?? 1_000_000 });
    const assistant = await Assistant.create({ organizationId: org._id, name: "Synthetic assistant",
      instructions: "Use verified records. Use interpret_business_preferences for an explicitly supplied place near which the customer wants to search.",
      publicKey: randomUUID(), conversationStrategy: "real_estate", modelSelection: selection });
    const staff = await User.create({ name: "Synthetic consultant", email: `${choice}@example.test`, passwordHash: "unused" });
    await Membership.create({ organizationId: org._id, userId: staff._id, role: "agent" });
    await StaffAvailability.create({ organizationId: org._id, staffId: staff._id, services: ["property viewing"], windows: hours });
    await BusinessKnowledge.create({ organizationId: org._id, profile: "Synthetic letting agency",
      contact: { email: "office@example.test" } });
    await Listing.create([27000, 34000].map((price) => ({ organizationId: org._id, title: `Synthetic flat ${price}`,
      location: "Görükle", description: "Amenities are unverified", price, currency: "TRY", listingType: "rent",
      propertyType: "apartment", rooms: 3, areaSqm: 90, availability: "available" } as const)));
    let calls = 0;
    let observed: unknown;
    let historyFingerprint: string | undefined;
    let latencyMs = 0;
    let reservationMicros = 0;
    const provider = options ? createOpenAIResponder({ model, apiKey: options.key, maxCompletionTokens: benchmarkLimits.outputTokens }).forModel!(configuration) : undefined;
    const responder: AIResponder = async (instructions, history) => {
      const start = performance.now();
      historyFingerprint = createHash("sha256").update(JSON.stringify(history)).digest("hex");
      const reserved = maximumReservationMicros(instructions, history, configuration);
      reservationMicros = reserved;
      const invoke = async (): Promise<AIReply> => {
        calls++;
        return provider ? provider(instructions, history) : {
          text: expected.proposal ? "" : "Please clarify your request.",
          action: expected.proposal, inputTokens: 12, outputTokens: 6,
        };
      };
      try {
        const reply = meter ? await meter.run(model, reserved, upperInputTokenBound(instructions, history), invoke,
          (result) => measuredCostMicros(result.inputTokens, result.outputTokens, result, configuration)) : await invoke();
        observed = reply.action ?? null;
        return reply;
      } finally {
        latencyMs = Math.round(performance.now() - start);
      }
    };
    for (const scenario of benchmarkCases) {
      if (meter?.stopped) break;
      const conversation = await Conversation.create({ organizationId: org._id, assistantId: assistant._id,
        visitorId: scenario.id });
      const turns: unknown[] = [];
      const requestIds: mongoose.Types.ObjectId[] = [];
      let scenarioPassed = true;
      for (const turn of scenario.turns) {
        if (meter?.stopped) break;
        expected = turn;
        observed = undefined;
        historyFingerprint = undefined;
        const previousCalls = calls;
        const started = performance.now();
        const queued = await WidgetRequest.create({ organizationId: org._id, assistantId: assistant._id,
          conversationId: conversation._id, visitorId: scenario.id, clientMessageId: randomUUID(),
          locale: scenario.locale, text: turn.text });
        requestIds.push(queued._id);
        await processWidgetRequest(queued._id, responder);
        const request = await WidgetRequest.findById(queued._id).lean();
        if (request?.errorCode === "budget_exhausted") meter?.halt("tenant_budget_limit");
        const state = await Conversation.findById(conversation._id).lean();
        const response = await Message.findById(request?.responseMessageId).lean();
        const action = await AgentAction.findOne({ _id: request?.actionId, organizationId: org._id }).lean();
        const usage = await UsageEvent.findOne({ requestId: queued._id }).lean();
        const text = response?.text ?? "";
        const preferences = Object.fromEntries(Object.entries(state?.workflow?.business?.values ?? {}).map(
          ([field, item]) => [field, (item as { value: unknown }).value]));
        const bookings = await Appointment.countDocuments({ organizationId: org._id });
        const checks = {
          modelCalls: calls - previousCalls === (turn.proposal || turn.expectsModel ? 1 : 0),
          afternoonOptions: !turn.offeredAfternoon || Boolean(state?.workflow?.offeredSlots?.length &&
            state.workflow.offeredSlots.every((slot) => {
              const local = localParts(new Date(slot.startAt!), "Europe/Istanbul");
              const today = localParts(request!.createdAt, "Europe/Istanbul").date;
              const daysAhead = (Date.parse(local.date) - Date.parse(today)) / 86_400_000;
              return daysAhead >= 2 && daysAhead <= 3 && local.minute >= 720 && local.minute < 960;
            })),
          completed: request?.status === "completed",
          preferences: Object.entries(turn.preferences ?? {}).every(([field, value]) => preferences[field] === value),
          removedPreferences: (turn.missingPreferences ?? []).every((field) => !(field in preferences)),
          refusal: !turn.refused || state?.workflow?.business?.refused.includes(turn.refused),
          executedTool: (action?.name ?? null) === (turn.tool ?? null),
          toolArguments: Object.entries(turn.args ?? {}).every(([field, value]) => (action?.arguments as Record<string, unknown> | undefined)?.[field] === value),
          proposedTool: !turn.proposal || (observed as { name?: string } | undefined)?.name === turn.proposal.name,
          tenantScopedResult: !JSON.stringify(action?.result ?? {}).includes("PRIVATE_SYNTHETIC_RECORD"),
          verifiedReply: (!turn.reply || turn.reply.test(text)) && !text.includes("PRIVATE_SYNTHETIC_RECORD"),
          followUp: !turn.noRepeat || !turn.noRepeat.test(text),
          transactionSafety: bookings === 0 && (await AgentAction.countDocuments({ conversationId: conversation._id,
            name: { $in: ["create_appointment", "cancel_appointment", "reschedule_appointment", "create_customer"] } })) === 0,
          handoff: turn.tool !== "handoff_to_human" || state?.status === "handoff",
          accounted: calls === previousCalls || (usage?.model === model && usage.inputTokens > 0),
        };
        if (Object.values(checks).some((pass) => !pass)) {
          failures++;
          scenarioPassed = false;
        }
        const historyKey = `${scenario.id}:${turns.length}`;
        if (choice === "normal" && historyFingerprint) baselineHistory.set(historyKey, historyFingerprint);
        const baseline = baselineHistory.get(historyKey);
        turns.push({ input: turn.text, providerHistoryDiffersFromLuna: baseline && historyFingerprint
          ? baseline !== historyFingerprint : null, expected: { preferences: turn.preferences, tool: turn.tool ?? null,
          arguments: turn.args, replyPattern: turn.reply?.source, refusal: turn.refused },
          actual: { preferences, tool: action?.name ?? null, arguments: action?.arguments, proposal: observed, reply: text,
            workflow: state?.workflow?.pendingQuestion, status: state?.status, bookings, failure: request?.errorCode },
          checks, latencyMs: Math.round(performance.now() - started), providerLatencyMs: calls > previousCalls ? latencyMs : null,
          worstCaseProviderCostMicros: calls > previousCalls ? reservationMicros : null,
          usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, estimatedCostMicros: usage.estimatedCostMicros, reasoningTokens: usage.reasoningTokens,
            cachedInputTokens: usage.cachedInputTokens, cacheWriteTokens: usage.cacheWriteTokens,
            usageBreakdownKnown: usage.usageBreakdownKnown, billingStatus: usage.billingStatus } : null,
          humanReview: { ...humanReview } });
      }
      const events = await UsageEvent.find({ organizationId: org._id, requestId: { $in: requestIds } }).lean();
      const totals = events.reduce((total, event) => ({ inputTokens: total.inputTokens + event.inputTokens,
        outputTokens: total.outputTokens + event.outputTokens, estimatedCostMicros: total.estimatedCostMicros + event.estimatedCostMicros }),
        { inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0 });
      const completed = turns.length === scenario.turns.length && scenarioPassed;
      const stats = economics.get(model) ?? { attempted: 0, successful: 0, spendMicros: 0 };
      stats.attempted++;
      stats.successful += Number(completed);
      stats.spendMicros += totals.estimatedCostMicros;
      economics.set(model, stats);
      results.push({ model, scenario: scenario.id, locale: scenario.locale, completed, turns, totals });
    }
  }
} catch (error) {
  if (!meter) throw error;
  meter.halt("fixture_or_runner_error");
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}
const comparison = Object.fromEntries([...economics].map(([model, metrics]) => [model, {
  ...metrics, estimatedMicrosPerSuccessfulConversation: metrics.successful ? metrics.spendMicros / metrics.successful : null,
}]));
const report = { comparison, version: benchmarkVersion, execution: live ? "live" : "simulated",
  settings: { effort: "medium", maxOutputTokens: 128, timeoutMs: 30_000, synthesis: false },
  pricingVersion, scenarioCount: benchmarkCases.length, failures, stopped: meter?.stopped, estimatedOrReservedMicros: meter?.total ?? null, results };
const json = JSON.stringify(report, null, 2) + "\n";
if (output) {
  try { await output.writeFile(json); } finally { await output.close(); }
} else if (operator.EVAL_REPORT_PATH) await writeFile(operator.EVAL_REPORT_PATH, json, { flag: "wx", mode: 0o600 });
if (live) console.log(JSON.stringify({ version: benchmarkVersion, failures, stopped: meter?.stopped, estimatedOrReservedMicros: meter?.total }));
else console.log(json);
if (failures || meter?.stopped) process.exitCode = 1;
assert.ok(results.length || meter?.stopped);
