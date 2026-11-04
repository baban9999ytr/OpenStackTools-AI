import type { RequestHandler } from "express";
import { RateCounter } from "../models/index.js";
import { tokenHash } from "../services/tokens.js";

export const distributedLimit =
  (scope: string, limit: number, windowMs: number): RequestHandler =>
  async (req, res, next) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const key = tokenHash(
      `${scope}:${req.ip ?? req.socket.remoteAddress}:${bucket}`,
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
export const widgetLimit = distributedLimit("widget", 30, 60_000);
