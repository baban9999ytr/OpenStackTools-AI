import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPhase2gEnvelope, phase2iApproval, benchmarkPreflight, createBenchmarkMeter } from "../evals/benchmark-admission.js";

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

test("Phase 2F reserves nine Luna calls and rejects Phase 2E execution approval", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { mkdtemp, readdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "astra-2f-test-"));
  const cli = fileURLToPath(new URL("../evals/benchmark.ts", import.meta.url));
  const launcher = fileURLToPath(new URL("../evals/launch-luna.mjs", import.meta.url));
  const fetchGuard = "data:text/javascript,globalThis.fetch=()=>{throw new Error('Provider fetch forbidden')}";
  try {
    const env = { ...process.env, ...valid, CI: "", GITHUB_ACTIONS: "", NODE_ENV: "test",
      EVAL_2F_EXECUTE_APPROVED: "", EVAL_EXECUTE_APPROVED: "1", EVAL_PREFLIGHT_ONLY: "1",
      EVAL_OUTPUT_PROFILE: "standard", EVAL_REASONING_EFFORT: "none", EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: "1",
      EVAL_VERIFIED_MODELS: "gpt-6-luna", EVAL_MAX_REQUESTS_PER_MODEL: "9",
      EVAL_MAX_SPEND_MICROS: "100000", EVAL_MAX_MODEL_SPEND_MICROS: "100000",
      EVAL_PRICE_VERSION: "openai-2026-11-13-standard-v1", EVAL_PRICE_CHECKED_AT: new Date().toISOString(),
      EVAL_REPORT_PATH: join(directory, "report.json") };
    const run = (overrides: NodeJS.ProcessEnv) => spawnSync(process.execPath,
      ["--import", fetchGuard, "--import", "tsx", cli, "--live", "--suite=luna-quality"],
      { env: { ...env, ...overrides }, encoding: "utf8", timeout: 25_000 });
    const denied = run({ EVAL_PREFLIGHT_ONLY: "0" });
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /separate execution approval/);
    const launcherDenied = spawnSync(process.execPath, [launcher, "--execute", "--suite=luna-quality"], { env, encoding: "utf8" });
    assert.equal(launcherDenied.status, 2);
    assert.match(launcherDenied.stderr, /separate execution approval/);
    assert.notEqual(run({ EVAL_MAX_REQUESTS_PER_MODEL: "8" }).status, 0);
    assert.notEqual(run({ EVAL_MAX_SPEND_MICROS: "40000" }).status, 0);
    const rehearsal = run({});
    assert.equal(rehearsal.status, 0, rehearsal.stderr || rehearsal.stdout);
    const summary = JSON.parse(rehearsal.stdout.trim().split("\n").at(-1)!);
    assert.equal(summary.admitted, true);
    assert.equal(summary.providerRequests, 0);
    assert.equal(summary.simulatedCalls, 9);
    assert.equal(summary.plannedCalls, 9);
    assert.equal(summary.worstCaseRunMicros, 92_331);
    assert.equal(summary.syntheticTurns, 10);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Phase 2G admits exactly seven provider-free opportunities and separates approval, privacy and failure gates", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { mkdtemp, chmod, readdir, readFile, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "astra-2g-test-"));
  const cli = fileURLToPath(new URL("../evals/benchmark.ts", import.meta.url));
  const launcher = fileURLToPath(new URL("../evals/launch-luna.mjs", import.meta.url));
  const report = join(directory, "report.json");
  const fetchGuard = "data:text/javascript," + encodeURIComponent(`
    globalThis.fetch = async () => { throw new Error("Provider fetch forbidden"); };
  `);
  const failingProvider = (status: 429 | 503) => "data:text/javascript," + encodeURIComponent(`
    globalThis.fetch = async (input, init) => {
      const body = JSON.parse(init.body);
      if (String(input) !== "https://api.openai.com/v1/responses" || body.model !== "gpt-6-luna" ||
          body.max_output_tokens !== 512 || body.reasoning?.effort !== "none" || body.service_tier !== "default" ||
          body.parallel_tool_calls !== false || body.store !== false || !Array.isArray(body.tools))
        return new Response(JSON.stringify({ error: { code: "bad_test_envelope" } }), { status: 400 });
      process.stderr.write("synthetic-responses-call\\n");
      return new Response(JSON.stringify({ error: { code: "synthetic_failure", message: "private-provider-body-marker" } }),
        { status: ${status}, headers: { "x-request-id": "private-provider-header-marker" } });
    };
  `);
  try {
    const env = { ...process.env, ...valid, CI: "", GITHUB_ACTIONS: "", NODE_ENV: "test",
      NODE_OPTIONS: undefined, EVAL_2F_EXECUTE_APPROVED: "1", EVAL_2G_EXECUTE_APPROVED: undefined,
      EVAL_PREFLIGHT_ONLY: "1", EVAL_REASONING_EFFORT: "none", EVAL_OUTPUT_PROFILE: "standard",
      EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: "1", EVAL_PROVIDER_QUOTA_CONFIRMED: "1",
      EVAL_MAX_REQUESTS_PER_MODEL: "7", EVAL_MAX_SPEND_MICROS: "80000", EVAL_MAX_MODEL_SPEND_MICROS: "80000",
      EVAL_PRICE_VERSION: "openai-2026-11-13-standard-v1", EVAL_PRICE_CHECKED_AT: new Date().toISOString(),
      EVAL_REPORT_PATH: report };
    const run = (overrides: NodeJS.ProcessEnv = {}, live = true, preload = fetchGuard) =>
      spawnSync(process.execPath, ["--import", preload, "--import", "tsx", cli, ...(live ? ["--live"] : []),
        "--suite=phase2g-live"], { env: { ...env, ...overrides }, encoding: "utf8", timeout: 30_000 });
    const denied = run({ EVAL_PREFLIGHT_ONLY: "0" });
    assert.match(denied.stderr, /Phase 2G requires separate execution approval/);
    const launcherDenied = spawnSync(process.execPath, [launcher, "--execute", "--suite=phase2g-live"], { env, encoding: "utf8" });
    assert.equal(launcherDenied.status, 2);
    assert.match(launcherDenied.stderr, /Phase 2G requires separate execution approval/);
    for (const overrides of [{ EVAL_PROVIDER_QUOTA_CONFIRMED: "0" }, { EVAL_MAX_REQUESTS_PER_MODEL: "8" },
      { EVAL_MAX_SPEND_MICROS: "100000" }, { EVAL_REASONING_EFFORT: "low" }, { EVAL_OUTPUT_PROFILE: "extended" }])
      assert.notEqual(run(overrides).status, 0);
    await chmod(directory, 0o755);
    assert.notEqual(run().status, 0);
    await chmod(directory, 0o700);
    const rehearsal = run();
    assert.equal(rehearsal.status, 0, rehearsal.stderr || rehearsal.stdout);
    const summary = JSON.parse(rehearsal.stdout.trim().split("\n").at(-1)!);
    assert.equal(summary.admitted, true);
    assert.equal(summary.providerRequests, 0);
    assert.equal(summary.plannedCalls, 7);
    assert.equal(summary.simulatedCalls, 7);
    assert.equal(summary.worstCaseRunMicros, 71_813);
    assert.equal(summary.syntheticTurns, 8);
    assert.deepEqual(await readdir(directory), []);

    const offline = run({ EVAL_PREFLIGHT_ONLY: "0" }, false);
    const json = JSON.parse(await readFile(report, "utf8"));
    const issues = json.results.flatMap((scenario: { scenario: string; turns: Array<{ issues: string[] }> }) =>
      scenario.turns.flatMap((turn, index) => turn.issues.map((issue) => `${scenario.scenario}/${index + 1}/${issue}`)));
    assert.equal(offline.status, 0, offline.stderr || issues.join(", ") || offline.stdout);
    assert.ok(!offline.stdout.includes("office@example.test"));
    const markdown = join(directory, "report.md");
    for (const path of [report, markdown]) assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(json.totalCalls, 7);
    assert.equal(json.results[1].prelude.length, 2);
    assert.equal(json.qualityMetrics["C.contactFieldPrecision"].passed, 1);
    assert.equal(json.qualityMetrics["A.persistedPropertyReference"].passed, 2);
    assert.match(await readFile(markdown, "utf8"), /Raw Luna decision/);

    for (const status of [503, 429] as const) {
      const failureReport = join(directory, `failure-${status}.json`);
      const failed = run({ EVAL_PREFLIGHT_ONLY: "0", EVAL_2G_EXECUTE_APPROVED: "1", EVAL_REPORT_PATH: failureReport },
        true, failingProvider(status));
      assert.equal(failed.status, 1, failed.stderr || failed.stdout);
      assert.equal((failed.stderr.match(/synthetic-responses-call/g) ?? []).length, 1, failed.stderr);
      const serialized = await readFile(failureReport, "utf8");
      const transcript = await readFile(failureReport.replace(/\.json$/, ".md"), "utf8");
      assert.doesNotMatch(serialized + transcript + failed.stdout + failed.stderr, /private-provider|synthetic_failure|inert-test-fixture/);
      const failedJson = JSON.parse(serialized);
      assert.equal(failedJson.totalCalls, 1);
      assert.equal(failedJson.results.length, 1);
      assert.equal(failedJson.stopped, "provider_uncertain");
      const [turn] = failedJson.results[0].turns;
      assert.equal(failedJson.estimatedOrReservedMicros, turn.worstCaseProviderCostMicros);
      assert.equal(turn.usage?.estimatedCostMicros ?? 0, status === 503 ? turn.worstCaseProviderCostMicros : 0);
      assert.equal(turn.actual.reply, "");
      assert.equal(turn.modelDecision.selectionCorrect, null);
      const category = status === 503 ? "http_server_error" : "http_rate_limit";
      const reason = status === 503 ? "provider_unavailable" : "provider_rate_limited";
      assert.deepEqual(turn.providerFailure, { reason, category, status });
      assert.ok(transcript.includes(JSON.stringify({ reason, category, status })));
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("single-call Luna diagnostic requires new approval and keeps private success and failure evidence", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { mkdtemp, readFile, readdir, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "astra-single-test-"));
  const cli = fileURLToPath(new URL("../evals/benchmark.ts", import.meta.url));
  const launcher = fileURLToPath(new URL("../evals/launch-luna.mjs", import.meta.url));
  const suite = "--suite=phase2g-single-call";
  const preload = (source: string) => "data:text/javascript," + encodeURIComponent(source);
  const guard = preload('globalThis.fetch = async () => { throw new Error("network disabled"); };');
  const env = { ...process.env, ...valid, NODE_OPTIONS: undefined, CI: "", GITHUB_ACTIONS: "", NODE_ENV: "test",
    EVAL_2F_EXECUTE_APPROVED: "1", EVAL_2G_EXECUTE_APPROVED: "1", EVAL_2G_SINGLE_CALL_EXECUTE_APPROVED: undefined,
    EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: "1", EVAL_PROVIDER_QUOTA_CONFIRMED: "1",
    EVAL_MAX_REQUESTS_PER_MODEL: "1", EVAL_MAX_SPEND_MICROS: "20000", EVAL_MAX_MODEL_SPEND_MICROS: "20000",
    EVAL_OUTPUT_PROFILE: "standard", EVAL_REASONING_EFFORT: "none",
    EVAL_PRICE_VERSION: "openai-2026-11-13-standard-v1", EVAL_PRICE_CHECKED_AT: new Date().toISOString(),
    EVAL_REPORT_PATH: join(directory, "preflight.json") };
  const run = (overrides: NodeJS.ProcessEnv, mock = guard) =>
    spawnSync(process.execPath, ["--import", mock, "--import", "tsx", cli, "--live", suite],
      { env: { ...env, ...overrides }, encoding: "utf8", timeout: 30_000 });
  try {
    const denied = run({ EVAL_PREFLIGHT_ONLY: "0" });
    assert.match(denied.stderr, /single-call diagnostic requires separate execution approval/i);
    const deniedLauncher = spawnSync(process.execPath, [launcher, "--execute", suite], { env: { ...env, EVAL_PROJECT_API_KEY: "" }, encoding: "utf8" });
    assert.equal(deniedLauncher.status, 2);
    assert.match(deniedLauncher.stderr, /single-call diagnostic requires separate execution approval/i);

    for (const overrides of [{ EVAL_MAX_REQUESTS_PER_MODEL: "2" }, { EVAL_MAX_SPEND_MICROS: "40000" },
      { EVAL_MAX_MODEL_SPEND_MICROS: "19999" }, { EVAL_PROVIDER_QUOTA_CONFIRMED: "0" }])
      assert.notEqual(run({ EVAL_PREFLIGHT_ONLY: "1", ...overrides }).status, 0);
    const preflight = run({ EVAL_PREFLIGHT_ONLY: "1" });
    assert.equal(preflight.status, 0, preflight.stderr || preflight.stdout);
    const summary = JSON.parse(preflight.stdout.trim().split("\n").at(-1)!);
    assert.equal(summary.admitted, true);
    assert.equal(summary.providerRequests, 0);
    assert.equal(summary.syntheticTurns, 1);
    assert.equal(summary.plannedCalls, 1);
    assert.equal(summary.simulatedCalls, 1);
    assert.equal(summary.worstCaseRunMicros, 10_259);
    assert.deepEqual(await readdir(directory), []);

    const rawText = "Synthetic raw model text.";
    const rawProposal = { name: "interpret_business_preferences", arguments: { fields: [] } };
    const provider = {
      id: "private-provider-response-id", object: "response", status: "completed", service_tier: "default", model: "gpt-6-luna",
      output: [{ type: "message", content: [{ type: "output_text", text: rawText }] },
        { type: "function_call", name: rawProposal.name, arguments: JSON.stringify(rawProposal.arguments) }],
      usage: { input_tokens: 300, output_tokens: 20, output_tokens_details: { reasoning_tokens: 0 } },
    };
    for (const status of [200, 503, 429] as const) {
      const path = join(directory, `diagnostic-${status}.json`);
      const body = status === 200 ? provider : { error: { message: "private-provider-body-marker" } };
      const mock = preload(`globalThis.fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        if (String(url) !== "https://api.openai.com/v1/responses" || body.model !== "gpt-6-luna" ||
            body.max_output_tokens !== 512 || body.reasoning?.effort !== "none" || body.service_tier !== "default" ||
            body.store !== false || !Array.isArray(body.tools) || body.input.length !== 1 ||
            !body.input[0].content.includes("Görükle de Özlüce de olur")) throw new Error("unexpected test request");
        process.stderr.write("intercepted-single-call\\n");
        return Response.json(${JSON.stringify(body)}, {status: ${status}, headers: {"x-request-id": "private-provider-header"}});
      };`);
      const result = run({ EVAL_PREFLIGHT_ONLY: "0", EVAL_2G_SINGLE_CALL_EXECUTE_APPROVED: "1", EVAL_REPORT_PATH: path }, mock);
      assert.equal(result.status, status === 200 ? 0 : 1, result.stderr || result.stdout);
      assert.equal((result.stderr.match(/intercepted-single-call/g) ?? []).length, 1);
      const json = await readFile(path, "utf8");
      const mdPath = path.replace(/\.json$/, ".md");
      const md = await readFile(mdPath, "utf8");
      for (const file of [path, mdPath]) assert.equal((await stat(file)).mode & 0o777, 0o600);
      assert.doesNotMatch(json + md + result.stdout + result.stderr, /private-provider|sk-proj-inert-test-fixture/);
      assert.doesNotMatch(result.stdout, /Synthetic raw model text/);
      const report = JSON.parse(json);
      const [turn] = report.results[0].turns;
      assert.equal(report.totalCalls, 1);
      assert.equal(report.results[0].turns.length, 1);
      assert.equal(turn.checks.transactionSafety, true);
      assert.equal(turn.checks.scopedAction, true);
      assert.ok(Number.isInteger(turn.sdkLatencyMs) && turn.sdkLatencyMs >= 0);
      if (status === 200) {
        assert.equal(turn.providerText, rawText);
        assert.deepEqual(turn.actual.proposal, rawProposal);
        assert.equal(turn.reportedUsage.inputTokens, 300);
        assert.equal(turn.usage.billingStatus, "measured");
        assert.equal(report.estimatedOrReservedMicros, turn.usage.estimatedCostMicros);
        assert.equal(turn.responseValidation, "accepted");
      } else {
        assert.equal(turn.providerFailure.status, status);
        assert.equal(turn.providerFailure.category, status === 503 ? "http_server_error" : "http_rate_limit");
        assert.equal(turn.responseValidation, "no_usable_response");
        assert.equal(report.estimatedOrReservedMicros, turn.worstCaseProviderCostMicros);
        assert.equal(report.stopped, "provider_uncertain");
        if (status === 503) assert.equal(turn.usage.billingStatus, "uncertain");
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release candidate live admission requires its own approval and preserves the Luna envelope", () => {
  const attestations = { ...valid, EVAL_2G_EXECUTE_APPROVED: "1",
    EVAL_PROVIDER_QUOTA_CONFIRMED: "1", EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: "1" };
  const limits = { global: 80_000, perModel: 80_000, requests: 7 };
  const profile = { profile: "standard", maxOutputTokens: 512, effort: "none" };
  assert.throws(() => assertPhase2gEnvelope(attestations, 7, 10_259, limits, profile, false, true), /Phase 2I.*approval/);
  assert.doesNotThrow(() => assertPhase2gEnvelope({ ...attestations, EVAL_PREFLIGHT_ONLY: "1" }, 7, 10_259, limits, profile, false, true));
  const approved = { ...attestations, [phase2iApproval]: "1" };
  assert.doesNotThrow(() => assertPhase2gEnvelope(approved, 7, 10_259, limits, profile, false, true));
  assert.throws(() => assertPhase2gEnvelope(approved, 7, 10_260, limits, profile, false, true), /required limits/);
});
