import mongoose from "mongoose";
import { Assistant, AgentAction, ChannelConnection, ChannelDelivery, ChannelIdentity, ChannelInbound,
  InteractionToken, Message, WidgetRequest } from "../../models/index.js";
import { tokenHash, newToken, sealChannelToken, openChannelToken } from "../tokens.js";
import { enqueueConversationMessage } from "../widget-queue.js";
import { actionReply, ActionError } from "../agent-actions.js";
import { confirmActionWithToken } from "../universal-confirmation.js";
import { confirmationFailureReply } from "../universal-confirmation.js";
import { AppointmentError } from "../appointments.js";
import { logger, safeError } from "../../config/logger.js";
import type { ChannelAdapter } from "./types.js";
import { telegramAdapter } from "./telegram.js";
import { resolveChannelCredential } from "./credentials.js";
export { channelSecret } from "./credentials.js";

const findIdentity = async (connection: typeof ChannelConnection.prototype, externalConversationId: string, senderId: string) => {
  const key = { channelConnectionId: connection._id, externalConversationId, senderId };
  try {
    return await ChannelIdentity.findOneAndUpdate(key, { $setOnInsert: {
      ...key, organizationId: connection.organizationId, assistantId: connection.assistantId,
      channel: "telegram", visitorId: tokenHash(`telegram:${connection._id}:${externalConversationId}:${senderId}`), locale: "tr",
    } }, { upsert: true, returnDocument: "after" });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return ChannelIdentity.findOne(key);
  }
};

export const processTelegramInbound = async (inboundId: mongoose.Types.ObjectId, adapter: ChannelAdapter = telegramAdapter) => {
  const inbound = await ChannelInbound.findOne({ _id: inboundId, status: { $ne: "handled" } });
  if (!inbound) return;
  const connection = await ChannelConnection.findOne({ _id: inbound.channelConnectionId, channel: "telegram", active: true });
  if (!connection || !await resolveChannelCredential(connection, "token") || !await resolveChannelCredential(connection, "webhook") ||
    !await Assistant.exists({ _id: connection.assistantId, organizationId: connection.organizationId, active: true }))
    throw new Error("Telegram connection unavailable");
  const identity = await findIdentity(connection, inbound.externalConversationId, inbound.senderId);
  if (!identity) throw new Error("Telegram identity unavailable");
  if (inbound.kind === "callback" && !identity.currentConversationId) {
    await ChannelInbound.updateOne({ _id: inboundId }, { $set: { status: "handled" }, $unset: { interactionToken: 1 } });
    if (inbound.callbackQueryId && adapter.acknowledge) void adapter.acknowledge((await resolveChannelCredential(connection, "token"))!, inbound.callbackQueryId)
      .catch((error) => logger.warn({ failure: safeError(error) }, "Telegram callback acknowledgement failed"));
    return;
  }
  if (inbound.kind === "message" && inbound.text) {
    const locale = /[çğıöşüÇĞİÖŞÜ]|\b(?:merhaba|randevu|daire|müsait|evet)\b/i.test(inbound.text) ? "tr"
      : /\b(?:hello|appointment|available|please|yes|rent)\b/i.test(inbound.text) ? "en" : identity.locale;
    if (locale !== identity.locale) {
      identity.locale = locale;
      await identity.save();
    }
    const queued = await enqueueConversationMessage(identity, { text: inbound.text,
      clientMessageId: `telegram:${inbound.externalMessageId}` }, "telegram");
    await ChannelInbound.updateOne({ _id: inboundId }, { $set: { requestId: queued._id, status: "handled" } });
    logger.info({ inboundId: inboundId.toString(), requestId: queued._id.toString(),
      conversationId: queued.conversationId.toString(), organizationId: connection.organizationId.toString() },
    "telegram.message.queued");
    return;
  }
  if (inbound.kind === "callback" && inbound.interactionToken && identity.currentConversationId) {
    const context = { organizationId: connection.organizationId, assistantId: connection.assistantId,
      conversationId: identity.currentConversationId, visitorId: identity.visitorId, channelConnectionId: connection._id };
    let reply: string;
    try {
      const action = await confirmActionWithToken(context, openChannelToken(inbound.interactionToken), "telegram", `telegram:${inbound.externalMessageId}`);
      reply = actionReply(action);
    } catch (error) {
      if (!(error instanceof ActionError || error instanceof AppointmentError)) throw error;
      reply = confirmationFailureReply(error, identity.locale === "tr");
    }
    await ChannelDelivery.updateOne({ channelConnectionId: connection._id, dedupeKey: `callback:${inbound.externalMessageId}` },
      { $setOnInsert: { channelConnectionId: connection._id, organizationId: connection.organizationId,
        conversationId: identity.currentConversationId, dedupeKey: `callback:${inbound.externalMessageId}`,
        externalConversationId: inbound.externalConversationId, text: reply, status: "queued", nextAttemptAt: new Date() } }, { upsert: true });
    await ChannelInbound.updateOne({ _id: inboundId }, { $set: { status: "handled" }, $unset: { interactionToken: 1 } });
    if (inbound.callbackQueryId && adapter.acknowledge) void adapter.acknowledge((await resolveChannelCredential(connection, "token"))!, inbound.callbackQueryId)
      .catch((error) => logger.warn({ failure: safeError(error) }, "Telegram callback acknowledgement failed"));
  }
};

