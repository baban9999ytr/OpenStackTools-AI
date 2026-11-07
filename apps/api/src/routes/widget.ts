import { Router } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  AgentAction,
  Assistant,
  Conversation,
  Message,
  WidgetRequest,
  WidgetSession,
} from "../models/index.js";
import { ActionError, actionReply, confirmAction } from "../services/agent-actions.js";
import { AppointmentError } from "../services/appointments.js";
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
      z.strictObject({ publicKey: z.string().startsWith("ost_").max(64), locale: z.enum(["en", "tr"]).optional() }),
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
        locale: req.body.locale ?? "en",
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
    const [message, reply, action] = await Promise.all([
      Message.findOne({ requestId: request._id, role: "customer" }).lean(),
      request.responseMessageId
        ? Message.findOne({
            _id: request.responseMessageId,
            organizationId: request.organizationId,
          }).lean()
        : Promise.resolve(null),
      request.actionId ? AgentAction.findOne({ _id: request.actionId,
        organizationId: request.organizationId, visitorId: request.visitorId,
      }).select("name status result expiresAt").lean() : Promise.resolve(null),
    ]);
    return {
      requestId: request._id,
      conversationId: request.conversationId,
      status: request.status,
      message,
      reply,
      errorCode: request.errorCode,
      action: action ? { id: action._id, name: action.name, status: action.status, result: action.result, expiresAt: action.expiresAt } : null,
    };
  };
  router.get("/actions/pending", requireWidgetSession, async (_req, res) => {
    const session = res.locals.widgetSession;
    const actions = await AgentAction.find({ organizationId: session.organizationId,
      assistantId: session.assistantId, visitorId: session.visitorId,
      status: "pending", expiresAt: { $gt: new Date() },
    }).select("name arguments expiresAt").sort({ createdAt: -1 }).limit(5).lean();
    const settled = await WidgetRequest.find({ organizationId: session.organizationId,
      assistantId: session.assistantId, visitorId: session.visitorId,
      status: "completed", actionId: { $in: actions.map((action) => action._id) },
    }).select("actionId").lean();
    const visible = new Set(settled.map((request) => request.actionId?.toString()));
    res.json({ actions: actions.filter((action) => visible.has(action._id.toString())).map((action) => ({ id: action._id,
      name: action.name, arguments: action.arguments, expiresAt: action.expiresAt,
    })) });
  });
  router.post("/actions/:actionId/confirm", requireWidgetSession, async (req, res) => {
    const actionId = req.params.actionId;
    if (typeof actionId !== "string" || !isValidObjectId(actionId)) { res.status(400).json({ error: "Invalid action" }); return; }
    const widget = res.locals.widgetSession;
    try {
      const action = await confirmAction({ organizationId: widget.organizationId,
        assistantId: widget.assistantId, visitorId: widget.visitorId,
        conversationId: widget.currentConversationId,
      }, new mongoose.Types.ObjectId(actionId));
      res.json({ action: { id: action._id, name: action.name, status: action.status,
        result: action.result }, message: actionReply(action) });
    } catch (error) {
      if (error instanceof AppointmentError || error instanceof ActionError) {
        res.status(error.code === "slot_taken" ? 409 : 403).json({ error: error.code }); return;
      }
      throw error;
    }
  });
  router.post("/actions/:actionId/decline", requireWidgetSession, async (req, res) => {
    const actionId = req.params.actionId;
    if (typeof actionId !== "string" || !isValidObjectId(actionId)) { res.status(400).json({ error: "Invalid action" }); return; }
    const widget = res.locals.widgetSession;
    const action = await AgentAction.findOneAndUpdate({ _id: actionId, organizationId: widget.organizationId,
      assistantId: widget.assistantId, visitorId: widget.visitorId, status: "pending",
    }, { $set: { status: "failed", result: { declined: true } } }, { returnDocument: "after" });
    if (!action) { res.status(404).json({ error: "Action unavailable" }); return; }
    res.json({ ok: true });
  });
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
