import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Assistant, ChannelConnection } from "../models/index.js";
import { channelSecret } from "../services/channels/telegram-service.js";

const args = Object.fromEntries(process.argv.slice(2).filter((item) => item.startsWith("--") && item.includes("="))
  .map((item) => { const index = item.indexOf("="); return [item.slice(2, index), item.slice(index + 1)]; }));
if (args.confirm !== "bind" || !args.assistant || !/^\d{1,20}$/.test(args.botId ?? "") ||
  !args.credentialEnv || !args.webhookSecretEnv ||
  !channelSecret(args.credentialEnv, "token") || !channelSecret(args.webhookSecretEnv, "webhook"))
  throw new Error("Provide --confirm=bind --assistant=PUBLIC_KEY --botId=BOT_ID --credentialEnv=OST_TELEGRAM_BOT_TOKEN_* --webhookSecretEnv=OST_TELEGRAM_WEBHOOK_SECRET_* with both secrets configured");
await mongoose.connect(env.mongoUrl);
try {
  const assistant = await Assistant.findOne({ publicKey: args.assistant, active: true }).lean();
  if (!assistant) throw new Error("Assistant unavailable");
  const existing = await ChannelConnection.findOne({ channel: "telegram", externalAccountId: args.botId }).lean();
  if (existing) {
    if (!existing.organizationId.equals(assistant.organizationId) || !existing.assistantId.equals(assistant._id) ||
      existing.credentialEnv !== args.credentialEnv || existing.webhookSecretEnv !== args.webhookSecretEnv)
      throw new Error("Telegram bot ID is already bound differently");
    process.stdout.write(`Existing Telegram connection: ${existing._id}\n`);
  } else {
    const connection = await ChannelConnection.create({ organizationId: assistant.organizationId, assistantId: assistant._id,
      channel: "telegram", externalAccountId: args.botId, credentialEnv: args.credentialEnv,
      webhookSecretEnv: args.webhookSecretEnv, active: true });
    process.stdout.write(`Telegram connection created: ${connection._id}\n`);
  }
} finally { await mongoose.disconnect(); }
