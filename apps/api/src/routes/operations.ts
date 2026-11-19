import { Router } from "express";
import mongoose from "mongoose";
import { compare } from "bcrypt";
import { z } from "zod";
import {
  AccountToken,
  AgentAction,
  Appointment,
  AppointmentSlot,
  Assistant,
  AuditEvent,
  BudgetWindow,
  BusinessKnowledge,
  ChannelConnection,
  ChannelCredential,
  ChannelDelivery,
  ChannelIdentity,
  ChannelInbound,
  Conversation,
  Customer,
  Listing,
  InteractionToken,
  ActionConfirmationAudit,
  Membership,
  Message,
  Organization,
  Session,
  StaffAvailability,
  UsageEvent,
  User,
  WidgetRequest,
  WidgetSession,
} from "../models/index.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { logger } from "../config/logger.js";

const router = Router();
router.use(requireUser);
const scoped = {
  assistants: Assistant,
  conversations: Conversation,
  messages: Message,
  usage: UsageEvent,
  audits: AuditEvent,
  requests: WidgetRequest,
  widgetSessions: WidgetSession,
  budgets: BudgetWindow,
  appointments: Appointment,
  appointmentSlots: AppointmentSlot,
  customers: Customer,
  agentActions: AgentAction,
  staffAvailability: StaffAvailability,
  knowledge: BusinessKnowledge,
  listings: Listing,
  channelConnections: ChannelConnection,
  channelIdentities: ChannelIdentity,
  channelInbound: ChannelInbound,
  channelDeliveries: ChannelDelivery,
  interactionTokens: InteractionToken,
  actionConfirmations: ActionConfirmationAudit,
};
router.get(
  "/:organizationId/export/:kind",
  requireMembership(["owner"]),
  async (req, res) => {
    const organizationId = res.locals.organizationId as mongoose.Types.ObjectId;
    const kind = req.params.kind as
      keyof typeof scoped | "organization" | "members";
    const after = req.query.after;
    if (
      after !== undefined &&
      (typeof after !== "string" || !mongoose.isValidObjectId(after))
    ) {
      res.status(400).json({ error: "Invalid cursor" });
      return;
    }
    if (kind === "organization") {
      res.json({
        items: await Organization.find({ _id: organizationId }).lean(),
        next: null,
      });
      return;
    }
    if (kind === "members") {
      const members = await Membership.find({
        organizationId,
        ...(after ? { _id: { $gt: after } } : {}),
      })
        .sort({ _id: 1 })
        .limit(100)
        .lean();
      const users = await User.find({
        _id: { $in: members.map((item) => item.userId) },
      }).lean();
      res.json({
        items: members.map((item) => ({
          id: item._id,
          role: item.role,
          user: users.find((user) => user._id.equals(item.userId)),
        })),
        next: members.length === 100 ? members.at(-1)?._id : null,
      });
      return;
    }
    if (!(kind in scoped)) {
      res.status(404).json({ error: "Unknown export collection" });
      return;
    }
    const model = scoped[kind as keyof typeof scoped];
    const items = await mongoose.connection
      .collection(model.collection.name)
      .find({
        organizationId,
        ...(after ? { _id: { $gt: new mongoose.Types.ObjectId(after) } } : {}),
      })
      .sort({ _id: 1 })
      .limit(100)
      .toArray();
    const sanitized = items.map((item) => {
      const record = { ...item } as Record<string, unknown>;
      if (kind === "widgetSessions" || kind === "interactionTokens") delete record.tokenHash;
      if (kind === "channelInbound") delete record.interactionToken;
      if (kind === "channelDeliveries") delete record.interactionToken;
      if (kind === "channelConnections") {
        delete record.credentialEnv;
        delete record.webhookSecretEnv;
        delete record.operationId;
        delete record.operationLeaseUntil;
      }
      return record;
    });
    res.json({
      items: sanitized,
      next: items.length === 100 ? items.at(-1)?._id : null,
    });
  },
);
router.patch(
  "/:organizationId/retention",
  requireMembership(["owner"]),
  validate(z.strictObject({ days: z.number().int().min(1).max(365) })),
  async (req, res) => {
    await Organization.updateOne(
      { _id: res.locals.organizationId },
      { $set: { retentionDays: req.body.days } },
    );
    res.json({ days: req.body.days });
  },
);
router.delete(
  "/:organizationId/tenant",
  requireMembership(["owner"]),
  validate(
    z.strictObject({ organizationName: z.string(), password: z.string() }),
  ),
  async (req, res) => {
    const organizationId = res.locals.organizationId as mongoose.Types.ObjectId;
    const [organization, owner] = await Promise.all([
      Organization.findById(organizationId),
      User.findById(res.locals.userId).select("+passwordHash"),
    ]);
    if (
      !organization ||
      !owner ||
      organization.name !== req.body.organizationName ||
      !(await compare(req.body.password, owner.passwordHash))
    ) {
      res.status(403).json({ error: "Confirmation failed" });
      return;
    }
    if (await ChannelConnection.exists({ organizationId, status: { $ne: "disconnected" } })) {
      res.status(409).json({ error: "Disconnect messaging channels before deleting the organization" });
      return;
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const memberships = await Membership.find({ organizationId })
          .session(session)
          .lean();
        for (const model of [
          Assistant,
          AgentAction,
          Appointment,
          AppointmentSlot,
          Conversation,
          Customer,
          Message,
          UsageEvent,
          WidgetRequest,
          WidgetSession,
          BudgetWindow,
          AuditEvent,
          AccountToken,
          Membership,
          StaffAvailability,
          BusinessKnowledge,
          Listing,
          ChannelConnection,
          ChannelCredential,
          ChannelIdentity,
          ChannelInbound,
          ChannelDelivery,
          InteractionToken,
          ActionConfirmationAudit,
        ])
          await mongoose.connection
            .collection(model.collection.name)
            .deleteMany({ organizationId }, { session });
        await Organization.deleteOne({ _id: organizationId }, { session });
        for (const member of memberships) {
          if (
            await Membership.exists({ userId: member.userId }).session(session)
          )
            continue;
          await Session.deleteMany({ userId: member.userId }, { session });
          await AccountToken.deleteMany({ userId: member.userId }, { session });
          await User.deleteOne({ _id: member.userId }, { session });
        }
      });
    } finally {
      await session.endSession();
    }
    logger.info(
      {
        organizationId: organizationId.toString(),
        actorId: res.locals.userId.toString(),
      },
      "Tenant deleted",
    );
    res.json({ ok: true });
  },
);
export default router;
