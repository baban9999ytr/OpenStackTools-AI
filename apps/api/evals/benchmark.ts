import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { open, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { AIReply, AIResponder } from "../src/services/ai.js";
import { benchmarkCases, benchmarkVersion, lunaSmokeCases, type BenchmarkTurn } from "./benchmark-cases.js";

import { assertSmokeEnvelope, privateReportDestination, redactSyntheticReport, selectOutputProfile, smokeSafety } from "./benchmark-smoke.js";
import { benchmarkLimits, benchmarkPreflight, createBenchmarkMeter } from "./benchmark-admission.js";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--live" && !arg.startsWith("--suite=")))
  throw new Error("Unknown benchmark argument");
const live = args.includes("--live");
const candidates = { normal: "gpt-6-luna", powerful: "gpt-6.1-sol", very_powerful: "gpt-6-astra" } as const;
const suite = args.find((arg) => arg.startsWith("--suite="))?.slice(8) ?? "comparison";
if (suite !== "comparison" && suite !== "luna-smoke") throw new Error("Unknown evaluation suite");
const smoke = suite === "luna-smoke";
const cases = smoke ? lunaSmokeCases : benchmarkCases;
const choices: Array<keyof typeof candidates> = smoke ? ["normal"] : ["normal", "powerful", "very_powerful"];
const modelIds = choices.map((choice) => candidates[choice]);
// Capture only operator-provided inputs, before dotenv can load app settings.
const operator = { ...process.env };
const profile = selectOutputProfile(operator.EVAL_OUTPUT_PROFILE ?? (smoke ? "standard" : "minimal"),
  operator.EVAL_REASONING_EFFORT ?? (smoke ? "none" : "medium"));
const preflightOnly = operator.EVAL_PREFLIGHT_ONLY === "1";
if (live && (operator.CI || operator.GITHUB_ACTIONS || operator.NODE_ENV === "production")) {
  console.error("Live benchmark is unavailable in CI and production.");
  process.exit(2);
}

// The harness owns its configuration. Do not load app dotenv files or inherit
// provider project IDs, custom headers, debug logging, or admin credentials.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("OPENAI_")) delete process.env[key];
}
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "/dev/null",
  NODE_ENV: "test",
  TELEGRAM_SELF_SERVICE_ENABLED: "false",
  MONGODB_URL: "mongodb://127.0.0.1:1/benchmark-unused",
  SESSION_SECRET: "synthetic-benchmark-session-secret",
  OPENAI_API_KEY: "unused-benchmark-key", OPENAI_MODEL: "benchmark-unused",
  OPENAI_MAX_COMPLETION_TOKENS: String(benchmarkLimits.outputTokens), OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1",
  OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1", DEFAULT_DAILY_BUDGET_USD: "1",
  DEFAULT_MONTHLY_BUDGET_USD: "1", AI_MAX_REASONING_EFFORT: "medium",
  AI_ENABLED_MODELS: modelIds.join(","),
  AI_VERIFIED_MODELS: live ? operator.EVAL_VERIFIED_MODELS ?? "" : modelIds.join(","),
  LOG_LEVEL: "silent",
  DASHBOARD_ORIGIN: "http://localhost:5173", SMTP_HOST: "localhost", SMTP_FROM: "benchmark@example.test",
});

