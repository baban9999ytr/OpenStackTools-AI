import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function deny(message) {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length !== 1 || !["--preflight", "--execute"].includes(args[0]))
  deny("Specify --preflight or --execute explicitly.");
if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.NODE_ENV === "production")
  deny("The Luna launcher is for local, nonproduction execution.");

const required = [
  "EVAL_DEDICATED_PROJECT_CONFIRMED", "EVAL_STANDARD_PRICING_CONFIRMED",
  "EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED",
];
const missing = required.filter((name) => process.env[name] !== "1");
const key = process.env.EVAL_PROJECT_API_KEY ?? "";
if (!/^sk-proj-[A-Za-z0-9_-]{20,}$/.test(key)) missing.push("EVAL_PROJECT_API_KEY");
if (!(process.env.EVAL_VERIFIED_MODELS ?? "").split(",").map((id) => id.trim()).includes("gpt-6-luna"))
  missing.push("EVAL_VERIFIED_MODELS (gpt-6-luna)");
const checkedAt = process.env.EVAL_PRICE_CHECKED_AT ?? "";
const reviewed = Date.parse(checkedAt);
const now = Date.now();
if (!checkedAt.endsWith("Z") || !Number.isFinite(reviewed) || reviewed > now || now - reviewed > 7 * 86_400_000)
  missing.push("EVAL_PRICE_CHECKED_AT (actual UTC review within seven days)");
if (missing.length) deny("Blocked on project configuration: " + missing.join(", "));

const reportDir = mkdtempSync(join(realpathSync(tmpdir()), "astra-luna-"));
chmodSync(reportDir, 0o700);
const report = join(reportDir, "luna.json");
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  EVAL_PROJECT_API_KEY: key,
  EVAL_PRICE_VERSION: "openai-2026-11-13-standard-v1",
  EVAL_PRICE_CHECKED_AT: checkedAt,
  EVAL_LIVE: "1",
  EVAL_SPEND_APPROVED: "1",
  EVAL_SYNTHETIC_TENANT_CONFIRMED: "1",
  EVAL_DEDICATED_PROJECT_CONFIRMED: process.env.EVAL_DEDICATED_PROJECT_CONFIRMED,
  EVAL_STANDARD_PRICING_CONFIRMED: process.env.EVAL_STANDARD_PRICING_CONFIRMED,
  EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: process.env.EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED,
  EVAL_VERIFIED_MODELS: "gpt-6-luna",
  EVAL_OUTPUT_PROFILE: "standard",
  EVAL_REASONING_EFFORT: "none",
  EVAL_MAX_REQUESTS_PER_MODEL: "3",
  EVAL_MAX_SPEND_MICROS: "40000",
  EVAL_MAX_MODEL_SPEND_MICROS: "40000",
  EVAL_REPORT_PATH: report,
};
const cli = fileURLToPath(new URL("./benchmark.ts", import.meta.url));
const run = (gate) => spawnSync(process.execPath, ["--import", "tsx", cli, "--live", "--suite=luna-smoke"],
  { cwd: fileURLToPath(new URL("../", import.meta.url)), env: { ...env, ...gate }, stdio: "inherit" });

console.log("Private report destination:", report);
const preflight = run({ EVAL_PREFLIGHT_ONLY: "1" });
if (preflight.status !== 0) process.exit(preflight.status ?? 1);
if (args[0] === "--execute") {
  const execution = run({ EVAL_EXECUTE_APPROVED: "1" });
  process.exitCode = execution.status ?? 1;
}
