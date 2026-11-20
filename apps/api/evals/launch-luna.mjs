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
const integrated = args[1] === "--suite=luna-integrated-widget";
const intent = args[1] === "--suite=luna-structured-intent";
const phase2f = args[1] === "--suite=luna-quality";
const singleCall = args[1] === "--suite=phase2g-single-call";
const phase2i = args[1] === "--suite=phase2i-rc";
const arm = args[1] === "--suite=luna-contract-a" ? "A" : args[1] === "--suite=luna-contract-b" ? "B" : undefined;
const phase2g = !!arm || phase2i || args[1] === "--suite=phase2g-live";
if ((args.length !== 1 && !(args.length === 2 && (integrated || intent || phase2f || phase2g || singleCall))) ||
    !["--preflight", "--execute"].includes(args[0]))
  deny("Specify --preflight or --execute explicitly.");
const approval = integrated ? undefined : intent ? "EVAL_STRUCTURED_INTENT_EXECUTE_APPROVED" : arm ? `EVAL_LUNA_CONTRACT_${arm}_EXECUTE_APPROVED` : phase2i ? "EVAL_2I_EXECUTE_APPROVED" : singleCall ? "EVAL_2G_SINGLE_CALL_EXECUTE_APPROVED" : phase2g ? "EVAL_2G_EXECUTE_APPROVED" : phase2f ? "EVAL_2F_EXECUTE_APPROVED" : undefined;
const repairedSource = process.env.EVAL_REPAIRED_WIDGET_APPROVED_SOURCE_SHA256;
if (integrated && args[0] === "--execute" &&
    ![repairedSource, process.env.EVAL_INTEGRATED_WIDGET_CORPUS_SHA256].every((digest) => /^[a-f0-9]{64}$/.test(digest ?? "")))
  deny("Repaired widget execution requires dedicated source approval and the frozen corpus digest.");
if (approval && args[0] === "--execute" && process.env[approval] !== "1")
  deny(`${intent ? "Structured intent" : arm ? "Luna contract arm " + arm : "Phase " + (phase2i ? "2I" : singleCall ? "2G single-call diagnostic" : phase2g ? "2G" : "2F")} requires separate execution approval.`);
if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.NODE_ENV === "production")
  deny("The Luna launcher is for local, nonproduction execution.");

const required = [
  "EVAL_DEDICATED_PROJECT_CONFIRMED", "EVAL_STANDARD_PRICING_CONFIRMED",
  "EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED",
];
if (integrated || intent || phase2g || singleCall) required.push("EVAL_PROVIDER_QUOTA_CONFIRMED");
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
if (integrated && args[0] === "--execute") {
  const projectReviewed = process.env.EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT ?? "";
  const timestamp = Date.parse(projectReviewed);
  if (!projectReviewed.endsWith("Z") || !Number.isFinite(timestamp) || timestamp > now || now - timestamp > 86_400_000)
    missing.push("EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT (actual project, Responses permission, quota, spending controls and billing review within 24 hours)");
}
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
  ...(integrated || intent || phase2g || singleCall ? { EVAL_PROVIDER_QUOTA_CONFIRMED: process.env.EVAL_PROVIDER_QUOTA_CONFIRMED } : {}),
  EVAL_VERIFIED_MODELS: "gpt-6-luna",
  EVAL_OUTPUT_PROFILE: "standard",
  EVAL_REASONING_EFFORT: "none",
  EVAL_MAX_REQUESTS_PER_MODEL: integrated ? "2" : intent ? "6" : singleCall ? "1" : phase2g ? "7" : phase2f ? "9" : "3",
  EVAL_MAX_SPEND_MICROS: integrated ? "21000" : intent ? "30000" : singleCall ? "20000" : phase2g ? "80000" : phase2f ? "100000" : "40000",
  EVAL_MAX_MODEL_SPEND_MICROS: integrated ? "21000" : intent ? "30000" : singleCall ? "20000" : phase2g ? "80000" : phase2f ? "100000" : "40000",
  EVAL_REPORT_PATH: report,
  ...(integrated ? {
    EVAL_INTEGRATED_WIDGET_CORPUS_SHA256: process.env.EVAL_INTEGRATED_WIDGET_CORPUS_SHA256,
    EVAL_REPAIRED_WIDGET_APPROVED_SOURCE_SHA256: repairedSource,
    EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT: process.env.EVAL_REPAIRED_WIDGET_PROJECT_REVIEWED_AT,
    ...(args[0] === "--preflight" ? { EVAL_PREFLIGHT_TIE_MESSAGE_CLOCK: process.env.EVAL_PREFLIGHT_TIE_MESSAGE_CLOCK } : {}),
  } : {}),
};
const cli = fileURLToPath(new URL(integrated ? "./luna-integrated-widget.ts" : intent ? "./receptionist-intent-live.ts" : "./benchmark.ts", import.meta.url));
const run = (gate) => spawnSync(process.execPath, ["--import", "tsx", cli, "--live", args[1] ?? "--suite=luna-smoke"],
  { cwd: fileURLToPath(new URL("../", import.meta.url)), env: { ...env, ...gate }, stdio: "inherit" });

console.log("Private report destination:", report);
const preflight = run({ EVAL_PREFLIGHT_ONLY: "1" });
if (preflight.status !== 0) process.exit(preflight.status ?? 1);
if (args[0] === "--execute") {
  const execution = run({ EVAL_EXECUTE_APPROVED: "1", ...(approval ? { [approval]: "1" } : {}) });
  process.exitCode = execution.status ?? 1;
}