const { createOpenAIResponder, IncompleteModelResponse, providerFailurePolicy } = await import("../src/services/ai.js");
const { maximumReservationMicros, measuredCostMicros, upperInputTokenBound, reservationForTokenBounds } = await import("../src/services/budget.js");
const { resolveModel, pricingVersion } = await import("../src/services/model-config.js");
const options = live ? (() => {
  try { return benchmarkPreflight(operator, modelIds, pricingVersion); }
  catch { console.error("Live benchmark preflight denied."); process.exit(2); }
})() : undefined;
const { modelRegistry, effectiveMaxEffort } = await import("../src/services/model-config.js");
const efforts = ["none", "low", "medium", "high", "xhigh", "max"] as const;
const effort = profile.effort as typeof efforts[number];
const configurations = choices.map((choice) => {
  const base = resolveModel({ mode: "product", choice });
  const model = modelRegistry[candidates[choice]];
  if (model.endpoint !== "responses" || !model.functions || !model.structuredOutputs ||
      !model.efforts.includes(effort) || efforts.indexOf(effort) > efforts.indexOf(effectiveMaxEffort()) ||
      !Object.values(base.prices).every((price) => Number.isSafeInteger(price) && price > 0))
    throw new Error("Unsupported evaluation capability, reasoning setting or pricing");
  return { ...base, reasoningEffort: effort };
});
const settings = { inputTokens: benchmarkLimits.inputTokens, timeoutMs: benchmarkLimits.timeoutMs, ...profile, synthesis: false };
const plannedCalls = cases.flatMap(({ turns }) => turns).filter((turn) => turn.proposal || turn.expectsModel).length;
const lunaReservation = reservationForTokenBounds(benchmarkLimits.inputTokens, profile.maxOutputTokens, configurations[0]);
if (preflightOnly && !options) throw new Error("Preflight requires explicit live opt-ins");
if (preflightOnly && !smoke) {
  console.log(JSON.stringify({ admitted: true, candidates: modelIds, limits: settings, global: options?.global,
    perModel: options?.perModel, requestsPerModel: options?.requests, entitlement: "operator-attested" }));
  process.exit(0);
}
if (smoke && options) {
  if (operator.EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED !== "1")
    throw new Error("Review and set the dedicated project's spending control where supported");
  assertSmokeEnvelope(lunaReservation, plannedCalls, options);
  await privateReportDestination(operator.EVAL_REPORT_PATH!);
}
const paid = options && !preflightOnly;
const meter = paid ? createBenchmarkMeter(options) : undefined;
const output = paid ? await open(operator.EVAL_REPORT_PATH!, "wx", 0o600) : undefined;
const transcriptFile = paid && smoke ? await open(operator.EVAL_REPORT_PATH!.replace(/\.json$/, ".md"), "wx", 0o600) : undefined;
const { localParts } = await import("../src/services/appointments.js");
const { processWidgetRequest } = await import("../src/services/widget-queue.js");
const { Organization, Assistant, Conversation, Listing, Message, WidgetRequest, AgentAction, Appointment, UsageEvent, StaffAvailability, Membership, User, BusinessKnowledge } =
  await import("../src/models/index.js");

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
let expected: BenchmarkTurn;
const humanReview = { naturalness: null, relevance: null, helpfulness: null, clarity: null,
  repetitiveness: null, groundedness: null, followUp: null, contextUnderstanding: null, professionalTone: null, recommendationQuality: null };
