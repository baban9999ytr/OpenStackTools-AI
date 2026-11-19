export const benchmarkLimits = { inputTokens: 40_000, outputTokens: 128, timeoutMs: 30_000 } as const;
const requiredFlags = ["EVAL_LIVE", "EVAL_SPEND_APPROVED", "EVAL_DEDICATED_PROJECT_CONFIRMED",
  "EVAL_SYNTHETIC_TENANT_CONFIRMED", "EVAL_STANDARD_PRICING_CONFIRMED"];
const integer = (value: string | undefined, max: number) =>
  value && /^[1-9]\d*$/.test(value) && Number(value) <= max ? Number(value) : 0;

export function benchmarkPreflight(env: NodeJS.ProcessEnv, models: readonly string[], pricingVersion: string, now = Date.now()) {
  const key = env.EVAL_PROJECT_API_KEY ?? "";
  const global = integer(env.EVAL_MAX_SPEND_MICROS, 1_000_000);
  const perModel = integer(env.EVAL_MAX_MODEL_SPEND_MICROS, global);
  const requests = integer(env.EVAL_MAX_REQUESTS_PER_MODEL, 18);
  const checked = Date.parse(env.EVAL_PRICE_CHECKED_AT ?? "");
  const verified = (env.EVAL_VERIFIED_MODELS ?? "").split(",").map((id) => id.trim());
  if (env.CI || env.GITHUB_ACTIONS || env.NODE_ENV === "production" ||
      (env.EVAL_PREFLIGHT_ONLY !== "1" && env.EVAL_EXECUTE_APPROVED !== "1") ||
      requiredFlags.some((flag) => env[flag] !== "1") || !/^sk-proj-[A-Za-z0-9_-]{20,}$/.test(key) ||
      !global || !perModel || !requests || !env.EVAL_REPORT_PATH || !models.length ||
      models.some((id) => !verified.includes(id)) || env.EVAL_PRICE_VERSION !== pricingVersion ||
      !Number.isFinite(checked) || checked > now || now - checked > 7 * 86_400_000)
    throw new Error("Live benchmark preflight denied");
  return { key, global, perModel, requests };
}

export function createBenchmarkMeter(limits: { global: number; perModel: number; requests: number }) {
  let total = 0;
  let stopped: string | undefined;
  const byModel = new Map<string, { spent: number; calls: number }>();
  return {
    get total() { return total; },
    get stopped() { return stopped; },
    halt(reason: string) { stopped ??= reason; },
    async run<T>(model: string, reservation: number, inputBound: number, call: () => Promise<T>, cost: (reply: T) => number) {
      const bucket = byModel.get(model) ?? { spent: 0, calls: 0 };
      if (!Number.isSafeInteger(inputBound) || inputBound < 1 || inputBound > benchmarkLimits.inputTokens)
        stopped ??= "context_limit";
      if (!Number.isSafeInteger(reservation) || reservation < 1 ||
          total + reservation > limits.global || bucket.spent + reservation > limits.perModel)
        stopped ??= "spend_limit";
      if (bucket.calls >= limits.requests) stopped ??= "request_limit";
      if (stopped) throw new Error("Benchmark admission denied");
      byModel.set(model, bucket);
      total += reservation;
      bucket.spent += reservation;
      bucket.calls++;
      try {
        const reply = await call();
        const settled = cost(reply);
        if (!Number.isSafeInteger(settled) || settled < 0) throw new Error("Invalid benchmark usage");
        total += settled - reservation;
        bucket.spent += settled - reservation;
        if (settled > reservation) {
          stopped = "usage_exceeded_reservation";
          throw new Error("Benchmark usage exceeded reservation");
        }
        return reply;
      } catch (error) {
        stopped ??= "provider_uncertain";
        throw error;
      }
    },
  };
}

export const phase2gEnvelope = { calls: 7, capMicros: 80_000, reservationMicros: 71_813, outputTokens: 512 } as const;

export const phase2gSingleCallEnvelope = { calls: 1, capMicros: 20_000, reservationMicros: 10_259, outputTokens: 512 } as const;
export const phase2gSingleCallApproval = "EVAL_2G_SINGLE_CALL_EXECUTE_APPROVED";

export const lunaContractApprovals = {
  a: "EVAL_LUNA_CONTRACT_A_EXECUTE_APPROVED",
  b: "EVAL_LUNA_CONTRACT_B_EXECUTE_APPROVED",
} as const;
export const phase2iApproval = "EVAL_2I_EXECUTE_APPROVED";

export function assertPhase2gEnvelope(env: NodeJS.ProcessEnv, plannedCalls: number, reservation: number,
  limits: { global: number; perModel: number; requests: number },
  profile: { profile: string; maxOutputTokens: number; effort: string }, singleCall = false, releaseCandidate = false, decisionArm?: keyof typeof lunaContractApprovals) {
  const envelope = singleCall ? phase2gSingleCallEnvelope : phase2gEnvelope;
  const approval = decisionArm ? lunaContractApprovals[decisionArm] : releaseCandidate ? phase2iApproval : singleCall ? phase2gSingleCallApproval : "EVAL_2G_EXECUTE_APPROVED";
  const label = decisionArm ? `Luna contract arm ${decisionArm.toUpperCase()}` : releaseCandidate ? "Phase 2I release candidate" : singleCall ? "Phase 2G single-call diagnostic" : "Phase 2G";
  if (env.EVAL_PREFLIGHT_ONLY !== "1" && env[approval] !== "1")
    throw new Error(`${label} requires separate execution approval`);
  if (env.EVAL_PROVIDER_QUOTA_CONFIRMED !== "1" || env.EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED !== "1" ||
      env.EVAL_VERIFIED_MODELS?.trim() !== "gpt-6-luna" || !env.EVAL_PRICE_CHECKED_AT?.endsWith("Z"))
    throw new Error("Phase 2G project attestations are incomplete");
  if (plannedCalls !== envelope.calls || limits.requests !== envelope.calls ||
      limits.global !== envelope.capMicros || limits.perModel !== envelope.capMicros ||
      profile.profile !== "standard" || profile.effort !== "none" || profile.maxOutputTokens !== envelope.outputTokens ||
      !Number.isSafeInteger(reservation) || reservation < 1 || reservation * plannedCalls > envelope.reservationMicros)
    throw new Error(`${label} envelope differs from the required limits`);
}
