import assert from "node:assert/strict";
import { test } from "node:test";
import { benchmarkPreflight, createBenchmarkMeter } from "../evals/benchmark-admission.js";

const now = Date.parse("2026-11-19T14:00:00Z");
const valid = {
  EVAL_LIVE: "1", EVAL_EXECUTE_APPROVED: "1", EVAL_SPEND_APPROVED: "1", EVAL_DEDICATED_PROJECT_CONFIRMED: "1",
  EVAL_SYNTHETIC_TENANT_CONFIRMED: "1", EVAL_STANDARD_PRICING_CONFIRMED: "1",
  EVAL_PROJECT_API_KEY: "sk-proj-inert-test-fixture-not-a-key",
  EVAL_MAX_SPEND_MICROS: "100", EVAL_MAX_MODEL_SPEND_MICROS: "70", EVAL_MAX_REQUESTS_PER_MODEL: "2",
  EVAL_VERIFIED_MODELS: "gpt-6-luna", EVAL_PRICE_VERSION: "fixture-v1",
  EVAL_PRICE_CHECKED_AT: "2026-11-19T12:00:00Z", EVAL_REPORT_PATH: "/tmp/inert-benchmark-test.json",
};

test("preflight rejects missing explicit approval, budget, entitlement, stale prices and CI", async () => {
  const launch = test.mock.fn(async () => 1);
  for (const invalid of [{ EVAL_EXECUTE_APPROVED: undefined }, { EVAL_SPEND_APPROVED: undefined }, { EVAL_MAX_SPEND_MICROS: undefined },
    { EVAL_MAX_MODEL_SPEND_MICROS: "101" }, { EVAL_VERIFIED_MODELS: "" }, { CI: "true" },
    { GITHUB_ACTIONS: "true" }, { NODE_ENV: "production" }, { EVAL_PRICE_CHECKED_AT: "2026-11-01" }]) {
    assert.throws(() => {
      benchmarkPreflight({ ...valid, ...invalid }, ["gpt-6-luna"], "fixture-v1", now);
      void launch();
    }, /preflight denied/);
  }
  assert.equal(launch.mock.callCount(), 0);
  assert.equal(benchmarkPreflight(valid, ["gpt-6-luna"], "fixture-v1", now).perModel, 70);
});

test("the meter settles confirmed usage and stops before exceeding either spend ceiling", async () => {
  const limits = { global: 100, perModel: 70, requests: 2 };
  const global = createBenchmarkMeter(limits);
  const provider = test.mock.fn(async () => 55);
  assert.equal(await global.run("luna", 70, 100, provider, (usage) => usage), 55);
  assert.equal(global.total, 55);
  await assert.rejects(global.run("sol", 46, 100, provider, (usage) => usage), /admission denied/);
  const model = createBenchmarkMeter(limits);
  await model.run("luna", 70, 100, provider, (usage) => usage);
  await assert.rejects(model.run("luna", 16, 100, provider, (usage) => usage), /admission denied/);
  assert.equal(provider.mock.callCount(), 2);
});

test("timeouts retain the full reservation and prevent subsequent provider calls", async () => {
  const meter = createBenchmarkMeter({ global: 100, perModel: 70, requests: 2 });
  const timeout = test.mock.fn(async () => { throw new Error("synthetic timeout"); });
  await assert.rejects(meter.run("luna", 60, 100, timeout, () => 1), /synthetic timeout/);
  await assert.rejects(meter.run("sol", 10, 100, timeout, () => 1), /admission denied/);
  assert.equal(timeout.mock.callCount(), 1);
  assert.equal(meter.total, 60);
  assert.equal(meter.stopped, "provider_uncertain");
});

test("input and request limits stop additional calls", async () => {
  const provider = test.mock.fn(async () => 1);
  const oversized = createBenchmarkMeter({ global: 100, perModel: 70, requests: 1 });
  await assert.rejects(oversized.run("luna", 10, 40_001, provider, (n) => n), /admission denied/);
  assert.equal(oversized.stopped, "context_limit");
  const bounded = createBenchmarkMeter({ global: 100, perModel: 70, requests: 1 });
  await bounded.run("luna", 10, 100, provider, (n) => n);
  await assert.rejects(bounded.run("luna", 10, 100, provider, (n) => n), /admission denied/);
  assert.equal(bounded.stopped, "request_limit");
  assert.equal(provider.mock.callCount(), 1);
});

