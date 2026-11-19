import { z } from "zod";
import { env } from "../config/env.js";

export const pricingVersion = "openai-2026-11-13-standard-v1";
export const pricingSource = "https://developers.openai.com/api/docs/pricing";
export const profileModels = {
  economical: "gpt-6-luna",
  balanced: "gpt-6.1-terra",
  advanced: "gpt-6.1-sol",
} as const;
export type Profile = keyof typeof profileModels;
export type ModelId = (typeof profileModels)[Profile] | "gpt-6-astra";
export type Effort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type Tier = "default";
const effortOrder: Effort[] = ["none", "low", "medium", "high", "xhigh", "max"];
export const configuredMaxEffort = (): Effort => {
  const value = process.env.AI_MAX_REASONING_EFFORT ?? "medium";
  if (!effortOrder.includes(value as Effort)) throw new Error("Invalid AI_MAX_REASONING_EFFORT");
  return value as Effort;
};
export const effectiveMaxEffort = (organizationLimit?: string | null): Effort => {
  const platform = configuredMaxEffort();
  if (organizationLimit == null) return platform;
  const index = effortOrder.indexOf(organizationLimit as Effort);
  if (index < 0) throw new Error("Invalid organization reasoning limit");
  return effortOrder[Math.min(index, effortOrder.indexOf(platform))]!;
};
export const modelRegistry: Record<ModelId, {
  name: string; efforts: readonly Effort[]; defaultEffort: Effort;
  tiers: readonly Tier[]; defaultTier: Tier; endpoint: "responses";
  functions: true; structuredOutputs: true; availability: string;
  prices: { input: number; cachedInput: number; cacheWrite: number; output: number };
}> = {
  "gpt-6-astra": { name: "Astra", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "medium",
    tiers: ["default"], defaultTier: "default", endpoint: "responses", functions: true, structuredOutputs: true,
    availability: "Project entitlement must be verified separately.",
    prices: { input: 10_000_000, cachedInput: 1_000_000, cacheWrite: 25_000_000, output: 50_000_000 } },
  "gpt-6-luna": { name: "Luna", efforts: ["none", "low", "medium", "high", "xhigh", "max"], defaultEffort: "medium",
    tiers: ["default"], defaultTier: "default", endpoint: "responses", functions: true, structuredOutputs: true,
    availability: "Project access is not established by the public model catalog.",
    prices: { input: 100_000, cachedInput: 10_000, cacheWrite: 250_000, output: 500_000 } },
  "gpt-6.1-terra": { name: "Terra", efforts: ["none", "low", "medium", "high", "xhigh", "max"], defaultEffort: "medium",
    tiers: ["default"], defaultTier: "default", endpoint: "responses", functions: true, structuredOutputs: true,
    availability: "Requires Responses API tool calling and project entitlement.",
    prices: { input: 1_000_000, cachedInput: 50_000, cacheWrite: 2_500_000, output: 5_000_000 } },
  "gpt-6.1-sol": { name: "Sol", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "medium",
    tiers: ["default"], defaultTier: "default", endpoint: "responses", functions: true, structuredOutputs: true,
    availability: "Requires Responses API tool calling and project entitlement.",
    prices: { input: 2_000_000, cachedInput: 100_000, cacheWrite: 5_000_000, output: 10_000_000 } },
};
export const configuredModels = (): ModelId[] => {
  const requested = (process.env.AI_ENABLED_MODELS ?? "gpt-6-luna").split(",").map((value) => value.trim());
  return requested.filter((value): value is ModelId => Object.hasOwn(modelRegistry, value));
};
export const productModels = { normal: "gpt-6-luna", powerful: "gpt-6.1-sol",
  very_powerful: "gpt-6-astra", automatic: "gpt-6-luna" } as const;
