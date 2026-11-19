import { Router } from "express";
import mongoose from "mongoose";
import { Assistant, ChannelConnection, ChannelInbound } from "../models/index.js";
import { processTelegramInbound } from "../services/channels/telegram-service.js";
import { resolveChannelCredential } from "../services/channels/credentials.js";
import { telegramAdapter } from "../services/channels/telegram.js";
import type { ChannelAdapter } from "../services/channels/types.js";
import { distributedLimit } from "../middleware/limits.js";
import { logger, safeError } from "../config/logger.js";
import { sealChannelToken } from "../services/tokens.js";

export const telegramRoutes = (adapter: ChannelAdapter = telegramAdapter) => {
  const router = Router();
  router.use(distributedLimit("telegram-webhook", 300, 60_000, (req) => String(req.params.connectionId ?? req.ip)));
  router.post("/:connectionId/webhook", async (req, res) => {
    const connectionId = req.params.connectionId;
    if (typeof connectionId !== "string" || !mongoose.isValidObjectId(connectionId)) { res.sendStatus(404); return; }
    const connection = await ChannelConnection.findOne({ _id: connectionId, channel: "telegram", active: true }).lean();
    const configured = connection ? await resolveChannelCredential(connection, "webhook") : null;
    if (!configured || !adapter.verifyWebhook({ headers: req.headers,
      rawBody: (req as typeof req & { rawBody?: Buffer }).rawBody }, configured)) {
      logger.warn({ connectionId }, "telegram.webhook.rejected");
      res.sendStatus(403); return;
    }
    if (!await Assistant.exists({ _id: connection!.assistantId, organizationId: connection!.organizationId, active: true })) {
      res.sendStatus(404); return;
    }
    const normalized = adapter.normalize(req.body, connectionId);
    if (!normalized) { logger.info({ connectionId }, "telegram.webhook.ignored"); res.json({ ok: true, ignored: true }); return; }
    const key = { channelConnectionId: connection!._id, externalMessageId: normalized.externalMessageId };
    let inbound = await ChannelInbound.findOne(key);
    if (!inbound) {
      try { inbound = await ChannelInbound.create({ ...key, organizationId: connection!.organizationId, externalConversationId: normalized.externalConversationId,
        senderId: normalized.senderId, kind: normalized.interaction ? "callback" : "message",
        ...(normalized.text ? { text: normalized.text } : {}),
        ...(normalized.interaction?.actionToken ? { interactionToken: sealChannelToken(normalized.interaction.actionToken) } : {}),
        ...(normalized.interaction?.providerInteractionId ? { callbackQueryId: normalized.interaction.providerInteractionId } : {}),
        status: "received" }); }
      catch (error) { if ((error as { code?: number }).code !== 11000) throw error; inbound = await ChannelInbound.findOne(key); }
    }
    if (!inbound) throw new Error("Inbound update unavailable");
    logger.info({ connectionId, inboundId: inbound._id.toString(), kind: inbound.kind,
      status: inbound.status }, "telegram.webhook.persisted");
    if (inbound.status !== "handled") {
      try { await processTelegramInbound(inbound._id, adapter); }
      catch (error) {
        logger.warn({ inboundId: inbound._id.toString(), failure: safeError(error) }, "Telegram inbound processing failed");
        res.sendStatus(503); return;
      }
    }
    logger.info({ connectionId, inboundId: inbound._id.toString() }, "telegram.webhook.accepted");
    res.json({ ok: true });
  });
  return router;
};
