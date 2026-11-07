import mongoose from "mongoose";
import {
  Assistant,
  Conversation,
  Message,
  UsageEvent,
  WidgetRequest,
  WidgetSession,
} from "../models/index.js";
import { providerFailurePolicy, type AIReply, type AIResponder, type Turn } from "./ai.js";
import {
  BudgetExceeded,
  maximumReservationMicros,
  measuredCostMicros,
  reserveBudget,
  settleWindows,
} from "./budget.js";
import { env } from "../config/env.js";
import { logger, safeError } from "../config/logger.js";

const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 2;
export class WidgetConflict extends Error {}
export class WidgetNotFound extends Error {}

type WidgetIdentity = {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  assistantId: mongoose.Types.ObjectId;
  visitorId: string;
};
export const enqueueWidgetMessage = async (
  identity: WidgetIdentity,
  input: { text: string; clientMessageId: string; conversationId?: string },
) => {
  const key = {
    organizationId: identity.organizationId,
    assistantId: identity.assistantId,
    visitorId: identity.visitorId,
    clientMessageId: input.clientMessageId,
  };
  const existing = await WidgetRequest.findOne(key).lean();
  if (existing) {
    if (
      existing.text !== input.text ||
      (input.conversationId &&
        existing.conversationId.toString() !== input.conversationId)
    )
      throw new WidgetConflict("Message ID was reused with different content");
    return existing;
  }
  const session = await mongoose.startSession();
  try {
    let createdId: mongoose.Types.ObjectId | undefined;
    await session.withTransaction(async () => {
      const freshIdentity = await WidgetSession.findById(identity._id).session(
        session,
      );
      if (!freshIdentity || freshIdentity.visitorId !== identity.visitorId)
        throw new WidgetNotFound("Widget session unavailable");
      const candidate =
        input.conversationId ?? freshIdentity.currentConversationId?.toString();
      let conversation = candidate
        ? await Conversation.findOne({
            _id: candidate,
            organizationId: identity.organizationId,
            assistantId: identity.assistantId,
            visitorId: identity.visitorId,
          }).session(session)
        : null;
      if (candidate && !conversation)
        throw new WidgetNotFound("Conversation unavailable");
      if (!conversation) {
        const [created] = await Conversation.create(
          [
            {
              organizationId: identity.organizationId,
              assistantId: identity.assistantId,
              visitorId: identity.visitorId,
            },
          ],
          { session },
        );
        if (!created) throw new Error("Conversation creation failed");
        conversation = created;
      }
      if (conversation.status === "closed")
        throw new WidgetConflict("Conversation is closed");
      const [created] = await WidgetRequest.create(
        [
          {
            ...key,
            conversationId: conversation._id,
            text: input.text,
            status: "queued",
          },
        ],
        { session },
      );
      if (!created) throw new Error("Message queueing failed");
      createdId = created._id;
      await WidgetSession.updateOne(
        { _id: identity._id },
        { $set: { currentConversationId: conversation._id } },
        { session },
      );
    });
    if (!createdId) throw new Error("Message queueing failed");
    const created = await WidgetRequest.findById(createdId).lean();
    if (!created) throw new Error("Queued message missing");
    return created;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const duplicate = await WidgetRequest.findOne(key).lean();
      if (
        duplicate &&
        duplicate.text === input.text &&
        (!input.conversationId ||
          duplicate.conversationId.toString() === input.conversationId)
      )
        return duplicate;
      throw new WidgetConflict("Message ID was reused with different content");
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const releaseConversation = async (
  requestId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession,
) => {
  await Conversation.updateOne(
    { processingRequestId: requestId },
    { $unset: { processingRequestId: 1, processingLeaseUntil: 1 } },
    { session },
  );
};
const recordCustomerMessage = async (
  request: typeof WidgetRequest.prototype,
  session?: mongoose.ClientSession,
) => {
  await Message.updateOne(
    { requestId: request._id, role: "customer" },
    {
      $setOnInsert: {
        organizationId: request.organizationId,
        conversationId: request.conversationId,
        role: "customer",
        text: request.text,
        clientMessageId: request.clientMessageId,
        requestId: request._id,
      },
    },
    { upsert: true, session },
  );
};

const finalizeFailure = async (
  requestId: mongoose.Types.ObjectId,
  errorCode: string,
  retry: boolean,
  uncertain = true,
) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const request = await WidgetRequest.findOne({
        _id: requestId,
        status: "processing",
      }).session(session);
      if (!request) return;
      if (request.reservedMicros > 0) {
        // An attempted provider call has uncertain cost on timeout or crash. Charge
        // the whole reservation so a second attempt cannot exceed the budget.
        await settleWindows(
          request,
          uncertain ? request.reservedMicros : 0,
          session,
        );
        if (uncertain) await UsageEvent.create(
          [
            {
              organizationId: request.organizationId,
              assistantId: request.assistantId,
              conversationId: request.conversationId,
              requestId: request._id,
              model: env.openaiModel,
              inputTokens: 0,
              outputTokens: 0,
              estimatedCostMicros: request.reservedMicros,
              billingStatus: "uncertain",
            },
          ],
          { session },
        );
      }
      await WidgetRequest.updateOne(
        { _id: requestId, status: "processing" },
        {
          $set: {
            status:
              retry && request.attempts < MAX_ATTEMPTS ? "queued" : "failed",
            errorCode,
            reservedMicros: 0,
          },
          $unset: { leaseUntil: 1, reservedDay: 1, reservedMonth: 1 },
        },
        { session },
      );
      await releaseConversation(requestId, session);
    });
  } finally {
    await session.endSession();
  }
};

