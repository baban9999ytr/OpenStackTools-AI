import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import express from "express";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";

process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/placeholder";
process.env.SESSION_SECRET = "test-only-secret-at-least-32-characters-long";
process.env.OPENAI_API_KEY = "test-only-key";
process.env.OPENAI_MODEL = "test-model";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "10";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "1";
process.env.DASHBOARD_ORIGIN = "http://localhost:5173";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "test@example.test";
let replset: MongoMemoryReplSet;
const { createApp } = await import("../src/app.js");
const { setMailSenderForTests } = await import("../src/services/mail.js");
const mailed = new Map<string, string>();
setMailSenderForTests(async ({ to, token }) => {
  mailed.set(to, token);
});
const { distributedLimit } = await import("../src/middleware/limits.js");
const { maximumReservationMicros } = await import("../src/services/budget.js");
const { processPendingRequests } =
  await import("../src/services/widget-queue.js");
const { runRetention } = await import("../src/services/retention.js");
const {
  WidgetRequest,
  Message,
  BudgetWindow,
  UsageEvent,
  Conversation,
  Organization,
  RateCounter,
} = await import("../src/models/index.js");
const app = createApp(async () => ({
  text: "Test answer",
  inputTokens: 8,
  outputTokens: 3,
}));
const dashboardHeaders = {
  Origin: "http://localhost:5173",
  "X-Requested-With": "XMLHttpRequest",
};
const websiteOrigin = "https://example-business.test";
const websiteHeaders = { Origin: websiteOrigin };
const cookieFrom = (response: request.Response) =>
  (response.headers["set-cookie"] as unknown as string[])[0]?.split(";")[0] ??
  "";
let orgA = "";
let orgB = "";
let cookieA = "";
let cookieB = "";
let assistantId = "";
let publicKey = "";
let conversationId = "";
let widgetToken = "";

before(async () => {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "8.0.12" },
  });
  await mongoose.connect(replset.getUri());
  await Promise.all(
    Object.values(mongoose.connection.models).map((model) => model.init()),
  );
});
after(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

test("register separate organizations and reject invalid input", async () => {
  const invalid = await request(app)
    .post("/api/auth/register")
    .set(dashboardHeaders)
    .send({
      organizationName: "A",
      name: "A",
      email: "bad",
      password: "short",
    });
  assert.equal(invalid.status, 422);
  const a = await request(app)
    .post("/api/auth/register")
    .set(dashboardHeaders)
    .send({
      organizationName: "Acme Studio",
      name: "Alice",
      email: "alice@example.test",
      password: "long-password-123",
    });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  orgA = a.body.organization.id;
  assert.equal(a.body.verificationRequired, true);
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .set(dashboardHeaders)
        .send({ email: "alice@example.test", password: "long-password-123" })
    ).status,
    403,
  );
  const verifiedA = await request(app)
    .post("/api/auth/verify-email")
    .set(dashboardHeaders)
    .send({ token: mailed.get("alice@example.test") });
  assert.equal(verifiedA.status, 200);
  cookieA = cookieFrom(verifiedA);
  assert.match(cookieA, /^ost_session=/);
  const b = await request(app)
    .post("/api/auth/register")
    .set(dashboardHeaders)
    .send({
      organizationName: "Beta Shop",
      name: "Bob",
      email: "bob@example.test",
      password: "long-password-123",
    });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  orgB = b.body.organization.id;
  const verifiedB = await request(app)
    .post("/api/auth/verify-email")
    .set(dashboardHeaders)
    .send({ token: mailed.get("bob@example.test") });
  assert.equal(verifiedB.status, 200);
  cookieB = cookieFrom(verifiedB);
  assert.notEqual(orgA, orgB);
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", cookieA)).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/auth/me")
        .set("Cookie", cookieA)
        .set(websiteHeaders)
    ).status,
    403,
  );
});

