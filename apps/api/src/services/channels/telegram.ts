import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import type { ChannelAdapter, NormalizedInbound, OutboundMessage } from "./types.js";

const id = z.union([z.string(), z.number().int()]).transform(String);
const user = z.object({ id });
const chat = z.object({ id, type: z.string() });
const message = z.object({ message_id: z.number().int(), from: user.optional(), chat, text: z.string().max(4000).optional(), date: z.number().int().optional() });
const update = z.object({ update_id: z.number().int(), message: message.optional(),
  callback_query: z.object({ id: z.string(), from: user, data: z.string().max(64).optional(), message: message.optional() }).optional() });

export const telegramPlainText = (value: string) => value
  .replace(/\*\*([^*\n]+)\*\*/g, "$1")
  .replace(/__([^_\n]+)__/g, "$1")
  .replace(/`([^`\n]+)`/g, "$1");

export const telegramAdapter: ChannelAdapter = {
  channel: "telegram",
  capabilities: { text: true, buttons: true, quickReplies: false, maxTextLength: 4096, maxButtonPayloadBytes: 64 },
  verifyWebhook(input, configuredSecret) {
    const header = input.headers["x-telegram-bot-api-secret-token"];
    const suppliedSecret = typeof header === "string" ? header : undefined;
    if (!suppliedSecret || !configuredSecret) return false;
    const supplied = Buffer.from(suppliedSecret);
    const configured = Buffer.from(configuredSecret);
    return supplied.length === configured.length && timingSafeEqual(supplied, configured);
  },
  normalize(payload: unknown, connectionId: string): NormalizedInbound | null {
    const parsed = update.safeParse(payload);
    if (!parsed.success) return null;
    const base = { channel: "telegram" as const, channelConnectionId: connectionId,
      externalMessageId: String(parsed.data.update_id), receivedAt: new Date().toISOString() };
    const msg = parsed.data.message;
    if (msg?.chat.type === "private" && msg.from && msg.chat.id === msg.from.id && msg.text?.trim()) return {
      ...base, externalConversationId: msg.chat.id, senderId: msg.from.id, text: msg.text.trim() };
    const callback = parsed.data.callback_query;
    if (callback?.message?.chat.type === "private" && callback.message.chat.id === callback.from.id && callback.data) return {
      ...base, externalConversationId: callback.message.chat.id, senderId: callback.from.id,
      interaction: { type: "button", actionToken: callback.data, providerInteractionId: callback.id } };
    return null;
  },
  async send(token: string, message: OutboundMessage) {
    const body: Record<string, unknown> = { chat_id: message.externalConversationId, text: telegramPlainText(message.text).slice(0, 4096) };
    if (message.confirmation && Buffer.byteLength(message.confirmation.token) <= 64)
      body.reply_markup = { inline_keyboard: [[{ text: message.confirmation.label, callback_data: message.confirmation.token }]] };
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; error_code?: number; parameters?: { retry_after?: number } };
    if (!response.ok || !data.ok || !data.result?.message_id) {
      const error = new Error("Telegram delivery failed") as Error & { status?: number; retryAfter?: number };
      error.status = data.error_code ?? response.status;
      error.retryAfter = data.parameters?.retry_after;
      throw error;
    }
    return { providerMessageId: String(data.result.message_id) };
  },
  async acknowledge(token: string, callbackQueryId: string, text?: string) {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }), signal: AbortSignal.timeout(5_000),
    });
  },
};
