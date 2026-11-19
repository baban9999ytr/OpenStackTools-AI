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

test("Responses failures expose bounded diagnostics and never retry at the SDK boundary", async () => {
  const { createOpenAIResponder, providerFailureDiagnostics } = await import("../src/services/ai.js");
  const secret = "private marker never serialize";
  const fixture = { object: "response", model: "gpt-6-luna", status: "completed", output: [],
    usage: { input_tokens: 20, output_tokens: 3 } };
  const cases = [
    { fetch: async () => Response.json({ error: { message: secret, code: secret } }, { status: 503, headers: { "x-request-id": secret } }),
      diagnostic: { reason: "provider_unavailable", category: "http_server_error", status: 503 } },
    ...([
      [400, "provider_rejected", "http_client_error"],
      [401, "provider_rejected", "http_authentication"],
      [403, "provider_rejected", "http_permission"],
      [404, "provider_model_unavailable", "http_not_found"],
      [409, "provider_unavailable", "http_client_error"],
      [422, "provider_rejected", "http_client_error"],
    ] as const).map(([status, reason, category]) => ({
      fetch: async () => Response.json({ error: { message: secret } }, { status }),
      diagnostic: { reason, category, status },
    })),
    { fetch: async () => Response.json({ error: { message: secret } }, { status: 429 }),
      diagnostic: { reason: "provider_rate_limited", category: "http_rate_limit", status: 429 } },
    { fetch: async () => Response.json({ error: { message: secret } }, { status: 408 }),
      diagnostic: { reason: "provider_unavailable", category: "http_request_timeout", status: 408 } },
    { fetch: async () => { throw new TypeError(secret); },
      diagnostic: { reason: "provider_unavailable", category: "network_error" } },
    { fetch: async () => { throw new DOMException(secret, "AbortError"); },
      diagnostic: { reason: "provider_unavailable", category: "network_timeout" } },
    { fetch: async () => new Response(secret, { headers: { "Content-Type": "application/json" } }),
      diagnostic: { reason: "provider_unavailable", category: "response_invalid_json", status: 200 } },
    { fetch: async () => Response.json({ ...fixture, output: null }),
      diagnostic: { reason: "provider_unavailable", category: "response_decode_failure", status: 200 } },
    { fetch: async () => Response.json({ ...fixture, model: null }),
      diagnostic: { reason: "provider_unavailable", category: "response_invalid_shape", status: 200 } },
    { fetch: async () => Response.json({ ...fixture, output: [{ type: "function_call", name: "search_listings", arguments: secret }] }),
      diagnostic: { reason: "provider_unavailable", category: "response_invalid_tool_call", status: 200 } },
    { fetch: async () => Response.json({ ...fixture, usage: null }),
      diagnostic: { reason: "provider_unavailable", category: "response_invalid_usage", status: 200 } },
    { fetch: async () => Response.json({ ...fixture, model: secret }),
      diagnostic: { reason: "provider_unavailable", category: "response_model_mismatch", status: 200 } },
    { fetch: async () => Response.json({ ...fixture, service_tier: "priority" }),
      diagnostic: { reason: "provider_unavailable", category: "response_tier_mismatch", status: 200 } },
    { fetch: async () => Response.json(fixture),
      diagnostic: { reason: "provider_unavailable", category: "response_empty", status: 200 } },
    { fetch: async () => Response.json({ ...fixture, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
      diagnostic: { reason: "max_output_tokens", category: "response_incomplete", status: 200,
        reportedUsage: { inputTokens: 20, outputTokens: 3, reasoningTokens: 0, cachedInputTokens: 0 } } },
  ];
  for (const { fetch, diagnostic } of cases) {
    const mock = test.mock.fn<typeof globalThis.fetch>(fetch);
    const responder = createOpenAIResponder({ model: "gpt-6-luna", endpoint: "responses",
      apiKey: "inert-fixture", maxCompletionTokens: 512, fetch: mock });
    await assert.rejects(responder("Synthetic instructions", []), (error: unknown) => {
      const actual = providerFailureDiagnostics(error);
      assert.deepEqual(actual, diagnostic);
      assert.doesNotMatch(JSON.stringify(actual), /private marker/);
      return true;
    }, diagnostic.category);
    assert.equal(mock.mock.callCount(), 1, diagnostic.category);
  }
  for (const status of [399.5, "503", null, Infinity, 600]) {
    assert.deepEqual(providerFailureDiagnostics({ status, code: secret, message: secret }),
      { reason: "provider_unavailable", category: "unknown_error" });
  }
});