test("assistant ownership and cross-tenant authorization", async () => {
  const created = await request(app)
    .post(`/api/organizations/${orgA}/assistants`)
    .set(dashboardHeaders)
    .set("Cookie", cookieA)
    .send({
      name: "Acme Helper",
      instructions: "Answer questions about Acme and hand off when unsure.",
      allowedOrigins: [websiteOrigin],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assistantId = created.body.assistant._id;
  publicKey = created.body.assistant.publicKey;
  assert.equal(
    (
      await request(app)
        .get(`/api/organizations/${orgA}/assistants`)
        .set("Cookie", cookieB)
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/organizations/${orgA}/assistants/${assistantId}`)
        .set(dashboardHeaders)
        .set("Cookie", cookieB)
        .send({ name: "Stolen" })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/organizations/${orgB}/assistants`)
        .set("Cookie", cookieB)
    ).body.assistants.length,
    0,
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/organizations/${orgA}/assistants`)
        .set("Cookie", cookieA)
        .send({
          name: "Bad",
          instructions: "This is invalid",
          allowedOrigins: [],
        })
    ).status,
    403,
  );
});

test("widget origin, visitor isolation, AI usage and handoff", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/widget/sessions")
        .set("Origin", "https://evil.test")
        .send({ publicKey })
    ).status,
    403,
  );
  const started = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  widgetToken = started.body.token;
  const sent = await request(app)
    .post("/api/widget/messages")
    .set(websiteHeaders)
    .set("Authorization", `Bearer ${widgetToken}`)
    .send({ text: "Hello", clientMessageId: crypto.randomUUID() });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.reply.text, "Test answer");
  conversationId = sent.body.conversationId;
  const second = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey });
  assert.equal(
    (
      await request(app)
        .get(`/api/widget/conversations/${conversationId}/messages`)
        .set(websiteHeaders)
        .set("Authorization", `Bearer ${second.body.token}`)
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .get(
          `/api/organizations/${orgA}/conversations/${conversationId}/messages`,
        )
        .set("Cookie", cookieB)
    ).status,
    403,
  );
  const usage = await request(app)
    .get(`/api/organizations/${orgA}/usage`)
    .set("Cookie", cookieA);
  assert.equal(usage.body.totals.inputTokens, 8);
  const handoff = await request(app)
    .patch(`/api/organizations/${orgA}/conversations/${conversationId}/status`)
    .set(dashboardHeaders)
    .set("Cookie", cookieA)
    .send({ status: "handoff" });
  assert.equal(handoff.status, 200);
  const held = await request(app)
    .post("/api/widget/messages")
    .set(websiteHeaders)
    .set("Authorization", `Bearer ${widgetToken}`)
    .send({
      text: "Human please",
      conversationId,
      clientMessageId: crypto.randomUUID(),
    });
  assert.equal(held.status, 202);
  const reply = await request(app)
    .post(`/api/organizations/${orgA}/conversations/${conversationId}/reply`)
    .set(dashboardHeaders)
    .set("Cookie", cookieA)
    .send({ text: "A person is here." });
  assert.equal(reply.status, 201);
  assert.equal(
    (
      await request(app)
        .post(
          `/api/organizations/${orgA}/conversations/${conversationId}/reply`,
        )
        .set(dashboardHeaders)
        .set("Cookie", cookieB)
        .send({ text: "Intrusion" })
    ).status,
    403,
  );
});

test("staff role checks, login and logout", async () => {
  const staff = await request(app)
    .post(`/api/organizations/${orgA}/invitations`)
    .set(dashboardHeaders)
    .set("Cookie", cookieA)
    .send({
      email: "val@example.test",
      role: "viewer",
    });
  assert.equal(staff.status, 201, JSON.stringify(staff.body));
  const accepted = await request(app)
    .post("/api/auth/accept-invitation")
    .set(dashboardHeaders)
    .send({
      token: mailed.get("val@example.test"),
      name: "Val",
      password: "another-long-password",
    });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  const login = await request(app)
    .post("/api/auth/login")
    .set(dashboardHeaders)
    .send({ email: "val@example.test", password: "another-long-password" });
  assert.equal(login.status, 200);
  const viewerCookie = cookieFrom(login);
  assert.equal(
    (
      await request(app)
        .post(`/api/organizations/${orgA}/assistants`)
        .set(dashboardHeaders)
        .set("Cookie", viewerCookie)
        .send({
          name: "Nope",
          instructions: "Do not create me please.",
          allowedOrigins: [],
        })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/organizations/${orgA}/assistants`)
        .set("Cookie", viewerCookie)
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/logout")
        .set(dashboardHeaders)
        .set("Cookie", viewerCookie)
    ).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", viewerCookie)).status,
    401,
  );
});

