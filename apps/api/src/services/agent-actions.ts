import mongoose from "mongoose";
import { z } from "zod";
import { AgentAction, Appointment, AppointmentSlot, Conversation, Customer, Listing, Message, Organization, User, WidgetRequest } from "../models/index.js";
import { AppointmentError, appointmentSlots, appointmentTimeSchema, assertBookable, inspectAvailability, changeAppointment, durationSchema, reserveAppointment } from "./appointments.js";
import { listingFilters, retrieveKnowledge, searchListings } from "./business-data.js";
import { formatListingReply, type VerifiedListing } from "./customer-listings.js";
import { appointmentConfirmedReply, appointmentProposalReply, availableSlotSummary, localAppointmentLabel, safeStaffName } from "./appointment-presentation.js";

const objectId = z.string().refine(mongoose.isValidObjectId, "Invalid identifier");
export const actionSchemas = {
  check_availability: z.strictObject({ staffId: objectId, date: z.iso.date(), durationMinutes: durationSchema,
    period: z.enum(["morning", "afternoon", "evening"]).optional(),
    startMinute: z.number().int().min(0).max(1425).multipleOf(15).optional(),
    endMinute: z.number().int().min(15).max(1440).multipleOf(15).optional(),
  }).refine((value) => (value.startMinute === undefined && value.endMinute === undefined) ||
    (value.startMinute !== undefined && value.endMinute !== undefined &&
      value.endMinute - value.startMinute >= value.durationMinutes),
  "A complete time range that fits the appointment duration is required"),
  create_appointment: z.strictObject({ staffId: objectId, startAt: appointmentTimeSchema, durationMinutes: durationSchema,
    customerName: z.string().trim().min(2).max(80).optional(), listingId: objectId.optional() }),
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
  if (!Object.hasOwn(actionSchemas, name)) throw new ActionError("invalid_action");
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
    if (parsed.name === "create_appointment" && (args as { listingId?: string }).listingId &&
      !await Listing.exists({ _id: (args as { listingId?: string }).listingId, organizationId: context.organizationId,
        archivedAt: { $exists: false }, availability: "available" })) throw new ActionError("action_unavailable");
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
  if (status === "pending" && (parsed.name === "create_appointment" || parsed.name === "reschedule_appointment")) {
    const args = parsed.arguments as { staffId?: string; appointmentId?: string; startAt: string; durationMinutes: number; listingId?: string };
    const staffId = parsed.name === "create_appointment" ? new mongoose.Types.ObjectId(args.staffId)
      : (await Appointment.findOne({ _id: args.appointmentId, organizationId: context.organizationId }).select("staffId").lean())?.staffId;
    const [organization, staffMember, listing] = await Promise.all([
      Organization.findById(context.organizationId).select("timeZone").lean(),
      staffId ? User.findById(staffId).select("name").lean() : null,
      args.listingId ? Listing.findOne({ _id: args.listingId, organizationId: context.organizationId }).select("title").lean() : null,
    ]);
    result = { startAt: args.startAt, durationMinutes: args.durationMinutes,
      timeZone: organization?.timeZone ?? "UTC", staffName: staffMember?.name ?? "", listingTitle: listing?.title ?? "" };
  }
  if (parsed.name === "check_availability") {
    const args = parsed.arguments as z.infer<typeof actionSchemas.check_availability>;
    const [organization, staffMember] = await Promise.all([
      Organization.findById(context.organizationId).select("timeZone").lean(),
      User.findById(args.staffId).select("name").lean(),
    ]);
    const inspected = await inspectAvailability(context.organizationId, new mongoose.Types.ObjectId(args.staffId), args.date, args.durationMinutes,
      args.startMinute !== undefined && args.endMinute !== undefined ? { startMinute: args.startMinute, endMinute: args.endMinute } : undefined);
    result = { ...inspected, timeZone: organization?.timeZone ?? "UTC", durationMinutes: args.durationMinutes, staffName: staffMember?.name ?? "" };
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

export const confirmAction = async (context: ActionContext, actionId: mongoose.Types.ObjectId, recordReply = true) => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const action = await AgentAction.findOne({ _id: actionId, organizationId: context.organizationId,
        ...(context.conversationId ? { conversationId: context.conversationId } : {}),
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
        if (args.listingId && !await Listing.exists({ _id: args.listingId, organizationId: context.organizationId,
          archivedAt: { $exists: false }, availability: "available" }).session(session)) throw new ActionError("action_unavailable");
        const appointment = await reserveAppointment({ organizationId: context.organizationId,
          staffId: new mongoose.Types.ObjectId(args.staffId), startAt: new Date(args.startAt),
          durationMinutes: args.durationMinutes, visitorId: action.visitorId ?? undefined,
          visitorName: args.customerName,
          ...(args.listingId ? { listingId: new mongoose.Types.ObjectId(args.listingId) } : {}),
          conversationId: action.conversationId ?? undefined, createdBy: action.visitorId ? "widget" : "staff",
        }, session);
        const [organization, staffMember, listing] = await Promise.all([
          Organization.findById(context.organizationId).select("timeZone").session(session).lean(),
          User.findById(appointment.staffId).select("name").session(session).lean(),
          appointment.listingId ? Listing.findOne({ _id: appointment.listingId, organizationId: context.organizationId }).select("title").session(session).lean() : null,
        ]);
        result = { appointmentId: appointment._id.toString(), startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt.toISOString(), status: appointment.status,
          timeZone: organization?.timeZone ?? "UTC", staffName: staffMember?.name ?? "", listingTitle: listing?.title ?? "",
          durationMinutes: args.durationMinutes };
      } else if (parsed.name === "reschedule_appointment" || parsed.name === "cancel_appointment") {
        const args = parsed.arguments as z.infer<typeof actionSchemas.reschedule_appointment>;
        const appointment = await changeAppointment({ organizationId: context.organizationId,
          appointmentId: new mongoose.Types.ObjectId(args.appointmentId), visitorId: context.visitorId,
          staffActor: Boolean(context.actorId), cancel: parsed.name === "cancel_appointment",
          ...(parsed.name === "reschedule_appointment" ? { startAt: new Date(args.startAt), durationMinutes: args.durationMinutes } : {}),
        }, session);
        const [organization, staffMember] = await Promise.all([
          Organization.findById(context.organizationId).select("timeZone").session(session).lean(),
          User.findById(appointment.staffId).select("name").session(session).lean(),
        ]);
        result = { appointmentId: appointment._id.toString(), startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt.toISOString(), status: appointment.status,
          timeZone: organization?.timeZone ?? "UTC", staffName: staffMember?.name ?? "",
          durationMinutes: Math.round((appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000) };
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
      if (recordReply && action.conversationId) await Message.create([{ organizationId: context.organizationId,
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

export const actionReply = (action: { name: string; status: string; result?: unknown; locale?: string; arguments?: unknown }, context: { query?: string; repeatedNoMatch?: boolean; assistantName?: string; responseLength?: "short" | "balanced" | "detailed"; tone?: string; previousListingIds?: string[]; reused?: boolean; broadened?: boolean; referencedListing?: { title: string; location: string }; askName?: boolean } = {}) => {
  const tr = action.locale === "tr";
  if (action.status === "pending") {
    if (action.name === "create_appointment") return appointmentProposalReply(action.result as Parameters<typeof appointmentProposalReply>[0], tr ? "tr" : "en");
    if (action.name === "reschedule_appointment") return appointmentProposalReply(action.result as Parameters<typeof appointmentProposalReply>[0], tr ? "tr" : "en");
    if (action.name === "cancel_appointment") return tr ? "İptali onaylayın. Randevu hâlâ geçerli." : "Please confirm cancellation. The appointment is still booked.";
    return tr ? "Kaydetmeden önce müşteri kaydını gözden geçirip onaylayın." : "Please review and confirm the customer record before saving it.";
  }
  if (action.name === "check_availability") {
    const result = action.result as { available?: Array<{ startAt: string }>; reason?: string; timeZone?: string; durationMinutes?: number; staffName?: string } | undefined;
    const args = action.arguments as { date?: string; period?: "morning" | "afternoon" | "evening" } | undefined;
    const available = result?.available ?? [];
    const zone = result?.timeZone ?? "UTC";
    const dateLabel = args?.date ? new Intl.DateTimeFormat(tr ? "tr-TR" : "en-GB", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" }).format(new Date(`${args.date}T12:00:00Z`)) : tr ? "Seçilen gün" : "The selected day";
    const periodLabel = args?.period ? tr ? { morning: "sabah", afternoon: "öğleden sonra", evening: "akşam" }[args.period]
      : { morning: "morning", afternoon: "afternoon", evening: "evening" }[args.period] : "";
    const listing = context.referencedListing?.title.replace(/^DEMO\s*[—-]\s*/i, "").trim();
    const subject = listing ? tr ? `${listing} için ` : `For ${listing}, ` : "";
    const when = `${dateLabel}${periodLabel ? ` ${periodLabel}` : ""}`;
    if (!available.length) {
      if (result?.reason === "missing_schedule") return tr ? "Danışman çalışma takvimi henüz yapılandırılmamış; şu anda müsaitlik doğrulayamıyorum. Ekibe aktarabilirim."
        : "The consultant's schedule is not configured, so I cannot verify availability. I can connect you with the team.";
      if (result?.reason === "business_closed") return tr ? `${when} işletme kapalı. Açık bir gün için saatlere bakabilirim.`
        : `The business is closed on ${when}. I can check an open day.`;
      if (result?.reason === "staff_unavailable") return tr ? `${when} bu danışmanın çalışma saatlerinde uygun bir aralık yok. Başka bir zaman arayabilirim.`
        : `This consultant has no working window on ${when}. I can check another time.`;
      return tr ? `${subject}${when} uygun saat bulamadım. Başka bir zaman aramamı ister misiniz?`
        : `${subject}${when}: I found no available times. Would you like me to check another period?`;
    }
    const staff = safeStaffName(result?.staffName);
    if (available.length === 1) {
      const label = localAppointmentLabel(available[0]!.startAt, zone, tr ? "tr" : "en");
      const lead = context.tone === "concise" || context.tone === "formal" ? "" : tr ? "Tabii, " : "Certainly, ";
      return tr ? `${lead}${subject}${staff ? `danışman ${staff} ${label} müsait` : `${label} uygun görünüyor`}. ${context.askName ? "Randevuyu hangi isimle oluşturabilirim?" : context.tone === "formal" ? "Bu saat sizin için uygun mudur?" : "Bu saat sizin için de uygun mu?"}`
        : `${lead}${subject}${staff ? `consultant ${staff} is available ${label}` : `${label} is available`}. ${context.askName ? "What name should I use for the appointment?" : context.tone === "formal" ? "Would that time be suitable for you?" : "Does that time work for you?"}`;
    }
    const options = availableSlotSummary(available.map((slot) => slot.startAt), zone, tr ? "tr" : "en");
    return tr ? `${subject}${when} ${staff ? `danışman ${staff} şu saatlerde müsait` : "şu saatler uygun"}: ${options}. ${context.tone === "formal" ? "Hangi saat sizin için uygundur?" : "Hangisi size uyar?"}`
      : `${subject}${when}, ${staff ? `consultant ${staff} has openings` : "these times are available"}: ${options}. ${context.tone === "formal" ? "Which time would suit you?" : "Which works for you?"}`;
  }
  if (action.name === "handoff_to_human") return tr ? "Bir ekip üyesi bu görüşmeyi devralacak." : "A team member will take over this conversation.";
  if (action.name === "get_business_knowledge") {
    const result = action.result as Record<string, unknown> | undefined;
    if (!result) return tr ? "Bu konuda doğrulanmış işletme bilgisi bulamadım. Hangi ayrıntıyı öğrenmek istersiniz?" : "I couldn't find verified business information about that. Which detail would help?";
    const contact = result.contact as { email?: string; website?: string; phone?: string; address?: string } | undefined;
    const contactLines = [
      contact?.email && (tr ? `Bize ${contact.email} adresinden yazabilirsiniz.` : `You can email us at ${contact.email}.`),
      contact?.website && (tr ? `Web sitemiz ${contact.website}` : `Our website is ${contact.website}`),
      contact?.phone && (tr ? `Bizi ${contact.phone} numarasından arayabilirsiniz.` : `You can call us at ${contact.phone}.`),
      contact?.address && (tr ? `Adresimiz ${contact.address}.` : `Our address is ${contact.address}.`),
    ].filter(Boolean);
    if (contactLines.length && Object.entries(result).every(([key, value]) =>
      key === "contact" || key === "timeZone" || !value || Array.isArray(value) && value.length === 0))
      return contactLines.join(" ");
    const lines = [result.profile, ...(result.services as Array<{ name: string; description: string; price: string }> ?? []).map((item) => `${item.name}: ${item.description}${item.price ? ` — ${item.price}` : ""}`),
      ...(result.faqs as Array<{ question: string; answer: string }> ?? []).map((item) => `${item.question}: ${item.answer}`),
      ...(result.policies as Array<{ title: string; text: string }> ?? []).map((item) => `${item.title}: ${item.text}`),
      ...(result.facts as Array<{ label: string; value: string }> ?? []).map((item) => `${item.label}: ${item.value}`),
      ...contactLines,
      ...((result.openingHours as Array<{ day: number; startMinute: number; endMinute: number }> ?? []).map((item) => `${tr ? "Gün" : "Day"} ${item.day}: ${String(Math.floor(item.startMinute / 60)).padStart(2, "0")}:${String(item.startMinute % 60).padStart(2, "0")}-${String(Math.floor(item.endMinute / 60)).padStart(2, "0")}:${String(item.endMinute % 60).padStart(2, "0")}`)),
    ].filter((item): item is string => typeof item === "string" && item.length > 0);
    if (lines.length) {
      const introduction = /kendini tanıt|kimsin|neler yapabilirsin|introduce yourself|who are you|what can you do/i.test(context.query ?? "");
      const selected = introduction && context.responseLength !== "detailed"
        ? lines.slice(0, context.responseLength === "balanced" ? 4 : 1) : lines;
      const lead = introduction ? tr ? `Merhaba! Ben ${context.assistantName ?? "bu işletmenin yapay zekâ asistanı"}. ` : `Hello! I'm ${context.assistantName ?? "this business's AI assistant"}. ` : "";
      return `${lead}${tr ? "İşletme bilgileri" : "Business information"}:\n${selected.join("\n")}${selected.length < lines.length ? tr ? "\nİsterseniz belirli bir hizmet veya ilke hakkında daha fazla bilgi verebilirim." : "\nAsk about a specific service or policy for more detail." : ""}`;
    }
    const introduction = /kendini tanıt|kimsin|neler yapabilirsin|introduce yourself|who are you|what can you do/i.test(context.query ?? "");
    if (introduction) return tr
      ? `Merhaba! Ben ${context.assistantName ?? "bu işletmenin yapay zekâ asistanı"}. İşletmenin doğrulanmış bilgilerini ve güncel ilanlarını araştırabilir, uygun randevu saatlerini kontrol edebilir veya sizi bir ekip üyesine aktarabilirim. Bu işletme hakkında henüz ek doğrulanmış bilgi bulamadım.`
      : `Hello! I'm ${context.assistantName ?? "this business's AI assistant"}. I can look up verified business information and current listings, check appointment times, or connect you with a team member. I don't have more verified details about this business yet.`;
    return tr ? "Bu konuda doğrulanmış işletme bilgisi bulamadım. Başka bir ayrıntı sorabilir veya bir ekip üyesine bağlanabilirsiniz." : "I couldn't find verified business information about that. You can ask about another detail or speak with a team member.";
  }
  if (action.name === "search_listings") {
    const listings = (action.result as { listings?: VerifiedListing[] })?.listings ?? [];
    return formatListingReply(listings, { locale: tr ? "tr" : "en", query: context.query, responseLength: context.responseLength, previousIds: context.previousListingIds, reused: context.reused, broadened: context.broadened, repeatedNoMatch: context.repeatedNoMatch });
  }
  if (action.name === "create_appointment" || action.name === "reschedule_appointment") {
    return appointmentConfirmedReply(action.result as Parameters<typeof appointmentConfirmedReply>[0], tr ? "tr" : "en",
      action.name === "reschedule_appointment");
  }
  if (action.name === "cancel_appointment") return tr ? "Randevunuz iptal edildi." : "Your appointment is cancelled.";
  return tr ? "Talebiniz işletme ekibi için kaydedildi." : "Your request was saved for the business team.";
};
