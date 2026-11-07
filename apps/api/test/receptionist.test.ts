import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";

process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/unused-receptionist-test";
process.env.SESSION_SECRET = "receptionist-test-secret-at-least-32-characters";
process.env.OPENAI_API_KEY = "unused-receptionist-key";
process.env.OPENAI_MODEL = "test-model";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "10";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "1";
process.env.DASHBOARD_ORIGIN = "http://localhost:5173";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "test@example.test";

const { createApp } = await import("../src/app.js");
const { tokenHash } = await import("../src/services/tokens.js");
const { Organization, User, Membership, Assistant, Session, Appointment, AgentAction, Customer, Conversation } = await import("../src/models/index.js");
const app = createApp(async () => ({ text: "Test answer", inputTokens: 8, outputTokens: 3 }));
const websiteOrigin = "https://example-business.test";
const websiteHeaders = { Origin: websiteOrigin };
const dashboardHeaders = { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest" };
let replset: MongoMemoryReplSet;
let orgA = "";
let orgB = "";
let cookieA = "";
let cookieB = "";
let publicKey = "";

before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
  await mongoose.connect(replset.getUri());
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.init()));
  const [ownerA, ownerB] = await User.create([
    { email: "receptionist-a@example.test", name: "Owner A", passwordHash: "test-only-hash", emailVerifiedAt: new Date() },
    { email: "receptionist-b@example.test", name: "Owner B", passwordHash: "test-only-hash", emailVerifiedAt: new Date() },
  ]);
  assert.ok(ownerA && ownerB);
  const [a, b] = await Organization.create([
    { name: "Receptionist A", dailyBudgetMicros: 1_000_000, monthlyBudgetMicros: 10_000_000 },
    { name: "Receptionist B", dailyBudgetMicros: 1_000_000, monthlyBudgetMicros: 10_000_000 },
  ]);
  assert.ok(a && b);
  orgA = a._id.toString(); orgB = b._id.toString();
  await Membership.create([{ organizationId: a._id, userId: ownerA._id, role: "owner" },
    { organizationId: b._id, userId: ownerB._id, role: "owner" }]);
  const tokenA = "test-receptionist-session-a";
  const tokenB = "test-receptionist-session-b";
  await Session.create([{ tokenHash: tokenHash(tokenA), userId: ownerA._id, expiresAt: new Date(Date.now() + 86_400_000) },
    { tokenHash: tokenHash(tokenB), userId: ownerB._id, expiresAt: new Date(Date.now() + 86_400_000) }]);
  cookieA = `ost_session=${tokenA}`; cookieB = `ost_session=${tokenB}`;
  const assistant = await Assistant.create({ organizationId: a._id, name: "Test receptionist", instructions: "Help visitors schedule appointments safely.", publicKey: "ost_receptionist_test", allowedOrigins: [websiteOrigin] });
  publicKey = assistant.publicKey;
});
after(async () => { await mongoose.disconnect(); await replset?.stop(); });

