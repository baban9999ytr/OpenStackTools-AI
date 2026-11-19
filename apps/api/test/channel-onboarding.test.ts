import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcrypt";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";

process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/unused-channel-test";
process.env.SESSION_SECRET = "channel-test-session-secret-at-least-32-characters";
process.env.OPENAI_API_KEY = "unused-channel-test-key";
process.env.OPENAI_MODEL = "test-model";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "10";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "1";
process.env.DASHBOARD_ORIGIN = "http://localhost:5173";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "test@example.test";
process.env.TELEGRAM_SELF_SERVICE_ENABLED = "true";
process.env.TELEGRAM_PUBLIC_API_ORIGIN = "https://bots.example.test";
process.env.CHANNEL_CREDENTIAL_ACTIVE_KEY_ID = "V1";
process.env.CHANNEL_CREDENTIAL_KEY_V1 = randomBytes(32).toString("base64");

const { createApp } = await import("../src/app.js");
const { telegramAdapter } = await import("../src/services/channels/telegram.js");
const { TelegramProviderError } = await import("../src/services/channels/telegram-management.js");
const { resolveChannelCredential } = await import("../src/services/channels/credentials.js");
const { processWidgetRequest } = await import("../src/services/widget-queue.js");
const { ensureTelegramDelivery, deliverTelegramOutbox, recoverTelegramInbounds } = await import("../src/services/channels/telegram-service.js");
const { tokenHash, newToken } = await import("../src/services/tokens.js");
const { Organization, User, Membership, Session, Assistant, ChannelConnection, ChannelCredential,
  ChannelDelivery, ChannelIdentity, InteractionToken, Conversation, ChannelInbound, AgentAction, WidgetRequest,
  StaffAvailability, Appointment } = await import("../src/models/index.js");
let replset: MongoMemoryReplSet;
before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
  await mongoose.connect(replset.getUri());
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.init()));
});
after(async () => { await mongoose.disconnect(); await replset?.stop(); });

const primaryToken = "123456:abcdefghijklmnopqrstuvwxyzABCDE";
const replacementToken = "123456:replacement-abcdefghijklmnopqrstuvwxyz";
const otherToken = "888888:abcdefghijklmnopqrstuvwxyzABCDE";
const bots = new Map([[primaryToken, { id: "123456", name: "Demo Bot", username: "DemoPilotBot" }],
  [replacementToken, { id: "123456", name: "Demo Bot", username: "DemoPilotBot" }],
  [otherToken, { id: "888888", name: "Other Bot", username: "OtherPilotBot" }]]);