test("the CLI rejects hosted execution and supports provider-free operator preflight", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const cli = fileURLToPath(new URL("../evals/benchmark.ts", import.meta.url));
  const synthetic = { ...process.env, ...valid, EVAL_PREFLIGHT_ONLY: "1", EVAL_EXECUTE_APPROVED: undefined,
    EVAL_VERIFIED_MODELS: "gpt-6-luna,gpt-6.1-sol,gpt-6-astra",
    EVAL_PRICE_VERSION: "openai-2026-11-13-standard-v1", EVAL_PRICE_CHECKED_AT: new Date().toISOString() };
  const run = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ["--import", "tsx", cli, "--live"],
    { env, encoding: "utf8", timeout: 5000 });
  assert.equal(run({ ...synthetic, CI: "true" }).status, 2);
  assert.equal(run({ ...synthetic, CI: "", GITHUB_ACTIONS: "", NODE_ENV: "test", EVAL_SPEND_APPROVED: "0" }).status, 2);
  const admitted = run({ ...synthetic, CI: "", GITHUB_ACTIONS: "", NODE_ENV: "test" });
  assert.equal(admitted.status, 0, admitted.stderr);
  assert.equal(JSON.parse(admitted.stdout.trim().split("\n").at(-1)!).entitlement, "operator-attested");
  assert.ok(!admitted.stdout.includes(valid.EVAL_PROJECT_API_KEY));
});

test("Luna rehearsal checks the full envelope, private paths and fixture queue with provider fetch disabled", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { mkdtemp, readdir, rm, chmod } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "astra-luna-test-"));
  const cli = fileURLToPath(new URL("../evals/benchmark.ts", import.meta.url));
  const fetchGuard = "data:text/javascript,globalThis.fetch=()=>{throw new Error('Provider fetch forbidden')}";
  try {
    const env = { ...process.env, ...valid, CI: "", GITHUB_ACTIONS: "", NODE_ENV: "test",
      EVAL_PREFLIGHT_ONLY: "1", EVAL_EXECUTE_APPROVED: undefined, EVAL_REASONING_EFFORT: "none",
      EVAL_OUTPUT_PROFILE: "standard", EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: "1", EVAL_VERIFIED_MODELS: "gpt-6-luna",
      EVAL_PRICE_VERSION: "openai-2026-11-13-standard-v1", EVAL_PRICE_CHECKED_AT: new Date().toISOString(),
      EVAL_MAX_SPEND_MICROS: "40000", EVAL_MAX_MODEL_SPEND_MICROS: "40000", EVAL_MAX_REQUESTS_PER_MODEL: "3",
      EVAL_REPORT_PATH: join(directory, "report.json") };
    const run = (overrides: NodeJS.ProcessEnv) => spawnSync(process.execPath,
      ["--import", fetchGuard, "--import", "tsx", cli, "--live", "--suite=luna-smoke"],
      { env: { ...env, ...overrides }, encoding: "utf8", timeout: 20_000 });
    assert.notEqual(run({ EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: "0" }).status, 0);
    assert.notEqual(run({ EVAL_MAX_MODEL_SPEND_MICROS: "30000" }).status, 0);
    assert.notEqual(run({ EVAL_MAX_REQUESTS_PER_MODEL: "2" }).status, 0);
    assert.equal(run({ EVAL_PREFLIGHT_ONLY: "0" }).status, 2);
    await chmod(directory, 0o755);
    assert.notEqual(run({}).status, 0);
    await chmod(directory, 0o700);
    const result = run({});
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    assert.equal(summary.admitted, true);
    assert.equal(summary.providerRequests, 0);
    assert.equal(summary.plannedCalls, 3);
    assert.equal(summary.worstCaseRunMicros, 30_777);
    assert.equal(summary.syntheticTurns, 9);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("smoke assertions flag fabricated prices, slot and booking claims and redact report data", async () => {
  const { smokeSafety, redactSyntheticReport, selectOutputProfile } = await import("../evals/benchmark-smoke.js");
  const validReply = smokeSafety("27.000 TL. 13.15 uygundur.", [27000], ["13:15"]);
  assert.ok(Object.values(validReply).every(Boolean));
  assert.deepEqual(smokeSafety("99.000 TL. 13.15 uygundur. Randevunuz onaylandı.", [27000], ["15:00"]),
    { verifiedPrices: false, verifiedClockTimes: false, noUnconfirmedBookingClaim: false });
  assert.equal(redactSyntheticReport({ raw: valid.EVAL_PROJECT_API_KEY }, valid.EVAL_PROJECT_API_KEY).raw, "[redacted]");
  assert.throws(() => selectOutputProfile("unlimited"), /Unknown/);
  assert.throws(() => selectOutputProfile("minimal", "invented"), /Unknown/);
});
