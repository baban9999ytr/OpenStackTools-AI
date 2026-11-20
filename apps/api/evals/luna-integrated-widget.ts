import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, writeFile, rename } from "node:fs/promises";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { benchmarkPreflight, createBenchmarkMeter } from "./benchmark-admission.js";
import { privateReportDestination, redactSyntheticReport } from "./benchmark-smoke.js";
import { item } from "./receptionist-intent-cases.js";
import { scoreIntentAdvice } from "./receptionist-intent-scoring.js";
import { intentPlanSchema, parseIntentAdvice, receptionistIntentFormat } from "../src/services/receptionist-intent.js";
import { recordedLunaPlans } from "./luna-integrated-widget-fixture.js";
import type { AIResponder } from "../src/services/ai.js";

const suite = "luna-integrated-widget";
const model = "gpt-6-luna";
const inputLimit = 40_000;
const outputLimit = 512;
const cap = 21_000;
const perCallCap = 10_259;
const operator = { ...process.env };
const preflight = operator.EVAL_PREFLIGHT_ONLY === "1";
assert.equal(process.argv.slice(2).join(" "), `--live --suite=${suite}`);
if (!preflight) {
  assert.equal(operator.EVAL_EXECUTE_APPROVED, "1", "Execute through the secure launcher");
  assert.match(operator.EVAL_REPAIRED_WIDGET_APPROVED_SOURCE_SHA256 ?? "", /^[a-f0-9]{64}$/, "Repaired source approval required");
  const projectReview = operator.EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT ?? "";
  const reviewAge = Date.now() - Date.parse(projectReview);
  assert.ok(projectReview.endsWith("Z") && reviewAge >= 0 && reviewAge <= 86_400_000,
    "Current repaired-widget project review required");
}
assert.equal(operator.EVAL_VERIFIED_MODELS?.trim(), model);
assert.equal(operator.EVAL_PROVIDER_QUOTA_CONFIRMED, "1");
assert.equal(operator.EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED, "1");
assert.ok(operator.EVAL_PRICE_CHECKED_AT?.endsWith("Z"));
assert.equal(operator.EVAL_REASONING_EFFORT, "none");
assert.equal(operator.EVAL_OUTPUT_PROFILE, "standard");
for (const key of Object.keys(process.env)) if (key.startsWith("OPENAI_")) delete process.env[key];
const origin = "https://synthetic-widget.example.test";
const zone = "Europe/Istanbul";
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "/dev/null", NODE_ENV: "test", LOG_LEVEL: "silent",
  OPENAI_API_KEY: "inert-unused-key", OPENAI_MODEL: "inert-widget-model",
  MONGODB_URL: "mongodb://127.0.0.1:1/unused", SESSION_SECRET: "synthetic-widget-evaluation-session-secret",
  DASHBOARD_ORIGIN: "http://localhost:5173", SMTP_HOST: "localhost", SMTP_FROM: "eval@example.test",
  DEFAULT_DAILY_BUDGET_USD: "0.021", DEFAULT_MONTHLY_BUDGET_USD: "0.021",
  OPENAI_INPUT_USD_PER_MILLION_TOKENS: "0.10", OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "0.50",
  OPENAI_MAX_COMPLETION_TOKENS: String(outputLimit), AI_ENABLED_MODELS: model, AI_VERIFIED_MODELS: model,
  AI_MAX_REASONING_EFFORT: "none", AI_EXPERIMENTAL_RECEPTIONIST_INTENTS: "true", TELEGRAM_SELF_SERVICE_ENABLED: "false",
});
const { resolveModel, pricingVersion } = await import("../src/services/model-config.js");
const limits = benchmarkPreflight(operator, [model], pricingVersion);
assert.deepEqual([limits.requests, limits.global, limits.perModel], [2, cap, cap]);
const configSelection = { mode: "custom", profile: "economical", model, reasoningEffort: "none", processingTier: "default" } as const;
const configuration = resolveModel(configSelection);
const { upperInputTokenBound, reservationForTokenBounds, measuredCostMicros } = await import("../src/services/budget.js");
assert.equal(reservationForTokenBounds(inputLimit, outputLimit, configuration), perCallCap);
assert.ok(perCallCap * limits.requests <= cap);
const frozen = {
  search: "Görükle'de kiralık 3+1 daire arıyorum, bütçem 35000 TL.",
  compare: "İki ilanı karşılaştır, hangisini önerirsin?",
  facts: "İkinci evin depozitosunu ve aidatını ayrı ayrı söyler misin?",
  preferences: "Balat ya da Kültür de olur, 1+1 veya 2+1 bakabiliriz.",
  compound: "Eşyalı mı, hafta sonu görebilir miyim?",
  slot: "First verified offered slot rendered as YYYY-MM-DD saat HH:mm in Europe/Istanbul.",
  defer: "Olur gibi ama kesinleştirmeyelim.",
  confirm: "Evet, randevuyu onaylıyorum.",
  expected: { priceDifference: 7000, maintenanceFee: 0, deposit: "unknown", furnished: false,
    neighborhoods: ["Balat", "Kültür"], rooms: [1, 2], pendingAfterDeferral: true, finalAppointments: 1 },
};
const expected = [
  { intents: [item("property_fact", "question", "İkinci evin depozitosunu ve aidatını",
    { reference: { kind: "position", position: 2 }, attributes: ["deposit", "maintenanceFee"] })] },
  { intents: [item("property_fact", "question", "Eşyalı mı", { reference: { kind: "focused", position: null }, attributes: ["furnished"] }),
    item("viewing", "question", "hafta sonu görebilir miyim", { reference: { kind: "focused", position: null } })] },
];
const corpusSha256 = createHash("sha256").update(JSON.stringify({ frozen, expected })).digest("hex");
// Hash the actual working tree so tracked edits and new local source files
// are covered. Exclude ignored/generated files and environment credentials.
const repo = new URL("../../../", import.meta.url);
const sources = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--",
  "apps", "deploy", "brand", ".github", "scripts", "package.json", "package-lock.json", ".npmrc",
  ".gitignore", ".dockerignore", "Dockerfile", ":(glob)*compose*.yml", ":(glob)*compose*.yaml", ":(glob)tsconfig*.json",
], { cwd: repo, encoding: "utf8" }).split("\0").filter((path) =>
  path && !path.split("/").some((part) => part.startsWith(".env") && !part.endsWith(".example")));