const finalizeSuccess = async (
  requestId: mongoose.Types.ObjectId,
  answer: AIReply,
) => {
  const actualMicros = measuredCostMicros(
    answer.inputTokens,
    answer.outputTokens,
    answer,
  );
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const request = await WidgetRequest.findOne({
        _id: requestId,
        status: "processing",
        leaseUntil: { $gt: new Date() },
      }).session(session);
      if (!request) throw new Error("Request lease was lost");
      if (actualMicros > request.reservedMicros)
        throw new Error("Provider usage exceeded conservative reservation");
      const conversation = await Conversation.findOne({
        _id: request.conversationId,
        organizationId: request.organizationId,
        processingRequestId: requestId,
      }).session(session);
      if (!conversation) throw new Error("Conversation lease was lost");
      await settleWindows(request, actualMicros, session);
      await UsageEvent.create(
        [
          {
            organizationId: request.organizationId,
            assistantId: request.assistantId,
            conversationId: request.conversationId,
            requestId: request._id,
            model: env.openaiModel,
            inputTokens: answer.inputTokens,
            outputTokens: answer.outputTokens,
            cachedInputTokens: answer.cachedInputTokens ?? 0,
            cacheWriteTokens: answer.cacheWriteTokens ?? 0,
            reasoningTokens: answer.reasoningTokens ?? 0,
            usageBreakdownKnown: answer.usageBreakdownKnown ?? false,
            estimatedCostMicros: actualMicros,
            billingStatus: "measured",
          },
        ],
        { session },
      );
      let responseMessageId: mongoose.Types.ObjectId | undefined;
      if (conversation.status === "bot") {
        const [reply] = await Message.create(
          [
            {
              organizationId: request.organizationId,
              conversationId: request.conversationId,
              role: "assistant",
              text: answer.text,
              requestId: request._id,
            },
          ],
          { session },
        );
        responseMessageId = reply?._id;
      }
      await WidgetRequest.updateOne(
        { _id: requestId },
        {
          $set: {
            status: conversation.status === "bot" ? "completed" : "handoff",
            reservedMicros: 0,
            ...(responseMessageId ? { responseMessageId } : {}),
          },
          $unset: {
            leaseUntil: 1,
            reservedDay: 1,
            reservedMonth: 1,
            errorCode: 1,
          },
        },
        { session },
      );
      await Conversation.updateOne(
        { _id: conversation._id },
        { $set: { updatedAt: new Date() } },
        { session },
      );
      await releaseConversation(requestId, session);
    });
  } finally {
    await session.endSession();
  }
};

