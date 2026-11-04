import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) =>
  createHmac("sha256", env.sessionSecret).update(token).digest("hex");
export const newPublicKey = () =>
  `ost_${randomBytes(18).toString("base64url")}`;
