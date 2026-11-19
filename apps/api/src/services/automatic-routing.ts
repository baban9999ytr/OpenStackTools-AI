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