export const processWidgetRequest = async (
  requestId: mongoose.Types.ObjectId,
  respond: AIResponder,
) => {
  const request = await WidgetRequest.findOne({
    _id: requestId,
    status: "queued",
  }).lean();
  if (!request) return;
  const older = await WidgetRequest.exists({
    conversationId: request.conversationId,
    status: { $in: ["queued", "processing"] },
    $or: [
      { createdAt: { $lt: request.createdAt } },
      { createdAt: request.createdAt, _id: { $lt: request._id } },
    ],
  });
  if (older) return;
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const conversation = await Conversation.findOneAndUpdate(
    {
      _id: request.conversationId,
      organizationId: request.organizationId,
      $or: [
        { processingRequestId: { $exists: false } },
        { processingRequestId: null },
        { processingLeaseUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        processingRequestId: requestId,
        processingLeaseUntil: leaseUntil,
      },
    },
    { returnDocument: "after" },
  );
  if (!conversation) return;
  const claimed = await WidgetRequest.findOneAndUpdate(
    { _id: requestId, status: "queued" },
    { $set: { status: "processing", leaseUntil }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!claimed) {
    await Conversation.updateOne(
      { _id: conversation._id, processingRequestId: requestId },
      { $unset: { processingRequestId: 1, processingLeaseUntil: 1 } },
    );
    return;
  }
  if (conversation.status === "closed") {
    await finalizeFailure(requestId, "conversation_closed", false);
    return;
  }
  if (conversation.status === "handoff") {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await recordCustomerMessage(claimed, session);
        await WidgetRequest.updateOne(
          { _id: requestId },
          { $set: { status: "handoff" }, $unset: { leaseUntil: 1 } },
          { session },
        );
        await Conversation.updateOne(
          { _id: conversation._id },
          { $set: { updatedAt: new Date() } },
          { session },
        );
        await releaseConversation(requestId, session);
      });
    } finally {
      await session.endSession();
    }
    return;
  }
  try {
    const assistant = await Assistant.findOne({
      _id: request.assistantId,
      organizationId: request.organizationId,
      active: true,
    }).lean();
    if (!assistant) {
      await finalizeFailure(requestId, "assistant_unavailable", false);
      return;
    }
    const prior = await Message.find({
      organizationId: request.organizationId,
      conversationId: request.conversationId,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(12)
      .lean();
    const history: Turn[] = [
      ...prior
        .reverse()
        .map((item) => ({ role: item.role as Turn["role"], text: item.text })),
      { role: "customer", text: request.text },
    ];
    const reservation = maximumReservationMicros(
      assistant.instructions,
      history,
    );
    if (!(await reserveBudget(requestId, reservation)))
      throw new Error("Request lease was lost");
    await recordCustomerMessage(claimed);
    const answer = await respond(assistant.instructions, history);
    await finalizeSuccess(requestId, answer);
  } catch (error) {
    if (error instanceof BudgetExceeded)
      await finalizeFailure(requestId, "budget_exhausted", false);
    else {
      const policy = providerFailurePolicy(error);
      logger.warn(
        { requestId: requestId.toString(), failureCode: policy.code },
        "Widget request failed",
      );
      await finalizeFailure(
        requestId,
        policy.code,
        policy.retry,
        policy.uncertain,
      );
    }
  }
};

export const recoverExpiredRequests = async () => {
  const expired = await WidgetRequest.find({
    status: "processing",
    leaseUntil: { $lt: new Date() },
  })
    .limit(20)
    .lean();
  for (const request of expired)
    await finalizeFailure(
      request._id,
      "lease_expired",
      request.reservedMicros === 0,
    );
};
export const processPendingRequests = async (respond: AIResponder) => {
  await recoverExpiredRequests();
  const queued = await WidgetRequest.find({ status: "queued" })
    .sort({ createdAt: 1, _id: 1 })
    .limit(20)
    .lean();
  for (const request of queued)
    await processWidgetRequest(request._id, respond);
};
export const startWidgetWorker = (respond: AIResponder) => {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await processPendingRequests(respond);
    } catch (error) {
      logger.error({ failure: safeError(error) }, "Widget worker failed");
    } finally {
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 2_000);
  return () => clearInterval(timer);
};
