export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
export type Role = "owner" | "admin" | "agent" | "viewer";
export type Organization = { id: string; name: string; role: Role };
export type Assistant = {
  _id: string;
  name: string;
  instructions: string;
  responseLength?: "short" | "balanced" | "detailed";
  modelSelection?: ModelSelection;
  conversationStrategy?: "reactive" | "real_estate";
  settingsVersion?: number;
  defaultLanguage?: "auto" | "tr" | "en";
  tone?: "warm" | "formal" | "friendly" | "concise" | "concierge";
  greetingStyle?: "brief" | "standard";
  emojiUsage?: "none" | "minimal";
  bookingNameRequired?: boolean;
  defaultAppointmentDurationMinutes?: 15 | 30 | 45 | 60 | 90 | 120;
  publicKey: string;
  allowedOrigins: string[];
  active: boolean;
};
export type ModelId = "gpt-6-luna" | "gpt-6.1-terra" | "gpt-6.1-sol";
export type Profile = "economical" | "balanced" | "advanced";
export type ProductMode = "normal" | "powerful" | "very_powerful" | "automatic";
export type ModelSelection = { mode: "product"; choice: ProductMode; profile?: never } | { mode: "preset"; profile: Profile } | {
  mode: "custom"; profile: Profile; model: ModelId;
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  processingTier: "default" };
export type ModelOptions = { productModes?: Array<{ choice: ProductMode; model: string; available: boolean; reason: string; reasoningEffort: string }>; models: Record<ModelId, { name: string; efforts: string[]; defaultEffort: string;
  tiers: string[]; prices: { input: number; output: number } }>;
  enabled: ModelId[]; maxReasoningEffort: string; pricingVersion: string; pricingSource: string; defaultSelection: ModelSelection };
export type Conversation = {
  _id: string;
  assistantId: string;
  status: "bot" | "handoff" | "closed";
  updatedAt: string;
};
export type Message = {
  _id: string;
  role: "customer" | "assistant" | "agent";
  text: string;
  createdAt: string;
};
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}