assert.ok(sources.includes("apps/api/evals/luna-integrated-widget.ts"), "Run from the source checkout");
const sourceManifest = [];
for (const path of [...new Set(sources)].sort()) {
  const file = new URL(path.split("/").map(encodeURIComponent).join("/"), repo);
  assert.ok((await lstat(file)).isFile(), "Source manifest must contain regular files");
  sourceManifest.push([path, createHash("sha256").update(await readFile(file)).digest("hex")]);
}
const sourceSha256 = createHash("sha256").update(JSON.stringify(sourceManifest)).digest("hex");
if (!preflight || operator.EVAL_REPAIRED_WIDGET_APPROVED_SOURCE_SHA256) {
  assert.ok(operator.EVAL_REPAIRED_WIDGET_APPROVED_SOURCE_SHA256 === sourceSha256, "Approved repaired source digest mismatch");
}
if (!preflight || operator.EVAL_INTEGRATED_WIDGET_CORPUS_SHA256) {
  assert.ok(operator.EVAL_INTEGRATED_WIDGET_CORPUS_SHA256 === corpusSha256, "Approved fixture digest mismatch");
}
const reportPath = operator.EVAL_REPORT_PATH!;
await privateReportDestination(reportPath);
const setup = { suite, model, sourceSha256, corpusSha256, pricingVersion, plannedCalls: 2, inputLimit, outputLimit,
  maxPerCallMicros: perCallCap, maxReservationMicros: perCallCap * limits.requests, globalCapMicros: cap, modelCapMicros: cap };
