import { test } from "node:test";
import assert from "node:assert/strict";
process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/unused-model-profiles";
process.env.DASHBOARD_ORIGIN = "http://localhost:5173";
process.env.SESSION_SECRET = "model-profiles-test-secret-at-least-32-characters";
process.env.OPENAI_API_KEY = "unused-model-profiles-key";
process.env.OPENAI_MODEL = "gpt-6-luna";
process.env.OPENAI_REASONING_EFFORT = "none";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "10";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "0.1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "0.5";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "Test <no-reply@example.invalid>";
process.env.AI_ENABLED_MODELS = "gpt-6-luna,gpt-6.1-terra,gpt-6.1-sol";
process.env.AI_MAX_REASONING_EFFORT = "medium";

const { resolveModel, newAssistantSelection, modelRegistry, pricingVersion } = await import("../src/services/model-config.js");
const { maximumReservationMicros, measuredCostMicros } = await import("../src/services/budget.js");
const { createOpenAIResponder } = await import("../src/services/ai.js");

test("organization policy cannot raise the platform reasoning ceiling", () => {
  assert.throws(() => resolveModel({ mode: "custom", profile: "advanced", model: "gpt-6.1-sol",
    reasoningEffort: "high", processingTier: "default" }, ["gpt-6.1-sol"], "max"), /organization limit/);
  assert.throws(() => resolveModel({ mode: "preset", profile: "advanced" }, ["gpt-6.1-sol"], "low"), /organization limit/);
});

test("three profiles, compatibility, organization policy and legacy preservation", () => {
  assert.deepEqual(newAssistantSelection(), { mode: "preset", profile: "balanced" });
  for (const [profile, model] of Object.entries({ economical: "gpt-6-luna", balanced: "gpt-6.1-terra", advanced: "gpt-6.1-sol" })) {
    const result = resolveModel({ mode: "preset", profile });
    assert.equal(result.model, model);
    assert.equal(result.reasoningEffort, "medium");
    assert.equal(result.pricingVersion, pricingVersion);
  }
  assert.equal(resolveModel(undefined).model, "gpt-6-luna");
  assert.throws(() => resolveModel({ mode: "preset", profile: "advanced" }, ["gpt-6-luna"]), /not allowed/);
  assert.throws(() => resolveModel({ mode: "custom", profile: "advanced", model: "gpt-6.1-sol",
    reasoningEffort: "none", processingTier: "default" }), /Unsupported/);
  assert.throws(() => resolveModel({ mode: "custom", profile: "balanced", model: "gpt-6.1-terra",
    reasoningEffort: "max", processingTier: "default" }), /organization limit/);
  assert.throws(() => resolveModel({ mode: "custom", profile: "balanced", model: "gpt-6.1-terra",
    reasoningEffort: "medium", processingTier: "priority" }), /invalid_union|Invalid input/);
  assert.equal(modelRegistry["gpt-6.1-sol"].endpoint, "responses");
});

test("model-specific prices control reservation and measured usage", () => {
  const luna = resolveModel({ mode: "preset", profile: "economical" });
  const sol = resolveModel({ mode: "preset", profile: "advanced" });
  const history = [{ role: "customer" as const, text: "Hello" }];
  assert.ok(maximumReservationMicros("Be helpful", history, sol) > maximumReservationMicros("Be helpful", history, luna));
  assert.equal(measuredCostMicros(1000, 200, {}, sol), 5000 + 2000);
  assert.equal(measuredCostMicros(1000, 200, { cachedInputTokens: 500, usageBreakdownKnown: true }, sol), 1000 + 50 + 2000);
});

test("Responses request sends saved model and effort with function tools; synthesis has no tools", async () => {
  const requests: Record<string, unknown>[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(body);
    const tool = Array.isArray(body.tools);
    return new Response(JSON.stringify({ id: "resp_fixture", object: "response", status: "completed",
      model: body.model, service_tier: "default", output_text: tool ? "" : "Verified response",
      output: tool ? [{ type: "function_call", name: "get_business_knowledge", arguments: '{"topic":"hours"}', call_id: "call_fixture" }]
        : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Verified response", annotations: [] }] }],
      usage: { input_tokens: 12, output_tokens: 6, input_tokens_details: { cached_tokens: 2 },
        output_tokens_details: { reasoning_tokens: 1 } } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const responder = createOpenAIResponder({ model: "gpt-6-luna", reasoningEffort: "none", maxCompletionTokens: 128,
    apiKey: "fixture", fetch: fakeFetch }).forModel!(resolveModel({ mode: "preset", profile: "advanced" }));
  const reply = await responder("Safe instructions", [{ role: "customer", text: "What are your hours?" }]);
  assert.equal(reply.model, "gpt-6.1-sol");
  assert.equal(reply.action?.name, "get_business_knowledge");
  assert.equal(reply.reasoningTokens, 1);
  assert.equal(requests[0]?.model, "gpt-6.1-sol");
  assert.deepEqual(requests[0]?.reasoning, { effort: "medium" });
  assert.equal(requests[0]?.service_tier, "default");
  assert.ok(Array.isArray(requests[0]?.tools));
  const synthesis = await responder.synthesize!("Safe instructions", [{ role: "customer", text: "Hours?" }], '{"hours":"09:00-17:00"}');
  assert.equal(synthesis.text, "Verified response");
  assert.equal(requests[1]?.tools, undefined);
});

test("product modes require verified access, valid prices and effective reasoning policy", () => {
  process.env.AI_VERIFIED_MODELS = "gpt-6-luna,gpt-6.1-sol";
  const price = modelRegistry["gpt-6-luna"].prices.input;
  try {
    assert.equal(resolveModel({ mode: "product", choice: "automatic" }).model, "gpt-6-luna");
    assert.throws(() => resolveModel({ mode: "product", choice: "automatic" }, ["gpt-6.1-sol"]), /policy/);
    assert.throws(() => resolveModel({ mode: "product", choice: "normal" }, ["gpt-6-luna"], "low"), /limit/);
    assert.throws(() => resolveModel({ mode: "product", choice: "very_powerful" }), /not been verified/);
    assert.throws(() => resolveModel({ mode: "product", choice: "automatic", model: "gpt-6.1-sol" }));
    modelRegistry["gpt-6-luna"].prices.input = NaN;
    assert.throws(() => resolveModel({ mode: "product", choice: "normal" }), /pricing/);
  } finally {
    modelRegistry["gpt-6-luna"].prices.input = price;
    delete process.env.AI_VERIFIED_MODELS;
  }
});
