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
process.env.DASHBOARD_ORIGIN = "http://localhost:5173";
let replset: MongoMemoryReplSet;
const { createApp } = await import("../src/app.js");
const { distributedLimit } = await import("../src/middleware/limits.js");
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
  cookieA = cookieFrom(a);
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
  cookieB = cookieFrom(b);
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
    .post(`/api/organizations/${orgA}/members`)
    .set(dashboardHeaders)
    .set("Cookie", cookieA)
    .send({
      name: "Val",
      email: "val@example.test",
      password: "another-long-password",
      role: "viewer",
    });
  assert.equal(staff.status, 201, JSON.stringify(staff.body));
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
