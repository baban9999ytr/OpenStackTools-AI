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