export const ensureTelegramDelivery = async (requestId: mongoose.Types.ObjectId) => {
  const request = await WidgetRequest.findOne({ _id: requestId, channel: "telegram",
    status: { $in: ["completed", "handoff", "failed"] }, channelConnectionId: { $exists: true } }).lean();
  if (!request || !request.channelConnectionId) return;
  const connectionId = request.channelConnectionId;
  const existing = await ChannelDelivery.exists({ channelConnectionId: connectionId, dedupeKey: `request:${requestId}` });
  if (existing) {
    await WidgetRequest.updateOne({ _id: requestId }, { $set: { deliveryPreparedAt: new Date() } });
    return;
  }
  const identity = await ChannelIdentity.findOne({ channelConnectionId: connectionId,
    organizationId: request.organizationId, assistantId: request.assistantId, visitorId: request.visitorId,
    currentConversationId: request.conversationId }).lean();
  if (!identity) return;
  const [message, action] = await Promise.all([
    request.responseMessageId ? Message.findById(request.responseMessageId).lean() : null,
    request.actionId ? AgentAction.findOne({ _id: request.actionId, organizationId: request.organizationId }).lean() : null,
  ]);
  const tr = identity.locale === "tr";
  const text = message?.text ?? (request.status === "handoff"
    ? tr ? "Bir ekip üyesi bu görüşmeyi devralacak." : "A team member will take over this conversation."
    : request.errorCode === "budget_exhausted"
      ? tr ? "Asistan şu anda kullanılamıyor. Lütfen işletme ekibiyle iletişime geçin."
        : "The assistant is temporarily unavailable. Please contact the business team."
      : tr ? "Asistan bu isteği tamamlayamadı. Lütfen daha sonra tekrar deneyin."
        : "The assistant could not complete this request. Please try again later.");
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    if (await ChannelDelivery.exists({ channelConnectionId: connectionId, dedupeKey: `request:${requestId}` }).session(session)) return;
    let interactionToken: string | undefined;
    if (action?.status === "pending" && action.expiresAt && action.expiresAt > new Date()) {
      interactionToken = newToken();
      await InteractionToken.create([{ tokenHash: tokenHash(interactionToken), organizationId: request.organizationId,
        assistantId: request.assistantId, conversationId: request.conversationId, visitorId: request.visitorId,
        channelConnectionId: connectionId, actionId: action._id, expiresAt: action.expiresAt }], { session });
    }
    await ChannelDelivery.create([{ channelConnectionId: connectionId, organizationId: request.organizationId,
      conversationId: request.conversationId, requestId, dedupeKey: `request:${requestId}`,
      externalConversationId: identity.externalConversationId, text, ...(interactionToken ? { interactionToken: sealChannelToken(interactionToken) } : {}),
      status: "queued", nextAttemptAt: new Date() }], { session });
  }); } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  finally { await session.endSession(); }
  await WidgetRequest.updateOne({ _id: requestId }, { $set: { deliveryPreparedAt: new Date() } });
  logger.info({ requestId: requestId.toString(), connectionId: connectionId.toString() }, "telegram.outbound.queued");
};

