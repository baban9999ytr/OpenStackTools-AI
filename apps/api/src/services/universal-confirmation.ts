import mongoose from "mongoose";
import { ActionConfirmationAudit, AgentAction, InteractionToken } from "../models/index.js";
import { actionReply, confirmAction, ActionError, type ActionContext } from "./agent-actions.js";
import { newToken, tokenHash } from "./tokens.js";
import { AppointmentError } from "./appointments.js";

export type ConfirmationChannel = "web" | "telegram" | "whatsapp" | "instagram";
export const createActionInteractionToken = async (context: ActionContext & { channelConnectionId?: mongoose.Types.ObjectId }, actionId: mongoose.Types.ObjectId) => {
  const action = await AgentAction.findOne({ _id: actionId, organizationId: context.organizationId,
    assistantId: context.assistantId, conversationId: context.conversationId, visitorId: context.visitorId,
    status: "pending", expiresAt: { $gt: new Date() } }).lean();
  if (!action || !action.expiresAt || !context.conversationId || !context.visitorId) throw new ActionError("action_unavailable");
  const token = newToken();
  await InteractionToken.create({ tokenHash: tokenHash(token), organizationId: context.organizationId,
    assistantId: context.assistantId, conversationId: context.conversationId, visitorId: context.visitorId,
    ...(context.channelConnectionId ? { channelConnectionId: context.channelConnectionId } : {}),
    actionId, expiresAt: action.expiresAt });
  return token;
};

const audit = async (context: ActionContext, actionId: mongoose.Types.ObjectId, method: "website_button" | "channel_button" | "text",
  channel: ConfirmationChannel, dedupeKey: string) => {
  if (!context.conversationId) return;
  try { await ActionConfirmationAudit.create({ organizationId: context.organizationId, actionId,
    conversationId: context.conversationId, method, channel, dedupeKey, outcome: "confirmed" }); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
};

export const confirmActionWithButton = async (context: ActionContext, actionId: mongoose.Types.ObjectId,
  channel: ConfirmationChannel, dedupeKey: string) => {
  const action = await confirmAction(context, actionId);
  await audit(context, actionId, channel === "web" ? "website_button" : "channel_button", channel, dedupeKey);
  return action;
};

export const confirmActionWithToken = async (context: ActionContext & { channelConnectionId?: mongoose.Types.ObjectId }, rawToken: string,
  channel: ConfirmationChannel, dedupeKey: string) => {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken) || !context.conversationId || !context.visitorId) throw new ActionError("action_unavailable");
  const scope = { tokenHash: tokenHash(rawToken), organizationId: context.organizationId, assistantId: context.assistantId,
    conversationId: context.conversationId, visitorId: context.visitorId,
    ...(context.channelConnectionId ? { channelConnectionId: context.channelConnectionId } : { channelConnectionId: { $exists: false } }) };
  const token = await InteractionToken.findOne(scope).lean();
  if (!token || token.expiresAt <= new Date()) throw new ActionError("action_unavailable");
  if (token.consumedAt) {
    const completed = await AgentAction.findOne({ _id: token.actionId, organizationId: context.organizationId, status: "completed" }).lean();
    if (!completed) throw new ActionError("action_unavailable");
    return completed;
  }
  const claimed = await InteractionToken.findOneAndUpdate({ ...scope, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } }, { returnDocument: "after" });
  if (!claimed) throw new ActionError("action_unavailable");
  try {
    const action = await confirmAction(context, claimed.actionId);
    await audit(context, claimed.actionId, "channel_button", channel, dedupeKey);
    return action;
  } catch (error) {
    await InteractionToken.updateOne({ _id: claimed._id }, { $unset: { consumedAt: 1 } });
    throw error;
  }
};

