import OpenAI from "openai";
import { env } from "../config/env.js";
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
  timeout: 30000,
  maxRetries: 1,
});
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
    max_completion_tokens: 800,
  });
  const text = response.choices[0]?.message.content;
  if (!text) throw new Error("Empty AI response");
  return {
    text,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
};
