import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { AIReply, AIResponder } from "../src/services/ai.js";
import { benchmarkCases, benchmarkVersion, type BenchmarkTurn } from "./benchmark-cases.js";

const live = process.argv.includes("--live");
const candidates = { normal: "gpt-6-luna", powerful: "gpt-6.1-sol", very_powerful: "gpt-6-astra" } as const;
const choices = Object.keys(candidates) as Array<keyof typeof candidates>;
const key = process.env.EVAL_PROJECT_API_KEY ?? "";
const cap = Number(process.env.EVAL_MAX_SPEND_MICROS);
const maxCalls = Number(process.env.EVAL_MAX_REQUESTS_PER_MODEL);
const flags = ["EVAL_LIVE", "EVAL_SPEND_APPROVED", "EVAL_DEDICATED_PROJECT_CONFIRMED", "EVAL_SYNTHETIC_TENANT_CONFIRMED"];
const verified = (process.env.EVAL_VERIFIED_MODELS ?? "").split(",").map((id) => id.trim());
if (live && (process.env.CI || process.env.NODE_ENV === "production" ||
    flags.some((flag) => process.env[flag] !== "1") || !/^sk-proj-[A-Za-z0-9_-]{20,}$/.test(key) ||
    !Number.isSafeInteger(cap) || cap <= 0 || cap > 1_000_000 ||
    !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 18 ||
    Object.values(candidates).some((id) => !verified.includes(id)))) {
  console.error("Live benchmark denied by operator, project, entitlement or budget gates.");
  process.exit(2);
}

Object.assign(process.env, {
  MONGODB_URL: "mongodb://127.0.0.1:1/benchmark-unused",
  SESSION_SECRET: "synthetic-benchmark-session-secret",
  OPENAI_API_KEY: "unused-benchmark-key", OPENAI_MODEL: "benchmark-unused",
  OPENAI_MAX_COMPLETION_TOKENS: "128", OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1",
  OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1", DEFAULT_DAILY_BUDGET_USD: "1",
  DEFAULT_MONTHLY_BUDGET_USD: "1", AI_MAX_REASONING_EFFORT: "medium",
  AI_ENABLED_MODELS: Object.values(candidates).join(","),
  AI_VERIFIED_MODELS: (live ? verified : Object.values(candidates)).join(","),
  LOG_LEVEL: "silent",
  DASHBOARD_ORIGIN: "http://localhost:5173", SMTP_HOST: "localhost", SMTP_FROM: "benchmark@example.test",
});

const { createOpenAIResponder } = await import("../src/services/ai.js");
const { maximumReservationMicros, measuredCostMicros } = await import("../src/services/budget.js");
const { resolveModel, pricingVersion } = await import("../src/services/model-config.js");
if (live) {
  if (!process.env.EVAL_REPORT_PATH) throw new Error("Set a private EVAL_REPORT_PATH for the live report");
  const checked = Date.parse(process.env.EVAL_PRICE_CHECKED_AT ?? "");
  if (process.env.EVAL_PRICE_VERSION !== pricingVersion || !Number.isFinite(checked) ||
      checked > Date.now() || Date.now() - checked > 7 * 86_400_000) {
    console.error("Live benchmark requires a recent review of the active registry prices.");
    process.exit(2);
  }
}
const { localParts } = await import("../src/services/appointments.js");
const { processWidgetRequest } = await import("../src/services/widget-queue.js");
const { Organization, Assistant, Conversation, Listing, Message, WidgetRequest, AgentAction, Appointment, UsageEvent, StaffAvailability, Membership, User } =
  await import("../src/models/index.js");

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
let totalMicros = 0;
let stopped: string | undefined;
let expected: BenchmarkTurn;
const humanReview = { naturalness: null, relevance: null, helpfulness: null, clarity: null,
  repetitiveness: null, groundedness: null, followUp: null };
