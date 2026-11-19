import mongoose from "mongoose";
import {
  AgentAction,
  Appointment,
  AppointmentSlot,
  ActionConfirmationAudit,
  ChannelDelivery,
  ChannelIdentity,
  ChannelInbound,
  Conversation,
  Customer,
  Listing,
  Message,
  Organization,
  InteractionToken,
  WidgetRequest,
  WidgetSession,
} from "../models/index.js";
import { logger, safeError } from "../config/logger.js";

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
          await ChannelIdentity.updateMany(
            { organizationId: organization._id, currentConversationId: { $in: ids } },
            { $unset: { currentConversationId: 1 } }, { session },
          );
          await ChannelDelivery.deleteMany({ organizationId: organization._id, conversationId: { $in: ids } }, { session });
          await InteractionToken.deleteMany({ organizationId: organization._id, conversationId: { $in: ids } }, { session });
          await ActionConfirmationAudit.deleteMany({ organizationId: organization._id, conversationId: { $in: ids } }, { session });
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
    await AgentAction.deleteMany({ organizationId: organization._id, createdAt: { $lt: cutoff } });
    await ChannelInbound.deleteMany({ organizationId: organization._id, createdAt: { $lt: cutoff } });
    await ChannelIdentity.deleteMany({ organizationId: organization._id, updatedAt: { $lt: cutoff },
      currentConversationId: { $exists: false } });
    await ChannelDelivery.deleteMany({ organizationId: organization._id, createdAt: { $lt: cutoff }, status: { $in: ["sent", "failed", "uncertain"] } });
    await ActionConfirmationAudit.deleteMany({ organizationId: organization._id, createdAt: { $lt: cutoff } });
    await InteractionToken.deleteMany({ organizationId: organization._id, expiresAt: { $lt: now } });
    await Customer.deleteMany({ organizationId: organization._id, updatedAt: { $lt: cutoff } });
    await Listing.deleteMany({ organizationId: organization._id, archivedAt: { $lt: cutoff } });
    const oldAppointments = await Appointment.find({ organizationId: organization._id, endAt: { $lt: cutoff } }).select("_id").lean();
    if (oldAppointments.length) {
      const ids = oldAppointments.map((item) => item._id);
      const session = await mongoose.startSession();
      try { await session.withTransaction(async () => {
        await AppointmentSlot.deleteMany({ organizationId: organization._id, appointmentId: { $in: ids } }, { session });
        await Appointment.deleteMany({ organizationId: organization._id, _id: { $in: ids } }, { session });
      }); } finally { await session.endSession(); }
    }
  }
};
export const startRetentionWorker = () => {
  const tick = () =>
    void runRetention().catch((error) =>
      logger.error({ failure: safeError(error) }, "Retention worker failed"),
    );
  tick();
  const timer = setInterval(tick, 24 * 60 * 60 * 1000);
  return () => clearInterval(timer);
};
