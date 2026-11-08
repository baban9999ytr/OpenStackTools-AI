import mongoose from "mongoose";
import { z } from "zod";
import { AgentAction, Appointment, AppointmentSlot, Conversation, Customer, Message, WidgetRequest } from "../models/index.js";
import { AppointmentError, appointmentSlots, appointmentTimeSchema, assertBookable, checkAvailability, changeAppointment, durationSchema, reserveAppointment } from "./appointments.js";
import { listingFilters, retrieveKnowledge, searchListings } from "./business-data.js";

const objectId = z.string().refine(mongoose.isValidObjectId, "Invalid identifier");
export const actionSchemas = {
  check_availability: z.strictObject({ staffId: objectId, date: z.iso.date(), durationMinutes: durationSchema }),
  create_appointment: z.strictObject({ staffId: objectId, startAt: appointmentTimeSchema, durationMinutes: durationSchema }),
  reschedule_appointment: z.strictObject({ appointmentId: objectId, startAt: appointmentTimeSchema, durationMinutes: durationSchema }),
  cancel_appointment: z.strictObject({ appointmentId: objectId }),
  create_customer: z.strictObject({
    name: z.string().trim().min(1).max(100),
    contact: z.string().trim().min(3).max(200),
    request: z.string().trim().min(1).max(1000),
    consentRecorded: z.boolean(),
  }),
  handoff_to_human: z.strictObject({ reason: z.string().trim().min(1).max(300) }),
  get_business_knowledge: z.strictObject({ topic: z.string().trim().max(100) }),
  search_listings: listingFilters,
} as const;
export type ActionName = keyof typeof actionSchemas;
export type ActionCall = { name: ActionName; arguments: unknown };
export const parseAction = (name: string, args: unknown): ActionCall => {
  if (!(name in actionSchemas)) throw new ActionError("invalid_action");
  const schema = actionSchemas[name as ActionName] as z.ZodType;
  const parsed = schema.safeParse(args);
  if (!parsed.success) throw new ActionError("invalid_arguments");
  return { name: name as ActionName, arguments: parsed.data };
};
export class ActionError extends Error {
  constructor(public code: "invalid_action" | "invalid_arguments" | "confirmation_required" | "action_unavailable" | "action_conflict") { super(code); }
}
export type ActionContext = {
  organizationId: mongoose.Types.ObjectId;
  assistantId?: mongoose.Types.ObjectId;
  conversationId?: mongoose.Types.ObjectId;
  visitorId?: string;
  actorId?: mongoose.Types.ObjectId;
  locale?: "en" | "tr";
};
const needsConfirmation = (name: ActionName) => !["check_availability", "handoff_to_human", "get_business_knowledge", "search_listings"].includes(name);

