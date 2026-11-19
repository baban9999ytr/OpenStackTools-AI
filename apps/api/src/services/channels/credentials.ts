import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { ChannelConnection, ChannelCredential } from "../../models/index.js";

export const channelSecret = (name: string, kind: "token" | "webhook") => {
  const pattern = kind === "token" ? /^OST_TELEGRAM_BOT_TOKEN_[A-Z0-9_]+$/ : /^OST_TELEGRAM_WEBHOOK_SECRET_[A-Z0-9_]+$/;
  if (!pattern.test(name)) return null;
  return process.env[name]?.trim() || null;
};

type Sealed = { ciphertext: string; nonce: string; tag: string };
export class ChannelCredentialError extends Error { constructor() { super("credential_decryption_failed"); } }
const keyFor = (keyId: string) => {
  if (!/^[A-Z0-9_]{1,24}$/.test(keyId)) throw new Error("Channel credential key unavailable");
  const encoded = process.env[`CHANNEL_CREDENTIAL_KEY_${keyId}`];
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Channel credential key unavailable");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Channel credential key unavailable");
  return key;
};
const seal = (value: string, keyId: string, purpose: string): Sealed => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(keyId), nonce);
  cipher.setAAD(Buffer.from(purpose));
  return { ciphertext: Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64"),
    nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
};
const open = (sealed: Sealed, keyId: string, purpose: string) => {
  const decipher = createDecipheriv("aes-256-gcm", keyFor(keyId), Buffer.from(sealed.nonce, "base64"));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
};
export const requireActiveCredentialKey = () => {
  const keyId = env.channelCredentialActiveKeyId;
  if (!keyId) throw new Error("Channel credential key unavailable");
  keyFor(keyId);
  return keyId;
};
export const saveManagedCredentials = async (connection: typeof ChannelConnection.prototype, token: string,
  webhookSecret: string, session?: mongoose.ClientSession) => {
  const keyId = requireActiveCredentialKey();
  const tokenSealed = seal(token, keyId, `${connection._id}:telegram:token`);
  const webhookSealed = seal(webhookSecret, keyId, `${connection._id}:telegram:webhook`);
  await ChannelCredential.updateOne({ connectionId: connection._id, organizationId: connection.organizationId }, {
    $set: { keyId, tokenCiphertext: tokenSealed.ciphertext, tokenNonce: tokenSealed.nonce,
      tokenTag: tokenSealed.tag, webhookCiphertext: webhookSealed.ciphertext,
      webhookNonce: webhookSealed.nonce, webhookTag: webhookSealed.tag },
  }, { upsert: true, ...(session ? { session } : {}) });
};
export const resolveChannelCredential = async (connection: typeof ChannelConnection.prototype,
  kind: "token" | "webhook") => {
  if (connection.credentialSource !== "managed") return channelSecret(kind === "token" ? connection.credentialEnv : connection.webhookSecretEnv, kind);
  const stored = await ChannelCredential.findOne({ connectionId: connection._id, organizationId: connection.organizationId }).lean();
  if (!stored) return null;
  try {
    return kind === "token"
      ? open({ ciphertext: stored.tokenCiphertext, nonce: stored.tokenNonce, tag: stored.tokenTag }, stored.keyId,
        `${connection._id}:telegram:token`)
      : open({ ciphertext: stored.webhookCiphertext, nonce: stored.webhookNonce, tag: stored.webhookTag }, stored.keyId,
        `${connection._id}:telegram:webhook`);
  } catch {
    await ChannelConnection.updateOne({ _id: connection._id, organizationId: connection.organizationId,
      credentialSource: "managed" }, { $set: { active: false, status: "needs_attention",
      lastErrorCategory: "credential_decryption_failed" } });
    logger.error({ connectionId: connection._id.toString(), category: "credential_decryption_failed" },
      "Managed channel credential unavailable");
    throw new ChannelCredentialError();
  }
};
