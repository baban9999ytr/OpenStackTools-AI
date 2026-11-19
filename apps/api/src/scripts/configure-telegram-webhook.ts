import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ChannelConnection } from "../models/index.js";
import { channelSecret } from "../services/channels/telegram-service.js";

const args = Object.fromEntries(process.argv.slice(2).filter((item) => item.startsWith("--") && item.includes("="))
  .map((item) => { const index = item.indexOf("="); return [item.slice(2, index), item.slice(index + 1)]; }));
if (args.confirm !== "set-webhook" || !mongoose.isValidObjectId(args.connection ?? ""))
  throw new Error("Provide --confirm=set-webhook --connection=CONNECTION_ID --publicOrigin=https://your-api-origin");
let origin: URL;
try { origin = new URL(args.publicOrigin ?? ""); }
catch { throw new Error("A valid HTTPS public origin is required"); }
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
  (origin.port && !["443", "88", "8443"].includes(origin.port)))
  throw new Error("publicOrigin must be an HTTPS origin without path, query or credentials");

await mongoose.connect(env.mongoUrl);
try {
  const connection = await ChannelConnection.findOne({ _id: args.connection, channel: "telegram", active: true }).lean();
  if (!connection || connection.credentialSource === "managed") throw new Error("Active operator-managed Telegram connection unavailable");
  const token = channelSecret(connection.credentialEnv, "token");
  const secret = channelSecret(connection.webhookSecretEnv, "webhook");
  if (!token || !secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) throw new Error("Telegram secret configuration unavailable or invalid");
  const call = async (method: string, body?: Record<string, unknown>) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json() as { ok?: boolean; result?: { id?: number } };
    if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed with status ${response.status}`);
    return result.result;
  };
  const bot = await call("getMe");
  if (String(bot?.id) !== connection.externalAccountId) throw new Error("Configured bot ID does not match the token owner");
  const webhook = new URL(`/api/channels/telegram/${connection._id}/webhook`, origin);
  await call("setWebhook", { url: webhook.toString(), secret_token: secret, allowed_updates: ["message", "callback_query"] });
  process.stdout.write(`Webhook configured for Telegram connection ${connection._id}\n`);
} finally { await mongoose.disconnect(); }