export const stageAction = async (context: ActionContext, call: ActionCall, idempotencyKey: string) => {
  const parsed = parseAction(call.name, call.arguments);
  const existing = await AgentAction.findOne({ organizationId: context.organizationId, idempotencyKey }).lean();
  if (existing) {
    if (existing.name !== parsed.name || JSON.stringify(existing.arguments) !== JSON.stringify(parsed.arguments)) throw new ActionError("action_conflict");
    return existing;
  }
  if (parsed.name === "handoff_to_human") {
    if (!context.conversationId || !context.visitorId) throw new ActionError("action_unavailable");
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const changed = await Conversation.findOneAndUpdate({ _id: context.conversationId,
          organizationId: context.organizationId, visitorId: context.visitorId, status: "bot",
        }, { $set: { status: "handoff" } }, { returnDocument: "after", session });
        if (!changed) throw new ActionError("action_unavailable");
        const [action] = await AgentAction.create([{ ...context, name: parsed.name,
          arguments: parsed.arguments, result: { handoff: true }, status: "completed", idempotencyKey,
        }], { session });
        if (!action) throw new ActionError("action_unavailable");
        return action;
      });
    } finally { await session.endSession(); }
  }
  if (parsed.name === "create_appointment" || parsed.name === "reschedule_appointment") {
    const args = parsed.arguments as z.infer<typeof actionSchemas.create_appointment>;
    let staffId: mongoose.Types.ObjectId;
    let excludedAppointmentId: mongoose.Types.ObjectId | undefined;
    if (parsed.name === "create_appointment") staffId = new mongoose.Types.ObjectId(args.staffId);
    else {
      const appointmentId = new mongoose.Types.ObjectId((parsed.arguments as z.infer<typeof actionSchemas.reschedule_appointment>).appointmentId);
      const appointment = await Appointment.findOne({ _id: appointmentId, organizationId: context.organizationId,
        status: "booked", ...(context.visitorId ? { visitorId: context.visitorId } : {}),
      }).lean();
      if (!appointment) throw new AppointmentError("appointment_unavailable");
      staffId = appointment.staffId;
      excludedAppointmentId = appointment._id;
    }
    const start = new Date(args.startAt);
    await assertBookable(context.organizationId, staffId, start, args.durationMinutes);
    const occupied = await AppointmentSlot.exists({ organizationId: context.organizationId, staffId,
      startAt: { $in: appointmentSlots(start, args.durationMinutes) },
      ...(excludedAppointmentId ? { appointmentId: { $ne: excludedAppointmentId } } : {}),
    });
    if (occupied) throw new AppointmentError("slot_taken");
  }
  if (parsed.name === "cancel_appointment") {
    const args = parsed.arguments as z.infer<typeof actionSchemas.cancel_appointment>;
    const existingBooking = await Appointment.exists({ _id: args.appointmentId, organizationId: context.organizationId,
      status: "booked", ...(context.visitorId ? { visitorId: context.visitorId } : {}),
    });
    if (!existingBooking) throw new AppointmentError("appointment_unavailable");
  }
  const status = needsConfirmation(parsed.name) ? "pending" : "completed";
  let result: Record<string, unknown> | undefined;
  if (parsed.name === "check_availability") {
    const args = parsed.arguments as z.infer<typeof actionSchemas.check_availability>;
    result = { available: await checkAvailability(context.organizationId, new mongoose.Types.ObjectId(args.staffId), args.date, args.durationMinutes) };
  }
  if (parsed.name === "get_business_knowledge") {
    result = await retrieveKnowledge(context.organizationId, (parsed.arguments as { topic: string }).topic);
  }
  if (parsed.name === "search_listings") {
    if ((parsed.arguments as { availability: string }).availability !== "available") throw new ActionError("invalid_arguments");
    result = { listings: await searchListings(context.organizationId, parsed.arguments) };
  }
  try {
    return await AgentAction.create({ ...context, name: parsed.name, arguments: parsed.arguments,
      result, status, idempotencyKey,
      ...(status === "pending" ? { expiresAt: new Date(Date.now() + 15 * 60_000) } : {}),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const found = await AgentAction.findOne({ organizationId: context.organizationId, idempotencyKey });
      if (found) {
        if (found.name !== parsed.name || JSON.stringify(found.arguments) !== JSON.stringify(parsed.arguments)) throw new ActionError("action_conflict");
        return found;
      }
    }
    throw error;
  }
};

