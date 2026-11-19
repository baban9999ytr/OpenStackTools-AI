import type { RequestHandler } from "express";
import { RateCounter } from "../models/index.js";
import { tokenHash } from "../services/tokens.js";

export const distributedLimit =
  (scope: string, limit: number, windowMs: number, identity?: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => string): RequestHandler =>
  async (req, res, next) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const key = tokenHash(
      `${scope}:${identity?.(req, res) ?? req.ip ?? req.socket.remoteAddress}:${bucket}`,
    );
    const expiresAt = new Date((bucket + 1) * windowMs + 60_000);
    try {
      await RateCounter.updateOne(
        { key },
        { $setOnInsert: { count: 0, expiresAt } },
        { upsert: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const counter = await RateCounter.findOneAndUpdate(
      { key, count: { $lt: limit } },
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
    const resetSeconds = Math.max(
      1,
      Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000),
    );
    res.set("RateLimit-Limit", String(limit));
    res.set(
      "RateLimit-Remaining",
      String(Math.max(0, limit - (counter?.count ?? limit))),
    );
    res.set("RateLimit-Reset", String(resetSeconds));
    if (!counter) {
      res.set("Retry-After", String(resetSeconds));
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }
    next();
  };

export const generalLimit = distributedLimit("general", 120, 60_000);
export const authLimit = distributedLimit("auth", 15, 15 * 60_000);
const widgetSessionId = (_req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) =>
  res.locals.widgetSession._id.toString() as string;
// Broad IP guard covers invalid tokens; authenticated read polling has its own
// quota and never spends the AI submission allowance.
export const widgetAbuseLimit = distributedLimit("widget-abuse", 600, 60_000);
export const widgetSessionLimit = distributedLimit("widget-session-create", 20, 15 * 60_000);
export const widgetReadLimit = distributedLimit("widget-read", 120, 60_000, widgetSessionId);
export const widgetMessageLimit = distributedLimit("widget-message", 10, 60_000, widgetSessionId);
export const widgetMessageIpLimit = distributedLimit("widget-message-ip", 30, 60_000);
export const widgetMutationLimit = distributedLimit("widget-mutation", 20, 60_000, widgetSessionId);
