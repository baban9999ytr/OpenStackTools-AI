import { rateLimit } from "express-rate-limit";
export const generalLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
export const authLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
export const widgetLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