export const confirmAction = async (context: ActionContext, actionId: mongoose.Types.ObjectId) => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const action = await AgentAction.findOne({ _id: actionId, organizationId: context.organizationId,
        ...(context.visitorId ? { visitorId: context.visitorId, assistantId: context.assistantId } : { actorId: context.actorId }),
      }).session(session);
      if (!action) throw new ActionError("action_unavailable");
      if (action.status === "completed") return action;
      if (action.status !== "pending" || !action.expiresAt || action.expiresAt <= new Date()) throw new ActionError("action_unavailable");
      if (context.visitorId) {
        const settled = await WidgetRequest.exists({ organizationId: context.organizationId,
          assistantId: context.assistantId, visitorId: context.visitorId,
          actionId: action._id, status: "completed",
        }).session(session);
        if (!settled) throw new ActionError("action_unavailable");
      }
      const parsed = parseAction(action.name, action.arguments);
      let result: Record<string, unknown>;
      if (parsed.name === "create_appointment") {
        const args = parsed.arguments as z.infer<typeof actionSchemas.create_appointment>;
        const appointment = await reserveAppointment({ organizationId: context.organizationId,
          staffId: new mongoose.Types.ObjectId(args.staffId), startAt: new Date(args.startAt),
          durationMinutes: args.durationMinutes, visitorId: action.visitorId ?? undefined,
          conversationId: action.conversationId ?? undefined, createdBy: action.visitorId ? "widget" : "staff",
        }, session);
        result = { appointmentId: appointment._id.toString(), startAt: appointment.startAt.toISOString(), endAt: appointment.endAt.toISOString(), status: appointment.status };
      } else if (parsed.name === "reschedule_appointment" || parsed.name === "cancel_appointment") {
        const args = parsed.arguments as z.infer<typeof actionSchemas.reschedule_appointment>;
        const appointment = await changeAppointment({ organizationId: context.organizationId,
          appointmentId: new mongoose.Types.ObjectId(args.appointmentId), visitorId: context.visitorId,
          staffActor: Boolean(context.actorId), cancel: parsed.name === "cancel_appointment",
          ...(parsed.name === "reschedule_appointment" ? { startAt: new Date(args.startAt), durationMinutes: args.durationMinutes } : {}),
        }, session);
        result = { appointmentId: appointment._id.toString(), startAt: appointment.startAt.toISOString(), endAt: appointment.endAt.toISOString(), status: appointment.status };
      } else if (parsed.name === "create_customer") {
        const args = parsed.arguments as z.infer<typeof actionSchemas.create_customer>;
        if (!args.consentRecorded) throw new ActionError("confirmation_required");
        const existingCustomer = action.visitorId && action.conversationId ? await Customer.findOne({ organizationId: context.organizationId,
          conversationId: action.conversationId, visitorId: action.visitorId }).session(session) : null;
        if (existingCustomer && (existingCustomer.contact !== args.contact || existingCustomer.name !== args.name)) throw new ActionError("action_conflict");
        let customer = existingCustomer;
        if (!customer) {
          try {
            const [created] = await Customer.create([{ organizationId: context.organizationId,
              conversationId: action.conversationId, visitorId: action.visitorId,
              ...(action.visitorId && action.conversationId ? { identityKey: `${action.conversationId.toString()}:${action.visitorId}` } : {}),
              name: args.name, contact: args.contact, request: args.request,
              consent: { recorded: true, source: context.visitorId ? "widget_confirmation" : "staff_confirmation", at: new Date() },
            }], { session });
            customer = created ?? null;
          } catch (error) {
            if ((error as { code?: number }).code === 11000) throw new ActionError("action_conflict");
            throw error;
          }
        }
        if (!customer) throw new ActionError("action_unavailable");
        result = { customerId: customer._id.toString() };
      } else throw new ActionError("action_unavailable");
      action.result = result;
      action.status = "completed";
      action.confirmedAt = new Date();
      await action.save({ session });
      if (action.conversationId) await Message.create([{ organizationId: context.organizationId,
        conversationId: action.conversationId, role: "assistant", text: actionReply(action),
        clientMessageId: `action:${action._id.toString()}`,
      }], { session });
      return action;
    });
  } catch (error) {
    if (error instanceof AppointmentError || error instanceof ActionError) throw error;
    if ((error as { code?: number }).code === 11000) throw new AppointmentError("slot_taken");
    throw error;
  } finally { await session.endSession(); }
};