test("rate limit is shared across API instances", async () => {
  const first = express();
  const second = express();
  first.use(distributedLimit("shared-test", 2, 60_000));
  second.use(distributedLimit("shared-test", 2, 60_000));
  first.get("/", (_req, res) => res.sendStatus(204));
  second.get("/", (_req, res) => res.sendStatus(204));
  assert.equal((await request(first).get("/")).status, 204);
  assert.equal((await request(second).get("/")).status, 204);
  const blocked = await request(first).get("/");
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers["retry-after"]);
});

test("daily and monthly budgets reject concurrent AI requests across visitors", async () => {
  const instructions = "Answer Beta Shop customers accurately and briefly.";
  const assistant = await request(app)
    .post(`/api/organizations/${orgB}/assistants`)
    .set(dashboardHeaders)
    .set("Cookie", cookieB)
    .send({
      name: "Beta Helper",
      instructions,
      allowedOrigins: [websiteOrigin],
    });
  assert.equal(assistant.status, 201);
  const text = "Budget guarded request";
  const reserve = maximumReservationMicros(instructions, [
    { role: "customer", text },
  ]);
  const dollars = (reserve / 1_000_000).toFixed(6);
  const configured = await request(app)
    .patch(`/api/organizations/${orgB}/budgets`)
    .set(dashboardHeaders)
    .set("Cookie", cookieB)
    .send({ dailyUsd: dollars, monthlyUsd: dollars });
  assert.equal(configured.status, 200);
  assert.equal(
    (
      await request(app)
        .patch(`/api/organizations/${orgB}/budgets`)
        .set(dashboardHeaders)
        .set("Cookie", cookieA)
        .send({ dailyUsd: "10", monthlyUsd: "10" })
    ).status,
    403,
  );
  const [firstSession, secondSession] = await Promise.all(
    [1, 2].map(() =>
      request(app)
        .post("/api/widget/sessions")
        .set(websiteHeaders)
        .send({ publicKey: assistant.body.assistant.publicKey }),
    ),
  );
  let calls = 0;
  const slowResponder = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 120));
    return { text: "Allowed", inputTokens: 8, outputTokens: 3 };
  };
  const slowApp = createApp(slowResponder);
  const replies = await Promise.all(
    [firstSession, secondSession].map((started) =>
      request(slowApp)
        .post("/api/widget/messages")
        .set(websiteHeaders)
        .set("Authorization", `Bearer ${started.body.token}`)
        .send({ text, clientMessageId: crypto.randomUUID() }),
    ),
  );
  assert.deepEqual(replies.map((reply) => reply.status).sort(), [201, 402]);
  assert.equal(calls, 1);
  const windows = await BudgetWindow.find({ organizationId: orgB });
  assert.equal(windows.length, 2);
  assert.ok(
    windows.every(
      (window) =>
        window.spentMicros <= window.limitMicros && window.reservedMicros === 0,
    ),
  );
  assert.equal(
    await UsageEvent.countDocuments({
      organizationId: orgB,
      billingStatus: "measured",
    }),
    1,
  );
  const monthlyOnly = await request(app)
    .patch(`/api/organizations/${orgB}/budgets`)
    .set(dashboardHeaders)
    .set("Cookie", cookieB)
    .send({ dailyUsd: "1", monthlyUsd: "1" });
  assert.equal(monthlyOnly.status, 200);
  await BudgetWindow.updateOne(
    { organizationId: orgB, kind: "month" },
    { $set: { spentMicros: 1_000_000, limitMicros: 1_000_000 } },
  );
  const monthlySession = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey: assistant.body.assistant.publicKey });
  const blockedMonthly = await request(slowApp)
    .post("/api/widget/messages")
    .set(websiteHeaders)
    .set("Authorization", `Bearer ${monthlySession.body.token}`)
    .send({ text, clientMessageId: crypto.randomUUID() });
  assert.equal(blockedMonthly.status, 402);
  assert.equal(calls, 1);
});