export const deliverTelegramOutbox = async (adapter: ChannelAdapter = telegramAdapter, now = new Date()) => {
  const expired = await ChannelDelivery.find({ status: "sending", leaseUntil: { $lt: now } }).limit(20).select("_id").lean();
  if (expired.length) await ChannelDelivery.updateMany({ _id: { $in: expired.map((item) => item._id) } },
    { $set: { status: "uncertain", failureCode: "lease_expired" }, $unset: { leaseUntil: 1 } });
  const deliveries = await ChannelDelivery.find({ status: "queued", nextAttemptAt: { $lte: now } }).limit(20).select("_id").lean();
  for (const item of deliveries) {
    const delivery = await ChannelDelivery.findOneAndUpdate({ _id: item._id, status: "queued" },
      { $set: { status: "sending", leaseUntil: new Date(now.getTime() + 30_000) }, $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (!delivery) continue;
    const connection = await ChannelConnection.findOne({ _id: delivery.channelConnectionId, channel: "telegram", active: true }).lean();
    const token = connection ? await resolveChannelCredential(connection, "token") : null;
    if (!token) {
      await ChannelDelivery.updateOne({ _id: delivery._id }, { $set: { status: "failed", failureCode: "connection_unavailable" }, $unset: { leaseUntil: 1, interactionToken: 1 } });
      continue;
    }
    try {
      const sent = await adapter.send(token, { externalConversationId: delivery.externalConversationId,
        text: delivery.text, ...(delivery.interactionToken ? { confirmation: { token: openChannelToken(delivery.interactionToken),
          label: "✅ Confirm / Onayla" } } : {}) });
      await ChannelDelivery.updateOne({ _id: delivery._id }, { $set: { status: "sent", providerMessageId: sent.providerMessageId },
        $unset: { leaseUntil: 1, interactionToken: 1 } });
      logger.info({ deliveryId: delivery._id.toString(), requestId: delivery.requestId?.toString(),
        connectionId: delivery.channelConnectionId.toString(), attempts: delivery.attempts }, "telegram.outbound.delivered");
    } catch (error) {
      const status = (error as { status?: number }).status;
      const retryAfter = (error as { retryAfter?: number }).retryAfter;
      const retry = status === 429 || typeof status === "number" && status >= 500;
      const next = retry && delivery.attempts < 5 ? "queued" : status ? "failed" : "uncertain";
      if ((status === 401 || status === 403) && connection?.credentialSource === "managed") {
        await ChannelConnection.updateOne({ _id: connection._id, organizationId: connection.organizationId },
          { $set: { active: false, status: "needs_attention", lastErrorCategory: "revoked" } });
        await InteractionToken.deleteMany({ channelConnectionId: connection._id, organizationId: connection.organizationId });
      }
      await ChannelDelivery.updateOne({ _id: delivery._id }, { $set: { status: next,
        failureCode: status ? `telegram_${status}` : "provider_uncertain",
        ...(next === "queued" ? { nextAttemptAt: new Date(now.getTime() + Math.min(300_000,
          Math.max((retryAfter ?? 0) * 1000, 2000 * 2 ** delivery.attempts))) } : {}) }, $unset: {
          leaseUntil: 1, ...(next === "queued" ? {} : { interactionToken: 1 }),
        } });
      logger.warn({ deliveryId: delivery._id.toString(), failure: safeError(error), status: next }, "Telegram delivery incomplete");
    }
  }
};

export const recoverTelegramInbounds = async (adapter: ChannelAdapter = telegramAdapter, now = new Date()) => {
  const received = await ChannelInbound.find({ status: "received", createdAt: { $lt: new Date(now.getTime() - 5000) } })
    .sort({ createdAt: 1 }).limit(20).select("_id").lean();
  for (const item of received) {
    try { await processTelegramInbound(item._id, adapter); }
    catch (error) { logger.warn({ inboundId: item._id.toString(), failure: safeError(error) }, "telegram.inbound.recovery_failed"); }
  }
};

export const startTelegramDeliveryWorker = (adapter: ChannelAdapter = telegramAdapter) => {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await recoverTelegramInbounds(adapter);
      const requests = await WidgetRequest.find({ channel: "telegram", status: { $in: ["completed", "handoff", "failed"] },
        channelConnectionId: { $exists: true }, deliveryPreparedAt: { $exists: false } }).sort({ createdAt: 1 }).limit(100).select("_id").lean();
      for (const request of requests) await ensureTelegramDelivery(request._id);
      await deliverTelegramOutbox(adapter);
    } catch (error) { logger.error({ failure: safeError(error) }, "Telegram delivery worker failed"); }
    finally { busy = false; }
  };
  logger.info("telegram.worker.started");
  void tick();
  const timer = setInterval(() => void tick(), 2000);
  return () => clearInterval(timer);
};