export const classifyTextConfirmation = (text: string) => {
  const normalized = text.trim().replace(/[.!]+$/, "").toLocaleLowerCase("tr");
  if (/^(?:yes|evet|onayla|confirm|okay|ok|tamam)$/.test(normalized)) return { kind: "ambiguous" as const };
  if (/^(?:evet[, ]+)?randevuyu onaylıyorum$|^(?:evet[, ]+)?(?:randevuyu )?oluşturabilirsiniz$|^yes[, ]+confirm (?:the|my) appointment$|^yes[, ]+please book (?:it|the appointment)$/.test(normalized))
    return { kind: "approve" as const, actions: ["create_appointment"] };
  if (/^(?:evet[, ]+)?(?:randevu )?değişikliğini onaylıyorum$|^yes[, ]+confirm (?:the|my) reschedul(?:e|ing)$/.test(normalized))
    return { kind: "approve" as const, actions: ["reschedule_appointment"] };
  if (/^(?:evet[, ]+)?(?:randevu )?iptalini onaylıyorum$|^yes[, ]+confirm (?:the|my) cancellation$/.test(normalized))
    return { kind: "approve" as const, actions: ["cancel_appointment"] };
  if (/^(?:evet[, ]+)?müşteri kaydını onaylıyorum$|^yes[, ]+confirm (?:the|my) customer record$/.test(normalized))
    return { kind: "approve" as const, actions: ["create_customer"] };
  return null;
};

export const confirmationFailureReply = (error: AppointmentError | ActionError, tr: boolean) => {
  if (error instanceof AppointmentError && error.code === "slot_taken")
    return tr ? "Bu saat artık müsait değil. Yeni uygun saatleri kontrol edebilirim."
      : "That time is no longer available. I can check other available times.";
  if (error instanceof AppointmentError && error.code === "schedule_closed")
    return tr ? "Çalışma saatleri değişti; bu randevuyu onaylayamıyorum. Yeni saatleri kontrol edebilirim."
      : "The schedule has changed, so I cannot confirm this appointment. I can check new times.";
  return tr ? "Bu işlem artık onaylanamıyor. Lütfen yeni bir istekte bulunun."
    : "This action can no longer be confirmed. Please make a new request.";
};

export const handleTextConfirmation = async (context: ActionContext, text: string, channel: ConfirmationChannel,
  dedupeKey: string): Promise<{ text: string; actionId?: mongoose.Types.ObjectId } | null> => {
  const intent = classifyTextConfirmation(text);
  if (!intent || !context.conversationId || !context.visitorId || !context.assistantId) return null;
  const tr = /[çğıöşüÇĞİÖŞÜ]|\b(?:evet|randevu|onayla|tamam)\b/i.test(text);
  const pending = await AgentAction.find({ organizationId: context.organizationId, assistantId: context.assistantId,
    conversationId: context.conversationId, visitorId: context.visitorId,
    status: "pending", expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).limit(3).lean();
  if (!pending.length) {
    const previous = await ActionConfirmationAudit.findOne({ organizationId: context.organizationId, dedupeKey, outcome: "confirmed" }).lean();
    if (previous) {
      const completed = await AgentAction.findOne({ _id: previous.actionId, organizationId: context.organizationId,
        conversationId: context.conversationId, visitorId: context.visitorId, status: "completed" }).lean();
      if (completed) return { text: actionReply(completed), actionId: completed._id };
    }
    return intent.kind === "ambiguous" ? null : {
      text: tr ? "Onaylanacak bekleyen bir işlem bulamadım." : "I couldn't find a pending action to confirm." };
  }
  if (intent.kind === "ambiguous" || pending.length !== 1 || !intent.actions.includes(pending[0]!.name)) return {
    text: tr ? "Hangi işlemi onaylamak istediğinizi açıkça belirtir misiniz? Örneğin: ‘Evet, randevuyu onaylıyorum.’"
      : "Please name the action you want to confirm, for example: ‘Yes, confirm the appointment.’" };
  let action;
  try { action = await confirmAction(context, pending[0]!._id, false); }
  catch (error) {
    if (error instanceof AppointmentError || error instanceof ActionError)
      return { text: confirmationFailureReply(error, tr) };
    throw error;
  }
  await audit(context, action._id, "text", channel, dedupeKey);
  return { text: actionReply(action), actionId: action._id };
};