const webhooks = new Map<string, string>();
let failSet = false;
let timeoutSet = false;
let slowSet = false;
let setEntered = false;
let revoked = false;
const provider: import("../src/services/channels/telegram-management.js").TelegramManagementProvider = {
  async getMe(token) {
    if (revoked && token === primaryToken) throw new TelegramProviderError("revoked");
    const bot = bots.get(token);
    if (!bot) throw new TelegramProviderError("invalid_token");
    return bot;
  },
  async setWebhook(token, url, _secret) {
    if (slowSet) { setEntered = true; await new Promise((resolve) => setTimeout(resolve, 100)); }
    if (failSet) throw new TelegramProviderError("provider_unavailable");
    if (timeoutSet) { webhooks.set(token, url); throw new TelegramProviderError("timeout"); }
    webhooks.set(token, url);
  },
  async getWebhookInfo(token) { return { url: webhooks.get(token) ?? "" }; },
  async deleteWebhook(token) { webhooks.delete(token); },
};
let aiCalls = 0;
const fakeAI: import("../src/services/ai.js").AIResponder = async () => {
  aiCalls++;
  return { text: "Synthetic answer", inputTokens: 1, outputTokens: 1 };
};
const delivered: string[] = [];
const fakeAdapter: import("../src/services/channels/types.js").ChannelAdapter = {
  ...telegramAdapter,
  async send(_token, message) { delivered.push(message.text); return { providerMessageId: String(delivered.length) }; },
  async acknowledge() {},
};
const app = createApp(fakeAI, fakeAdapter, provider);
const headers = { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest" };
const withAuth = (cookie: string) => ({ ...headers, Cookie: cookie });
const createOwner = async (name: string) => {
  const org = await Organization.create({ name, dailyBudgetMicros: 1_000_000, monthlyBudgetMicros: 10_000_000 });
  const password = `test-${randomUUID()}`;
  const user = await User.create({ name: `${name} owner`, email: `${randomUUID()}@example.test`,
    passwordHash: await hash(password, 4), emailVerifiedAt: new Date() });
  await Membership.create({ organizationId: org._id, userId: user._id, role: "owner" });
  const sessionToken = randomBytes(32).toString("base64url");
  await Session.create({ userId: user._id, tokenHash: tokenHash(sessionToken), expiresAt: new Date(Date.now() + 3_600_000) });
  const assistant = await Assistant.create({ organizationId: org._id, name: `${name} assistant`,
    instructions: "Respond using verified business data.", publicKey: `ost_channel_${randomUUID()}`,
    allowedOrigins: ["https://business.example.test"] });
  return { org, user, assistant, password, cookie: `ost_session=${sessionToken}` };
};

test("managed Telegram onboarding is tenant scoped, encrypted and recoverable", async () => {
  const a = await createOwner("Business A");
  const b = await createOwner("Business B");
  const baseA = `/api/organizations/${a.org._id}/channels`;
  const baseB = `/api/organizations/${b.org._id}/channels`;
  const create = (base: string, cookie: string, botToken: string, assistantId: string) =>
    request(app).post(`${base}/telegram`).set(withAuth(cookie)).send({ botToken, assistantId });
  const invalid = await create(baseA, a.cookie, "invalid-but-long-enough-token", a.assistant._id.toString());
  assert.equal(invalid.status, 422);
  assert.equal(await ChannelConnection.countDocuments(), 0);
  const crossAssistant = await create(baseA, a.cookie, otherToken, b.assistant._id.toString());
  assert.equal(crossAssistant.status, 404);
  const pair = await Promise.all([create(baseA, a.cookie, primaryToken, a.assistant._id.toString()),
    create(baseB, b.cookie, primaryToken, b.assistant._id.toString())]);
  assert.deepEqual(pair.map((item) => item.status).sort(), [201, 409]);
  const owner = pair[0]!.status === 201 ? a : b;
  const outsider = pair[0]!.status === 201 ? b : a;
  const base = owner === a ? baseA : baseB;
  const connectionId = (pair.find((item) => item.status === 201)!.body.connection as { id: string }).id;
  const connection = await ChannelConnection.findById(connectionId);
  assert.ok(connection);
  assert.equal(connection.status, "connected");
  assert.equal(connection.active, true);
  assert.equal(webhooks.get(primaryToken), `https://bots.example.test/api/channels/telegram/${connectionId}/webhook`);
  const credential = await ChannelCredential.findOne({ connectionId });
  assert.ok(credential);
  assert.equal(credential.keyId, "V1");
  assert.notEqual(credential.tokenCiphertext, primaryToken);
  assert.equal(JSON.stringify(credential).includes(primaryToken), false);
  assert.equal(await resolveChannelCredential(connection, "token"), primaryToken);
  const listed = await request(app).get(base).set(withAuth(owner.cookie));
  assert.equal(listed.status, 200);
  assert.equal(JSON.stringify(listed.body).includes(primaryToken), false);
  assert.equal(JSON.stringify(listed.body).includes("tokenCiphertext"), false);
  const exported = await request(app).get(`/api/organizations/${owner.org._id}/export/channelConnections`).set(withAuth(owner.cookie));
  assert.equal(exported.status, 200);
  assert.equal(JSON.stringify(exported.body).includes("credentialEnv"), false);
  assert.equal((await request(app).get(`/api/organizations/${owner.org._id}/export/channelCredentials`).set(withAuth(owner.cookie))).status, 404);
  assert.equal((await request(app).get(base).set(withAuth(outsider.cookie))).status, 403);
  assert.equal((await request(app).post(`${base}/telegram/${connectionId}/verify`).set(withAuth(outsider.cookie)).send({})).status, 403);
  const wrongTenantBase = owner === a ? baseB : baseA;
  assert.equal((await request(app).post(`${wrongTenantBase}/telegram/${connectionId}/verify`).set(withAuth(outsider.cookie)).send({})).status, 404);
  const forged = await request(app).post(`/api/channels/telegram/${connectionId}/webhook`).send({ update_id: 1 });
  assert.equal(forged.status, 403);
  const webhookSecret = await resolveChannelCredential(connection, "webhook");
  assert.ok(webhookSecret);
  const accepted = await request(app).post(`/api/channels/telegram/${connectionId}/webhook`)
    .set("X-Telegram-Bot-Api-Secret-Token", webhookSecret).send({ update_id: 1 });
  assert.equal(accepted.status, 200);
  const start = await request(app).post(`/api/channels/telegram/${connectionId}/webhook`)
    .set("X-Telegram-Bot-Api-Secret-Token", webhookSecret).send({ update_id: 1001,
      message: { message_id: 1001, chat: { id: 101, type: "private" }, from: { id: 101 }, text: "/start" } });
  assert.equal(start.status, 200);
  const startInbound = await ChannelInbound.findOne({ channelConnectionId: connection._id, externalMessageId: "1001" });
  assert.ok(startInbound?.requestId);
  const beforeStartCalls = aiCalls;
  await processWidgetRequest(startInbound.requestId, fakeAI);
  await ensureTelegramDelivery(startInbound.requestId);
  await deliverTelegramOutbox(fakeAdapter);
  assert.match(delivered.at(-1) ?? "", /Merhaba|Hello/);
  assert.equal(aiCalls, beforeStartCalls);
  assert.equal((await request(app).post(`/api/channels/telegram/${connectionId}/webhook`)
    .set("X-Telegram-Bot-Api-Secret-Token", webhookSecret).send({ update_id: 1001,
      message: { message_id: 1001, chat: { id: 101, type: "private" }, from: { id: 101 }, text: "/start" } })).status, 200);
  assert.equal(await ChannelDelivery.countDocuments({ requestId: startInbound.requestId }), 1);
  const messageAccepted = await request(app).post(`/api/channels/telegram/${connectionId}/webhook`)
    .set("X-Telegram-Bot-Api-Secret-Token", webhookSecret).send({ update_id: 2,
      message: { message_id: 2, chat: { id: 101, type: "private" }, from: { id: 101 }, text: "Hello" } });
  assert.equal(messageAccepted.status, 200);
  const inbound = await ChannelInbound.findOne({ channelConnectionId: connection._id, externalMessageId: "2" });
  assert.ok(inbound?.requestId);
  await processWidgetRequest(inbound.requestId, fakeAI);
  await ensureTelegramDelivery(inbound.requestId);
  await deliverTelegramOutbox(fakeAdapter);
  assert.equal(delivered.at(-1), "Synthetic answer");
  const stranded = await ChannelInbound.create({ organizationId: owner.org._id, channelConnectionId: connection._id,
    externalMessageId: "1002", externalConversationId: "101", senderId: "101", kind: "message",
    text: "Hello again", status: "received" });
  await recoverTelegramInbounds(fakeAdapter, new Date(Date.now() + 6000));
  const recovered = await ChannelInbound.findById(stranded._id);
  assert.equal(recovered?.status, "handled");
  assert.ok(recovered?.requestId);
  await processWidgetRequest(recovered.requestId, fakeAI);
  await ensureTelegramDelivery(recovered.requestId);
  await deliverTelegramOutbox(fakeAdapter);
  assert.equal(delivered.at(-1), "Synthetic answer");
  const visitor = await ChannelIdentity.findOne({ channelConnectionId: connection._id, senderId: "101" });
  assert.ok(visitor?.currentConversationId);
  const staff = await User.create({ name: "Synthetic consultant", email: `${randomUUID()}@example.test`, passwordHash: "unused" });
  await Membership.create({ organizationId: owner.org._id, userId: staff._id, role: "agent" });
  const windows = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 540, endMinute: 1080 }));
  await StaffAvailability.create({ organizationId: owner.org._id, staffId: staff._id,
    windows, services: ["viewing"], appointmentDurationsMinutes: [30] });
  await Organization.updateOne({ _id: owner.org._id }, { $set: { openingHours: windows, timeZone: "UTC" } });
  const at = new Date(Date.now() + 86_400_000);
  at.setUTCHours(12, 0, 0, 0);
  const pending = await AgentAction.create({ organizationId: owner.org._id, assistantId: owner.assistant._id,
    conversationId: visitor.currentConversationId, visitorId: visitor.visitorId, locale: "en",
    name: "create_appointment", arguments: { staffId: staff._id.toString(), startAt: at.toISOString(), durationMinutes: 30 },
    status: "pending", expiresAt: new Date(Date.now() + 900_000), idempotencyKey: `test:${randomUUID()}` });
  await WidgetRequest.create({ organizationId: owner.org._id, assistantId: owner.assistant._id,
    conversationId: visitor.currentConversationId, visitorId: visitor.visitorId,
    channel: "telegram", channelConnectionId: connection._id,
    text: "Book the verified time", clientMessageId: `test:${randomUUID()}`,
    status: "completed", actionId: pending._id });
  const callbackToken = newToken();
  await InteractionToken.create({ tokenHash: tokenHash(callbackToken), organizationId: owner.org._id,
    assistantId: owner.assistant._id, conversationId: visitor.currentConversationId,
    visitorId: visitor.visitorId, channelConnectionId: connection._id, actionId: pending._id,
    expiresAt: pending.expiresAt });
  const callback = { update_id: 3, callback_query: { id: "managed-confirm", from: { id: 101 }, data: callbackToken,
    message: { message_id: 30, chat: { id: 101, type: "private" } } } };
  assert.equal((await request(app).post(`/api/channels/telegram/${connectionId}/webhook`)
    .set("X-Telegram-Bot-Api-Secret-Token", webhookSecret).send(callback)).status, 200);
  await deliverTelegramOutbox(fakeAdapter);
  assert.equal(await Appointment.countDocuments({ organizationId: owner.org._id, visitorId: visitor.visitorId }), 1);
  assert.equal((await request(app).post(`/api/channels/telegram/${connectionId}/webhook`)
    .set("X-Telegram-Bot-Api-Secret-Token", webhookSecret).send(callback)).status, 200);
  assert.equal(await Appointment.countDocuments({ organizationId: owner.org._id, visitorId: visitor.visitorId }), 1);

  revoked = true;
  const checked = await request(app).post(`${base}/telegram/${connectionId}/verify`).set(withAuth(owner.cookie)).send({});
  assert.equal(checked.body.connection.status, "needs_attention");
  assert.equal((await ChannelConnection.findById(connectionId))?.active, false);
  revoked = false;
  failSet = true;
  const failedRepair = await request(app).post(`${base}/telegram/${connectionId}/repair`).set(withAuth(owner.cookie)).send({});
  assert.equal(failedRepair.body.connection.status, "needs_attention");
  failSet = false;
  const repaired = await request(app).post(`${base}/telegram/${connectionId}/repair`).set(withAuth(owner.cookie)).send({ botToken: replacementToken });
  assert.equal(repaired.body.connection.status, "connected");
  assert.equal(await resolveChannelCredential((await ChannelConnection.findById(connectionId))!, "token"), replacementToken);
  const otherAssistant = await Assistant.create({ organizationId: owner.org._id, name: "Second assistant",
    instructions: "Respond using verified data.", publicKey: `ost_channel_${randomUUID()}`, allowedOrigins: [] });
  const originalConversation = (await Conversation.findById(visitor.currentConversationId))!;
  const changed = await request(app).patch(`${base}/telegram/${connectionId}/assistant`).set(withAuth(owner.cookie))
    .send({ assistantId: otherAssistant._id.toString() });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.connection.assistantId, otherAssistant._id.toString());
  assert.equal((await ChannelIdentity.findOne({ channelConnectionId: connectionId }))?.currentConversationId, undefined);
  assert.ok(await Conversation.findById(originalConversation._id));
  const disabled = await request(app).post(`${base}/telegram/${connectionId}/disable`).set(withAuth(owner.cookie)).send({});
  assert.equal(disabled.body.connection.status, "disabled");
  assert.equal((await request(app).post(`/api/channels/telegram/${connectionId}/webhook`)
    .set("X-Telegram-Bot-Api-Secret-Token", webhookSecret).send({ update_id: 2 })).status, 403);
  const stillDisabled = await request(app).post(`${base}/telegram/${connectionId}/verify`).set(withAuth(owner.cookie)).send({});
  assert.equal(stillDisabled.body.connection.status, "disabled");
  const enabled = await request(app).post(`${base}/telegram/${connectionId}/repair`).set(withAuth(owner.cookie)).send({});
  assert.equal(enabled.body.connection.status, "connected");
  const wrongPassword = await request(app).delete(`${base}/telegram/${connectionId}`).set(withAuth(owner.cookie))
    .send({ password: "wrong" });
  assert.equal(wrongPassword.status, 403);
  const removed = await request(app).delete(`${base}/telegram/${connectionId}`).set(withAuth(owner.cookie))
    .send({ password: owner.password });
  assert.equal(removed.body.connection.status, "disconnected");
  assert.equal(await ChannelCredential.countDocuments({ connectionId }), 0);
  assert.ok(await Conversation.findById(originalConversation._id));
  const transferred = await create(wrongTenantBase, outsider.cookie, primaryToken, outsider.assistant._id.toString());
  assert.equal(transferred.status, 201);
  assert.equal(transferred.body.connection.status, "connected");
  const blockedDelete = await request(app).delete(`/api/organizations/${outsider.org._id}/tenant`)
    .set(withAuth(outsider.cookie)).send({ organizationName: outsider.org.name, password: outsider.password });
  assert.equal(blockedDelete.status, 409);
  const transferredDisconnect = await request(app).delete(`${wrongTenantBase}/telegram/${transferred.body.connection.id}`)
    .set(withAuth(outsider.cookie)).send({ password: outsider.password });
  assert.equal(transferredDisconnect.body.connection.status, "disconnected");
  const removedTenant = await request(app).delete(`/api/organizations/${outsider.org._id}/tenant`)
    .set(withAuth(outsider.cookie)).send({ organizationName: outsider.org.name, password: outsider.password });
  assert.equal(removedTenant.status, 200);
  assert.equal(await ChannelCredential.countDocuments({ organizationId: outsider.org._id }), 0);
});

