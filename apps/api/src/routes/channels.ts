import { randomBytes, randomUUID } from "node:crypto";
import { compare } from "bcrypt";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Assistant, ChannelConnection, ChannelCredential, ChannelDelivery, ChannelIdentity,
  InteractionToken, User } from "../models/index.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { distributedLimit } from "../middleware/limits.js";
import { validate } from "../middleware/validate.js";
import { env } from "../config/env.js";
import { logger, safeError } from "../config/logger.js";
import { ChannelCredentialError, requireActiveCredentialKey, resolveChannelCredential,
  saveManagedCredentials } from "../services/channels/credentials.js";
import { telegramManagementProvider, TelegramProviderError,
  type TelegramManagementProvider } from "../services/channels/telegram-management.js";

const id = z.string().refine(mongoose.isValidObjectId, "Invalid ID");
const token = z.string().trim().min(20).max(200);
const createInput = z.strictObject({ assistantId: id, botToken: token });
const repairInput = z.strictObject({ botToken: token.optional() });
const assistantInput = z.strictObject({ assistantId: id });
const disconnectInput = z.strictObject({ password: z.string().min(1).max(200) });
const safeConnection = (connection: typeof ChannelConnection.prototype) => ({
  id: connection._id.toString(), channel: connection.channel,
  assistantId: connection.assistantId.toString(), providerUsername: connection.providerUsername ?? null,
  providerName: connection.providerName ?? null, credentialSource: connection.credentialSource ?? "operator",
  status: connection.credentialSource === "managed" ? connection.status : connection.active ? "setup_required" : "disabled",
  webhookState: connection.webhookState, active: connection.active,
  verifiedAt: connection.verifiedAt ?? null, webhookCheckedAt: connection.webhookCheckedAt ?? null,
  lastSuccessfulCheckAt: connection.lastSuccessfulCheckAt ?? null,
  lastErrorCategory: connection.lastErrorCategory ?? null,
});
const publicWebhookUrl = (connectionId: mongoose.Types.ObjectId) =>
  `${env.telegramPublicApiOrigin}/api/channels/telegram/${connectionId}/webhook`;
const failCategory = (error: unknown) => error instanceof TelegramProviderError ? error.category
  : error instanceof ChannelCredentialError ? "credential_decryption_failed" : "internal_error";
const handleFailure = async (connection: typeof ChannelConnection.prototype, error: unknown, operationId: string) => {
  const category = failCategory(error);
  await ChannelConnection.updateOne({ _id: connection._id, operationId }, {
    $set: { status: "needs_attention", active: false, webhookState: "failed", lastErrorCategory: category },
    $unset: { operationId: 1, operationLeaseUntil: 1 },
  });
  logger.warn({ connectionId: connection._id.toString(), category }, "Telegram connection operation incomplete");
};
const acquire = async (organizationId: mongoose.Types.ObjectId, connectionId: string, allowedStatuses: string[]) => {
  const now = new Date();
  const operationId = randomUUID();
  const filter = { _id: connectionId, organizationId, channel: "telegram",
    credentialSource: "managed", status: { $in: allowedStatuses },
    $or: [{ operationLeaseUntil: { $exists: false } }, { operationLeaseUntil: { $lt: now } }] };
  const connection = await ChannelConnection.findOneAndUpdate(filter as never,
  { $set: { operationId, operationLeaseUntil: new Date(now.getTime() + 45_000) } }, { returnDocument: "after" }) as typeof ChannelConnection.prototype | null;
  return connection ? { connection, operationId } : null;
};
const stopPending = async (connection: typeof ChannelConnection.prototype) => {
  await InteractionToken.deleteMany({ organizationId: connection.organizationId, channelConnectionId: connection._id });
  await ChannelDelivery.updateMany({ organizationId: connection.organizationId, channelConnectionId: connection._id,
    status: "queued" }, { $set: { status: "failed", failureCode: "connection_disabled" }, $unset: { interactionToken: 1 } });
  await ChannelDelivery.updateMany({ organizationId: connection.organizationId, channelConnectionId: connection._id,
    status: "sending" }, { $set: { status: "uncertain", failureCode: "connection_disabled_during_send" },
    $unset: { interactionToken: 1 } });
};
const install = async (connection: typeof ChannelConnection.prototype, rawToken: string, secret: string,
  provider: TelegramManagementProvider, operationId: string) => {
  const expected = publicWebhookUrl(connection._id);
  await ChannelConnection.updateOne({ _id: connection._id, operationId }, { $set: {
    status: "connecting", active: false, webhookState: "installing" } });
  await provider.setWebhook(rawToken, expected, secret);
  const info = await provider.getWebhookInfo(rawToken);
  if (info.url !== expected) throw new TelegramProviderError("invalid_response");
  const now = new Date();
  return ChannelConnection.findOneAndUpdate({ _id: connection._id, operationId }, {
    $set: { status: "connected", active: true, webhookState: "verified", verifiedAt: now,
      webhookCheckedAt: now, lastSuccessfulCheckAt: now },
    $unset: { operationId: 1, operationLeaseUntil: 1, lastErrorCategory: 1 },
  }, { returnDocument: "after" });
};

