import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) =>
  createHmac("sha256", env.sessionSecret).update(token).digest("hex");
export const newPublicKey = () =>
  `ost_${randomBytes(18).toString("base64url")}`;

const channelTokenKey = () => createHmac("sha256", env.sessionSecret).update("channel-interaction-token-v1").digest();
export const sealChannelToken = (token: string) => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", channelTokenKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${nonce.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
};
export const openChannelToken = (sealed: string) => {
  const [version, nonce, encrypted, tag] = sealed.split(".");
  if (version !== "v1" || !nonce || !encrypted || !tag) throw new Error("Invalid sealed channel token");
  const decipher = createDecipheriv("aes-256-gcm", channelTokenKey(), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
};
