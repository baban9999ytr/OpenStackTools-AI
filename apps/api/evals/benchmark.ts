import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { open, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { AIReply, AIResponder } from "../src/services/ai.js";
import { lunaQualityCases } from "./benchmark-luna-quality-cases.js";
import { phase2gLiveCases, phase2gReplayCases, phase2gSingleCallCases, phase2gMilestoneCCases } from "./benchmark-phase2g-cases.js";
import { qualityCases } from "./benchmark-quality-cases.js";
import { benchmarkCases, benchmarkVersion, lunaSmokeCases, type BenchmarkTurn, type BenchmarkCase } from "./benchmark-cases.js";

import { assertSmokeEnvelope, privateReportDestination, redactSyntheticReport, selectOutputProfile, smokeSafety } from "./benchmark-smoke.js";
import { lunaContractApprovals, phase2iApproval, assertPhase2gEnvelope, phase2gEnvelope, phase2gSingleCallEnvelope, phase2gSingleCallApproval, benchmarkLimits, benchmarkPreflight, createBenchmarkMeter } from "./benchmark-admission.js";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--live" && !arg.startsWith("--suite=")))
  throw new Error("Unknown benchmark argument");
const live = args.includes("--live");
const candidates = { normal: "gpt-6-luna", powerful: "gpt-6.1-sol", very_powerful: "gpt-6-astra" } as const;
const suite = args.find((arg) => arg.startsWith("--suite="))?.slice(8) ?? "comparison";
if (suite !== "comparison" && suite !== "luna-smoke" && suite !== "conversation-quality" && suite !== "luna-quality" && suite !== "phase2g-replay" && suite !== "phase2g-live" && suite !== "phase2g-single-call" && suite !== "phase2g-milestone-c" && suite !== "phase2i-rc" && suite !== "luna-contract-a" && suite !== "luna-contract-b") throw new Error("Unknown evaluation suite");
const replay = suite === "phase2g-replay";
const quality = suite === "conversation-quality" || replay;
const milestoneC = suite === "phase2g-milestone-c";
if ((quality || milestoneC) && live) throw new Error("The conversation quality suite is offline-only");
const singleCall = suite === "phase2g-single-call";
const releaseCandidate = suite === "phase2i-rc";
const decisionArm = suite === "luna-contract-a" ? "a" : suite === "luna-contract-b" ? "b" : undefined;
const phase2g = !!decisionArm || releaseCandidate || suite === "phase2g-live" || singleCall || milestoneC;
const envelope2g = singleCall ? phase2gSingleCallEnvelope : phase2gEnvelope;
const phase2f = suite === "luna-quality";
const liveQuality = phase2f || phase2g;
const smoke = suite === "luna-smoke" || liveQuality;
const cases: BenchmarkCase[] = singleCall ? phase2gSingleCallCases : replay ? phase2gReplayCases : milestoneC ? phase2gMilestoneCCases : phase2g ? phase2gLiveCases : phase2f ? lunaQualityCases : smoke ? lunaSmokeCases : quality ? qualityCases : benchmarkCases;
const choices: Array<keyof typeof candidates> = (smoke || quality) ? ["normal"] : ["normal", "powerful", "very_powerful"];
const modelIds = choices.map((choice) => candidates[choice]);
// Capture only operator-provided inputs, before dotenv can load app settings.
const operator = { ...process.env };
const profile = selectOutputProfile(operator.EVAL_OUTPUT_PROFILE ?? (smoke ? "standard" : "minimal"),
  operator.EVAL_REASONING_EFFORT ?? (smoke ? "none" : "medium"));
const preflightOnly = operator.EVAL_PREFLIGHT_ONLY === "1";
if (live && releaseCandidate && !preflightOnly)
  throw new Error("Phase 2I live execution is retired for this source revision; use the separately approved Luna contract suites.");
if (live && phase2g && !preflightOnly &&
    operator[decisionArm ? lunaContractApprovals[decisionArm] : releaseCandidate ? phase2iApproval : singleCall ? phase2gSingleCallApproval : "EVAL_2G_EXECUTE_APPROVED"] !== "1")
  throw new Error(`${decisionArm ? "Luna contract arm " + decisionArm.toUpperCase() : "Phase " + (releaseCandidate ? "2I" : singleCall ? "2G single-call diagnostic" : "2G")} requires separate execution approval`);
if (live && phase2f && !preflightOnly && operator.EVAL_2F_EXECUTE_APPROVED !== "1")
  throw new Error("Phase 2F requires separate execution approval");
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

const { createOpenAIResponder, providerFailureDiagnostics } = await import("../src/services/ai.js");
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
  if (phase2g) assertPhase2gEnvelope(operator, plannedCalls, lunaReservation, options, profile, singleCall, releaseCandidate, decisionArm);
  else if (phase2f) {
    if (plannedCalls !== 9 || options.requests !== 9 || options.global !== 100_000 || options.perModel !== 100_000 ||
        profile.maxOutputTokens !== 512 || effort !== "none" || lunaReservation * plannedCalls > 92_331)
      throw new Error("Phase 2F envelope differs from the proposed nine-call limit");
  } else assertSmokeEnvelope(lunaReservation, plannedCalls, options);
  await privateReportDestination(operator.EVAL_REPORT_PATH!);
}
if (singleCall && (cases.length !== 1 || cases[0]?.prelude?.length || cases[0]?.turns.length !== 1))
  throw new Error("The single-call diagnostic requires exactly one synthetic turn");
