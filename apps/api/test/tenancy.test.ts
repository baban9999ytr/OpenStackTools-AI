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
const { accountLink } = await import("../src/services/mail.js");
const { accountMailContent } = await import("../src/services/mail.js");
const { safeError } = await import("../src/config/logger.js");
const { tokenHash } = await import("../src/services/tokens.js");
const mailed = new Map<string, string>();
let mailFails = false;
setMailSenderForTests(async ({ to, token }) => {
  if (mailFails) throw new Error("sandbox SMTP outage with sensitive detail");
  mailed.set(to, token);
});
const { distributedLimit } = await import("../src/middleware/limits.js");
const { maximumReservationMicros } = await import("../src/services/budget.js");
const { processPendingRequests, buildReceptionistInstructions } =
  await import("../src/services/widget-queue.js");
const { runRetention } = await import("../src/services/retention.js");
const {
  WidgetRequest,
  Message,
  BudgetWindow,
  UsageEvent,
  Conversation,
  Organization,
  AuditEvent,
  RateCounter,
  AccountToken,
  Session,
  Membership,
  User,
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
  assert.equal(
    accountLink("verify", "test token"),
    "http://localhost:5173/app/#verify=test%20token",
  );
  assert.equal(accountLink("reset", "reset-token"), "http://localhost:5173/app/#reset=reset-token");
  assert.equal(accountLink("invite", "invite-token"), "http://localhost:5173/app/#invite=invite-token");
  const content = accountMailContent("reset", "token <&\"");
  assert.match(content.text, /\/app\/#reset=token%20%3C%26%22/);
  assert.doesNotMatch(content.html, /token <&"/);
  assert.equal(JSON.stringify(safeError(new Error("secret customer message"))).includes("secret customer message"), false);
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
  assert.match(invalid.headers["x-request-id"] ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(invalid.headers["cache-control"], "no-store");
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
  const sessionCookie =
    (verifiedA.headers["set-cookie"] as unknown as string[])[0] ?? "";
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.doesNotMatch(sessionCookie, /Domain=/);
  assert.equal(
    (
      await request(app)
        .post("/api/auth/logout")
        .set("Cookie", cookieA)
        .set("Origin", "https://untrusted.test")
        .set("X-Requested-With", "XMLHttpRequest")
    ).status,
    403,
  );
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
      tone: "warm", defaultLanguage: "auto", bookingNameRequired: true,
      defaultAppointmentDurationMinutes: 30, emojiUsage: "none", greetingStyle: "brief",
      allowedOrigins: [websiteOrigin],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assistantId = created.body.assistant._id;
  publicKey = created.body.assistant.publicKey;
  assert.equal(created.body.assistant.bookingNameRequired, true);
  assert.equal(created.body.assistant.defaultAppointmentDurationMinutes, 30);
  assert.equal((await request(app).patch(`/api/organizations/${orgA}/assistants/${assistantId}`)
    .set(dashboardHeaders).set("Cookie", cookieA).send({ tone: "concierge", bookingNameRequired: false })).body.assistant.tone, "concierge");
  assert.equal((await request(app).patch(`/api/organizations/${orgA}/assistants/${assistantId}`)
    .set(dashboardHeaders).set("Cookie", cookieA).send({ defaultAppointmentDurationMinutes: 7 })).status, 422);
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

test("four product modes persist and Automatic executes through the durable queue with actual model accounting", async () => {
  const isolated = await Organization.create({ name: "Synthetic routing organization", dailyBudgetMicros: 10000000, monthlyBudgetMicros: 100000000 });
  const orgA = isolated._id.toString();
  const owner = await User.findOne({ email: "alice@example.test" });
  await Membership.create({ organizationId: orgA, userId: owner!._id, role: "owner" });
  const { Assistant } = await import("../src/models/index.js");
  const { processWidgetRequest } = await import("../src/services/widget-queue.js");
  const { createOpenAIResponder } = await import("../src/services/ai.js");
  process.env.AI_ENABLED_MODELS = "gpt-6-luna,gpt-6.1-sol,gpt-6-astra";
  process.env.AI_VERIFIED_MODELS = "gpt-6-luna,gpt-6.1-sol";
  const org = await Organization.findById(orgA).lean();
  let automaticId = "";
  try {
    for (const choice of ["normal", "powerful", "automatic", "very_powerful"]) {
      const response = await request(app).post(`/api/organizations/${orgA}/assistants`).set(dashboardHeaders).set("Cookie", cookieA)
        .send({ name: "Synthetic product mode", instructions: "Answer only verified questions.", allowedOrigins: [], modelSelection: { mode: "product", choice } });
      assert.equal(response.status, choice === "very_powerful" ? 422 : 201);
      if (choice === "automatic") automaticId = response.body.assistant._id;
      if (response.status === 201) {
        assert.deepEqual(response.body.assistant.modelSelection, { mode: "product", choice });
        assert.equal((await Assistant.findById(response.body.assistant._id))?.modelSelection.choice, choice);
        assert.equal((await request(app).patch(`/api/organizations/${orgA}/assistants/${response.body.assistant._id}`)
          .set(dashboardHeaders).set("Cookie", cookieB).send({ modelSelection: { mode: "product", choice: "normal" } })).status, 403);
      }
    }
    for (const choice of ["normal", "powerful", "automatic"]) {
      const patched = await request(app).patch(`/api/organizations/${orgA}/assistants/${automaticId}`)
        .set(dashboardHeaders).set("Cookie", cookieA).send({ modelSelection: { mode: "product", choice } });
      assert.equal(patched.status, 200);
      assert.equal((await Assistant.findById(automaticId))?.modelSelection.choice, choice);
    }
    assert.equal((await request(app).patch(`/api/organizations/${orgA}/assistants/${automaticId}`)
      .set(dashboardHeaders).set("Cookie", cookieA).send({ modelSelection: { mode: "product", choice: "very_powerful" } })).status, 422);
    const options = await request(app).get(`/api/organizations/${orgA}/model-options`).set("Cookie", cookieA);
    assert.equal(options.body.productModes.find((item: {choice: string}) => item.choice === "very_powerful").available, false);
    process.env.AI_VERIFIED_MODELS += ",gpt-6-astra";
    const astra = await request(app).post(`/api/organizations/${orgA}/assistants`).set(dashboardHeaders).set("Cookie", cookieA)
      .send({ name: "Synthetic Astra", instructions: "Use verified facts only.", allowedOrigins: [],
        modelSelection: { mode: "product", choice: "very_powerful" } });
    assert.equal(astra.status, 201);
    assert.equal((await Assistant.findById(astra.body.assistant._id))?.modelSelection.choice, "very_powerful");
    let calls = 0;
    const responder = createOpenAIResponder({ model: "unused", apiKey: "synthetic-only", maxCompletionTokens: 800,
      fetch: async (_url, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "gpt-6-luna", "Automatic must not escalate even when premium models are allowed");
        return new Response(JSON.stringify({ id: "resp_synthetic", object: "response", output_text: "Synthetic verified reply", status: "completed", model: body.model, service_tier: "default",
          output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Synthetic verified reply", annotations: [] }] }],
          usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 0 } } }),
          { headers: { "content-type": "application/json" } });
      } });
    const send = async () => {
      const conversation = await Conversation.create({ organizationId: orgA, assistantId: automaticId, visitorId: "synthetic-router" });
      const queued = await WidgetRequest.create({ organizationId: orgA, assistantId: automaticId, conversationId: conversation._id,
        visitorId: "synthetic-router", clientMessageId: crypto.randomUUID(), text: "Explain how this business can help." });
      await processWidgetRequest(queued._id, responder);
      return WidgetRequest.findById(queued._id).lean();
    };
    await Organization.updateOne({ _id: orgA }, { $set: { dailyBudgetMicros: 10000000, monthlyBudgetMicros: 100000000 }, $unset: { allowedModels: 1 } });
    const completed = await send();
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.aiModel, "gpt-6-luna");
    assert.equal(completed?.aiRoutingPolicy, "astra-routing-v1");
    const usage = await UsageEvent.findOne({ requestId: completed?._id }).lean();
    assert.equal(usage?.model, "gpt-6-luna");
    assert.equal(usage?.inputTokens, 10);
    assert.equal(calls, 1);
    await processWidgetRequest(completed!._id, responder);
    assert.equal(calls, 1, "completed durable requests cannot repeat a provider call");
    await Organization.updateOne({ _id: orgA }, { $set: { dailyBudgetMicros: 1 } });
    assert.equal((await send())?.errorCode, "budget_exhausted");
    assert.equal(calls, 1);
    await Organization.updateOne({ _id: orgA }, { $set: { dailyBudgetMicros: 10000000, allowedModels: ["gpt-6.1-sol"] } });
    assert.equal((await send())?.status, "failed");
    assert.equal(calls, 1);
    await Organization.updateOne({ _id: orgA }, { $unset: { allowedModels: 1 } });
    process.env.AI_ENABLED_MODELS = "gpt-6.1-sol";
    assert.equal((await send())?.status, "failed");
    assert.equal(calls, 1);
    process.env.AI_ENABLED_MODELS = "gpt-6-luna,gpt-6.1-sol";
    delete process.env.AI_VERIFIED_MODELS;
    assert.equal((await send())?.status, "failed");
    assert.equal(calls, 1);
  } finally {
    await Organization.updateOne({ _id: orgA }, { $set: { dailyBudgetMicros: org!.dailyBudgetMicros, monthlyBudgetMicros: org!.monthlyBudgetMicros }, $unset: { allowedModels: 1 } });
    delete process.env.AI_ENABLED_MODELS;
    delete process.env.AI_VERIFIED_MODELS;
  }
});

