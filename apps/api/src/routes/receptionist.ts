import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { AgentAction, Appointment, Customer, Listing, Membership, Organization, StaffAvailability, User } from "../models/index.js";
import { requireMembership, requireUser } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { ActionError, actionReply, confirmAction, parseAction } from "../services/agent-actions.js";
import { AppointmentError, checkAvailability, durationSchema, timeZoneSchema, windowsSchema } from "../services/appointments.js";

import { propertyViewingServicePattern, staffCanShowProperty } from "../services/appointment-language.js";

const router = Router();
router.use(requireUser);
const id = z.string().refine(mongoose.isValidObjectId);
const handle = (error: unknown, res: import("express").Response) => {
  if (error instanceof AppointmentError || error instanceof ActionError) {
    res.status(["slot_taken", "action_conflict", "schedule_closed"].includes(error.code) ? 409 : ["invalid_arguments", "invalid_time"].includes(error.code) ? 422 : 403).json({ error: error.code });
    return true;
  }
  return false;
};
router.get("/:organizationId/receptionist/config", requireMembership(["owner", "admin", "agent", "viewer"]), async (_req, res) => {
  const organizationId = res.locals.organizationId;
  const [organization, schedules, members] = await Promise.all([
    Organization.findById(organizationId).select("timeZone openingHours").lean(),
    StaffAvailability.find({ organizationId }).lean(),
    Membership.find({ organizationId, role: { $in: ["owner", "admin", "agent"] } }).lean(),
  ]);
  const users = await User.find({ _id: { $in: members.map((member) => member.userId) } }).select("name").lean();
  res.json({ timeZone: organization?.timeZone ?? "UTC", openingHours: organization?.openingHours ?? [],
    staff: members.map((member) => ({ id: member.userId, name: users.find((user) => user._id.equals(member.userId))?.name ?? "Staff",
      windows: schedules.find((schedule) => schedule.staffId.equals(member.userId))?.windows ?? [],
      services: schedules.find((schedule) => schedule.staffId.equals(member.userId))?.services ?? [],
      viewingEnabled: staffCanShowProperty(schedules.find((schedule) => schedule.staffId.equals(member.userId))?.services ?? []),
      appointmentDurationsMinutes: schedules.find((schedule) => schedule.staffId.equals(member.userId))?.appointmentDurationsMinutes ?? [15, 30, 45, 60, 90, 120],
    })),
  });
});
router.patch("/:organizationId/receptionist/hours", requireMembership(["owner", "admin"]),
  validate(z.strictObject({ timeZone: timeZoneSchema, openingHours: windowsSchema })), async (req, res) => {
    await Organization.updateOne({ _id: res.locals.organizationId }, { $set: req.body });
    res.json({ timeZone: req.body.timeZone, openingHours: req.body.openingHours });
  });
router.put("/:organizationId/receptionist/staff/:staffId/availability", requireMembership(["owner", "admin"]),
  validate(z.strictObject({ windows: windowsSchema, viewingEnabled: z.boolean().optional() })), async (req, res) => {
    if (typeof req.params.staffId !== "string" || !mongoose.isValidObjectId(req.params.staffId)) { res.status(400).json({ error: "Invalid staff" }); return; }
    const member = await Membership.exists({ organizationId: res.locals.organizationId, userId: req.params.staffId,
      role: { $in: ["owner", "admin", "agent"] },
    });
    if (!member) { res.status(404).json({ error: "Staff unavailable" }); return; }
    const schedule = await StaffAvailability.findOneAndUpdate({ organizationId: res.locals.organizationId, staffId: req.params.staffId },
      { $set: { windows: req.body.windows },
        ...(req.body.viewingEnabled === true ? { $addToSet: { services: "property viewing" } } : {}),
        ...(req.body.viewingEnabled === false ? { $pull: { services: propertyViewingServicePattern } } : {}),
      }, { upsert: true, returnDocument: "after" });
    res.json({ staffId: schedule.staffId, windows: schedule.windows });
  });
