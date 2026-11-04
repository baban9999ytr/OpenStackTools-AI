import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Assistant } from "../models/index.js";
import { validate, origin } from "../middleware/validate.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { newPublicKey } from "../services/tokens.js";
const router = Router();
router.use(requireUser);
const input = z.strictObject({
  name: z.string().trim().min(2).max(80),
  instructions: z.string().trim().min(10).max(8000),
  allowedOrigins: z.array(origin).max(10),
  active: z.boolean().optional(),
});
router.get(
  "/:organizationId/assistants",
  requireMembership(["owner", "admin", "agent", "viewer"]),
  async (_req, res) => {
    const assistants = await Assistant.find({
      organizationId: res.locals.organizationId,
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ assistants });
  },
);
router.post(
  "/:organizationId/assistants",
  requireMembership(["owner", "admin"]),
  validate(input),
  async (req, res) => {
    const assistant = await Assistant.create({
      ...req.body,
      allowedOrigins: [...new Set(req.body.allowedOrigins)],
      organizationId: res.locals.organizationId,
      publicKey: newPublicKey(),
    });
    res.status(201).json({ assistant });
  },
);
router.patch(
  "/:organizationId/assistants/:assistantId",
  requireMembership(["owner", "admin"]),
  validate(input.partial()),
  async (req, res) => {
    if (!isValidObjectId(req.params.assistantId)) {
      res.status(400).json({ error: "Invalid assistant" });
      return;
    }
    const patch = { ...req.body };
    if (patch.allowedOrigins)
      patch.allowedOrigins = [...new Set(patch.allowedOrigins)];
    const assistant = await Assistant.findOneAndUpdate(
      {
        _id: req.params.assistantId,
        organizationId: res.locals.organizationId,
      },
      { $set: patch },
      { returnDocument: "after", runValidators: true },
    );
    if (!assistant) {
      res.status(404).json({ error: "Assistant unavailable" });
      return;
    }
    res.json({ assistant });
  },
);
export default router;
