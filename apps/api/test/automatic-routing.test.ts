import { test } from "node:test";
import assert from "node:assert/strict";
import type { RoutingInput } from "../src/services/automatic-routing.js";
process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/unused-routing-test";
process.env.DASHBOARD_ORIGIN = "http://localhost:5173";
process.env.SESSION_SECRET = "routing-test-secret-at-least-32-characters";
process.env.OPENAI_API_KEY = "unused-test-key";
process.env.OPENAI_MODEL = "test-model";
process.env.DEFAULT_DAILY_BUDGET_USD = "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD = "10";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS = "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS = "1";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_FROM = "test@example.invalid";
const { routeAutomatic } = await import("../src/services/automatic-routing.js");

const base: RoutingInput = { baseline: "gpt-6-luna", platformAllowed: ["gpt-6-luna"], organizationAllowed: ["gpt-6-luna"], requiredTools: true, remainingDeadlineMs: 1000, remainingBudgetMicros: 100 };
test("automatic routing stays on the authorized baseline and fails closed", () => {
  assert.equal(routeAutomatic(base).kind, "model");
  for (const changes of [{ organizationAllowed: [] }, { platformAllowed: [] }, { remainingDeadlineMs: 0 }, { remainingBudgetMicros: 0 }, { remainingBudgetMicros: NaN }])
    assert.equal(routeAutomatic({ ...base, ...changes }).kind, "unavailable");
});


test("unknown baseline models fail closed even if listed in both policies", () => {
  const unknown = "unknown-model" as RoutingInput["baseline"];
  assert.equal(routeAutomatic({ ...base, baseline: unknown, platformAllowed: [unknown], organizationAllowed: [unknown] }).kind, "unavailable");
});

test("Automatic cannot select a premium baseline even when both policies allow it", () => {
  assert.equal(routeAutomatic({ ...base, baseline: "gpt-6.1-sol",
    platformAllowed: ["gpt-6.1-sol"], organizationAllowed: ["gpt-6.1-sol"] }).kind, "unavailable");
});

const { classifyRoutingTask, routeAdaptive } = await import("../src/services/automatic-routing.js");
test("the adaptive policy requires trusted approval, measured gain, entitlement and affordable read-only work", () => {
  const allowed = ["gpt-6-luna", "gpt-6.1-sol"];
  const input: Parameters<typeof routeAdaptive>[0] = { ...base, platformAllowed: allowed, organizationAllowed: allowed,
    verified: allowed, complexity: "complex", readOnly: true, premiumApproved: false, maxRequestMicros: 100,
    reservationFor: (model) => model === "gpt-6-luna" ? 3 : 50,
    evidence: [{ model: "gpt-6.1-sol", task: "complex", samples: 40, qualityGainBasisPoints: 600,
      safetyFailures: 0, latencyP95Ms: 500 }] };
  assert.equal(routeAdaptive(input).reason, "authorized_baseline");
  const approved = { ...input, premiumApproved: true };
  assert.equal(routeAdaptive(approved).reason, "measured_improvement");
  for (const changes of [{ readOnly: false }, { maxRequestMicros: 10 }, { remainingDeadlineMs: 200 },
    { verified: ["gpt-6-luna"] }, { organizationAllowed: ["gpt-6-luna"] }, { evidence: [] }]) {
    assert.equal(routeAdaptive({ ...approved, ...changes }).reason, "authorized_baseline");
  }
  assert.equal(routeAdaptive({ ...approved, verified: ["gpt-6.1-sol"] }).reason, "entitlement");
  assert.equal(routeAdaptive({ ...approved, maxRequestMicros: 2 }).reason, "budget");
  assert.equal(classifyRoutingTask({ recognizedIntents: 3, ambiguous: false, activeWorkflow: false, hasReferences: true, readOnly: true }), "complex");
  assert.equal(classifyRoutingTask({ recognizedIntents: 1, ambiguous: false, activeWorkflow: false, hasReferences: false, readOnly: true }), "simple");
});
