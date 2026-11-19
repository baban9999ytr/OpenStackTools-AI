import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Conversation, Message, UsageEvent, WidgetRequest } from "../models/index.js";
import { validate } from "../middleware/validate.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { businessStateSchema } from "../services/business-conversation.js";

const router = Router();
const failureCategory = (code?: string | null) => {
  if (code === "budget_exhausted") return "budget";
  if (code === "provider_rate_limited") return "rate_limit";
  if (code === "provider_model_unavailable" || code === "provider_rejected" || code === "assistant_unavailable") return "configuration";
  return code === "provider_unavailable" ? "provider" : "incomplete";
};
router.use(requireUser);
router.get(
  "/:organizationId/conversations",
  requireMembership(["owner", "admin", "agent", "viewer"]),
  async (_req, res) => {
    const conversations = await Conversation.find({
      organizationId: res.locals.organizationId,
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json({ conversations });
  },
);
router.get(
  "/:organizationId/conversations/:conversationId/messages",
  requireMembership(["owner", "admin", "agent", "viewer"]),
  async (req, res) => {
    if (!isValidObjectId(req.params.conversationId)) {
      res.status(400).json({ error: "Invalid conversation" });
      return;
    }
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      organizationId: res.locals.organizationId,
    }).lean();
    if (!conversation) {
      res.status(404).json({ error: "Conversation unavailable" });
      return;
    }
    const scope = { organizationId: res.locals.organizationId, conversationId: conversation._id };
    const [messages, failed] = await Promise.all([
      Message.find(scope).sort({ createdAt: -1, _id: -1 }).limit(200).lean(),
      WidgetRequest.find({ ...scope, status: "failed" }).select("errorCode createdAt").sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    const business = businessStateSchema.safeParse(conversation.workflow?.business).data;
    const values = business?.values;
    const preferences = {
      locations: business?.alternatives.location ?? (typeof values?.location?.value === "string" ? [values.location.value] : []),
      rooms: business?.alternatives.rooms ?? (typeof values?.rooms?.value === "number" ? [values.rooms.value] : []),
      ...(typeof values?.budget?.value === "number" ? { budget: values.budget.value } : {}),
      ...(typeof values?.currency?.value === "string" ? { currency: values.currency.value } : {}),
      ...(typeof values?.listingType?.value === "string" ? { listingType: values.listingType.value } : {}),
      ...(typeof values?.propertyType?.value === "string" ? { propertyType: values.propertyType.value } : {}),
      budgetUnknown: business?.budgetUnknown ?? false,
    };
    res.json({ conversation, messages: messages.reverse(), preferences,
      recentFailures: failed.map((item) => ({ category: failureCategory(item.errorCode), createdAt: item.createdAt })) });
  },
);
router.patch(
  "/:organizationId/conversations/:conversationId/status",
  requireMembership(["owner", "admin", "agent"]),
  validate(z.strictObject({ status: z.enum(["bot", "handoff", "closed"]) })),
  async (req, res) => {
    if (!isValidObjectId(req.params.conversationId)) {
      res.status(400).json({ error: "Invalid conversation" });
      return;
    }
    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: req.params.conversationId,
        organizationId: res.locals.organizationId,
      },
      {
        $set: {
          status: req.body.status,
          assignedTo: req.body.status === "handoff" ? res.locals.userId : null,
        },
      },
      { returnDocument: "after" },
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation unavailable" });
      return;
    }
    res.json({ conversation });
  },
);
router.post(
  "/:organizationId/conversations/:conversationId/reply",
  requireMembership(["owner", "admin", "agent"]),
  validate(z.strictObject({ text: z.string().trim().min(1).max(4000) })),
  async (req, res) => {
    if (!isValidObjectId(req.params.conversationId)) {
      res.status(400).json({ error: "Invalid conversation" });
      return;
    }
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      organizationId: res.locals.organizationId,
      status: "handoff",
    });
    if (!conversation) {
      res.status(409).json({ error: "Conversation is not in handoff" });
      return;
    }
    const message = await Message.create({
      organizationId: res.locals.organizationId,
      conversationId: conversation._id,
      role: "agent",
      text: req.body.text,
    });
    res.status(201).json({ message });
  },
);
router.get(
  "/:organizationId/usage",
  requireMembership(["owner", "admin"]),
  async (_req, res) => {
    const events = await UsageEvent.find({
      organizationId: res.locals.organizationId,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const [totals] = await UsageEvent.aggregate<{
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      cacheWriteTokens: number;
      reasoningTokens: number;
      estimatedCostMicros: number;
    }>([
      { $match: { organizationId: res.locals.organizationId } },
      {
        $group: {
          _id: null,
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          cachedInputTokens: { $sum: "$cachedInputTokens" },
          cacheWriteTokens: { $sum: "$cacheWriteTokens" },
          reasoningTokens: { $sum: "$reasoningTokens" },
          estimatedCostMicros: { $sum: "$estimatedCostMicros" },
        },
      },
    ]);
    res.json({
      totals: totals ?? {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        estimatedCostMicros: 0,
      },
      recentEvents: events,
    });
  },
);
export default router;
