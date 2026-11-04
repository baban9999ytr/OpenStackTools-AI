import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  Assistant,
  Conversation,
  Message,
  UsageEvent,
  WidgetSession,
} from "../models/index.js";
import { validate } from "../middleware/validate.js";
import { requireWidgetSession } from "../middleware/security.js";
import { widgetLimit } from "../middleware/limits.js";
import { newToken, tokenHash } from "../services/tokens.js";
import type { AIResponder, Turn } from "../services/ai.js";
import { env } from "../config/env.js";
export const widgetRoutes = (respond: AIResponder) => {
  const router = Router();
  router.use(widgetLimit);
  router.post(
    "/sessions",
    validate(
      z.strictObject({ publicKey: z.string().startsWith("ost_").max(64) }),
    ),
    async (req, res) => {
      const origin = req.get("origin");
      if (!origin) {
        res.status(403).json({ error: "Origin required" });
        return;
      }
      const assistant = await Assistant.findOne({
        publicKey: req.body.publicKey,
        active: true,
        allowedOrigins: origin,
      }).lean();
      if (!assistant) {
        res.status(403).json({ error: "Widget unavailable for this origin" });
        return;
      }
      const token = newToken();
      const visitorId = newToken();
      await WidgetSession.create({
        tokenHash: tokenHash(token),
        organizationId: assistant.organizationId,
        assistantId: assistant._id,
        visitorId,
        origin,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      res.status(201).json({ token, assistant: { name: assistant.name } });
    },
  );
  router.get(
    "/conversations/:conversationId/messages",
    requireWidgetSession,
    async (req, res) => {
      const session = res.locals.widgetSession;
      if (!isValidObjectId(req.params.conversationId)) {
        res.status(400).json({ error: "Invalid conversation" });
        return;
      }
      const conversation = await Conversation.findOne({
        _id: req.params.conversationId,
        organizationId: session.organizationId,
        assistantId: session.assistantId,
        visitorId: session.visitorId,
      }).lean();
      if (!conversation) {
        res.status(404).json({ error: "Conversation unavailable" });
        return;
      }
      const messages = await Message.find({
        organizationId: session.organizationId,
        conversationId: conversation._id,
      })
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();
      res.json({ conversation, messages });
    },
  );
  router.post(
    "/messages",
    requireWidgetSession,
    validate(
      z.strictObject({
        text: z.string().trim().min(1).max(4000),
        conversationId: z.string().optional(),
        clientMessageId: z.uuid(),
      }),
    ),
    async (req, res) => {
      const session = res.locals.widgetSession;
      const assistant = await Assistant.findOne({
        _id: session.assistantId,
        organizationId: session.organizationId,
        active: true,
      }).lean();
      if (!assistant) {
        res.status(404).json({ error: "Assistant unavailable" });
        return;
      }
      let conversation;
      if (req.body.conversationId) {
        if (!isValidObjectId(req.body.conversationId)) {
          res.status(400).json({ error: "Invalid conversation" });
          return;
        }
        conversation = await Conversation.findOne({
          _id: req.body.conversationId,
          organizationId: session.organizationId,
          assistantId: session.assistantId,
          visitorId: session.visitorId,
        });
        if (!conversation) {
          res.status(404).json({ error: "Conversation unavailable" });
          return;
        }
      } else {
        conversation = await Conversation.create({
          organizationId: session.organizationId,
          assistantId: session.assistantId,
          visitorId: session.visitorId,
        });
      }
      if (conversation.status === "closed") {
        res.status(409).json({ error: "Conversation is closed" });
        return;
      }
      const existing = await Message.findOne({
        organizationId: session.organizationId,
        conversationId: conversation._id,
        clientMessageId: req.body.clientMessageId,
      });
      if (existing) {
        res
          .status(200)
          .json({ conversationId: conversation._id, duplicate: true });
        return;
      }
      const customerMessage = await Message.create({
        organizationId: session.organizationId,
        conversationId: conversation._id,
        role: "customer",
        text: req.body.text,
        clientMessageId: req.body.clientMessageId,
      });
      await Conversation.updateOne(
        { _id: conversation._id, organizationId: session.organizationId },
        { $set: { updatedAt: new Date() } },
      );
      if (conversation.status !== "bot") {
        res
          .status(202)
          .json({
            conversationId: conversation._id,
            message: customerMessage,
            status: conversation.status,
          });
        return;
      }
      const prior = await Message.find({
        organizationId: session.organizationId,
        conversationId: conversation._id,
        _id: { $ne: customerMessage._id },
      })
        .sort({ createdAt: -1 })
        .limit(12)
        .lean();
      const history: Turn[] = [
        ...prior
          .reverse()
          .map((item) => ({
            role: item.role as Turn["role"],
            text: item.text,
          })),
        { role: "customer", text: req.body.text },
      ];
      try {
        const answer = await respond(assistant.instructions, history);
        const reply = await Message.create({
          organizationId: session.organizationId,
          conversationId: conversation._id,
          role: "assistant",
          text: answer.text,
        });
        await UsageEvent.create({
          organizationId: session.organizationId,
          assistantId: assistant._id,
          conversationId: conversation._id,
          model: env.openaiModel,
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
        });
        res
          .status(201)
          .json({
            conversationId: conversation._id,
            message: customerMessage,
            reply,
            status: "bot",
          });
      } catch (error) {
        req.log.error({ err: error }, "AI response failed");
        res
          .status(502)
          .json({
            error: "Assistant temporarily unavailable",
            conversationId: conversation._id,
          });
      }
    },
  );
  return router;
};