test("assistant model profiles validate, persist, isolate tenants and reject stale updates", async () => {
  process.env.AI_ENABLED_MODELS = "gpt-6-luna,gpt-6.1-terra,gpt-6.1-sol";
  try {
    const base = `/api/organizations/${orgA}/assistants`;
    const options = await request(app).get(`/api/organizations/${orgA}/model-options`).set("Cookie", cookieA);
    assert.equal(options.status, 200);
    assert.equal(options.body.defaultSelection.profile, "balanced");
    assert.equal((await request(app).get(`/api/organizations/${orgA}/model-options`).set("Cookie", cookieB)).status, 403);
    for (const profile of ["economical", "balanced", "advanced"]) {
      const created = await request(app).post(base).set(dashboardHeaders).set("Cookie", cookieA).send({
        name: `${profile} test assistant`, instructions: "Help this synthetic visitor safely.", allowedOrigins: [],
        modelSelection: { mode: "preset", profile },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.assistant.modelSelection.profile, profile);
      const id = created.body.assistant._id;
      assert.equal((await request(app).patch(`${base}/${id}`).set(dashboardHeaders).set("Cookie", cookieB)
        .send({ modelSelection: { mode: "preset", profile: "advanced" } })).status, 403);
      if (profile === "balanced") {
        const custom = await request(app).patch(`${base}/${id}`).set(dashboardHeaders).set("Cookie", cookieA).send({
          settingsVersion: 0, modelSelection: { mode: "custom", profile: "balanced", model: "gpt-6.1-terra",
            reasoningEffort: "low", processingTier: "default" },
        });
        assert.equal(custom.status, 200);
        assert.equal(custom.body.assistant.modelSelection.reasoningEffort, "low");
        assert.equal((await request(app).patch(`${base}/${id}`).set(dashboardHeaders).set("Cookie", cookieA)
          .send({ settingsVersion: 0, modelSelection: { mode: "preset", profile: "economical" } })).status, 409);
        assert.equal((await request(app).patch(`${base}/${id}`).set(dashboardHeaders).set("Cookie", cookieA)
          .send({ modelSelection: { mode: "preset", profile: "balanced" } })).status, 200);
      }
    }
    assert.equal((await request(app).post(base).set(dashboardHeaders).set("Cookie", cookieA).send({
      name: "Default profile", instructions: "Help this synthetic visitor safely.", allowedOrigins: [],
    })).body.assistant.modelSelection.profile, "balanced");
    assert.equal((await request(app).patch(`${base}/${assistantId}`).set(dashboardHeaders).set("Cookie", cookieA)
      .send({ modelSelection: { mode: "custom", profile: "advanced", model: "gpt-6.1-sol",
        reasoningEffort: "none", processingTier: "default" } })).status, 422);
    assert.equal((await request(app).patch(`${base}/${assistantId}`).set(dashboardHeaders).set("Cookie", cookieA)
      .send({ modelSelection: { mode: "custom", profile: "balanced", model: "gpt-6.1-terra",
        reasoningEffort: "medium", processingTier: "priority" } })).status, 422);
    await Organization.updateOne({ _id: orgA }, { $set: { allowedModels: ["gpt-6-luna"] } });
    assert.equal((await request(app).patch(`${base}/${assistantId}`).set(dashboardHeaders).set("Cookie", cookieA)
      .send({ modelSelection: { mode: "preset", profile: "advanced" } })).status, 422);
  } finally {
    await Organization.updateOne({ _id: orgA }, { $unset: { allowedModels: 1 } });
    delete process.env.AI_ENABLED_MODELS;
  }
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
  assert.match(started.headers["access-control-expose-headers"] ?? "", /Retry-After/);
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
  assert.equal((await request(app).get(`/api/organizations/${orgA}/budgets`).set("Cookie", viewerCookie)).status, 403);
  assert.equal((await request(app).get(`/api/organizations/${orgA}/usage`).set("Cookie", viewerCookie)).status, 403);
  assert.equal((await request(app).get(`/api/organizations/${orgB}/budgets`).set("Cookie", viewerCookie)).status, 403);
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

test("ordinary widget polling cannot exhaust the message submission quota", async () => {
  const session = await request(app).post("/api/widget/sessions").set(websiteHeaders).send({ publicKey });
  assert.equal(session.status, 201);
  const headers = { ...websiteHeaders, Authorization: `Bearer ${session.body.token}` };
  const first = await request(app).post("/api/widget/messages").set(headers)
    .send({ text: "Start a separate chat", clientMessageId: crypto.randomUUID() });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  for (let index = 0; index < 45; index++) {
    const path = index % 3 === 0 ? "/api/widget/sessions/current" : index % 3 === 1
      ? `/api/widget/conversations/${first.body.conversationId}/messages` : "/api/widget/actions/pending";
    const poll = await request(app).get(path).set(headers);
    assert.equal(poll.status, 200, `poll ${index}: ${JSON.stringify(poll.body)}`);
  }
  const sent = await request(app).post("/api/widget/messages").set(headers)
    .send({ text: "Second message after polling", conversationId: first.body.conversationId, clientMessageId: crypto.randomUUID() });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(Number(sent.headers["ratelimit-limit"]), 10);
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
  const org = await Organization.findById(orgB).lean();
  const staffMembers = await Membership.find({ organizationId: orgB, role: { $in: ["owner", "admin", "agent"] } }).lean();
  const staffUsers = await User.find({ _id: { $in: staffMembers.map((member) => member.userId) } }).select("name").lean();
  const fullInstructions = buildReceptionistInstructions(instructions, org?.timeZone ?? "UTC",
    staffUsers.map((user) => ({ name: user.name, id: user._id.toString() })));
  const reserve = maximumReservationMicros(fullInstructions, [
    { role: "customer", text },
  ], (await import("../src/services/model-config.js")).resolveModel(assistant.body.assistant.modelSelection));
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

test("ambiguous provider failure is charged conservatively and never replayed", async () => {
  const started = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey });
  let attempts = 0;
  const responder = async () => {
    attempts++;
    throw new Error("provider timeout with sensitive details");
  };
  const retryApp = createApp(responder);
  const clientMessageId = crypto.randomUUID();
  const first = await request(retryApp)
    .post("/api/widget/messages")
    .set(websiteHeaders)
    .set("Authorization", `Bearer ${started.body.token}`)
    .send({ text: "Retry me", clientMessageId });
  assert.equal(first.status, 502);
  assert.equal(first.body.error, "Assistant temporarily unavailable");
  assert.equal(JSON.stringify(first.body).includes("sensitive details"), false);
  await processPendingRequests(responder);
  const queued = await WidgetRequest.findOne({ clientMessageId });
  assert.equal(queued?.status, "failed");
  assert.equal(queued?.errorCode, "provider_unavailable");
  assert.equal(attempts, 1);
  assert.equal(await Message.countDocuments({ requestId: queued?._id }), 1);
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
    0,
  );
});

test("provider 429 is retried once without uncertain billing", async () => {
  const started = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey });
  let attempts = 0;
  const responder = async () => {
    attempts++;
    if (attempts === 1)
      throw Object.assign(new Error("provider rate limit"), { status: 429 });
    return {
      text: "Recovered", inputTokens: 8, outputTokens: 3,
      cachedInputTokens: 2, cacheWriteTokens: 1, reasoningTokens: 1,
      usageBreakdownKnown: true,
    };
  };
  const retryApp = createApp(responder);
  const clientMessageId = crypto.randomUUID();
  const first = await request(retryApp)
    .post("/api/widget/messages")
    .set(websiteHeaders)
    .set("Authorization", `Bearer ${started.body.token}`)
    .send({ text: "Retry after rate limit", clientMessageId });
  assert.equal(first.status, 202);
  await processPendingRequests(responder);
  const queued = await WidgetRequest.findOne({ clientMessageId });
  assert.equal(queued?.status, "completed");
  assert.equal(attempts, 2);
  assert.equal(await UsageEvent.countDocuments({ requestId: queued?._id, billingStatus: "uncertain" }), 0);
  assert.equal(await UsageEvent.countDocuments({ requestId: queued?._id, billingStatus: "measured" }), 1);
  const usage = await UsageEvent.findOne({ requestId: queued?._id }).lean();
  assert.equal(usage?.cachedInputTokens, 2);
  assert.equal(usage?.cacheWriteTokens, 1);
  assert.equal(usage?.reasoningTokens, 1);
  assert.equal(usage?.usageBreakdownKnown, true);
});