test("webhook uncertainty is reported without claiming connection success", async () => {
  const owner = await createOwner("Business C");
  const base = `/api/organizations/${owner.org._id}/channels`;
  timeoutSet = true;
  const created = await request(app).post(`${base}/telegram`).set(withAuth(owner.cookie))
    .send({ assistantId: owner.assistant._id.toString(), botToken: otherToken });
  timeoutSet = false;
  assert.equal(created.status, 201);
  assert.equal(created.body.connection.status, "needs_attention");
  assert.equal(created.body.connection.active, false);
  const repaired = await request(app).post(`${base}/telegram/${created.body.connection.id}/repair`).set(withAuth(owner.cookie)).send({});
  assert.equal(repaired.body.connection.status, "connected");
  slowSet = true; setEntered = false;
  const concurrentRepair = request(app).post(`${base}/telegram/${created.body.connection.id}/repair`)
    .set(withAuth(owner.cookie)).send({});
  const repairResult = concurrentRepair.then((result) => result);
  for (let i = 0; i < 200 && !setEntered; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(setEntered, true);
  const competingDisable = await request(app).post(`${base}/telegram/${created.body.connection.id}/disable`)
    .set(withAuth(owner.cookie)).send({});
  assert.equal(competingDisable.status, 404);
  assert.equal((await repairResult).body.connection.status, "connected");
  slowSet = false;
  const otherMember = await User.create({ name: "Viewer", email: `${randomUUID()}@example.test`, passwordHash: "unused" });
  await Membership.create({ organizationId: owner.org._id, userId: otherMember._id, role: "viewer" });
  const visitorToken = randomBytes(32).toString("base64url");
  await Session.create({ userId: otherMember._id, tokenHash: tokenHash(visitorToken), expiresAt: new Date(Date.now() + 3_600_000) });
  const denied = await request(app).post(`${base}/telegram/${created.body.connection.id}/disable`)
    .set(withAuth(`ost_session=${visitorToken}`)).send({});
  assert.equal(denied.status, 403);
  await ChannelCredential.updateOne({ connectionId: created.body.connection.id }, { $set: { tokenTag: "tampered" } });
  const brokenKey = await request(app).post(`${base}/telegram/${created.body.connection.id}/verify`)
    .set(withAuth(owner.cookie)).send({});
  assert.equal(brokenKey.body.connection.active, false);
  assert.equal(brokenKey.body.connection.lastErrorCategory, "credential_decryption_failed");
  await new Promise((resolve) => setTimeout(resolve, 50));
});
