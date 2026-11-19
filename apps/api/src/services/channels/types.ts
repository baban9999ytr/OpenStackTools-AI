export type ChannelName = "website" | "telegram" | "whatsapp" | "instagram";
export type NormalizedInbound = {
  channel: ChannelName;
  channelConnectionId: string;
  externalConversationId: string;
  externalMessageId: string;
  senderId: string;
  text?: string;
  interaction?: { type: "button" | "quick_reply" | "text_confirmation"; actionToken?: string; providerInteractionId?: string };
  receivedAt: string;
};
export type ChannelCapabilities = {
  text: boolean;
  buttons: boolean;
  quickReplies: boolean;
  maxTextLength: number;
  maxButtonPayloadBytes: number;
};
export type OutboundMessage = {
  externalConversationId: string;
  text: string;
  confirmation?: { token: string; label: string };
};
export type DeliveryResult = { providerMessageId: string };
export type WebhookVerificationInput = {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
};
export interface ChannelAdapter {
  readonly channel: ChannelName;
  readonly capabilities: ChannelCapabilities;
  verifyWebhook(input: WebhookVerificationInput, configuredSecret: string): boolean;
  normalize(payload: unknown, connectionId: string): NormalizedInbound | null;
  send(token: string, message: OutboundMessage): Promise<DeliveryResult>;
  acknowledge?(token: string, callbackQueryId: string, text?: string): Promise<void>;
}
