import mongoose from "mongoose";
import {
  Conversation,
  Message,
  Organization,
  WidgetRequest,
  WidgetSession,
} from "../models/index.js";
import { logger } from "../config/logger.js";

export const runRetention = async (now = new Date()) => {
  for await (const organization of Organization.find().cursor()) {
    const cutoff = new Date(
      now.getTime() - organization.retentionDays * 86_400_000,
    );
    while (true) {
      const conversations = await Conversation.find({
        organizationId: organization._id,
        updatedAt: { $lt: cutoff },
        processingRequestId: { $exists: false },
      })
        .select("_id")
        .limit(100)
        .lean();
      if (!conversations.length) break;
      const ids = conversations.map((item) => item._id);
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await Message.deleteMany(
            { organizationId: organization._id, conversationId: { $in: ids } },
            { session },
          );
          await WidgetRequest.deleteMany(
            { organizationId: organization._id, conversationId: { $in: ids } },
            { session },
          );
          await WidgetSession.updateMany(
            {
              organizationId: organization._id,
              currentConversationId: { $in: ids },
            },
            { $unset: { currentConversationId: 1 } },
            { session },
          );
          await Conversation.deleteMany(
            {
              organizationId: organization._id,
              _id: { $in: ids },
              processingRequestId: { $exists: false },
            },
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
    }
  }
};
export const startRetentionWorker = () => {
  const tick = () =>
    void runRetention().catch((error) =>
      logger.error({ err: error }, "Retention worker failed"),
    );
  tick();
  const timer = setInterval(tick, 24 * 60 * 60 * 1000);
  return () => clearInterval(timer);
};