const results: unknown[] = [];
const transcript = ["# Luna smoke-test transcript", "", "Human scores and comments are blank until reviewed."];
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
      contact: { email: "office@example.test", website: "https://agency.example.test" } });
    await Listing.create([27000, 34000].map((price) => ({ organizationId: org._id, title: `Synthetic flat ${price}`,
      location: "Görükle", description: "Amenities are unverified", price, currency: "TRY", listingType: "rent",
      propertyType: "apartment", rooms: 3, areaSqm: 90, availability: "available" } as const)));
    let calls = 0;
    let observed: unknown;
    let providerText: string | undefined;
    let providerFailure: unknown;
    let expectedSettledMicros: number | undefined;
    let activeRequestId: mongoose.Types.ObjectId | undefined;
    let reservationMatched = true;
    let boundAccepted = true;
    let historyFingerprint: string | undefined;
    let latencyMs = 0;
    let reservationMicros = 0;
    const provider = paid ? createOpenAIResponder({ model, apiKey: options.key, maxCompletionTokens: profile.maxOutputTokens }).forModel!(configuration) : undefined;
    const responder: AIResponder = async (instructions, history) => {
      const start = performance.now();
      historyFingerprint = createHash("sha256").update(JSON.stringify(history)).digest("hex");
      const reserved = maximumReservationMicros(instructions, history, configuration, profile.maxOutputTokens);
      reservationMicros = reserved;
      if (smoke) {
        const queued = await WidgetRequest.findOne({ _id: activeRequestId, organizationId: org._id }).lean();
        reservationMatched = queued?.reservedMicros === reserved && queued.aiModel === model;
        boundAccepted = upperInputTokenBound(instructions, history) <= benchmarkLimits.inputTokens;
        if (!reservationMatched || !boundAccepted || calls >= (options?.requests ?? 5)) {
          meter?.halt("smoke_admission_denied");
          throw new Error("Smoke admission denied");
        }
      }
      const invoke = async (): Promise<AIReply> => {
        calls++;
        const reply = provider ? await provider(instructions, history) : {
          text: expected.fixtureText ?? (expected.proposal ? "" : "Please clarify your request."), model,
          action: expected.proposal, inputTokens: 12, outputTokens: 6,
        };
        if (smoke && (reply.inputTokens > upperInputTokenBound(instructions, history) ||
            reply.outputTokens > profile.maxOutputTokens)) {
          providerFailure = { reason: "usage_outside_token_envelope" };
          throw new Error("Provider usage outside configured envelope");
        }
        return reply;
      };
      try {
        const reply = meter ? await meter.run(model, reserved, upperInputTokenBound(instructions, history), invoke,
          (result) => measuredCostMicros(result.inputTokens, result.outputTokens, result, configuration)) : await invoke();
        expectedSettledMicros = measuredCostMicros(reply.inputTokens, reply.outputTokens, reply, configuration);
        providerText = reply.text;
        observed = reply.action ?? null;
        return reply;
      } catch (error) {
        providerFailure ??= error instanceof IncompleteModelResponse
          ? { reason: error.reason, reportedUsage: error.reportedUsage }
          : { reason: providerFailurePolicy(error).code };
        throw error;
      } finally {
        latencyMs = Math.round(performance.now() - start);
      }
    };
    for (const scenario of cases) {
      if (meter?.stopped) break;
      const conversation = await Conversation.create({ organizationId: org._id, assistantId: assistant._id,
        visitorId: scenario.id });
      const turns: unknown[] = [];
      const requestIds: mongoose.Types.ObjectId[] = [];
      let scenarioPassed = true;
      let priorListings: Array<{ title: string; price: number; _id: unknown }> = [];
      for (const turn of scenario.turns) {
        if (meter?.stopped) break;
        expected = turn;
        observed = undefined;
        providerText = undefined;
        providerFailure = undefined;
        expectedSettledMicros = undefined;
        reservationMatched = boundAccepted = true;
        historyFingerprint = undefined;
        const previousCalls = calls;
        const started = performance.now();
        const queued = await WidgetRequest.create({ organizationId: org._id, assistantId: assistant._id,
          conversationId: conversation._id, visitorId: scenario.id, clientMessageId: randomUUID(),
          locale: scenario.locale, text: turn.text });
        requestIds.push(queued._id);
        activeRequestId = queued._id;
        await processWidgetRequest(queued._id, responder, {
          maxOutputTokens: profile.maxOutputTokens, retryProviderFailures: false,
        });
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
        let scopedListingResults = true;
        if (action?.name === "search_listings") {
          priorListings = ((action.result as { listings?: typeof priorListings })?.listings ?? [])
            .map(({ title, price, _id }) => ({ title, price, _id }));
          if (smoke) scopedListingResults = await Listing.countDocuments({
            organizationId: org._id, _id: { $in: priorListings.map(({ _id }) => _id) },
          }) === priorListings.length;
        }
        const referenced = turn.referenceOrdinal ? priorListings[turn.referenceOrdinal - 1] : undefined;
        const slotTimes = (state?.workflow?.offeredSlots ?? []).map((slot) => {
          const { minute } = localParts(new Date(slot.startAt!), "Europe/Istanbul");
          return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
        });
        const checks = {
          ...(smoke ? { ...smokeSafety(text, turn.unknownFee ? [] : priorListings.map(({ price }) => price), slotTimes),
            scopedAction: (!request?.actionId || Boolean(action)) && scopedListingResults,
            listingReference: !turn.referenceOrdinal || Boolean(referenced && (turn.offeredAfternoon
              ? String(state?.workflow?.selectedListingId) === String(referenced._id) : text.includes(referenced.title))),
            authorizedModel: calls === previousCalls || request?.aiModel === "gpt-6-luna",
            admitted: reservationMatched && boundAccepted,
            settledUsage: expectedSettledMicros === undefined || usage?.estimatedCostMicros === expectedSettledMicros &&
              usage.billingStatus === "measured" && request?.reservedMicros === 0,
            noMaskedProviderFailure: !providerFailure || request?.status === "failed" && !text } : {}),
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
        const issues = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
        if (issues.length) {
          failures++;
          scenarioPassed = false;
          if (smoke && paid) meter?.halt("smoke_assertion_failed");
        }
        const historyKey = `${scenario.id}:${turns.length}`;
        if (choice === "normal" && historyFingerprint) baselineHistory.set(historyKey, historyFingerprint);
        const baseline = baselineHistory.get(historyKey);
        if (smoke) {
          const block = (value: string) => value.split("\n").map((line) => `    ${line}`).join("\n");
          transcript.push("", `## ${scenario.id}, turn ${turns.length + 1}`, "",
            "Customer", "", block(turn.text), "", "Delivered reply", "", block(text || "(no reply)"), "",
            `Expected tool ${turn.tool ?? "no executed tool"}. Expected response pattern ${turn.reply?.source ?? "none"}.`,
            `Executed tool ${action?.name ?? "none"}. Booking count ${bookings}.`,
            `Potential issue ${issues.join(", ") || "none flagged by automated checks"}.`, "",
            "Natural Turkish __ / 5 · Relevance __ / 5 · Context __ / 5 · Helpfulness __ / 5 · Groundedness __ / 5 · Follow-up __ / 5",
            "", "Reviewer comments ________________________________________");
        }
        turns.push({ input: turn.text, authorizedModel: model, providerText, providerFailure,
          issues, verifiedFacts: smoke ? { listings: priorListings.map(({ title, price }) => ({ title, price })), slotTimes,
            ...(action?.name === "get_business_knowledge" ? { knowledge: action.result } : {}) } : undefined, providerHistoryDiffersFromLuna: baseline && historyFingerprint
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
const report = { comparison, version: benchmarkVersion, execution: paid ? "live" : preflightOnly ? "provider-free-preflight" : "simulated",
  settings, suite, plannedCalls, worstCasePerCallMicros: smoke ? lunaReservation : undefined,
  pricingVersion, scenarioCount: cases.length, failures, stopped: meter?.stopped, estimatedOrReservedMicros: meter?.total ?? null, results };
const json = JSON.stringify(redactSyntheticReport(report, options?.key), null, 2) + "\n";
const markdown = redactSyntheticReport(transcript.join("\n") + "\n", options?.key);
if (output) {
  try { await output.writeFile(json); } finally { await output.close(); }
}
if (transcriptFile) {
  try { await transcriptFile.writeFile(markdown); } finally { await transcriptFile.close(); }
}
if (!output && !preflightOnly && operator.EVAL_REPORT_PATH) await writeFile(operator.EVAL_REPORT_PATH, json, { flag: "wx", mode: 0o600 });
if (preflightOnly) console.log(JSON.stringify({ admitted: failures === 0, providerRequests: 0, suite, settings,
  syntheticTurns: cases.flatMap(({ turns }) => turns).length, plannedCalls, worstCasePerCallMicros: lunaReservation,
  worstCaseRunMicros: lunaReservation * options!.requests, entitlement: "operator-attested" }));
else if (paid) console.log(JSON.stringify({ version: benchmarkVersion, failures, stopped: meter?.stopped, estimatedOrReservedMicros: meter?.total }));
else {
  if (smoke && operator.EVAL_REPORT_PATH) {
    const path = operator.EVAL_REPORT_PATH.replace(/\.json$/, ".md");
    if (path !== operator.EVAL_REPORT_PATH) await writeFile(path, markdown, { flag: "wx", mode: 0o600 });
  }
  console.log(json);
}
if (failures || meter?.stopped) process.exitCode = 1;
assert.ok(results.length || meter?.stopped);