export type ProductMode = keyof typeof productModels;
// Operator attestation for this API project, separate from authorization. Empty by default.
export const verifiedModels = () => (process.env.AI_VERIFIED_MODELS ?? "").split(",").map((id) => id.trim());
export const productModeOptions = (allowed: readonly string[], ceiling: Effort) =>
  (Object.keys(productModels) as ProductMode[]).map((choice) => {
    let reason = "";
    try { resolveModel({ mode: "product", choice }, allowed, ceiling); }
    catch (error) { reason = (error as Error).message; }
    return { choice, model: productModels[choice], available: !reason, reason,
      reasoningEffort: modelRegistry[productModels[choice]].defaultEffort };
  });
export const modelSelectionSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("product"), choice: z.enum(["normal", "powerful", "very_powerful", "automatic"]) }),
  z.strictObject({ mode: z.literal("preset"), profile: z.enum(["economical", "balanced", "advanced"]) }),
  z.strictObject({ mode: z.literal("custom"), profile: z.enum(["economical", "balanced", "advanced"]),
    model: z.enum(["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol"]),
    reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh", "max"]),
    processingTier: z.literal("default") }),
]);
export type ModelSelection = z.infer<typeof modelSelectionSchema>;
export type EffectiveModel = { model: string; reasoningEffort?: Effort; processingTier: Tier;
  profile?: Profile; mode: "preset" | "custom" | "legacy" | "product"; prices: typeof modelRegistry[ModelId]["prices"];
  pricingVersion: string };
export const resolveModel = (selection: unknown, allowedModels: readonly string[] = configuredModels(),
  maxEffort: Effort = configuredMaxEffort()): EffectiveModel => {
  if (selection == null) return { model: env.openaiModel, reasoningEffort: env.reasoningEffort as Effort | undefined,
    processingTier: "default", mode: "legacy", pricingVersion: "legacy-env",
    prices: { input: env.inputPriceMicrosPerMillion, cachedInput: env.cachedInputPriceMicrosPerMillion,
      cacheWrite: env.cacheWritePriceMicrosPerMillion, output: env.outputPriceMicrosPerMillion } };
  const parsed = modelSelectionSchema.parse(selection);
  if (parsed.mode === "product") {
    const model = productModels[parsed.choice];
    if (!verifiedModels().includes(model)) throw new Error("Project access has not been verified");
    if (!configuredModels().includes(model) || !allowedModels.includes(model)) throw new Error("Model is not allowed by policy");
    const capability = modelRegistry[model];
    if (effortOrder.indexOf(capability.defaultEffort) > effortOrder.indexOf(effectiveMaxEffort(maxEffort)))
      throw new Error("Reasoning effort exceeds organization limit");
    if (!Object.values(capability.prices).every((price) => Number.isSafeInteger(price) && price > 0))
      throw new Error("Model pricing is invalid");
    return { model, reasoningEffort: capability.defaultEffort, processingTier: "default", mode: "product",
      prices: capability.prices, pricingVersion };
  }
  const model = parsed.mode === "preset" ? profileModels[parsed.profile] : parsed.model;
  const capabilities = modelRegistry[model];
  if (!allowedModels.includes(model)) throw new Error("Model is not allowed for this organization");
  const reasoningEffort = parsed.mode === "preset" ? capabilities.defaultEffort : parsed.reasoningEffort;
  const processingTier = parsed.mode === "preset" ? capabilities.defaultTier : parsed.processingTier;
  if (!capabilities.efforts.includes(reasoningEffort) || !capabilities.tiers.includes(processingTier))
    throw new Error("Unsupported model configuration");
  if (effortOrder.indexOf(reasoningEffort) > effortOrder.indexOf(effectiveMaxEffort(maxEffort))) throw new Error("Reasoning effort exceeds organization limit");
  return { model, reasoningEffort, processingTier, profile: parsed.profile, mode: parsed.mode,
    prices: capabilities.prices, pricingVersion };
};
export const newAssistantSelection = (allowedModels: readonly string[] = configuredModels()): ModelSelection => ({ mode: "preset",
  profile: allowedModels.includes(profileModels.balanced) ? "balanced"
    : allowedModels.includes(profileModels.economical) ? "economical" : "advanced" });
