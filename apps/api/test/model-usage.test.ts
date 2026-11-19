import { test } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";

process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/unused-model-test";
process.env.DASHBOARD_ORIGIN = "https://staging.example.invalid";
process.env.SESSION_SECRET = "model-test-only-secret-at-least-32-characters";
process.env.OPENAI_API_KEY = "unused-model-test-key";
process.env.OPENAI_MODEL = "gpt-6-luna";
process.env.OPENAI_REASONING_EFFORT = "none";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "1";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "0.10";
process.env.OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS = "0.01";
process.env.OPENAI_CACHE_WRITE_USD_PER_MILLION_TOKENS = "0.125";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "0.50";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "Test <no-reply@example.invalid>";

const { parseAIReply, providerFailurePolicy } = await import("../src/services/ai.js");
const { measuredCostMicros, maximumReservationMicros } = await import("../src/services/budget.js");
const { parseAction, actionReply } = await import("../src/services/agent-actions.js");

const response = (usage: Record<string, unknown>) => ({
  choices: [{ message: { content: "Synthetic response" } }],
  service_tier: "default",
  usage,
}) as unknown as OpenAI.Chat.Completions.ChatCompletion;

test("cached and reasoning usage is measured without double counting", () => {
  const reply = parseAIReply(response({
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 400, cache_write_tokens: 100 },
    completion_tokens_details: { reasoning_tokens: 50 },
  }));
  assert.equal(reply.usageBreakdownKnown, true);
  assert.equal(reply.reasoningTokens, 50);
  assert.equal(measuredCostMicros(reply.inputTokens, reply.outputTokens, reply), 167);
  assert.ok(maximumReservationMicros("Answer briefly", [{ role: "customer", text: "Hello" }]) >= 167);
});

test("missing cache breakdown uses the highest configured input rate", () => {
  const reply = parseAIReply(response({ prompt_tokens: 1000, completion_tokens: 200 }));
  assert.equal(reply.usageBreakdownKnown, false);
  assert.equal(measuredCostMicros(reply.inputTokens, reply.outputTokens, reply), 225);
});

test("invalid or missing usage cannot be settled as a measured reply", () => {
  assert.throws(() => parseAIReply(response({ prompt_tokens: 10, completion_tokens: 2,
    prompt_tokens_details: { cached_tokens: 8, cache_write_tokens: 8 } })), /usage details/);
  assert.throws(() => parseAIReply(response({ prompt_tokens: 10, completion_tokens: 2,
    completion_tokens_details: { reasoning_tokens: 3 } })), /usage details/);
  assert.throws(() => parseAIReply(response({})), /valid usage/);
  assert.throws(() => parseAIReply({ ...response({ prompt_tokens: 1, completion_tokens: 1 }), service_tier: "priority" }), /service tier/);
  assert.throws(() => measuredCostMicros(100, 10, { cachedInputTokens: 101, usageBreakdownKnown: true }), /breakdown/);
});

test("unavailable model fails clearly without automatic replay", () => {
  assert.deepEqual(providerFailurePolicy({ status: 404 }), {
    code: "provider_model_unavailable", retry: false, uncertain: false,
  });
});

test("a single provider function call is parsed as data, never executed by the adapter", () => {
  const fixture = response({ prompt_tokens: 20, completion_tokens: 10 });
  const completion = { ...fixture, choices: [{ message: { content: null,
    tool_calls: [{ id: "call-1", type: "function", function: { name: "check_availability",
      arguments: JSON.stringify({ staffId: "507f1f77bcf86cd799439011", date: "2027-02-01", durationMinutes: 30 }),
    } }],
  } }] } as unknown as OpenAI.Chat.Completions.ChatCompletion;
  const reply = parseAIReply(completion);
  assert.equal(reply.action?.name, "check_availability");
  assert.equal(reply.text, "");
  assert.equal(reply.inputTokens, 20);
});

test("action registry rejects unknown names, extra fields and unsupported durations", () => {
  assert.throws(() => parseAction("run_code", { command: "echo unsafe" }), /invalid_action/);
  assert.throws(() => parseAction("create_appointment", { staffId: "507f1f77bcf86cd799439011", startAt: "2027-02-01T09:00:00Z", durationMinutes: 7 }), /invalid_arguments/);
  assert.throws(() => parseAction("cancel_appointment", { appointmentId: "507f1f77bcf86cd799439011", extra: true }), /invalid_arguments/);
  assert.throws(() => parseAction("search_listings", { budgetMax: 100000 }), /invalid_arguments/);
  assert.throws(() => parseAction("search_listings", { $where: "return true" }), /invalid_arguments/);
});

test("confirmed action replies follow the widget session language", () => {
  assert.match(actionReply({ name: "create_appointment", status: "pending", locale: "tr" }), /Henüz randevu oluşturulmadı/);
  assert.match(actionReply({ name: "create_appointment", status: "completed", locale: "tr", result: { appointmentId: "123" } }), /Randevunuz oluşturuldu/);
  assert.match(actionReply({ name: "create_appointment", status: "pending", locale: "en" }), /No booking has been made/);
});