test("unavailable model returns a generic error without replay or cost", async () => {
  const started = await request(app)
    .post("/api/widget/sessions")
    .set(websiteHeaders)
    .send({ publicKey });
  let attempts = 0;
  const providerApp = createApp(async () => {
    attempts++;
    throw Object.assign(new Error("model identifier is private"), { status: 404 });
  });
  const clientMessageId = crypto.randomUUID();
  const result = await request(providerApp)
    .post("/api/widget/messages")
    .set(websiteHeaders)
    .set("Authorization", `Bearer ${started.body.token}`)
    .send({ text: "Can you answer?", clientMessageId });
  assert.equal(result.status, 502);
  assert.equal(JSON.stringify(result.body).includes("model identifier"), false);
  await processPendingRequests(async () => {
    attempts++;
    throw new Error("Unexpected replay");
  });
  const queued = await WidgetRequest.findOne({ clientMessageId });
  assert.equal(queued?.status, "failed");
  assert.equal(queued?.errorCode, "provider_model_unavailable");
  assert.equal(attempts, 1);
  assert.equal(await UsageEvent.countDocuments({ requestId: queued?._id }), 0);
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
  const expiredToken = "expired-reset-link-token-at-least-32-chars";
  await AccountToken.create({
    tokenHash: tokenHash(expiredToken),
    purpose: "reset",
    email: "agent@example.test",
    expiresAt: new Date(Date.now() - 1000),
  });
  await RateCounter.deleteMany({});
  assert.equal((await request(app).post("/api/auth/reset-password").set(dashboardHeaders).send({ token: expiredToken, password: "another-secure-password-123" })).status, 400);
});