const evidence = { ...setup, execution: preflight ? "provider-free" : "live", inputs: frozen, expected,
  providerRequests: 0, inferenceBoundaries: 0, inFlightMicros: 0, stopped: "" as string, passed: false,
  inferences: [] as unknown[], checkpoints: [] as unknown[], reloadDiagnostics: null as unknown,
  failure: null as unknown, humanReview: null };
if (!preflight) await (await open(reportPath, "wx", 0o600)).close();
const persist = async () => {
  if (preflight) return;
  await writeFile(reportPath + ".tmp", JSON.stringify(redactSyntheticReport(evidence, limits.key), null, 2),
    { mode: 0o600, flag: "wx" });
  await rename(reportPath + ".tmp", reportPath);
};
const { createOpenAIResponder, providerFailureDiagnostics } = await import("../src/services/ai.js");
const { createApp } = await import("../src/app.js");
const { tokenHash } = await import("../src/services/tokens.js");
const { localParts } = await import("../src/services/appointments.js");
const { AgentAction, Assistant, Appointment, Conversation, Listing, Membership, Organization, StaffAvailability, UsageEvent, WidgetRequest, Message, WidgetSession } = await import("../src/models/index.js");
const meter = createBenchmarkMeter(limits);
const provider = preflight ? undefined : createOpenAIResponder({
  model, apiKey: limits.key, maxCompletionTokens: outputLimit,
}).forModel!(configuration).interpretIntent;
assert.ok(preflight || provider, "Luna structured inference unavailable");
let activePrompt = "";
const responder: AIResponder = async () => { throw new Error("Unexpected function inference"); };
responder.interpretIntent = async (instructions, history) => {
  const index = evidence.inferenceBoundaries;
  const prompt = history.at(-1)?.text;
  const bound = upperInputTokenBound(instructions + JSON.stringify(receptionistIntentFormat), history);
  const reservation = reservationForTokenBounds(bound, outputLimit, configuration);
  if (index >= limits.requests || prompt !== [frozen.facts, frozen.compound][index] || prompt !== activePrompt ||
      bound > inputLimit || reservation > perCallCap) {
    meter.halt("unexpected_inference_or_bound");
    throw new Error("Integrated inference does not match the approved plan");
  }
  evidence.inferenceBoundaries++;
  evidence.inFlightMicros = reservation;
  await persist();
  const start = performance.now();
  try {
    const reply = await meter.run(model, reservation, bound, async () => {
      if (!provider) return { text: recordedLunaPlans[index]!, inputTokens: 12, outputTokens: 8 };
      evidence.providerRequests++;
      const result = await provider(instructions, history);
      if (result.action || result.model !== model || result.reasoningTokens !== 0 ||
          result.inputTokens > bound || result.outputTokens > outputLimit) {
        meter.halt("provider_safety_or_usage_guard");
        throw new Error("Integrated provider response violates approved limits");
      }
      return result;
    }, (answer) => measuredCostMicros(answer.inputTokens, answer.outputTokens, answer, configuration));
    const advice = parseIntentAdvice(reply.text, prompt!, 2, index === 1);
    let raw: unknown;
    try { raw = JSON.parse(reply.text); } catch { /* Keep malformed output as rejected evidence. */ }
    const rawPlan = intentPlanSchema.safeParse(raw);
    evidence.inferences.push({ prompt, rawPlan: reply.text, serverAccepted: Boolean(advice),
      score: scoreIntentAdvice(expected[index]!, rawPlan.success ? rawPlan.data : null), inputBound: bound, reservationMicros: reservation,
      usage: { input: reply.inputTokens, output: reply.outputTokens, reasoning: "reasoningTokens" in reply ? reply.reasoningTokens : null,
        cached: "cachedInputTokens" in reply ? reply.cachedInputTokens : null },
      providerLatencyMs: preflight ? null : Math.round(performance.now() - start),
      settledMicros: measuredCostMicros(reply.inputTokens, reply.outputTokens, reply, configuration) });
    evidence.inFlightMicros = 0;
    await persist();
    return reply;
  } catch (error) {
    evidence.inferences.push({ prompt, providerFailure: providerFailureDiagnostics(error), retainedMicros: evidence.inFlightMicros });
    evidence.stopped = meter.stopped ?? "provider_failure";
    await persist();
    throw error;
  }
};