router.get("/:organizationId/receptionist/availability", requireMembership(["owner", "admin", "agent", "viewer"]), async (req, res) => {
  const parsed = z.strictObject({ staffId: id, date: z.iso.date(), durationMinutes: z.coerce.number().pipe(durationSchema) }).safeParse(req.query);
  if (!parsed.success) { res.status(422).json({ error: "Invalid availability query" }); return; }
  try { res.json({ available: await checkAvailability(res.locals.organizationId,
    new mongoose.Types.ObjectId(parsed.data.staffId), parsed.data.date, parsed.data.durationMinutes) }); }
  catch (error) { if (!handle(error, res)) throw error; }
});
router.get("/:organizationId/receptionist/appointments", requireMembership(["owner", "admin", "agent", "viewer"]), async (_req, res) => {
  const organizationId = res.locals.organizationId;
  const appointments = await Appointment.find({ organizationId }).sort({ startAt: 1 }).limit(100).lean();
  const [customers, listings] = await Promise.all([
    res.locals.role === "viewer" ? [] : Customer.find({ organizationId, _id: { $in: appointments.flatMap(item => item.customerId ? [item.customerId] : []) } })
      .select("name contact bookingContactMethod").lean(),
    Listing.find({ organizationId, _id: { $in: appointments.flatMap(item => item.listingId ? [item.listingId] : []) } }).select("title").lean(),
  ]);
  const customerById = new Map(customers.map(item => [item._id.toString(), item]));
  const listingById = new Map(listings.map(item => [item._id.toString(), item.title]));
  res.json({ appointments: appointments.map(({ visitorName, visitorId: _visitorId, customerId, ...item }) => {
    const customer = customerId ? customerById.get(customerId.toString()) : undefined;
    return { ...item, listingTitle: item.listingId ? listingById.get(item.listingId.toString()) : undefined,
      ...(res.locals.role === "viewer" ? {} : { visitorName: customer?.name ?? visitorName,
        contact: customer?.contact, contactMethod: customer?.bookingContactMethod }) };
  }) });
});
router.get("/:organizationId/receptionist/customers", requireMembership(["owner", "admin", "agent"]), async (_req, res) => {
  res.json({ customers: await Customer.find({ organizationId: res.locals.organizationId }).sort({ updatedAt: -1 }).limit(100).lean() });
});
router.get("/:organizationId/receptionist/actions", requireMembership(["owner", "admin", "agent"]), async (_req, res) => {
  res.json({ actions: await AgentAction.find({ organizationId: res.locals.organizationId }).select("name status result createdAt confirmedAt").sort({ createdAt: -1 }).limit(100).lean() });
});
router.post("/:organizationId/receptionist/actions", requireMembership(["owner", "admin", "agent"]),
  validate(z.strictObject({ name: z.string().max(50), arguments: z.unknown(), idempotencyKey: z.uuid(), confirmed: z.boolean() })),
  async (req, res) => {
    try {
      const call = parseAction(req.body.name, req.body.arguments);
      if (["create_appointment", "reschedule_appointment", "cancel_appointment", "create_customer"].includes(call.name) && req.body.confirmed !== true)
        throw new ActionError("confirmation_required");
      if (call.name === "handoff_to_human") throw new ActionError("invalid_action");
      const context = { organizationId: res.locals.organizationId as mongoose.Types.ObjectId,
        actorId: res.locals.userId as mongoose.Types.ObjectId };
      const staged = await (await import("../services/agent-actions.js")).stageAction(context, call, `staff:${req.body.idempotencyKey}`);
      const action = staged.status === "pending" ? await confirmAction(context, staged._id) : staged;
      res.status(staged.status === "pending" ? 201 : 200).json({ action: { id: action._id, name: action.name,
        status: action.status, result: action.result }, message: actionReply(action) });
    } catch (error) { if (!handle(error, res)) throw error; }
  });
export default router;
