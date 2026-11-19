import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";

process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/unused-omnichannel-test";
process.env.SESSION_SECRET = "omnichannel-test-secret-at-least-32-characters";
process.env.OPENAI_API_KEY = "unused-omnichannel-key";
process.env.OPENAI_MODEL = "test-model";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "10";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "1";
process.env.DASHBOARD_ORIGIN = "http://localhost:5173";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "test@example.test";
process.env.OST_TELEGRAM_BOT_TOKEN_TEST = "fake-telegram-token-never-sent";
process.env.OST_TELEGRAM_WEBHOOK_SECRET_TEST = "test-webhook-secret-1234567890";

const { createApp } = await import("../src/app.js");
const { telegramAdapter } = await import("../src/services/channels/telegram.js");
const { processWidgetRequest } = await import("../src/services/widget-queue.js");
const { ensureTelegramDelivery, deliverTelegramOutbox } = await import("../src/services/channels/telegram-service.js");
const { confirmActionWithToken } = await import("../src/services/universal-confirmation.js");
const { tokenHash, newToken } = await import("../src/services/tokens.js");
const { localParts } = await import("../src/services/appointments.js");
const { Organization, Assistant, User, Membership, StaffAvailability, Listing, ChannelConnection,
  ChannelInbound, ChannelIdentity, ChannelDelivery, WidgetRequest, AgentAction, Appointment, ActionConfirmationAudit,
  UsageEvent, Conversation } = await import("../src/models/index.js");
const { InteractionToken } = await import("../src/models/index.js");
const { demoListings } = await import("../src/scripts/demo-data.js");

let replset: MongoMemoryReplSet;
before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
  await mongoose.connect(replset.getUri());
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.init()));
});
after(async () => { await mongoose.disconnect(); await replset?.stop(); });

