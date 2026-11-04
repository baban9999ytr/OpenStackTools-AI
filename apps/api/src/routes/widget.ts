import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  Assistant,
  Conversation,
  Message,
  WidgetRequest,
  WidgetSession,
} from "../models/index.js";
import { validate } from "../middleware/validate.js";
import { requireWidgetSession } from "../middleware/security.js";
import { widgetLimit } from "../middleware/limits.js";
import { newToken, tokenHash } from "../services/tokens.js";
import type { AIResponder } from "../services/ai.js";
import {
  enqueueWidgetMessage,
  processWidgetRequest,
  WidgetConflict,
  WidgetNotFound,
} from "../services/widget-queue.js";

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
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await WidgetSession.create({
        tokenHash: tokenHash(token),
        organizationId: assistant.organizationId,
        assistantId: assistant._id,
        visitorId,
        origin,
        expiresAt,
      });
      res
        .status(201)
        .json({ token, expiresAt, assistant: { name: assistant.name } });
    },
  );
  router.get("/sessions/current", requireWidgetSession, async (_req, res) => {
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
    res.json({
      assistant: { name: assistant.name },
      conversationId: session.currentConversationId,
      expiresAt: session.expiresAt,
    });
  });
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
        .sort({ createdAt: 1, _id: 1 })
        .limit(100)
        .lean();
      res.json({ conversation, messages });
    },
  );
  const responseFor = async (request: typeof WidgetRequest.prototype) => {
    const [message, reply] = await Promise.all([
      Message.findOne({ requestId: request._id, role: "customer" }).lean(),
      request.responseMessageId
        ? Message.findOne({
            _id: request.responseMessageId,
            organizationId: request.organizationId,
          }).lean()
        : Promise.resolve(null),
    ]);
    return {
      requestId: request._id,
      conversationId: request.conversationId,
      status: request.status,
      message,
      reply,
      errorCode: request.errorCode,
    };
  };
  router.get("/requests/:requestId", requireWidgetSession, async (req, res) => {
    if (!isValidObjectId(req.params.requestId)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const session = res.locals.widgetSession;
    const found = await WidgetRequest.findOne({
      _id: req.params.requestId,
      organizationId: session.organizationId,
      assistantId: session.assistantId,
      visitorId: session.visitorId,
    });
    if (!found) {
      res.status(404).json({ error: "Request unavailable" });
      return;
    }
    res.json(await responseFor(found));
  });
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
      if (
        req.body.conversationId &&
        !isValidObjectId(req.body.conversationId)
      ) {
        res.status(400).json({ error: "Invalid conversation" });
        return;
      }
      const assistant = await Assistant.findOne({
        _id: session.assistantId,
        organizationId: session.organizationId,
        active: true,
      }).lean();
      if (!assistant) {
        res.status(404).json({ error: "Assistant unavailable" });
        return;
      }
      try {
        const queued = await enqueueWidgetMessage(session, req.body);
        if (queued.status === "queued")
          await processWidgetRequest(queued._id, respond);
        const current = await WidgetRequest.findById(queued._id);
        if (!current) throw new Error("Queued request missing");
        if (current.errorCode === "budget_exhausted") {
          res
            .status(402)
            .json({
              error: "Organization AI budget exhausted",
              requestId: current._id,
              conversationId: current.conversationId,
            });
          return;
        }
        if (current.status === "failed") {
          res
            .status(502)
            .json({
              error: "Assistant temporarily unavailable",
              requestId: current._id,
              conversationId: current.conversationId,
            });
          return;
        }
        const payload = await responseFor(current);
        res.status(current.status === "completed" ? 201 : 202).json(payload);
      } catch (error) {
        if (error instanceof WidgetConflict) {
          res.status(409).json({ error: error.message });
          return;
        }
        if (error instanceof WidgetNotFound) {
          res.status(404).json({ error: error.message });
          return;
        }
        throw error;
      }
    },
  );
  return router;
};
