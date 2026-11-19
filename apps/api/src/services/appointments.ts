import mongoose from "mongoose";
import { z } from "zod";
import { Appointment, AppointmentSlot, Membership, Organization, StaffAvailability } from "../models/index.js";

export const windowSchema = z.strictObject({
  day: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1425).multipleOf(15),
  endMinute: z.number().int().min(15).max(1440).multipleOf(15),
}).refine((value) => value.endMinute > value.startMinute, "End must follow start");
export const windowsSchema = z.array(windowSchema).max(28).refine((windows) =>
  windows.every((window, index) => windows.every((other, otherIndex) =>
    index === otherIndex || window.day !== other.day ||
    window.endMinute <= other.startMinute || other.endMinute <= window.startMinute,
  )), "Opening windows overlap");
export const timeZoneSchema = z.string().max(80).refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; }
  catch { return false; }
}, "Invalid IANA time zone");
export const appointmentTimeSchema = z.string().datetime({ offset: true });
export const durationSchema = z.number().int().refine((value) => [15, 30, 45, 60, 90, 120].includes(value), "Unsupported duration");
const formatter = (timeZone: string) => new Intl.DateTimeFormat("en-US", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const localParts = (date: Date, timeZone: string) => {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: days.indexOf(parts.weekday ?? ""),
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
};
const within = (windows: Array<{ day?: number | null; startMinute?: number | null; endMinute?: number | null }>, day: number, start: number, end: number) =>
  windows.some((window) => window.day === day && typeof window.startMinute === "number" && typeof window.endMinute === "number" && start >= window.startMinute && end <= window.endMinute);

export class AppointmentError extends Error {
  constructor(public code: "schedule_closed" | "slot_taken" | "appointment_unavailable" | "invalid_time") { super(code); }
}

export const appointmentEnd = (startAt: Date, durationMinutes: number) => new Date(startAt.getTime() + durationMinutes * 60_000);
export const appointmentSlots = (startAt: Date, durationMinutes: number) =>
  Array.from({ length: durationMinutes / 15 }, (_, index) => new Date(startAt.getTime() + index * 15 * 60_000));

const loadSchedule = async (organizationId: mongoose.Types.ObjectId, staffId: mongoose.Types.ObjectId) => {
  const [organization, membership, availability] = await Promise.all([
    Organization.findById(organizationId).lean(),
    Membership.findOne({ organizationId, userId: staffId, role: { $in: ["owner", "admin", "agent"] } }).lean(),
    StaffAvailability.findOne({ organizationId, staffId }).lean(),
  ]);
  if (!organization || !membership || !availability) throw new AppointmentError("schedule_closed");
  return { organization, availability };
};
const bookableInSchedule = (schedule: Awaited<ReturnType<typeof loadSchedule>>, startAt: Date, durationMinutes: number) => {
  const endAt = appointmentEnd(startAt, durationMinutes);
  const timeZone = schedule.organization.timeZone ?? "UTC";
  const start = localParts(startAt, timeZone);
  const end = localParts(endAt, timeZone);
  return start.date === end.date &&
    (schedule.availability.appointmentDurationsMinutes?.length ? schedule.availability.appointmentDurationsMinutes.includes(durationMinutes) : true) &&
    within(schedule.organization.openingHours ?? [], start.day, start.minute, end.minute) &&
    within(schedule.availability.windows ?? [], start.day, start.minute, end.minute);
};

export const assertBookable = async (organizationId: mongoose.Types.ObjectId, staffId: mongoose.Types.ObjectId, startAt: Date, durationMinutes: number) => {
  if (!Number.isFinite(startAt.getTime()) || startAt.getTime() < Date.now() + 60_000 || startAt.getTime() > Date.now() + 180 * 86_400_000 || startAt.getTime() % (15 * 60_000) !== 0)
    throw new AppointmentError("invalid_time");
  const schedule = await loadSchedule(organizationId, staffId);
  const endAt = appointmentEnd(startAt, durationMinutes);
  if (!bookableInSchedule(schedule, startAt, durationMinutes)) throw new AppointmentError("schedule_closed");
  return { endAt, timeZone: schedule.organization.timeZone ?? "UTC" };
};

export const checkAvailability = async (organizationId: mongoose.Types.ObjectId, staffId: mongoose.Types.ObjectId, date: string, durationMinutes: number,
  requestedWindow?: { startMinute: number; endMinute: number }, now = new Date()) => {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new AppointmentError("invalid_time");
  const candidates: Date[] = [];
  if (requestedWindow && (!Number.isInteger(requestedWindow.startMinute) || !Number.isInteger(requestedWindow.endMinute) ||
    requestedWindow.startMinute < 0 || requestedWindow.endMinute > 1440 || requestedWindow.startMinute >= requestedWindow.endMinute ||
    requestedWindow.startMinute % 15 !== 0 || requestedWindow.endMinute % 15 !== 0)) throw new AppointmentError("invalid_time");
  const anchor = parsedDate.getTime();
  const schedule = await loadSchedule(organizationId, staffId);
  for (let offset = -14 * 60; offset < 38 * 60; offset += 15) {
    const startAt = new Date(anchor + offset * 60_000);
    if (localParts(startAt, schedule.organization.timeZone ?? "UTC").date !== date) continue;
    if (requestedWindow) {
      const startLocal = localParts(startAt, schedule.organization.timeZone ?? "UTC");
      const endLocal = localParts(appointmentEnd(startAt, durationMinutes), schedule.organization.timeZone ?? "UTC");
      if (startLocal.minute < requestedWindow.startMinute || endLocal.date !== date || endLocal.minute > requestedWindow.endMinute) continue;
    }
    if (startAt.getTime() < now.getTime() + 60_000 || startAt.getTime() > now.getTime() + 180 * 86_400_000) continue;
    if (bookableInSchedule(schedule, startAt, durationMinutes)) candidates.push(startAt);
  }
  const occupied = await AppointmentSlot.find({ organizationId, staffId,
    startAt: { $gte: new Date(anchor - 14 * 3_600_000), $lt: new Date(anchor + 38 * 3_600_000) },
  }).select("startAt").lean();
  const used = new Set(occupied.map((slot) => slot.startAt.getTime()));
  return candidates.filter((startAt) => appointmentSlots(startAt, durationMinutes).every((slot) => !used.has(slot.getTime())))
    .slice(0, 48).map((startAt) => ({ startAt: startAt.toISOString(), endAt: appointmentEnd(startAt, durationMinutes).toISOString() }));
};

export const inspectAvailability = async (organizationId: mongoose.Types.ObjectId, staffId: mongoose.Types.ObjectId,
  date: string, durationMinutes: number, requestedWindow?: { startMinute: number; endMinute: number }, now = new Date()) => {
  let schedule: Awaited<ReturnType<typeof loadSchedule>>;
  try { schedule = await loadSchedule(organizationId, staffId); }
  catch (error) {
    if (error instanceof AppointmentError && error.code === "schedule_closed")
      return { available: [], reason: "missing_schedule" as const };
    throw error;
  }
  const available = await checkAvailability(organizationId, staffId, date, durationMinutes, requestedWindow, now);
  if (available.length) return { available, reason: "available" as const };
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const fits = (windows: Array<{ day?: number | null; startMinute?: number | null; endMinute?: number | null }>) =>
    windows.some((window) => window.day === day && typeof window.startMinute === "number" && typeof window.endMinute === "number" &&
      (!requestedWindow || Math.max(window.startMinute, requestedWindow.startMinute) + durationMinutes <=
        Math.min(window.endMinute, requestedWindow.endMinute)));
  if (!fits(schedule.organization.openingHours ?? [])) return { available, reason: "business_closed" as const };
  if (!fits(schedule.availability.windows ?? []) ||
    schedule.availability.appointmentDurationsMinutes?.length && !schedule.availability.appointmentDurationsMinutes.includes(durationMinutes))
    return { available, reason: "staff_unavailable" as const };
  return { available, reason: "no_slots" as const };
};

export const reserveAppointment = async (input: {
  organizationId: mongoose.Types.ObjectId; staffId: mongoose.Types.ObjectId; startAt: Date;
  durationMinutes: number; visitorId?: string; conversationId?: mongoose.Types.ObjectId;
  visitorName?: string;
  listingId?: mongoose.Types.ObjectId;
  createdBy: "widget" | "staff";
}, session: mongoose.ClientSession) => {
  const { endAt } = await assertBookable(input.organizationId, input.staffId, input.startAt, input.durationMinutes);
  const [appointment] = await Appointment.create([{ ...input, endAt, status: "booked" }], { session });
  if (!appointment) throw new AppointmentError("appointment_unavailable");
  await AppointmentSlot.insertMany(appointmentSlots(input.startAt, input.durationMinutes).map((startAt) => ({
    organizationId: input.organizationId, staffId: input.staffId, appointmentId: appointment._id, startAt,
  })), { session });
  return appointment;
};

export const changeAppointment = async (input: {
  organizationId: mongoose.Types.ObjectId; appointmentId: mongoose.Types.ObjectId;
  visitorId?: string; staffActor?: boolean; startAt?: Date; durationMinutes?: number;
  cancel?: boolean;
}, session: mongoose.ClientSession) => {
  const appointment = await Appointment.findOne({ _id: input.appointmentId, organizationId: input.organizationId,
    status: "booked", ...(!input.staffActor ? { visitorId: input.visitorId } : {}),
  }).session(session);
  if (!appointment) throw new AppointmentError("appointment_unavailable");
  if (input.cancel) {
    await AppointmentSlot.deleteMany({ organizationId: input.organizationId, appointmentId: appointment._id }, { session });
    appointment.status = "cancelled";
  } else {
    const startAt = input.startAt!;
    const duration = input.durationMinutes!;
    const { endAt } = await assertBookable(input.organizationId, appointment.staffId, startAt, duration);
    await AppointmentSlot.deleteMany({ organizationId: input.organizationId, appointmentId: appointment._id }, { session });
    await AppointmentSlot.insertMany(appointmentSlots(startAt, duration).map((slot) => ({
      organizationId: input.organizationId, staffId: appointment.staffId, appointmentId: appointment._id, startAt: slot,
    })), { session });
    appointment.startAt = startAt;
    appointment.endAt = endAt;
  }
  await appointment.save({ session });
  return appointment;
};