export const actionReply = (action: { name: string; status: string; result?: unknown; locale?: string }) => {
  const tr = action.locale === "tr";
  if (action.status === "pending") {
    if (action.name === "create_appointment") return tr ? "Randevu talebini gözden geçirip onaylayın. Henüz randevu oluşturulmadı." : "Please review and confirm this appointment request. No booking has been made yet.";
    if (action.name === "reschedule_appointment") return tr ? "Değişikliği gözden geçirip onaylayın. Randevu henüz taşınmadı." : "Please review and confirm this change. The appointment has not moved yet.";
    if (action.name === "cancel_appointment") return tr ? "İptali onaylayın. Randevu hâlâ geçerli." : "Please confirm cancellation. The appointment is still booked.";
    return tr ? "Kaydetmeden önce müşteri kaydını gözden geçirip onaylayın." : "Please review and confirm the customer record before saving it.";
  }
  if (action.name === "check_availability") {
    const available = (action.result as { available?: Array<{ startAt: string }> })?.available ?? [];
    return available.length ? tr ? `Uygun saatler (UTC): ${available.slice(0, 8).map((slot) => slot.startAt).join(", ")}. Lütfen birini seçin.` : `Available times (UTC): ${available.slice(0, 8).map((slot) => slot.startAt).join(", ")}. Please select one.` : tr ? "Bu tarih ve çalışan için uygun saat bulunamadı." : "No available times were found for that date and staff member.";
  }
  if (action.name === "handoff_to_human") return tr ? "Bir ekip üyesi bu görüşmeyi devralacak." : "A team member will take over this conversation.";
  if (action.name === "get_business_knowledge") {
    const result = action.result as Record<string, unknown> | undefined;
    if (!result) return tr ? "Doğrulanmış işletme bilgisi bulunamadı. Bir ekip üyesinden yardım isteyebilirsiniz." : "No verified business information was found. You can ask a team member for help.";
    const lines = [result.profile, ...(result.services as Array<{ name: string; description: string; price: string }> ?? []).map((item) => `${item.name}: ${item.description}${item.price ? ` — ${item.price}` : ""}`),
      ...(result.faqs as Array<{ question: string; answer: string }> ?? []).map((item) => `${item.question}: ${item.answer}`),
      ...(result.policies as Array<{ title: string; text: string }> ?? []).map((item) => `${item.title}: ${item.text}`),
      ...(result.facts as Array<{ label: string; value: string }> ?? []).map((item) => `${item.label}: ${item.value}`),
      ...((result.contact && typeof result.contact === "object") ? Object.entries(result.contact as Record<string, string>).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`) : []),
      ...((result.openingHours as Array<{ day: number; startMinute: number; endMinute: number }> ?? []).map((item) => `${tr ? "Gün" : "Day"} ${item.day}: ${String(Math.floor(item.startMinute / 60)).padStart(2, "0")}:${String(item.startMinute % 60).padStart(2, "0")}-${String(Math.floor(item.endMinute / 60)).padStart(2, "0")}:${String(item.endMinute % 60).padStart(2, "0")} (${String(result.timeZone ?? "UTC")})`)),
    ].filter((item): item is string => typeof item === "string" && item.length > 0);
    return lines.length ? `${tr ? "İşletme bilgileri" : "Business information"}:\n${lines.join("\n").slice(0, 6000)}` : tr ? "Doğrulanmış işletme bilgisi bulunamadı. Bir ekip üyesinden yardım isteyebilirsiniz." : "No verified business information was found. You can ask a team member for help.";
  }
  if (action.name === "search_listings") {
    const listings = (action.result as { listings?: Array<{ title: string; location: string; price: number; currency: string; publicUrl?: string; updatedAt: Date }> })?.listings ?? [];
    if (!listings.length) return tr ? "Kayıtlı ilanlarda eşleşme bulunamadı. İsterseniz bir ekip üyesine aktarabilirim." : "No stored listings match. I can connect you with a team member.";
    return `${tr ? "Kayıtlı uygun ilanlar" : "Matching stored listings"}:\n${listings.map((item) => `${item.title} — ${item.location} — ${item.price} ${item.currency}${item.publicUrl ? ` — ${item.publicUrl}` : ""} (${tr ? "güncelleme" : "updated"}: ${new Date(item.updatedAt).toISOString().slice(0, 10)})`).join("\n").slice(0, 4000)}`;
  }
  if (action.name === "create_appointment" || action.name === "reschedule_appointment") {
    const result = action.result as { appointmentId?: string; startAt?: string } | undefined;
    if (tr) return `${action.name === "create_appointment" ? "Randevu onaylandı" : "Randevu değişikliği onaylandı"}${result?.startAt ? `: ${result.startAt} (UTC)` : ""}${result?.appointmentId ? `. Referans: ${result.appointmentId}` : ""}.`;
    return `${action.name === "create_appointment" ? "Appointment confirmed" : "Appointment change confirmed"}${result?.startAt ? ` for ${result.startAt} (UTC)` : ""}${result?.appointmentId ? `. Reference: ${result.appointmentId}` : ""}.`;
  }
  if (action.name === "cancel_appointment") return tr ? "Randevunuz iptal edildi." : "Your appointment is cancelled.";
  return tr ? "Talebiniz işletme ekibi için kaydedildi." : "Your request was saved for the business team.";
};