let mongo: MongoMemoryReplSet | undefined;
let checkpoint = "setup";
let reloadAssertion = "history_request";
try {
  await persist();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: "127.0.0.1" }, binary: { version: "8.0.12" } });
  await mongoose.connect(mongo.getUri("synthetic_integrated_widget"));
  const hours = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 840, endMinute: 930 }));
  const org = await Organization.create({ name: "Synthetic integration", timeZone: zone, openingHours: hours,
    dailyBudgetMicros: cap, monthlyBudgetMicros: cap });
  const staffId = new mongoose.Types.ObjectId();
  const { User } = await import("../src/models/index.js");
  await User.create({ _id: staffId, name: "Synthetic consultant", email: "consultant@example.test", passwordHash: "synthetic-unused" });
  await Membership.create({ organizationId: org._id, role: "agent", userId: staffId });
  await StaffAvailability.create({ organizationId: org._id, staffId, windows: hours, services: ["property viewing"] });
  const listing = { organizationId: org._id, location: "Görükle", currency: "TRY", rooms: 3, areaSqm: 90,
    listingType: "rent", propertyType: "apartment", availability: "available", description: "Synthetic listing" } as const;
  const [, garden] = await Listing.create([
    { ...listing, title: "Synthetic Park Flat", price: 27000 },
    { ...listing, title: "Synthetic Garden Flat", price: 34000, facts: { maintenanceFee: 0, furnished: false } },
  ]);
  await Listing.collection.updateOne({ _id: garden!._id, organizationId: org._id },
    { $set: { updatedAt: new Date(Date.now() - 60_000) } });
  const publicKey = `ost_${randomUUID()}`;
  await Assistant.create({ publicKey, name: "Synthetic integration assistant", instructions: "Use verified facts.",
    organizationId: org._id, allowedOrigins: [origin], conversationStrategy: "real_estate",
    bookingNameRequired: false, modelSelection: configSelection });
  const app = createApp(responder);
  const session = await request(app).post("/api/widget/sessions").set("Origin", origin).send({ publicKey, locale: "tr" });
  assert.equal(session.status, 201);
  const auth = { Origin: origin, Authorization: `Bearer ${session.body.token}` };
  let conversationId: string | undefined;
  const scoped = { organizationId: org._id };
  const workflow = async () => (await Conversation.findOne({ ...scoped, _id: conversationId }).lean())?.workflow;
  const count = () => Appointment.countDocuments(scoped);
  const send = async (label: string, text: string, expectedCalls: number, replyPattern: RegExp, booking = false) => {
    checkpoint = label;
    assert.ok(!meter.stopped && !evidence.stopped);
    activePrompt = text;
    const reply = await request(app).post("/api/widget/messages").set(auth)
      .send({ text, conversationId, clientMessageId: randomUUID() });
    conversationId = reply.body.conversationId ?? conversationId;
    evidence.checkpoints.push({ label, status: reply.status, text: reply.body.reply?.text ?? null,
      errorCode: reply.body.errorCode, action: reply.body.action?.name, actionStatus: reply.body.action?.status });
    await persist();
    assert.equal(reply.status, 201);
    assert.equal(evidence.inferenceBoundaries, expectedCalls);
    assert.match(reply.body.reply.text, replyPattern);
    assert.equal(await count(), booking ? 1 : 0);
    return reply.body;
  };
  await send("search", frozen.search, 0, /Synthetic Park Flat.*27\.000 TL.*Synthetic Garden Flat.*34\.000 TL/s);
  assert.equal(String((await workflow())?.displayedListingIds?.[1]), String(garden!._id));
  await send("compare", frozen.compare, 0, /27\.000 TL.*7\.000 TL/s);
  await send("facts", frozen.facts, 1, /Synthetic Garden Flat.*aidat: 0 TL.*depozito .*doğrulanmamış/s);
  const searches = await AgentAction.countDocuments({ ...scoped, name: "search_listings" });
  await send("preferences", frozen.preferences, 1, /seçeneklerinizi not aldım/);
  assert.deepEqual((await workflow())?.business?.alternatives, { location: ["Balat", "Kültür"], rooms: [1, 2] });
  assert.equal(await AgentAction.countDocuments({ ...scoped, name: "search_listings" }), searches);
  await send("compound", frozen.compound, 2, /Synthetic Garden Flat.*eşyasız.*gösterim saatleri/is);
  const slot = (await workflow())?.offeredSlots?.[0];
  assert.ok(slot?.startAt);
  const local = localParts(new Date(slot.startAt), zone);
  assert.ok([0, 6].includes(local.day));
  assert.equal(local.minute, 840);
  assert.equal(String(slot.staffId), String(staffId));
  assert.equal(await AgentAction.countDocuments({ ...scoped, name: "create_appointment" }), 0);
  const proposal = await send("verified slot selection", `${local.date} saat 14:00`, 2, /onay/i);
  assert.equal(proposal.action.status, "pending");
  const before = await workflow();
  const originalNow = mongoose.now;
  const deferral = await (async () => {
    if (preflight && operator.EVAL_PREFLIGHT_TIE_MESSAGE_CLOCK === "1") {
      const stamp = new Date();
      mongoose.now = () => stamp;
    }
    try {
      return await send("defer", frozen.defer, 2, /şimdilik kesinleştirmiyoruz/);
    } finally {
      mongoose.now = originalNow;
    }
  })();
  assert.deepEqual(await workflow(), before);
  assert.equal((await AgentAction.findById(proposal.action.id).lean())?.status, "pending");
  checkpoint = "reload";
  const reload = await request(app).get(`/api/widget/conversations/${conversationId}/messages`).set(auth);
  const history = Array.isArray(reload.body.messages) ? reload.body.messages : [];
  const tag = (id: unknown) => String(id) === String(deferral.reply._id) ? "deferral_reply" :
    String(id) === String(deferral.message._id) ? "deferral_customer" : "earlier";
  const persistedConversation = await Conversation.findOne({ ...scoped, _id: conversationId }).lean();
  const [deferRequest, pair, sessionRecord, pending, unfinished] = await Promise.all([
    WidgetRequest.findOne({ ...scoped, conversationId, _id: deferral.requestId }).lean(),
    Message.find({ ...scoped, conversationId, requestId: deferral.requestId }).sort({ createdAt: 1, _id: 1 }).lean(),
    WidgetSession.findOne({ ...scoped, tokenHash: tokenHash(session.body.token), origin, currentConversationId: conversationId }).lean(),
    AgentAction.findOne({ ...scoped, conversationId, _id: proposal.action.id }).lean(),
    WidgetRequest.countDocuments({ ...scoped, conversationId, status: { $in: ["queued", "processing"] } }),
  ]);
  evidence.reloadDiagnostics = {
    priorResponse: { status: deferral.status, customerPresent: Boolean(deferral.message), replyPresent: Boolean(deferral.reply) },
    history: { status: reload.status, count: history.length, last: history.length ? tag(history.at(-1)?._id) : null,
      pairOrder: history.map((row: { _id: string }) => tag(row._id)).filter((kind: string) => kind !== "earlier"),
      conversationMatches: String(reload.body.conversation?._id) === conversationId },
    database: { requestStatus: deferRequest?.status, requestAttempts: deferRequest?.attempts, requestLease: Boolean(deferRequest?.leaseUntil),
      responseMatches: Boolean(deferRequest?.responseMessageId?.equals(deferral.reply._id)),
      conversationStatus: persistedConversation?.status, processingRequest: Boolean(persistedConversation?.processingRequestId),
      conversationLease: Boolean(persistedConversation?.processingLeaseUntil), unfinished,
      sessionMatches: Boolean(sessionRecord && persistedConversation && sessionRecord.visitorId === persistedConversation.visitorId &&
        sessionRecord.assistantId.equals(persistedConversation.assistantId) && sessionRecord.expiresAt > new Date()),
      actionStatus: pending?.status, bookingCount: await count(), pendingQuestion: persistedConversation?.workflow?.pendingQuestion,
      pair: pair.map((row) => ({ kind: tag(row._id), role: row.role, createdMs: row.createdAt.getTime() })),
    },
  };
  reloadAssertion = "history_http_200";
  assert.equal(reload.status, 200);
  reloadAssertion = "history_latest_is_deferral_reply";
  assert.match(history.at(-1)?.text ?? "", /şimdilik kesinleştirmiyoruz/);
  assert.equal(tag(history.at(-1)?._id), "deferral_reply");
  reloadAssertion = "deferral_request_completed_and_reply_persisted";
  assert.equal(deferRequest?.status, "completed");
  assert.ok(deferRequest?.responseMessageId?.equals(deferral.reply._id));
  assert.equal(unfinished, 0);
  assert.equal(persistedConversation?.processingRequestId, undefined);
  reloadAssertion = "deferral_pair_is_chronological";
  assert.deepEqual(pair.map((row) => tag(row._id)), ["deferral_customer", "deferral_reply"]);
  assert.ok(pair[1]!.createdAt > pair[0]!.createdAt);
  reloadAssertion = "pending_action_survives_reload";
  assert.equal(pending?.status, "pending");
  assert.equal(await count(), 0);
  evidence.checkpoints.push({ label: checkpoint, status: reload.status });
  const confirmed = await send("confirm", frozen.confirm, 2, /onay|oluştur/i, true);
  assert.equal(confirmed.action.status, "completed");
  const booked = await Appointment.findOne(scoped).lean();
  assert.equal(String(booked?.listingId), String(garden!._id));
  assert.equal(booked?.startAt.toISOString(), slot.startAt);
  checkpoint = "duplicate confirmation";
  const duplicate = await request(app).post(`/api/widget/actions/${proposal.action.id}/confirm`).set(auth).send({});
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.action.result.appointmentId, confirmed.action.result.appointmentId);
  assert.equal(await count(), 1);
  assert.equal(await AgentAction.countDocuments({ ...scoped, name: "create_appointment" }), 1);
  assert.equal(await AgentAction.countDocuments({ ...scoped, name: { $in: ["reschedule_appointment", "cancel_appointment"] } }), 0);
  evidence.checkpoints.push({ label: checkpoint, status: duplicate.status, appointments: 1 });
  checkpoint = "accounting";
  const usage = await UsageEvent.find(scoped).lean();
  assert.equal(usage.length, evidence.inferenceBoundaries);
  assert.ok(usage.every((row) => row.model === model && row.billingStatus === "measured"));
  assert.equal(usage.reduce((sum, row) => sum + row.estimatedCostMicros, 0), meter.total);
  assert.equal(evidence.checkpoints.length, 10);
  assert.equal(evidence.providerRequests, preflight ? 0 : limits.requests);
  evidence.passed = true;
} catch (error) {
  evidence.stopped ||= meter.stopped ?? checkpoint;
  evidence.failure = { checkpoint, assertion: checkpoint === "reload" ? reloadAssertion : null,
    type: error instanceof assert.AssertionError ? "assertion" : "runtime_error" };
} finally {
  await persist();
  await mongoose.disconnect();
  await mongo?.stop();
}
console.log(JSON.stringify({ ...setup, admitted: preflight && evidence.passed,
  providerRequests: evidence.providerRequests, observedInferenceBoundaries: evidence.inferenceBoundaries,
  checkpointEvidence: preflight ? evidence.checkpoints : undefined,
  reloadDiagnostics: evidence.reloadDiagnostics, failure: evidence.failure,
  checkpoints: evidence.checkpoints.length, stopped: evidence.stopped || null, passed: evidence.passed,
  estimatedOrReservedMicros: preflight ? null : meter.total, inferences: preflight ? evidence.inferences : undefined }));
if (!evidence.passed) process.exitCode = 1;