test("receptionist hours, time zones, confirmations, idempotency and concurrent slot claims", async () => {
  const owner = await Membership.findOne({ organizationId: orgA, role: "owner" }).lean();
  assert.ok(owner);
  const staffId = owner.userId.toString();
  const start = new Date(Date.now() + 7 * 86_400_000);
  start.setUTCHours(9, 0, 0, 0);
  const local = new Date(start.getTime() + 3 * 3_600_000);
  const date = local.toISOString().slice(0, 10);
  const day = local.getUTCDay();
  const windows = [{ day, startMinute: 540, endMinute: 1020 }];
  const hours = await request(app).patch(`/api/organizations/${orgA}/receptionist/hours`)
    .set(dashboardHeaders).set("Cookie", cookieA).send({ timeZone: "Europe/Istanbul", openingHours: windows });
  assert.equal(hours.status, 200, JSON.stringify(hours.body));
  assert.equal((await request(app).put(`/api/organizations/${orgA}/receptionist/staff/${staffId}/availability`)
    .set(dashboardHeaders).set("Cookie", cookieA).send({ windows })).status, 200);
  assert.equal((await request(app).get(`/api/organizations/${orgA}/receptionist/config`).set("Cookie", cookieB)).status, 403);
  const query = new URLSearchParams({ staffId, date, durationMinutes: "30" });
  const availability = await request(app).get(`/api/organizations/${orgA}/receptionist/availability?${query}`).set("Cookie", cookieA);
  assert.equal(availability.status, 200, JSON.stringify(availability.body));
  assert.ok(availability.body.available.some((slot: { startAt: string }) => slot.startAt === start.toISOString()));
  assert.equal((await request(app).post(`/api/organizations/${orgA}/receptionist/actions`).set(dashboardHeaders).set("Cookie", cookieA)
    .send({ name: "create_appointment", arguments: { staffId, startAt: start.toISOString(), durationMinutes: 30 }, idempotencyKey: crypto.randomUUID(), confirmed: false })).status, 403);
  assert.equal((await request(app).post(`/api/organizations/${orgA}/receptionist/actions`).set(dashboardHeaders).set("Cookie", cookieA)
    .send({ name: "create_appointment", arguments: { staffId, startAt: start.toISOString(), durationMinutes: 7 }, idempotencyKey: crypto.randomUUID(), confirmed: true })).status, 422);
  const firstKey = crypto.randomUUID();
  const secondKey = crypto.randomUUID();
  const body = (idempotencyKey: string) => ({ name: "create_appointment", arguments: { staffId, startAt: start.toISOString(), durationMinutes: 30 }, idempotencyKey, confirmed: true });
  const [first, second] = await Promise.all([
    request(app).post(`/api/organizations/${orgA}/receptionist/actions`).set(dashboardHeaders).set("Cookie", cookieA).send(body(firstKey)),
    request(app).post(`/api/organizations/${orgA}/receptionist/actions`).set(dashboardHeaders).set("Cookie", cookieA).send(body(secondKey)),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  assert.equal(await Appointment.countDocuments({ organizationId: orgA, startAt: start, status: "booked" }), 1);
  const replay = await request(app).post(`/api/organizations/${orgA}/receptionist/actions`).set(dashboardHeaders).set("Cookie", cookieA).send(body(first.status === 201 ? firstKey : secondKey));
  assert.equal(replay.status, 200);
  const booked = first.status === 201 ? first.body.action.result.appointmentId : second.body.action.result.appointmentId;
  assert.equal((await request(app).get(`/api/organizations/${orgB}/receptionist/appointments`).set("Cookie", cookieB)).body.appointments.some((item: { _id: string }) => item._id === booked), false);
  await Membership.updateOne({ organizationId: orgB }, { $set: { role: "viewer" } });
  assert.equal((await request(app).get(`/api/organizations/${orgB}/receptionist/appointments`).set("Cookie", cookieB)).status, 200);
  assert.equal((await request(app).patch(`/api/organizations/${orgB}/receptionist/hours`).set(dashboardHeaders).set("Cookie", cookieB)
    .send({ timeZone: "UTC", openingHours: windows })).status, 403);
  assert.equal((await request(app).post(`/api/organizations/${orgB}/receptionist/actions`).set(dashboardHeaders).set("Cookie", cookieB)
    .send(body(crypto.randomUUID()))).status, 403);
  await Membership.updateOne({ organizationId: orgB }, { $set: { role: "owner" } });
});

test("widget action proposal books only after the same visitor confirms", async () => {
  const owner = await Membership.findOne({ organizationId: orgA, role: "owner" }).lean();
  assert.ok(owner);
  const start = new Date(Date.now() + 8 * 86_400_000);
  start.setUTCHours(9, 0, 0, 0);
  const local = new Date(start.getTime() + 3 * 3_600_000);
  const windows = [{ day: local.getUTCDay(), startMinute: 540, endMinute: 1020 }];
  await request(app).patch(`/api/organizations/${orgA}/receptionist/hours`).set(dashboardHeaders).set("Cookie", cookieA)
    .send({ timeZone: "Europe/Istanbul", openingHours: windows });
  await request(app).put(`/api/organizations/${orgA}/receptionist/staff/${owner.userId}/availability`).set(dashboardHeaders).set("Cookie", cookieA).send({ windows });
  const session = await request(app).post("/api/widget/sessions").set(websiteHeaders).send({ publicKey });
  assert.equal(session.status, 201);
  const responder = async () => ({ text: "", inputTokens: 12, outputTokens: 8,
    action: { name: "create_appointment", arguments: { staffId: owner.userId.toString(), startAt: start.toISOString(), durationMinutes: 30 } },
  });
  const actionApp = createApp(responder);
  const message = await request(actionApp).post("/api/widget/messages").set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({ text: "Please book this time", clientMessageId: crypto.randomUUID() });
  assert.equal(message.status, 201, JSON.stringify(message.body));
  assert.equal(message.body.action.status, "pending");
  assert.equal(await Appointment.countDocuments({ organizationId: orgA, startAt: start }), 0);
  const otherSession = await request(app).post("/api/widget/sessions").set(websiteHeaders).send({ publicKey });
  const denied = await request(app).post(`/api/widget/actions/${message.body.action.id}/confirm`).set(websiteHeaders)
    .set("Authorization", `Bearer ${otherSession.body.token}`).send({});
  assert.equal(denied.status, 403);
  const confirm = () => request(app).post(`/api/widget/actions/${message.body.action.id}/confirm`).set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({});
  const confirmations = await Promise.all([confirm(), confirm()]);
  assert.deepEqual(confirmations.map((item) => item.status), [200, 200]);
  const done = confirmations[0];
  assert.equal(await Appointment.countDocuments({ organizationId: orgA, startAt: start, status: "booked" }), 1);
  const saved = await request(app).get(`/api/widget/conversations/${message.body.conversationId}/messages`).set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`);
  assert.ok(saved.body.messages.some((item: { text: string }) => item.text.includes("Appointment confirmed for") && item.text.includes(start.toISOString())));
  const action = await AgentAction.findById(message.body.action.id).lean();
  assert.equal(action?.status, "completed");
  const appointmentId = done.body.action.result.appointmentId;
  const movedStart = new Date(start.getTime() + 60 * 60_000);
  const movedApp = createApp(async () => ({ text: "", inputTokens: 12, outputTokens: 8,
    action: { name: "reschedule_appointment", arguments: { appointmentId, startAt: movedStart.toISOString(), durationMinutes: 30 } },
  }));
  const move = await request(movedApp).post("/api/widget/messages").set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({ text: "Move it one hour later", conversationId: message.body.conversationId, clientMessageId: crypto.randomUUID() });
  assert.equal(move.body.action.status, "pending");
  assert.equal((await Appointment.findById(appointmentId).lean())?.startAt.toISOString(), start.toISOString());
  assert.equal((await request(app).post(`/api/widget/actions/${move.body.action.id}/confirm`).set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({})).status, 200);
  assert.equal((await Appointment.findById(appointmentId).lean())?.startAt.toISOString(), movedStart.toISOString());
  const cancelApp = createApp(async () => ({ text: "", inputTokens: 12, outputTokens: 8,
    action: { name: "cancel_appointment", arguments: { appointmentId } },
  }));
  const cancel = await request(cancelApp).post("/api/widget/messages").set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({ text: "Cancel it", conversationId: message.body.conversationId, clientMessageId: crypto.randomUUID() });
  assert.equal(cancel.body.action.status, "pending");
  assert.equal((await request(app).post(`/api/widget/actions/${cancel.body.action.id}/confirm`).set(websiteHeaders)
    .set("Authorization", `Bearer ${otherSession.body.token}`).send({})).status, 403);
  assert.equal((await request(app).post(`/api/widget/actions/${cancel.body.action.id}/confirm`).set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({})).status, 200);
  assert.equal((await Appointment.findById(appointmentId).lean())?.status, "cancelled");
});

test("customer record requires visitor confirmation and handoff persists", async () => {
  const session = await request(app).post("/api/widget/sessions").set(websiteHeaders).send({ publicKey, locale: "tr" });
  const recordApp = createApp(async () => ({ text: "", inputTokens: 10, outputTokens: 4,
    action: { name: "create_customer", arguments: { name: "Synthetic Visitor", contact: "synthetic@example.test", request: "Please call about a viewing", consentRecorded: true } },
  }));
  const record = await request(recordApp).post("/api/widget/messages").set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({ text: "You may save my details", clientMessageId: crypto.randomUUID() });
  assert.equal(record.body.action.status, "pending");
  assert.match(record.body.reply.text, /müşteri kaydını gözden geçirip onaylayın/i);
  assert.equal(await Customer.countDocuments({ organizationId: orgA, name: "Synthetic Visitor" }), 0);
  assert.equal((await request(app).post(`/api/widget/actions/${record.body.action.id}/confirm`).set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({})).status, 200);
  const customer = await Customer.findOne({ organizationId: orgA, name: "Synthetic Visitor" }).lean();
  assert.equal(customer?.consent?.source, "widget_confirmation");
  assert.equal(customer?.conversationId.toString(), record.body.conversationId);
  assert.equal((await request(app).get(`/api/organizations/${orgA}/receptionist/customers`).set("Cookie", cookieB)).status, 403);
  assert.equal((await request(app).get(`/api/organizations/${orgB}/receptionist/customers`).set("Cookie", cookieB)).body.customers.length, 0);
  assert.equal((await request(app).get(`/api/organizations/${orgA}/receptionist/actions`).set("Cookie", cookieB)).status, 403);
  const handoffApp = createApp(async () => ({ text: "", inputTokens: 9, outputTokens: 4,
    action: { name: "handoff_to_human", arguments: { reason: "Visitor requested a person" } },
  }));
  const handoff = await request(handoffApp).post("/api/widget/messages").set(websiteHeaders)
    .set("Authorization", `Bearer ${session.body.token}`).send({ text: "Please connect me to a person", conversationId: record.body.conversationId, clientMessageId: crypto.randomUUID() });
  assert.equal(handoff.status, 202, JSON.stringify(handoff.body));
  const conversation = await Conversation.findById(record.body.conversationId).lean();
  assert.equal(conversation?.status, "handoff");
});