test("SMTP outage does not reveal reset account existence or leave usable links", async () => {
  await RateCounter.deleteMany({});
  const before = await AccountToken.countDocuments({ purpose: "reset", email: "alice@example.test" });
  mailFails = true;
  try {
    const known = await request(app)
      .post("/api/auth/request-password-reset")
      .set(dashboardHeaders)
      .send({ email: "alice@example.test" });
    const unknown = await request(app)
      .post("/api/auth/request-password-reset")
      .set(dashboardHeaders)
      .send({ email: "nobody@example.test" });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(known.body, unknown.body);
    assert.equal(await AccountToken.countDocuments({ purpose: "reset", email: "alice@example.test" }), before);
    const invite = await request(app)
      .post(`/api/organizations/${orgA}/invitations`)
      .set(dashboardHeaders)
      .set("Cookie", cookieA)
      .send({ email: "offline@example.test", role: "viewer" });
    assert.equal(invite.status, 503);
    assert.equal(JSON.stringify(invite.body).includes("sensitive detail"), false);
    assert.equal(await AccountToken.countDocuments({ purpose: "invite", email: "offline@example.test" }), 0);
  } finally {
    mailFails = false;
  }
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
  for (
    let attempt = 0;
    attempt < 20 &&
    !(await AuditEvent.exists({
      organizationId: orgA,
      target: { $regex: "/retention$" },
    }));
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(
    await AuditEvent.exists({
      organizationId: orgA,
      target: { $regex: "/retention$" },
    }),
  );
  const old = await Conversation.create({
    organizationId: orgA,
    assistantId,
    visitorId: "old-visitor",
    workflow: { visitorName: "Synthetic private name",
      visitorNameSourceRequestId: new mongoose.Types.ObjectId(), pendingQuestion: "customer_name" },
    updatedAt: new Date("2020-01-01"),
  });
  assert.equal((await Conversation.findById(old._id).lean())?.workflow?.visitorName, "Synthetic private name");
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

test("readiness fails closed when MongoDB disconnects", async () => {
  assert.equal((await request(app).get("/health/ready")).status, 200);
  await mongoose.disconnect();
  try {
    const response = await request(app).get("/health/ready");
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { status: "unavailable" });
  } finally {
    await mongoose.connect(replset.getUri());
  }
});

test("expired staff session is rejected", async () => {
  const sessionValue = cookieA.split("=")[1];
  assert.ok(sessionValue);
  await Session.updateOne({ tokenHash: tokenHash(sessionValue) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", cookieA)).status, 401);
});