test("website and mocked Telegram share AI queue, budgets and replay-safe action confirmation", async () => {
  const windows = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 540, endMinute: 1080 }));
  const org = await Organization.create({ name: "Fictional omnichannel business", timeZone: "Europe/Istanbul",
    openingHours: windows, dailyBudgetMicros: 1_000_000, monthlyBudgetMicros: 10_000_000 });
  const assistant = await Assistant.create({ organizationId: org._id, name: "Fictional receptionist",
    instructions: "Use verified data.", publicKey: `ost_omni_${crypto.randomUUID().replaceAll("-", "")}`,
    allowedOrigins: ["https://business.example.test"] });
  const staff = await User.create({ email: `omni-${crypto.randomUUID()}@example.test`, name: "Viewing consultant", passwordHash: "test-only-hash" });
  await Membership.create({ organizationId: org._id, userId: staff._id, role: "agent" });
  await StaffAvailability.create({ organizationId: org._id, staffId: staff._id, services: ["property viewing"], windows,
    appointmentDurationsMinutes: [30] });
  for (const item of [demoListings[0], demoListings[1]]) {
    assert.ok(item);
    const { stale: _stale, ...listing } = item;
    await Listing.create({ organizationId: org._id, ...listing });
  }
  const tomorrow = localParts(new Date(Date.now() + 86_400_000), "Europe/Istanbul").date;
  let bookingHour = 11;
  let providerCalls = 0;
  const model: import("../src/services/ai.js").AIResponder = async (_instructions, history) => {
    providerCalls++;
    const text = history.at(-1)?.text ?? "";
    if (/randevu al|book/i.test(text)) {
      const startAt = new Date(`${tomorrow}T${String(bookingHour++).padStart(2, "0")}:00:00Z`);
      return { text: "", action: { name: "create_appointment", arguments: {
        staffId: staff._id.toString(), startAt: startAt.toISOString(), durationMinutes: 30 } }, inputTokens: 12, outputTokens: 5 };
    }
    if (/müsait|available/i.test(text)) return { text: "", action: { name: "check_availability", arguments: {
      staffId: staff._id.toString(), date: tomorrow, durationMinutes: 30 } }, inputTokens: 12, outputTokens: 5 };
    if (/devral|handoff/i.test(text)) return { text: "", action: { name: "handoff_to_human", arguments: { reason: "Visitor requested staff" } }, inputTokens: 12, outputTokens: 5 };
    return { text: "", action: { name: "search_listings", arguments: { location: "Nilüfer", listingType: "rent",
      propertyType: "apartment", minRooms: 3, budgetMax: 30_000, currency: "TRY" } }, inputTokens: 12, outputTokens: 5 };
  };
  const sent: Array<{ text: string; token?: string; chat: string }> = [];
  let outage = false;
  let uncertainOutage = false;
  const fakeAdapter: import("../src/services/channels/types.js").ChannelAdapter = {
    ...telegramAdapter,
    async send(_token, message) {
      if (uncertainOutage) { uncertainOutage = false; throw new Error("mock network timeout"); }
      if (outage) { outage = false; const error = new Error("mock 429") as Error & { status: number; retryAfter: number };
        error.status = 429; error.retryAfter = 1; throw error; }
      sent.push({ text: message.text, token: message.confirmation?.token, chat: message.externalConversationId });
      return { providerMessageId: String(sent.length) };
    },
    async acknowledge() {},
  };
  const app = createApp(model, fakeAdapter);
  app.set("trust proxy", 1);
  const connection = await ChannelConnection.create({ organizationId: org._id, assistantId: assistant._id,
    channel: "telegram", externalAccountId: "123456", credentialEnv: "OST_TELEGRAM_BOT_TOKEN_TEST",
    webhookSecretEnv: "OST_TELEGRAM_WEBHOOK_SECRET_TEST", active: true });
  const path = `/api/channels/telegram/${connection._id}/webhook`;
  const header = "X-Telegram-Bot-Api-Secret-Token";
  const telegramMessage = (updateId: number, text: string, senderId = 101) => ({ update_id: updateId,
    message: { message_id: updateId, from: { id: senderId }, chat: { id: senderId, type: "private" }, text } });
  const post = (payload: unknown, secret = process.env.OST_TELEGRAM_WEBHOOK_SECRET_TEST!) =>
    request(app).post(path).set(header, secret).send(payload);
  assert.equal((await post(telegramMessage(1, "Nilüfer'de kiralık 3+1 daire arıyorum"), "wrong-secret")).status, 403);
  assert.equal(await ChannelInbound.countDocuments(), 0);
  const drain = async (updateId: number) => {
    const inbound = await ChannelInbound.findOne({ channelConnectionId: connection._id, externalMessageId: String(updateId) }).lean();
    assert.ok(inbound?.requestId);
    await processWidgetRequest(inbound.requestId, model);
    await ensureTelegramDelivery(inbound.requestId);
    await deliverTelegramOutbox(fakeAdapter);
    return WidgetRequest.findById(inbound.requestId).lean();
  };
  assert.equal((await post(telegramMessage(1, "Nilüfer'de kiralık 3+1 daire arıyorum"))).status, 200);
  const search = await drain(1);
  assert.equal(search?.status, "completed");
  assert.match(sent.at(-1)?.text ?? "", /27\.500 TL/);
  assert.equal((await post(telegramMessage(1, "Nilüfer'de kiralık 3+1 daire arıyorum"))).status, 200);
  assert.equal(await ChannelInbound.countDocuments({ channelConnectionId: connection._id }), 1);
  assert.equal(await WidgetRequest.countDocuments({ channelConnectionId: connection._id }), 1);
  for (const [id, text] of [[2, "İkisinden hangisini önerirsin?"], [3, "Ucuz olanın balkonu var mı?"]] as const) {
    assert.equal((await post(telegramMessage(id, text))).status, 200);
    await drain(id);
  }
  assert.match(sent.at(-1)?.text ?? "", /balkon.*doğrulanmamış/i);
  assert.equal((await Conversation.findOne({ _id: search?.conversationId }).lean())?.channel, "telegram");
  assert.equal((await UsageEvent.countDocuments({ organizationId: org._id })), 3);
  assert.equal((await request(app).post("/api/widget/sessions").set("Origin", "https://business.example.test")
    .send({ publicKey: assistant.publicKey, locale: "tr" })).status, 201);
  const webSession = await request(app).post("/api/widget/sessions").set("Origin", "https://business.example.test")
    .send({ publicKey: assistant.publicKey, locale: "tr" });
  const webSearch = await request(app).post("/api/widget/messages").set("Origin", "https://business.example.test")
    .set("Authorization", `Bearer ${webSession.body.token}`)
    .send({ text: "Nilüfer'de kiralık 3+1 daire arıyorum", clientMessageId: crypto.randomUUID() });
  assert.equal(webSearch.status, 201);
  assert.equal((await Conversation.findById(webSearch.body.conversationId).lean())?.channel, "web");
  assert.equal((await AgentAction.countDocuments({ organizationId: org._id, name: "search_listings" })), 2);
  assert.equal((await post(telegramMessage(4, "Yarın öğleden sonra müsait bir danışman var mı?"))).status, 200);
  const availability = await drain(4);
  const availableAction = await AgentAction.findById(availability?.actionId).lean();
  assert.equal(availableAction?.name, "check_availability");
  assert.equal((availableAction?.arguments as { period?: string }).period, "afternoon");
  assert.ok((availableAction?.result as { available: unknown[] }).available.length > 0);
  assert.equal((await post(telegramMessage(5, "Yarın öğleden sonra saat 14:00 için randevu al"))).status, 200);
  const pendingRequest = await drain(5);
  const pending = await AgentAction.findById(pendingRequest?.actionId).lean();
  assert.equal(pending?.status, "pending");
  const actionToken = sent.at(-1)?.token;
  assert.ok(actionToken);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 0);
  const wrongSender = { update_id: 6, callback_query: { id: "wrong-sender", from: { id: 999 }, data: actionToken,
    message: { message_id: 50, chat: { id: 101, type: "private" } } } };
  assert.equal((await post(wrongSender)).status, 200);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 0);
  const callback = (id: number, token: string) => ({ update_id: id, callback_query: { id: `callback-${id}`,
    from: { id: 101 }, data: token, message: { message_id: 50, chat: { id: 101, type: "private" } } } });
  assert.equal((await post(callback(7, actionToken))).status, 200);
  await deliverTelegramOutbox(fakeAdapter);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 1);
  assert.equal((await post(callback(7, actionToken))).status, 200);
  assert.equal((await post(callback(8, actionToken))).status, 200);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 1);
  assert.equal(await ActionConfirmationAudit.countDocuments({ organizationId: org._id, outcome: "confirmed" }), 1);
  assert.equal((await post(telegramMessage(9, "Başka bir saat için randevu al"))).status, 200);
  await drain(9);
  assert.equal((await post(telegramMessage(10, "Evet"))).status, 200);
  await drain(10);
  assert.match(sent.at(-1)?.text ?? "", /Hangi işlemi onaylamak/i);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 1);
  const callsBeforeText = providerCalls;
  assert.equal((await post(telegramMessage(11, "Evet, randevuyu onaylıyorum"))).status, 200);
  await drain(11);
  assert.equal(providerCalls, callsBeforeText);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 2);
  assert.equal((await post(telegramMessage(11, "Evet, randevuyu onaylıyorum"))).status, 200);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 2);
  assert.equal((await ActionConfirmationAudit.countDocuments({ organizationId: org._id, method: "text" })), 1);
  assert.equal((await post(telegramMessage(12, "Bir danışman devralabilir mi?"))).status, 200);
  const handoff = await drain(12);
  assert.equal(handoff?.status, "handoff");
  assert.match(sent.at(-1)?.text ?? "", /ekip üyesi/i);
  const otherOrg = await Organization.create({ name: "Other tenant", dailyBudgetMicros: 1_000_000, monthlyBudgetMicros: 10_000_000 });
  await assert.rejects(() => confirmActionWithToken({ organizationId: otherOrg._id, assistantId: assistant._id,
    conversationId: pendingRequest!.conversationId, visitorId: "wrong", channelConnectionId: connection._id },
  actionToken, "telegram", "cross-tenant"));
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 2);
  assert.equal(await ChannelDelivery.countDocuments({ channelConnectionId: connection._id, status: "sent" }) >= 10, true);

  const expiredToken = newToken();
  await InteractionToken.create({ tokenHash: tokenHash(expiredToken), organizationId: org._id,
    assistantId: assistant._id, conversationId: pendingRequest!.conversationId,
    visitorId: (await ChannelIdentity.findOne({ channelConnectionId: connection._id, senderId: "101" }).lean())!.visitorId,
    channelConnectionId: connection._id, actionId: pending!._id,
    expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await post(callback(13, expiredToken))).status, 200);
  await deliverTelegramOutbox(fakeAdapter);
  assert.match(sent.at(-1)?.text ?? "", /artık onaylanamıyor|no longer be confirmed/i);
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, createdBy: "widget" }), 2);

  await ChannelDelivery.create({ channelConnectionId: connection._id, organizationId: org._id,
    conversationId: pendingRequest!.conversationId, dedupeKey: "test:retry-429",
    externalConversationId: "101", text: "Synthetic retry delivery", status: "queued", nextAttemptAt: new Date() });
  outage = true;
  await deliverTelegramOutbox(fakeAdapter);
  const retry = await ChannelDelivery.findOne({ dedupeKey: "test:retry-429" }).lean();
  assert.equal(retry?.status, "queued");
  assert.equal(retry?.attempts, 1);
  await ChannelDelivery.updateOne({ _id: retry!._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await deliverTelegramOutbox(fakeAdapter);
  assert.equal((await ChannelDelivery.findById(retry!._id).lean())?.status, "sent");
  assert.equal(sent.filter((item) => item.text === "Synthetic retry delivery").length, 1);

  await ChannelDelivery.create({ channelConnectionId: connection._id, organizationId: org._id,
    conversationId: pendingRequest!.conversationId, dedupeKey: "test:uncertain-send",
    externalConversationId: "101", text: "Synthetic uncertain delivery", status: "queued", nextAttemptAt: new Date() });
  uncertainOutage = true;
  await deliverTelegramOutbox(fakeAdapter);
  assert.equal((await ChannelDelivery.findOne({ dedupeKey: "test:uncertain-send" }).lean())?.status, "uncertain");
  await deliverTelegramOutbox(fakeAdapter);
  assert.equal(sent.filter((item) => item.text === "Synthetic uncertain delivery").length, 0);

  await Organization.updateOne({ _id: org._id }, { $set: { dailyBudgetMicros: 0, monthlyBudgetMicros: 0 } });
  assert.equal((await post(telegramMessage(14, "Başka bir ev arıyorum", 202))).status, 200);
  const exhausted = await drain(14);
  assert.equal(exhausted?.status, "failed");
  assert.equal(exhausted?.errorCode, "budget_exhausted");
  assert.match(sent.at(-1)?.text ?? "", /şu anda kullanılamıyor/i);
});
