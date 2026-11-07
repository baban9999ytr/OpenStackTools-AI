import OpenAI from "openai";
import { env } from "../config/env.js";
export const MAX_COMPLETION_TOKENS = env.maxCompletionTokens;
export type Turn = { role: "customer" | "assistant" | "agent"; text: string };
export type AIReply = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  usageBreakdownKnown?: boolean;
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
  if (status === 404)
    return { code: "provider_model_unavailable", retry: false, uncertain: false };
  if (typeof status === "number" && [400, 401, 403, 422].includes(status))
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
    service_tier: "default",
    ...(env.reasoningEffort ? { reasoning_effort: env.reasoningEffort as "none" | "low" | "medium" | "high" | "xhigh" | "max" } : {}),
  });
  return parseAIReply(response);
};
export const parseAIReply = (response: OpenAI.Chat.Completions.ChatCompletion): AIReply => {
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
  const cachedInputTokens = response.usage.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens = response.usage.prompt_tokens_details?.cache_write_tokens ?? 0;
  const reasoningTokens = response.usage.completion_tokens_details?.reasoning_tokens ?? 0;
  const usageBreakdownKnown =
    Number.isSafeInteger(response.usage.prompt_tokens_details?.cached_tokens) &&
    Number.isSafeInteger(response.usage.prompt_tokens_details?.cache_write_tokens);
  if (
    ![cachedInputTokens, cacheWriteTokens, reasoningTokens].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    cachedInputTokens + cacheWriteTokens > response.usage.prompt_tokens ||
    reasoningTokens > response.usage.completion_tokens
  ) throw new Error("AI response omitted valid usage details");
  if (response.service_tier && response.service_tier !== "default")
    throw new Error("AI response used an unexpected service tier");
  return {
    text,
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    cachedInputTokens,
    cacheWriteTokens,
    reasoningTokens,
    usageBreakdownKnown,
  };
};