export const channelRoutes = (provider: TelegramManagementProvider = telegramManagementProvider) => {
  const router = Router();
  router.use(requireUser);
  router.get("/:organizationId/channels", requireMembership(["owner", "admin", "agent", "viewer"]), async (_req, res) => {
    const connections = await ChannelConnection.find({ organizationId: res.locals.organizationId }).sort({ createdAt: -1 });
    res.json({ telegramSelfServiceAvailable: env.telegramSelfServiceEnabled,
      connections: connections.map(safeConnection) });
  });
  router.use("/:organizationId/channels", requireMembership(["owner", "admin"]),
    distributedLimit("channel-management", 20, 15 * 60_000, (_req, res) => String(res.locals.userId)));
  router.post("/:organizationId/channels/telegram", validate(createInput), async (req, res) => {
    if (!env.telegramSelfServiceEnabled) { res.status(503).json({ error: "Telegram self-service is not configured" }); return; }
    try { requireActiveCredentialKey(); }
    catch { res.status(503).json({ error: "Telegram credential storage unavailable" }); return; }
    const organizationId = res.locals.organizationId as mongoose.Types.ObjectId;
    const assistant = await Assistant.findOne({ _id: req.body.assistantId, organizationId, active: true });
    if (!assistant) { res.status(404).json({ error: "Assistant unavailable" }); return; }
    let bot;
    try { bot = await provider.getMe(req.body.botToken); }
    catch (error) {
      const category = failCategory(error);
      res.status(category === "invalid_token" || category === "revoked" ? 422 : 503).json({ error: "Telegram verification failed", category });
      return;
    }
    const connectionId = new mongoose.Types.ObjectId();
    const operationId = randomUUID();
    const webhookSecret = randomBytes(32).toString("base64url");
    const session = await mongoose.startSession();
    let connection: typeof ChannelConnection.prototype;
    try {
      await session.withTransaction(async () => {
        const [created] = await ChannelConnection.create([{ _id: connectionId, organizationId,
          assistantId: assistant._id, channel: "telegram", externalAccountId: bot.id,
          credentialSource: "managed", credentialEnv: `managed:${connectionId}:token`,
          webhookSecretEnv: `managed:${connectionId}:webhook`, providerName: bot.name,
          providerUsername: bot.username, status: "connecting", webhookState: "unknown", active: false,
          operationId, operationLeaseUntil: new Date(Date.now() + 45_000), verifiedAt: new Date() }], { session });
        if (!created) throw new Error("Connection creation failed");
        await saveManagedCredentials(created, req.body.botToken, webhookSecret, session);
      });
      connection = (await ChannelConnection.findById(connectionId))!;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ error: "This bot is already connected" }); return;
      }
      throw error;
    } finally { await session.endSession(); }
    try {
      const ready = await install(connection!, req.body.botToken, webhookSecret, provider, operationId);
      res.status(201).json({ connection: safeConnection(ready!) });
    } catch (error) {
      await handleFailure(connection!, error, operationId);
      const updated = await ChannelConnection.findById(connectionId);
      res.status(201).json({ connection: safeConnection(updated!) });
    }
  });
  router.post("/:organizationId/channels/telegram/:connectionId/verify", async (req, res) => {
    if (!env.telegramSelfServiceEnabled) { res.status(503).json({ error: "Telegram self-service is not configured" }); return; }
    const organizationId = res.locals.organizationId as mongoose.Types.ObjectId;
    const lock = await acquire(organizationId, String(req.params.connectionId), ["connected", "needs_attention", "disabled"]);
    if (!lock) { res.status(404).json({ error: "Connection unavailable or busy" }); return; }
    const { connection, operationId } = lock;
    try {
      const rawToken = await resolveChannelCredential(connection, "token");
      if (!rawToken) throw new TelegramProviderError("invalid_token");
      const bot = await provider.getMe(rawToken);
      if (bot.id !== connection.externalAccountId) throw new TelegramProviderError("invalid_token");
      const info = await provider.getWebhookInfo(rawToken);
      const healthy = info.url === publicWebhookUrl(connection._id) && connection.webhookState === "verified";
      const enabled = healthy && connection.status !== "disabled";
      const now = new Date();
      const updated = await ChannelConnection.findOneAndUpdate({ _id: connection._id, operationId }, {
        $set: { status: enabled ? "connected" : connection.status === "disabled" ? "disabled" : "needs_attention", active: enabled,
          webhookState: healthy ? "verified" : "failed", webhookCheckedAt: now,
          lastSuccessfulCheckAt: now, providerName: bot.name, providerUsername: bot.username,
          ...(healthy ? {} : { lastErrorCategory: "webhook_mismatch" }) },
        $unset: { operationId: 1, operationLeaseUntil: 1, ...(healthy ? { lastErrorCategory: 1 } : {}) },
      }, { returnDocument: "after" });
      res.json({ connection: safeConnection(updated!) });
    } catch (error) {
      await handleFailure(connection, error, operationId);
      res.json({ connection: safeConnection((await ChannelConnection.findById(connection._id))!) });
    }
  });
  router.post("/:organizationId/channels/telegram/:connectionId/repair", validate(repairInput), async (req, res) => {
    if (!env.telegramSelfServiceEnabled) { res.status(503).json({ error: "Telegram self-service is not configured" }); return; }
    const organizationId = res.locals.organizationId as mongoose.Types.ObjectId;
    const lock = await acquire(organizationId, String(req.params.connectionId), ["connected", "needs_attention", "disabled", "connecting"]);
    if (!lock) { res.status(404).json({ error: "Connection unavailable or busy" }); return; }
    const { connection, operationId } = lock;
    try {
      const rawToken = req.body.botToken ?? await resolveChannelCredential(connection, "token");
      if (!rawToken) throw new TelegramProviderError("invalid_token");
      const bot = await provider.getMe(rawToken);
      if (bot.id !== connection.externalAccountId) throw new TelegramProviderError("invalid_token");
      const webhookSecret = await resolveChannelCredential(connection, "webhook");
      if (!webhookSecret) throw new TelegramProviderError("invalid_response");
      if (req.body.botToken) await saveManagedCredentials(connection, rawToken, webhookSecret);
      const ready = await install(connection, rawToken, webhookSecret, provider, operationId);
      await ChannelConnection.updateOne({ _id: connection._id }, { $set: { providerName: bot.name, providerUsername: bot.username } });
      res.json({ connection: safeConnection(ready!) });
    } catch (error) {
      if (req.body.botToken && failCategory(error) === "invalid_token") {
        await ChannelConnection.updateOne({ _id: connection._id, operationId },
          { $unset: { operationId: 1, operationLeaseUntil: 1 } });
        res.status(422).json({ error: "Telegram token does not belong to this bot" }); return;
      }
      await handleFailure(connection, error, operationId);
      res.json({ connection: safeConnection((await ChannelConnection.findById(connection._id))!) });
    }
  });
  router.patch("/:organizationId/channels/telegram/:connectionId/assistant", validate(assistantInput), async (req, res) => {
    const organizationId = res.locals.organizationId as mongoose.Types.ObjectId;
    const assistant = await Assistant.findOne({ _id: req.body.assistantId, organizationId, active: true });
    if (!assistant) { res.status(404).json({ error: "Assistant unavailable" }); return; }
    const lock = await acquire(organizationId, String(req.params.connectionId), ["connected", "disabled", "needs_attention"]);
    if (!lock) { res.status(404).json({ error: "Connection unavailable or busy" }); return; }
    const { connection, operationId } = lock;
    await ChannelConnection.updateOne({ _id: connection._id, operationId }, { $set: { active: false } });
    await stopPending(connection);
    await ChannelIdentity.updateMany({ organizationId, channelConnectionId: connection._id }, {
      $set: { assistantId: assistant._id }, $unset: { currentConversationId: 1 } });
    const updated = await ChannelConnection.findOneAndUpdate({ _id: connection._id, operationId }, {
      $set: { assistantId: assistant._id, active: connection.status === "connected" },
      $unset: { operationId: 1, operationLeaseUntil: 1 },
    }, { returnDocument: "after" });
    res.json({ connection: safeConnection(updated!) });
  });
  router.post("/:organizationId/channels/telegram/:connectionId/disable", async (req, res) => {
    const lock = await acquire(res.locals.organizationId, String(req.params.connectionId), ["connected", "needs_attention", "disabled"]);
    if (!lock) { res.status(404).json({ error: "Connection unavailable or busy" }); return; }
    const { connection, operationId } = lock;
    await ChannelConnection.updateOne({ _id: connection._id, operationId }, { $set: { active: false, status: "disabled" } });
    await stopPending(connection);
    const updated = await ChannelConnection.findOneAndUpdate({ _id: connection._id, operationId },
      { $unset: { operationId: 1, operationLeaseUntil: 1 } }, { returnDocument: "after" });
    res.json({ connection: safeConnection(updated!) });
  });
  router.delete("/:organizationId/channels/telegram/:connectionId", validate(disconnectInput), async (req, res) => {
    const owner = await User.findById(res.locals.userId).select("+passwordHash");
    if (!owner || !await compare(req.body.password, owner.passwordHash)) {
      res.status(403).json({ error: "Reauthentication failed" }); return;
    }
    const lock = await acquire(res.locals.organizationId, String(req.params.connectionId),
      ["connected", "needs_attention", "disabled", "connecting", "disconnecting"]);
    if (!lock) { res.status(404).json({ error: "Connection unavailable or busy" }); return; }
    const { connection, operationId } = lock;
    await ChannelConnection.updateOne({ _id: connection._id, operationId }, { $set: { active: false, status: "disconnecting" } });
    await stopPending(connection);
    try {
      const rawToken = await resolveChannelCredential(connection, "token");
      if (!rawToken) throw new TelegramProviderError("invalid_token");
      const bot = await provider.getMe(rawToken);
      if (bot.id !== connection.externalAccountId) throw new TelegramProviderError("invalid_token");
      await provider.deleteWebhook(rawToken);
      const info = await provider.getWebhookInfo(rawToken);
      if (info.url) throw new TelegramProviderError("invalid_response");
      const session = await mongoose.startSession();
      try { await session.withTransaction(async () => {
        await ChannelCredential.deleteOne({ organizationId: connection.organizationId,
          connectionId: connection._id }, { session });
        const changed = await ChannelConnection.updateOne({ _id: connection._id, organizationId: connection.organizationId,
          operationId }, { $set: { active: false, status: "disconnected", webhookState: "removed",
          webhookCheckedAt: new Date(), externalAccountId: `released:${connection._id}` },
          $unset: { operationId: 1, operationLeaseUntil: 1, lastErrorCategory: 1 } }, { session });
        if (changed.matchedCount !== 1) throw new Error("Connection operation changed concurrently");
      }); } finally { await session.endSession(); }
      const updated = await ChannelConnection.findById(connection._id);
      res.json({ connection: safeConnection(updated!) });
    } catch (error) {
      await handleFailure(connection, error, operationId);
      res.json({ connection: safeConnection((await ChannelConnection.findById(connection._id))!) });
    }
  });
  return router;
};
