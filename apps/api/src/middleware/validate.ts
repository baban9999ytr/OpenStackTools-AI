import type { RequestHandler } from "express";
import { z } from "zod";
export const validate =
  <T extends z.ZodType>(schema: T): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res
        .status(422)
        .json({
          error: "Invalid input",
          details: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      return;
    }
    req.body = result.data;
    next();
  };
export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const password = z.string().min(12).max(128);
export const origin = z
  .url()
  .transform((value) => new URL(value).origin)
  .refine((value) => value !== "null");
