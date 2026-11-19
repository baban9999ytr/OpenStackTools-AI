import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "production";
process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/unused-test";
process.env.DASHBOARD_ORIGIN = "https://staging.example.invalid";
process.env.SESSION_SECRET = "production-config-test-only-secret-32-chars";
process.env.OPENAI_API_KEY = "unused-test-key";
process.env.OPENAI_MODEL = "unused-test-model";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "1";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "1";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "Test <no-reply@example.invalid>";

const { cookieName, cookieOptions, requireDashboardOrigin } = await import("../src/middleware/security.js");
const { accountLink } = await import("../src/services/mail.js");
const { env } = await import("../src/config/env.js");

test("production cookie and links remain host-only, secure, and same-origin", async () => {
  assert.equal(env.cookieSecure, true);
  assert.equal(env.smtpRequireTls, true);
  assert.equal(accountLink("invite", "example-token"), "https://staging.example.invalid/app/#invite=example-token");
  const app = express();
  app.get("/cookie", (_req, res) => res.cookie(cookieName, "test-value", cookieOptions).sendStatus(204));
  app.post("/mutation", requireDashboardOrigin, (_req, res) => res.sendStatus(204));
  const response = await request(app).get("/cookie");
  const setCookie = (response.headers["set-cookie"] as unknown as string[])[0] ?? "";
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, /Domain=/);
  assert.equal((await request(app).post("/mutation").set("Origin", "https://foreign.example.invalid").set("X-Requested-With", "XMLHttpRequest")).status, 403);
  assert.equal((await request(app).post("/mutation").set("Origin", env.dashboardOrigin)).status, 403);
  assert.equal((await request(app).post("/mutation").set("Origin", env.dashboardOrigin).set("X-Requested-With", "XMLHttpRequest")).status, 204);
});

test("models without Chat Completions tool calling fail at startup", () => {
  const checked = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `import ${JSON.stringify(new URL("../src/config/env.ts", import.meta.url).href)}`],
  { env: { ...process.env, OPENAI_MODEL: "gpt-6.1-sol", OPENAI_REASONING_EFFORT: "medium" }, encoding: "utf8" });
  assert.notEqual(checked.status, 0);
  assert.match(checked.stderr, /requires a Responses API adapter/);
});