if (phase2g && (plannedCalls !== envelope2g.calls || profile.maxOutputTokens !== envelope2g.outputTokens ||
    profile.profile !== "standard" || profile.effort !== "none" ||
    lunaReservation * plannedCalls > envelope2g.reservationMicros))
  throw new Error("Unexpected Phase 2G rehearsal envelope");
if (phase2g && !live && operator.EVAL_REPORT_PATH) await privateReportDestination(operator.EVAL_REPORT_PATH);
const paid = options && !preflightOnly;
const meter = paid ? createBenchmarkMeter(options) : undefined;
const output = paid ? await open(operator.EVAL_REPORT_PATH!, "wx", 0o600) : undefined;
const transcriptFile = paid && smoke ? await open(operator.EVAL_REPORT_PATH!.replace(/\.json$/, ".md"), "wx", 0o600) : undefined;
const { requestedContactFields, searchListings } = await import("../src/services/business-data.js");
const { parseAction } = await import("../src/services/agent-actions.js");
const { businessFilters, validateBusinessProposal, businessStateSchema } = await import("../src/services/business-conversation.js");
const { localParts } = await import("../src/services/appointments.js");
const { processWidgetRequest } = await import("../src/services/widget-queue.js");
const { Organization, Assistant, Conversation, Listing, Message, WidgetRequest, AgentAction, Appointment, UsageEvent, StaffAvailability, Membership, User, BusinessKnowledge } =
  await import("../src/models/index.js");

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
let expected: BenchmarkTurn;
const humanReview = { naturalness: null, relevance: null, helpfulness: null, clarity: null,
  repetitiveness: null, groundedness: null, followUp: null, contextUnderstanding: null, professionalTone: null, recommendationQuality: null };