const results: unknown[] = [];
let failures = 0;
try {
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.init()));
  const privateOrg = await Organization.create({ name: "Synthetic hidden tenant", dailyBudgetMicros: 1, monthlyBudgetMicros: 1 });
  await Listing.create({ organizationId: privateOrg._id, title: "PRIVATE_SYNTHETIC_RECORD", location: "Görükle",
    description: "Hidden fixture", price: 100, currency: "TRY", listingType: "rent", propertyType: "apartment",
    rooms: 3, areaSqm: 90, availability: "available" });
  const hours = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 720, endMinute: 960 }));
  for (const choice of choices) {
    if (stopped) break;
    const model = candidates[choice];
    const selection = { mode: "product", choice };
    const configuration = resolveModel(selection);
    const org = await Organization.create({ name: "Synthetic benchmark tenant", timeZone: "Europe/Istanbul",
      openingHours: hours, allowedModels: [model], dailyBudgetMicros: live ? cap : 1_000_000, monthlyBudgetMicros: live ? cap : 1_000_000 });
    const assistant = await Assistant.create({ organizationId: org._id, name: "Synthetic assistant",
      instructions: "Use verified records. Use interpret_business_preferences for an explicitly supplied place near which the customer wants to search.",
      publicKey: randomUUID(), conversationStrategy: "real_estate", modelSelection: selection });
    const staff = await User.create({ name: "Synthetic consultant", email: `${choice}@example.test`, passwordHash: "unused" });
    await Membership.create({ organizationId: org._id, userId: staff._id, role: "agent" });
    await StaffAvailability.create({ organizationId: org._id, staffId: staff._id, services: ["property viewing"], windows: hours });
    await Listing.create([27000, 34000].map((price) => ({ organizationId: org._id, title: `Synthetic flat ${price}`,
      location: "Görükle", description: "Amenities are unverified", price, currency: "TRY", listingType: "rent",
      propertyType: "apartment", rooms: 3, areaSqm: 90, availability: "available" } as const)));
    let calls = 0;
    let observed: unknown;
    let latencyMs = 0;
    let reservationMicros = 0;
    const provider = live ? createOpenAIResponder({ model, apiKey: key, maxCompletionTokens: 128 }).forModel!(configuration) : undefined;
    const responder: AIResponder = async (instructions, history) => {
      const start = performance.now();
      const reserved = maximumReservationMicros(instructions, history, configuration);
      reservationMicros = reserved;
      if (live) {
        if (stopped || calls >= maxCalls || totalMicros + reserved > cap) {
          stopped ??= calls >= maxCalls ? "request_limit" : "spend_limit";
          throw new Error("Benchmark admission denied");
        }
        totalMicros += reserved;
      }
      calls++;
      try {
        const reply: AIReply = provider ? await provider(instructions, history) : {
          text: expected.proposal ? "" : "Please clarify your request.",
          action: expected.proposal, inputTokens: 12, outputTokens: 6,
        };
        if (live) {
          const cost = measuredCostMicros(reply.inputTokens, reply.outputTokens, reply, configuration);
          if (cost > reserved) {
            totalMicros += cost - reserved;
            stopped = "usage_exceeded_reservation";
            throw new Error("Benchmark usage exceeded reservation");
          }
          totalMicros += cost - reserved;
        }
        observed = reply.action ?? null;
        return reply;
      } catch (error) {
        if (live) stopped ??= "provider_error";
        throw error;
      } finally {
        latencyMs = Math.round(performance.now() - start);
      }
    };
    for (const scenario of benchmarkCases) {
      if (stopped) break;
      const conversation = await Conversation.create({ organizationId: org._id, assistantId: assistant._id,
        visitorId: scenario.id });
      const turns: unknown[] = [];
      const requestIds: mongoose.Types.ObjectId[] = [];
      for (const turn of scenario.turns) {
        if (stopped) break;
        expected = turn;
        observed = undefined;
        const previousCalls = calls;
        const started = performance.now();
        const queued = await WidgetRequest.create({ organizationId: org._id, assistantId: assistant._id,
          conversationId: conversation._id, visitorId: scenario.id, clientMessageId: randomUUID(),
          locale: scenario.locale, text: turn.text });
        requestIds.push(queued._id);
        await processWidgetRequest(queued._id, responder);
        const request = await WidgetRequest.findById(queued._id).lean();
        if (live && request?.errorCode === "budget_exhausted") stopped ??= "tenant_budget_limit";
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
        if (Object.values(checks).some((pass) => !pass)) failures++;
        turns.push({ input: turn.text, expected: { preferences: turn.preferences, tool: turn.tool ?? null,
          arguments: turn.args, replyPattern: turn.reply?.source, refusal: turn.refused },
          actual: { preferences, tool: action?.name ?? null, arguments: action?.arguments, proposal: observed, reply: text,
            workflow: state?.workflow?.pendingQuestion, status: state?.status, bookings, failure: request?.errorCode },
          checks, latencyMs: Math.round(performance.now() - started), providerLatencyMs: calls > previousCalls ? latencyMs : null,
          worstCaseProviderCostMicros: calls > previousCalls ? reservationMicros : null,
          usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, estimatedCostMicros: usage.estimatedCostMicros } : null,
          humanReview: { ...humanReview } });
      }
      const events = await UsageEvent.find({ organizationId: org._id, requestId: { $in: requestIds } }).lean();
      results.push({ model, scenario: scenario.id, locale: scenario.locale, turns,
        totals: events.reduce((total, event) => ({ inputTokens: total.inputTokens + event.inputTokens,
          outputTokens: total.outputTokens + event.outputTokens, estimatedCostMicros: total.estimatedCostMicros + event.estimatedCostMicros }),
          { inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0 }) });
    }
  }
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}
const report = { version: benchmarkVersion, execution: live ? "live" : "simulated",
  settings: { effort: "medium", maxOutputTokens: 128, timeoutMs: 30_000, synthesis: false },
  pricingVersion, scenarioCount: benchmarkCases.length, failures, stopped, estimatedOrReservedMicros: live ? totalMicros : null, results };
const json = JSON.stringify(report, null, 2) + "\n";
if (process.env.EVAL_REPORT_PATH) await writeFile(process.env.EVAL_REPORT_PATH, json, { flag: "wx", mode: 0o600 });
if (live) console.log(JSON.stringify({ version: benchmarkVersion, failures, stopped, estimatedOrReservedMicros: totalMicros }));
else console.log(json);
if (failures || stopped) process.exitCode = 1;
assert.ok(results.length || stopped);
