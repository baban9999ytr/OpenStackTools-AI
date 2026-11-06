import OpenAI from "openai";
import { env } from "../config/env.js";
export const MAX_COMPLETION_TOKENS = 800;
export type Turn = { role: "customer" | "assistant" | "agent"; text: string };
export type AIReply = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};
export type AIResponder = (
  instructions: string,
  history: Turn[],
) => Promise<AIReply>;
const client = new OpenAI({
  apiKey: env.openaiApiKey,
  baseURL: "https://api.openai.com/v1",
  timeout: 30000,
  // A timeout may happen after the provider has billed a request. The queue
  // decides whether a new attempt is safe; the SDK must not replay it.
  maxRetries: 0,
});
export const providerFailurePolicy = (error: unknown) => {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 429)
    return { code: "provider_rate_limited", retry: true, uncertain: false };
  if (typeof status === "number" && [400, 401, 403, 404, 422].includes(status))
    return { code: "provider_rejected", retry: false, uncertain: false };
  return { code: "provider_unavailable", retry: false, uncertain: true };
};
export const openAIResponder: AIResponder = async (instructions, history) => {
  const response = await client.chat.completions.create({
    model: env.openaiModel,
    messages: [
      { role: "system", content: instructions },
      ...history.map((turn) => ({
        role:
          turn.role === "assistant"
            ? ("assistant" as const)
            : ("user" as const),
        content: turn.text,
      })),
    ],
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  });
  const text = response.choices[0]?.message.content;
  if (!text?.trim()) throw new Error("Empty AI response");
  if (
    !response.usage ||
    !Number.isSafeInteger(response.usage.prompt_tokens) ||
    !Number.isSafeInteger(response.usage.completion_tokens) ||
    response.usage.prompt_tokens < 0 ||
    response.usage.completion_tokens < 0
  )
    throw new Error("AI response omitted valid usage");
  return {
    text,
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
  };
};
