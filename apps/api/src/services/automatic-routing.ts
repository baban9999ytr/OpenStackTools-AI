import { modelRegistry, type ModelId } from "./model-config.js";

/** A routing proposal is never authorization or budget admission. */
export type RoutingInput = {
  baseline: ModelId;
  platformAllowed: readonly string[];
  organizationAllowed: readonly string[];
  requiredTools: boolean;
  remainingDeadlineMs: number;
  remainingBudgetMicros: number;
};
export type RoutingDecision =
  | { kind: "model"; model: ModelId; reason: "authorized_baseline"; policyVersion: "astra-routing-v1" }
  | { kind: "unavailable"; reason: "deadline" | "budget" | "model_policy" | "capability" | "pricing"; policyVersion: "astra-routing-v1" };

/** Deliberately never escalates: admission and worst-case reservation remain mandatory downstream. */
export function routeAutomatic(input: RoutingInput): RoutingDecision {
  const policyVersion = "astra-routing-v1" as const;
  const unavailable = (reason: Extract<RoutingDecision, {kind: "unavailable"}>["reason"]): RoutingDecision => ({ kind: "unavailable", reason, policyVersion });
  if (!Number.isFinite(input.remainingDeadlineMs) || input.remainingDeadlineMs <= 0) return unavailable("deadline");
  if (!Number.isSafeInteger(input.remainingBudgetMicros) || input.remainingBudgetMicros <= 0) return unavailable("budget");
  if (input.baseline !== "gpt-6-luna") return unavailable("model_policy");
  if (!input.platformAllowed.includes(input.baseline) || !input.organizationAllowed.includes(input.baseline)) return unavailable("model_policy");
  const model = modelRegistry[input.baseline];
  if (!model || (input.requiredTools && !model.functions)) return unavailable("capability");
  if (![model.prices.input, model.prices.output].every((price) => Number.isSafeInteger(price) && price > 0) ||
    ![model.prices.cachedInput, model.prices.cacheWrite].every((price) => Number.isSafeInteger(price) && price >= 0)) return unavailable("pricing");
  return { kind: "model", model: input.baseline, reason: "authorized_baseline", policyVersion };
}

export type RoutingComplexity = "simple" | "moderate" | "complex";
export function classifyRoutingTask(signals: { recognizedIntents: number; ambiguous: boolean; activeWorkflow: boolean;
  hasReferences: boolean; readOnly: boolean }): RoutingComplexity {
  if (signals.ambiguous || (signals.activeWorkflow && signals.hasReferences) || signals.recognizedIntents >= 3)
    return "complex";
  return !signals.readOnly || signals.activeWorkflow || signals.hasReferences || signals.recognizedIntents >= 2
    ? "moderate" : "simple";
}

type EvaluatedCandidate = {
  model: ModelId;
  task: RoutingComplexity;
  samples: number;
  qualityGainBasisPoints: number;
  safetyFailures: number;
  latencyP95Ms: number;
};

type AdaptiveInput = RoutingInput & {
  complexity: RoutingComplexity;
  readOnly: boolean;
  premiumApproved: boolean;
  verified: readonly string[];
  maxRequestMicros: number;
  reservationFor: (model: ModelId) => number | undefined;
  evidence: readonly EvaluatedCandidate[];
};
const adaptiveVersion = "astra-routing-v2" as const;

export function routeAdaptive(input: AdaptiveInput) {
  const baseline = routeAutomatic(input);
  if (baseline.kind === "unavailable") return { ...baseline, policyVersion: adaptiveVersion };
  const withinBudget = (model: ModelId) => {
    const amount = input.reservationFor(model);
    return amount !== undefined && Number.isSafeInteger(amount) && amount > 0 &&
      amount <= Math.min(input.maxRequestMicros, input.remainingBudgetMicros);
  };
  if (!input.verified.includes(baseline.model))
    return { kind: "unavailable", reason: "entitlement", policyVersion: adaptiveVersion } as const;
  if (!withinBudget(baseline.model))
    return { kind: "unavailable", reason: "budget", policyVersion: adaptiveVersion } as const;
  if (input.premiumApproved && input.readOnly && input.complexity === "complex") {
    const candidates = input.evidence.filter((item) => {
      if (item.model === baseline.model || !Object.hasOwn(modelRegistry, item.model)) return false;
      const model = modelRegistry[item.model];
      return item.task === input.complexity && item.safetyFailures === 0 &&
        Number.isSafeInteger(item.samples) && item.samples >= 30 &&
        Number.isSafeInteger(item.qualityGainBasisPoints) && item.qualityGainBasisPoints >= 500 &&
        item.qualityGainBasisPoints <= 10_000 &&
        item.latencyP95Ms > 0 && item.latencyP95Ms <= input.remainingDeadlineMs &&
        input.platformAllowed.includes(item.model) && input.organizationAllowed.includes(item.model) &&
        input.verified.includes(item.model) && model.endpoint === "responses" &&
        (!input.requiredTools || model.functions) && model.structuredOutputs &&
        Object.values(model.prices).every((value) => Number.isSafeInteger(value) && value > 0) && withinBudget(item.model);
    });
    candidates.sort((a, b) => input.reservationFor(a.model)! - input.reservationFor(b.model)!);
    const candidate = candidates[0];
    if (candidate) return { kind: "model", model: candidate.model, reason: "measured_improvement", policyVersion: adaptiveVersion } as const;
  }
  return { ...baseline, policyVersion: adaptiveVersion };
}