test("first-message idempotency and serialized replies survive concurrent POSTs", async () => {
  const started = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey });
  const token = started.body.token as string;
  let calls = 0;
  const slowResponder = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { text: `Reply ${calls}`, inputTokens: 8, outputTokens: 3 };
  };
  const slowApp = createApp(slowResponder);
  const clientMessageId = crypto.randomUUID();
  const submit = () =>
    request(slowApp)
      .post("/api/widget/messages")
      .set(websiteHeaders)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "First question", clientMessageId });
  const [a, b] = await Promise.all([submit(), submit()]);
  assert.ok([201, 202].includes(a.status));
  assert.ok([201, 202].includes(b.status));
  const queued = await WidgetRequest.findOne({ clientMessageId });
  assert.ok(queued);
  assert.equal(await WidgetRequest.countDocuments({ clientMessageId }), 1);
  assert.equal(await Message.countDocuments({ requestId: queued._id }), 2);
  assert.equal(calls, 1);
  const conversationId = queued.conversationId.toString();
  const next = (text: string) =>
    request(slowApp)
      .post("/api/widget/messages")
      .set(websiteHeaders)
      .set("Authorization", `Bearer ${token}`)
      .send({ text, conversationId, clientMessageId: crypto.randomUUID() });
  const [c, d] = await Promise.all([
    next("Second question"),
    next("Third question"),
  ]);
  assert.ok([201, 202].includes(c.status));
  assert.ok([201, 202].includes(d.status));
  await processPendingRequests(slowResponder);
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  assert.deepEqual(
    messages.map((message) => message.role),
    ["customer", "assistant", "customer", "assistant", "customer", "assistant"],
  );
  assert.equal(calls, 3);
});

test("failed provider attempt is conservatively charged and retried once", async () => {
  const started = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey });
  let attempts = 0;
  const responder = async () => {
    attempts++;
    if (attempts === 1) throw new Error("provider timeout");
    return { text: "Recovered", inputTokens: 8, outputTokens: 3 };
  };
  const retryApp = createApp(responder);
  const clientMessageId = crypto.randomUUID();
  const first = await request(retryApp)
    .post("/api/widget/messages")
    .set(websiteHeaders)
    .set("Authorization", `Bearer ${started.body.token}`)
    .send({ text: "Retry me", clientMessageId });
  assert.equal(first.status, 202);
  await processPendingRequests(responder);
  const queued = await WidgetRequest.findOne({ clientMessageId });
  assert.equal(queued?.status, "completed");
  assert.equal(attempts, 2);
  assert.equal(await Message.countDocuments({ requestId: queued?._id }), 2);
  assert.equal(
    await UsageEvent.countDocuments({
      requestId: queued?._id,
      billingStatus: "uncertain",
    }),
    1,
  );
  assert.equal(
    await UsageEvent.countDocuments({
      requestId: queued?._id,
      billingStatus: "measured",
    }),
    1,
  );
});