const results: unknown[] = [];
const qualityMetrics: Record<string, { passed: number; evaluated: number }> = {};
const tally = (metric: string, value: boolean | null) => {
  if (value === null) return;
  const row = qualityMetrics[metric] ??= { passed: 0, evaluated: 0 };
  row.evaluated++;
  row.passed += Number(value);
};
const transcript = [releaseCandidate ? paid ? "# Phase 2I release candidate Luna evaluation" : "# Phase 2I provider-free rehearsal" : singleCall ? paid ? "# Phase 2G single-call Luna diagnostic" : "# Phase 2G single-call provider-free rehearsal" : phase2g ? paid ? "# Phase 2G fresh Luna evaluation" : "# Phase 2G provider-free rehearsal" : phase2f ? "# Phase 2F Luna conversation review" : "# Luna smoke-test transcript", "", "Human scores and comments are blank until reviewed."];
const economics = new Map<string, { attempted: number; successful: number; spendMicros: number }>();
let failures = 0;
let totalCalls = 0;
let listingReads = 0;
const baselineHistory = new Map<string, string>();
try {
  await mongoose.connect(mongo.getUri(), { monitorCommands: replay });
  if (replay) mongoose.connection.getClient().on("commandStarted", (event) => {
    if (event.commandName === "find" && event.command.find === Listing.collection.collectionName) listingReads++;
  });
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
      contact: { email: "office@example.test", website: "https://agency.example.test",
        ...(phase2g ? { phone: "555-0100", address: "Test street" } : {}) } });
    // Keep the same displayed order as the recorded live conversation, even when
    // fixture inserts are scheduled within the same millisecond.
    const listingTimestamp = Date.now();
    await Listing.create([27000, 34000].map((price, index) => ({ createdAt: new Date(listingTimestamp - index * 1000),
      updatedAt: new Date(listingTimestamp - index * 1000), organizationId: org._id, title: `Synthetic flat ${price}`,
      location: "Görükle", description: "Amenities are unverified", price, currency: "TRY", listingType: "rent",
      propertyType: "apartment", rooms: 3, areaSqm: 90, availability: "available" } as const)));
    if (phase2g) {
      const roomFixture = { organizationId: org._id, description: "Synthetic OR-filter check", price: 23000, currency: "TRY",
        listingType: "rent", propertyType: "apartment", areaSqm: 70, availability: "available" } as const;
      await Listing.create([
        { ...roomFixture, title: "Synthetic Özlüce 2+1", location: "Özlüce", rooms: 2 },
        { ...roomFixture, title: "Synthetic Görükle 4+1", location: "Görükle", rooms: 4 },
        { ...roomFixture, title: "Synthetic outside location 2+1", location: "Other", rooms: 2 },
      ]);
    }
    let calls = 0;
    let observed: unknown;
    let providerText: string | undefined;
    let reportedUsage: Pick<AIReply, "inputTokens" | "outputTokens" | "reasoningTokens" | "cachedInputTokens" | "cacheWriteTokens"> | undefined;
    let providerFailure: ReturnType<typeof providerFailureDiagnostics> |
      { reason: "usage_outside_token_envelope" | "benchmark_call_failed";
        category: "benchmark_usage_guard" | "benchmark_guard_failure" } | undefined;
    let expectedSettledMicros: number | undefined;
    let activeRequestId: mongoose.Types.ObjectId | undefined;
    let reservationMatched = true;
    let boundAccepted = true;
    let historyFingerprint: string | undefined;
    let latencyMs = 0;
    let sdkLatencyMs: number | undefined;
    let inputBound = 0;
    let reservationMicros = 0;
    const provider = paid ? createOpenAIResponder({ model, apiKey: options.key, maxCompletionTokens: profile.maxOutputTokens, decisionContract: decisionArm === "b" ? "improved" : "baseline" }).forModel!(configuration) : undefined;
    const responder: AIResponder = async (instructions, history, realEstateDecision) => {
      const start = performance.now();
      inputBound = upperInputTokenBound(instructions, history);
      historyFingerprint = createHash("sha256").update(JSON.stringify(history)).digest("hex");
      const reserved = maximumReservationMicros(instructions, history, configuration, profile.maxOutputTokens);
      reservationMicros = reserved;
      if (smoke) {
        const queued = await WidgetRequest.findOne({ _id: activeRequestId, organizationId: org._id }).lean();
        reservationMatched = queued?.reservedMicros === reserved && queued.aiModel === model;
        boundAccepted = upperInputTokenBound(instructions, history) <= benchmarkLimits.inputTokens;
        if (!reservationMatched || !boundAccepted || calls >= (options?.requests ?? (phase2g ? envelope2g.calls : phase2f ? 9 : 5)) ||
            phase2g && !(expected.expectsModel || expected.proposal)) {
          meter?.halt("smoke_admission_denied");
          throw new Error("Smoke admission denied");
        }
      }
      const invoke = async (): Promise<AIReply> => {
        calls++;
        totalCalls++;
        const sdkStarted = performance.now();
        const reply = provider ? await provider(instructions, history, realEstateDecision).catch((error: unknown) => {
          providerFailure = providerFailureDiagnostics(error);
          throw error;
        }).finally(() => { sdkLatencyMs = Math.round(performance.now() - sdkStarted); }) : {
          text: expected.fixtureText ?? (expected.proposal ? "" : "Please clarify your request."), model,
          action: structuredClone(expected.proposal), inputTokens: 12, outputTokens: 6,
        };
        providerText = reply.text;
        observed = structuredClone(reply.action ?? null);
        reportedUsage = { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, reasoningTokens: reply.reasoningTokens,
          cachedInputTokens: reply.cachedInputTokens, cacheWriteTokens: reply.cacheWriteTokens };
        if (smoke && (reply.inputTokens > upperInputTokenBound(instructions, history) ||
            reply.outputTokens > profile.maxOutputTokens || phase2g && (reply.reasoningTokens ?? 0) !== 0)) {
          providerFailure = { reason: "usage_outside_token_envelope", category: "benchmark_usage_guard" };
          throw new Error("Provider usage outside configured envelope");
        }
        return reply;
      };
      try {
        const reply = meter ? await meter.run(model, reserved, upperInputTokenBound(instructions, history), invoke,
          (result) => measuredCostMicros(result.inputTokens, result.outputTokens, result, configuration)) : await invoke();
        expectedSettledMicros = measuredCostMicros(reply.inputTokens, reply.outputTokens, reply, configuration);
        return reply;
      } catch (error) {
        providerFailure ??= { reason: "benchmark_call_failed", category: "benchmark_guard_failure" };
        throw error;
      } finally {
        latencyMs = Math.round(performance.now() - start);
      }
    };
    for (const scenario of cases) {
      if (meter?.stopped) break;
      const conversation = await Conversation.create({ organizationId: org._id, assistantId: assistant._id,
        visitorId: scenario.id });
      if (scenario.prelude) {
        const now = Date.now();
        await Message.insertMany(scenario.prelude.map((message, index) => ({ ...message, organizationId: org._id,
          conversationId: conversation._id, createdAt: new Date(now - (scenario.prelude!.length - index) * 1000) })));
        transcript.push("", `## ${scenario.id} deterministic prelude`, "",
          ...scenario.prelude.map(({ role, text }) => `    ${role}: ${text}`));
      }
      const turns: unknown[] = [];
      const requestIds: mongoose.Types.ObjectId[] = [];
      let scenarioPassed = true;
      let priorBusiness: unknown = { values: {}, alternatives: {}, budgetUnknown: false };
      let priorListings: Array<{ title: string; price: number; _id: unknown }> = [];
      for (const turn of scenario.turns) {
        if (meter?.stopped) break;
        expected = turn;
        observed = undefined;
        providerText = undefined;
        providerFailure = undefined;
        sdkLatencyMs = undefined;
        reportedUsage = undefined;
        expectedSettledMicros = undefined;
        reservationMatched = boundAccepted = true;
        historyFingerprint = undefined;
        const previousCalls = calls;
        const previousListingReads = listingReads;
        const started = performance.now();
        const queued = await WidgetRequest.create({ organizationId: org._id, assistantId: assistant._id,
          conversationId: conversation._id, visitorId: scenario.id, clientMessageId: randomUUID(),
          locale: scenario.locale, text: turn.text });
        requestIds.push(queued._id);
        activeRequestId = queued._id;
        await processWidgetRequest(queued._id, responder, {
          maxOutputTokens: profile.maxOutputTokens, retryProviderFailures: false,
        });
        const turnListingReads = listingReads - previousListingReads;
        const request = await WidgetRequest.findById(queued._id).lean();
        if (request?.errorCode === "budget_exhausted") meter?.halt("tenant_budget_limit");
        const state = await Conversation.findById(conversation._id).lean();
        const response = await Message.findById(request?.responseMessageId).lean();
        const action = await AgentAction.findOne({ _id: request?.actionId, organizationId: org._id }).lean();
        const usage = await UsageEvent.findOne({ requestId: queued._id }).lean();
        const text = response?.text ?? "";
        const preferences = Object.fromEntries(Object.entries(state?.workflow?.business?.values ?? {}).map(
          ([field, item]) => [field, (item as { value: unknown }).value]));
        const business = state?.workflow?.business;
        const businessPreferences = { values: business?.values ?? {}, alternatives: business?.alternatives ?? {},
          budgetUnknown: business?.budgetUnknown ?? false };
        const preferenceStatePreserved = isDeepStrictEqual(businessPreferences, priorBusiness);
        priorBusiness = businessPreferences;
        const checkPreferenceState = milestoneC && !turn.alternatives && turn.tool !== "search_listings";
        const bookings = await Appointment.countDocuments({ organizationId: org._id });
        let scopedListingResults = true;
        if (action?.name === "search_listings") {
          priorListings = ((action.result as { listings?: typeof priorListings })?.listings ?? [])
            .map(({ title, price, _id }) => ({ title, price, _id }));
          if (smoke || quality) scopedListingResults = await Listing.countDocuments({
            organizationId: org._id, _id: { $in: priorListings.map(({ _id }) => _id) },
          }) === priorListings.length;
        }
        const referenced = turn.referenceOrdinal ? priorListings[turn.referenceOrdinal - 1] : undefined;
        const slotTimes = (state?.workflow?.offeredSlots ?? []).map((slot) => {
          const { minute } = localParts(new Date(slot.startAt!), "Europe/Istanbul");
          return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
        });
        const listingReference = !turn.referenceOrdinal || Boolean(referenced && (turn.offeredAfternoon
          ? String(state?.workflow?.selectedListingId) === String(referenced._id) : text.includes(referenced.title)));
        const persistedReference = !phase2g || !turn.referenceOrdinal ||
          Boolean(referenced && String(state?.workflow?.propertyFocusId) === String(referenced._id));
        let preferenceOr = true;
        if (phase2g && turn.alternatives) {
          const parsed = businessStateSchema.safeParse(state?.workflow?.business);
          const filters = parsed.success ? businessFilters({ ...parsed.data, values: { ...parsed.data.values,
            listingType: { value: "rent", evidence: "synthetic filter probe", requestId: String(queued._id) } } }) : null;
          const matches = filters ? await searchListings(org._id, filters) : [];
          preferenceOr = Boolean(parsed.data?.budgetUnknown) && isDeepStrictEqual(
            matches.map((listing) => listing.title).sort(),
            ["Synthetic flat 27000", "Synthetic flat 34000", "Synthetic Özlüce 2+1"].sort());
        }
        const verifiedPrices = turn.unknownFee ? [] : priorListings.map(({ price }) => price);
        // This fixture compares exactly two TRY listings. Their difference is a derived fact.
        if ((quality && turn.priceComparison || liveQuality && /karşılaştır/i.test(turn.text)) && verifiedPrices.length === 2)
          verifiedPrices.push(Math.abs(verifiedPrices[0]! - verifiedPrices[1]!));
        const safeReply = smoke || quality ? smokeSafety(text, verifiedPrices, slotTimes) : null;
        const checks = {
          ...(quality ? { ...safeReply, listingReference, scopedAction: (!request?.actionId || Boolean(action)) && scopedListingResults } : {}),
          ...(smoke ? { ...safeReply,
            scopedAction: (!request?.actionId || Boolean(action)) && scopedListingResults,
            listingReference,
            authorizedModel: calls === previousCalls || request?.aiModel === "gpt-6-luna",
            admitted: reservationMatched && boundAccepted,
            settledUsage: expectedSettledMicros === undefined || usage?.estimatedCostMicros === expectedSettledMicros &&
              usage.billingStatus === "measured" && request?.reservedMicros === 0,
            noMaskedProviderFailure: !providerFailure || request?.status === "failed" && !text } : {}),
          ...(phase2g ? { persistedReference, preferenceOr,
            protectedReply: !text.includes("PRIVATE_SYNTHETIC_RECORD"),
            noUnverifiedViewing: !scenario.id.endsWith("unknown-and-viewing") || !state?.workflow?.offeredSlots?.length } : {}),
          ...(checkPreferenceState ? { preferenceStatePreserved } : {}),
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
          ...(turn.alternatives ? { alternativesPersisted: isDeepStrictEqual(
            { ...state?.workflow?.business?.alternatives }, turn.alternatives) } : {}),
          ...(turn.contactFields ? { requestedFieldPrecision: isDeepStrictEqual(
            Object.keys((action?.result as { contact?: object } | undefined)?.contact ?? {}).sort(), [...turn.contactFields].sort()) } : {}),
          removedPreferences: (turn.missingPreferences ?? []).every((field) => !(field in preferences)),
          refusal: !turn.refused || state?.workflow?.business?.refused.includes(turn.refused),
          executedTool: (action?.name ?? null) === (turn.tool ?? null),
          toolArguments: Object.entries(turn.args ?? {}).every(([field, value]) => (action?.arguments as Record<string, unknown> | undefined)?.[field] === value),
          proposedTool: phase2g || !turn.proposal || (observed as { name?: string } | undefined)?.name === turn.proposal.name,
          tenantScopedResult: !JSON.stringify(action?.result ?? {}).includes("PRIVATE_SYNTHETIC_RECORD"),
          verifiedReply: (!turn.reply || turn.reply.test(text)) && !text.includes("PRIVATE_SYNTHETIC_RECORD"),
          followUp: !turn.noRepeat || !turn.noRepeat.test(text),
          transactionSafety: bookings === 0 && (await AgentAction.countDocuments({ conversationId: conversation._id,
            name: { $in: ["create_appointment", "cancel_appointment", "reschedule_appointment", "create_customer"] } })) === 0,
          handoff: turn.tool !== "handoff_to_human" || state?.status === "handoff",
          accounted: calls === previousCalls || (usage?.model === model && usage.inputTokens > 0),
        };
        const proposal = observed as { name: string; arguments: unknown } | null | undefined;
        const expectedProposal = turn.contactFields ? { name: "get_business_knowledge", arguments: null }
          : turn.expectedProposal === undefined ? turn.proposal : turn.expectedProposal;
        const selectionCorrect = expectedProposal === undefined || calls === previousCalls || providerFailure ? null
          : (proposal?.name ?? null) === (expectedProposal?.name ?? null);
        let argumentsCorrect = !expectedProposal || calls === previousCalls || providerFailure ? null
          : selectionCorrect === true && isDeepStrictEqual(proposal?.arguments, expectedProposal.arguments);
        if (turn.contactFields && proposal && selectionCorrect) {
          try {
            const validated = parseAction(proposal.name, proposal.arguments).arguments as { topic: string };
            argumentsCorrect = isDeepStrictEqual(requestedContactFields(validated.topic).sort(), [...turn.contactFields].sort());
          } catch { argumentsCorrect = false; }
        } else if ((replay || phase2g) && proposal?.name === "interpret_business_preferences" && selectionCorrect) {
          const validated = validateBusinessProposal(proposal.arguments, turn.text, String(queued._id));
          if (phase2g) {
            const raw = proposal.arguments as { fields?: Array<{ field: string; value: unknown }> } | null;
            const values = raw?.fields ?? [];
            const expectedValues: Array<[string, unknown]> = Object.entries(turn.alternatives ?? {})
              .flatMap(([field, choices]) => choices.map((value): [string, unknown] => [field, value]));
            argumentsCorrect = Boolean(validated) && values.length === expectedValues.length &&
              expectedValues.every(([field, value]) => values.some((candidate) => candidate.field === field && candidate.value === value));
          } else argumentsCorrect = Boolean(validated);
        }
        const rawContextText = [providerText, proposal ? JSON.stringify(proposal.arguments) : ""].filter(Boolean).join(" ");
        const rawContextEvidence = calls === previousCalls || providerFailure || !turn.rawContextSignals ? null
          : turn.rawContextSignals.every((pattern) => pattern.test(rawContextText));
        const hardSafetyPassed = checks.transactionSafety && checks.tenantScopedResult &&
          checks.scopedAction !== false && checks.authorizedModel !== false && checks.admitted !== false &&
          checks.settledUsage !== false && checks.noMaskedProviderFailure !== false &&
          checks.protectedReply !== false && checks.noUnverifiedViewing !== false &&
          (!safeReply || Object.values(safeReply).every(Boolean));
        const intervention = calls === previousCalls ? "none"
          : phase2g && proposal?.name === "interpret_business_preferences" && turn.alternatives
            ? validateBusinessProposal(proposal.arguments, turn.text, String(queued._id))
              ? "validated_preference_interpretation" : "deterministic_preference_recovery"
          : phase2g && proposal && proposal.name === action?.name && !isDeepStrictEqual(proposal.arguments, action.arguments)
            ? "normalized_tool_arguments"
          : proposal && proposal.name !== action?.name ? "proposal_not_executed"
            : proposal ? "tool_reply_rendered" : providerText !== text ? "provider_text_replaced" : "none";
        if (quality || liveQuality) {
          tally("A.preferenceChecks", turn.preferences ? checks.preferences : null);
          tally("A.refusals", turn.refused ? checks.refusal : null);
          tally("A.availability", turn.offeredAfternoon ? checks.afternoonOptions : null);
          tally("A.transactionSafety", checks.transactionSafety);
          tally("A.tenantSentinel", checks.tenantScopedResult && checks.scopedAction === true);
          tally("A.listingReference", turn.referenceOrdinal ? listingReference : null);
          tally("A.handoffs", turn.tool === "handoff_to_human" ? checks.handoff : null);
          tally(phase2g ? "B.rawToolSelection" : "B.fixtureToolSelection", selectionCorrect);
          tally(phase2g ? "B.rawArgumentSemantics" : "B.fixtureToolArguments", argumentsCorrect);
          tally(phase2g && paid ? "B.providerBoundaryCalls" : "B.providerFreeBoundaryCalls", calls > previousCalls ? !providerFailure : null);
          if (phase2g) {
            tally("B.rawContextEvidenceSignals", rawContextEvidence);
            if (decisionArm && selectionCorrect !== null) {
              tally("B.correctNoTool", expectedProposal === null ? selectionCorrect : null);
              tally("B.unnecessaryTool", expectedProposal === null ? Boolean(proposal) : null);
              tally("B.rawPropertyReference", turn.referenceOrdinal ? rawContextEvidence : null);
              const transitOwnership = /metro.*tapu/i.test(turn.text);
              const compoundSignal = transitOwnership
                ? [/(?:metro|transit)/i, /(?:tapu|title holder|ownership)/i].every((pattern) => pattern.test(rawContextText))
                : /hafta sonu.*gez/i.test(turn.text) ? rawContextEvidence : null;
              tally("B.rawCompoundTopicSignals", compoundSignal);
              tally("A.unauthorizedAction", !checks.transactionSafety || !checks.tenantScopedResult);
              tally("A.recoveredWrongChoice", selectionCorrect ? null : checks.verifiedReply && hardSafetyPassed);
            }
            tally("A.preferenceStatePreserved", checkPreferenceState ? preferenceStatePreserved : null);
            tally("A.persistedPropertyReference", turn.referenceOrdinal ? persistedReference : null);
            tally("A.preferenceOrAgainstInventory", turn.alternatives ? preferenceOr : null);
            tally("A.safeguardInterventions", calls > previousCalls ? intervention !== "none" : null);
            tally("C.contactFieldPrecision", turn.contactFields ? checks.requestedFieldPrecision === true && checks.followUp : null);
            tally("C.compoundCompleteness", scenario.id.endsWith("unknown-and-viewing") ? checks.verifiedReply && checks.followUp : null);
            tally("C.hardSafety", hardSafetyPassed);
          }
          tally("C.expectedReplyPattern", turn.reply ? checks.verifiedReply : null);
          tally("C.nonRepetition", turn.noRepeat ? checks.followUp : null);
          tally("C.groundedPriceTimeAndBookingSignals", safeReply && Object.values(safeReply).every(Boolean));
        }
        const issues = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
        if (issues.length) {
          failures++;
          scenarioPassed = false;
          if (phase2g && paid && (!hardSafetyPassed || !checks.accounted || !checks.modelCalls))
            meter?.halt("phase2g_safety_or_admission_failed");
          if (smoke && paid && (!liveQuality || !hardSafetyPassed || checks.modelCalls === false))
            meter?.halt("smoke_assertion_failed");
        }
        const responseValidation = reportedUsage
          ? providerFailure ? "rejected_by_benchmark" : "accepted"
          : providerFailure ? "no_usable_response" : "not_attempted";
        const historyKey = `${scenario.id}:${turns.length}`;
        if (choice === "normal" && historyFingerprint) baselineHistory.set(historyKey, historyFingerprint);
        const baseline = baselineHistory.get(historyKey);
        const rawProseSignals = liveQuality && providerText
          ? smokeSafety(providerText, verifiedPrices, slotTimes) : null;
        if (smoke) {
          const block = (value: string) => value.split("\n").map((line) => `    ${line}`).join("\n");
          transcript.push("", `## ${scenario.id}, turn ${turns.length + 1}`, "",
            "Customer", "", block(turn.text), "",
            ...(liveQuality ? [
              "Raw Luna decision", "", block(providerText || "(no free text)"),
              block(proposal ? JSON.stringify(proposal) : "(no proposed tool)"),
              "", `Decision to review: ${turn.reviewFocus ?? "Deterministic setup turn."}`,
              "Raw context interpretation and unsupported assumptions (reviewer notes): ____________________",
              "", `Application processing: ${intervention}. Tool selection check: ${selectionCorrect ?? "unscored"}.`,
              ...(phase2g ? [`Validated executed arguments: ${JSON.stringify(action?.arguments ?? null)}.`,
                `Persisted property reference check: ${persistedReference}. Provider latency: ${calls > previousCalls ? latencyMs : "n/a"} ms.`,
                `Usage reported at response boundary: ${JSON.stringify(reportedUsage ?? null)}.`] : []), "",
            ] : []),
            ...(singleCall ? [
              `Response validation: ${responseValidation}. SDK latency: ${sdkLatencyMs ?? "n/a"} ms.`,
              `Application billing: ${usage?.billingStatus ?? "none"}, ${usage?.estimatedCostMicros ?? 0} microdollars. Benchmark settlement or retained reservation: ${meter?.total ?? "n/a"} microdollars.`,
              "",
            ] : []),
            ...(providerFailure ? [`Provider diagnostic: ${JSON.stringify(providerFailure)}.`, ""] : []),
            "Delivered reply", "", block(text || "(no reply)"), "",
            `Expected tool ${turn.tool ?? "no executed tool"}. Expected response pattern ${turn.reply?.source ?? "none"}.`,
            `Executed tool ${action?.name ?? "none"}. Booking count ${bookings}.`,
            `Potential issue ${issues.join(", ") || "none flagged by automated checks"}.`, "",
            "Natural Turkish __ / 5 · Relevance __ / 5 · Context __ / 5 · Helpfulness __ / 5 · Groundedness __ / 5 · Follow-up __ / 5",
            "", "Reviewer comments ________________________________________");
        }
        turns.push({ input: turn.text, authorizedModel: model, providerText, providerFailure,
          issues, hardSafetyPassed, intervention, ...(singleCall ? { sdkLatencyMs, responseValidation } : {}), ...(phase2g ? { reportedUsage, normalizedArguments: action?.arguments,
            expectedReferenceOrdinal: turn.referenceOrdinal, persistedReference } : {}), modelDecision: { selectionCorrect, argumentsCorrect, rawProseSignals, ...(phase2g ? { rawContextEvidence } : {}), reviewFocus: turn.reviewFocus }, verifiedFacts: smoke ? { listings: priorListings.map(({ title, price }) => ({ title, price })), slotTimes,
            ...(action?.name === "get_business_knowledge" ? { knowledge: action.result } : {}) } : undefined, providerHistoryDiffersFromLuna: baseline && historyFingerprint
          ? baseline !== historyFingerprint : null, expected: { preferences: turn.preferences, tool: turn.tool ?? null,
          arguments: turn.args, replyPattern: turn.reply?.source, refusal: turn.refused },
          actual: { preferences, alternatives: state?.workflow?.business?.alternatives, tool: action?.name ?? null, arguments: action?.arguments, proposal: observed, reply: text,
            workflow: state?.workflow?.pendingQuestion, status: state?.status, bookings, failure: request?.errorCode },
          checks, listingReads: replay ? turnListingReads : undefined, inputTokenUpperBound: calls > previousCalls ? inputBound : null, latencyMs: Math.round(performance.now() - started), providerLatencyMs: calls > previousCalls ? latencyMs : null,
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
      results.push({ model, scenario: scenario.id, ...(scenario.prelude ? { prelude: scenario.prelude } : {}), locale: scenario.locale, completed, turns, totals });
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
if (liveQuality && totalCalls !== plannedCalls && !meter?.stopped) failures++;
const report = { totalCalls,  ...(quality || liveQuality ? { qualityMetrics } : {}), comparison, version: benchmarkVersion, execution: paid ? "live" : preflightOnly ? "provider-free-preflight" : "simulated",
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
  simulatedCalls: totalCalls, syntheticTurns: cases.flatMap(({ turns }) => turns).length, plannedCalls, worstCasePerCallMicros: lunaReservation,
  worstCaseRunMicros: lunaReservation * options!.requests,
  ...(singleCall ? { model: modelIds[0], globalCapMicros: options!.global, perModelCapMicros: options!.perModel } : {}), entitlement: "operator-attested" }));
else if (paid) console.log(JSON.stringify({ version: benchmarkVersion, failures, stopped: meter?.stopped, estimatedOrReservedMicros: meter?.total }));
else {
  if (smoke && operator.EVAL_REPORT_PATH) {
    const path = operator.EVAL_REPORT_PATH.replace(/\.json$/, ".md");
    if (path !== operator.EVAL_REPORT_PATH) await writeFile(path, markdown, { flag: "wx", mode: 0o600 });
  }
  if (phase2g && operator.EVAL_REPORT_PATH) console.log(JSON.stringify({ suite, failures, totalCalls, reportSaved: true }));
  else console.log(json);
}
if (failures || meter?.stopped) process.exitCode = 1;
assert.ok(results.length || meter?.stopped);