test("invitation is single use and password reset revokes sessions", async () => {
  const invited = await request(app)
    .post(`/api/organizations/${orgA}/invitations`)
    .set(dashboardHeaders)
    .set("Cookie", cookieA)
    .send({ email: "agent@example.test", role: "agent" });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  const token = mailed.get("agent@example.test");
  assert.ok(token);
  const accepted = await request(app)
    .post("/api/auth/accept-invitation")
    .set(dashboardHeaders)
    .send({ token, name: "Agent", password: "a-secure-password-123" });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  assert.equal(
    (
      await request(app)
        .post("/api/auth/accept-invitation")
        .set(dashboardHeaders)
        .send({ token, name: "Agent", password: "a-secure-password-123" })
    ).status,
    400,
  );
  const agentCookie = cookieFrom(accepted);
  assert.equal(
    (
      await request(app)
        .get(`/api/organizations/${orgA}/conversations`)
        .set("Cookie", agentCookie)
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/organizations/${orgB}/conversations`)
        .set("Cookie", agentCookie)
    ).status,
    403,
  );
  const sessions = await request(app)
    .get("/api/auth/sessions")
    .set("Cookie", agentCookie);
  assert.equal(sessions.body.sessions.length, 1);
  await request(app)
    .post("/api/auth/request-password-reset")
    .set(dashboardHeaders)
    .send({ email: "agent@example.test" });
  const resetToken = mailed.get("agent@example.test");
  const reset = await request(app)
    .post("/api/auth/reset-password")
    .set(dashboardHeaders)
    .send({ token: resetToken, password: "new-secure-password-123" });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", agentCookie)).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/reset-password")
        .set(dashboardHeaders)
        .send({ token: resetToken, password: "new-secure-password-123" })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app).post("/api/auth/login").set(dashboardHeaders).send({
        email: "agent@example.test",
        password: "new-secure-password-123",
      })
    ).status,
    200,
  );
});

test("owner export is tenant scoped and retention removes expired conversations", async () => {
  const denied = await request(app)
    .get(`/api/organizations/${orgA}/export/conversations`)
    .set("Cookie", cookieB);
  assert.equal(denied.status, 403);
  const exported = await request(app)
    .get(`/api/organizations/${orgA}/export/conversations`)
    .set("Cookie", cookieA);
  assert.equal(exported.status, 200);
  assert.ok(
    exported.body.items.every(
      (item: { organizationId: string }) => item.organizationId === orgA,
    ),
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/organizations/${orgA}/retention`)
        .set(dashboardHeaders)
        .set("Cookie", cookieB)
        .send({ days: 1 })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/organizations/${orgA}/retention`)
        .set(dashboardHeaders)
        .set("Cookie", cookieA)
        .send({ days: 1 })
    ).status,
    200,
  );
  const old = await Conversation.create({
    organizationId: orgA,
    assistantId,
    visitorId: "old-visitor",
    updatedAt: new Date("2020-01-01"),
  });
  await Message.create({
    organizationId: orgA,
    conversationId: old._id,
    role: "customer",
    text: "Expired",
  });
  await Conversation.collection.updateOne(
    { _id: old._id },
    { $set: { updatedAt: new Date("2020-01-01") } },
  );
  await runRetention(new Date());
  assert.equal(await Conversation.exists({ _id: old._id }), null);
  assert.equal(await Message.countDocuments({ conversationId: old._id }), 0);
});

test("owner can delete only their own tenant with password confirmation", async () => {
  await RateCounter.deleteMany({}); // Only the ephemeral test database; avoid unrelated auth requests reaching the shared test limit.
  const created = await request(app)
    .post("/api/auth/register")
    .set(dashboardHeaders)
    .send({
      organizationName: "Temporary Pilot",
      name: "Delete Owner",
      email: "delete@example.test",
      password: "delete-password-123",
    });
  assert.equal(created.status, 201);
  const verified = await request(app)
    .post("/api/auth/verify-email")
    .set(dashboardHeaders)
    .send({ token: mailed.get("delete@example.test") });
  const orgId = created.body.organization.id;
  const cookie = cookieFrom(verified);
  const route = `/api/organizations/${orgId}/tenant`;
  assert.equal(
    (
      await request(app)
        .delete(route)
        .set(dashboardHeaders)
        .set("Cookie", cookie)
        .send({
          organizationName: "Temporary Pilot",
          password: "wrong-password",
        })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .delete(route)
        .set(dashboardHeaders)
        .set("Cookie", cookieB)
        .send({
          organizationName: "Temporary Pilot",
          password: "delete-password-123",
        })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .delete(route)
        .set(dashboardHeaders)
        .set("Cookie", cookie)
        .send({
          organizationName: "Temporary Pilot",
          password: "delete-password-123",
        })
    ).status,
    200,
  );
  assert.equal(await Organization.exists({ _id: orgId }), null);
  assert.ok(await Organization.exists({ _id: orgA }));
});
