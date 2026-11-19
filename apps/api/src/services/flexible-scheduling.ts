import { localParts, inspectAvailability } from "./appointments.js";
import { requestedAppointmentDates, requestedAppointmentWindow } from "./appointment-language.js";
import type { Types } from "mongoose";

export const flexibleDatePlan = (text: string, zone: string, at: Date, priorDate?: string | null) => {
  const local = localParts(at, zone);
  const add = (n: number) => { const d = new Date(`${local.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const any = /(?:gün|gun).{0,15}(?:saat|zaman).{0,15}fark etmez|any (?:day|time)|whenever/i.test(text);
  const week = /bu hafta.{0,25}herhangi|any day this week/i.test(text);
  const excludeTomorrow = /yarın (?:olmaz|gelemem|gelemiyorum).{0,30}sonraki iki gün|not tomorrow.{0,30}(?:following|next) two days/i.test(text);
  const notEarly = /sabah erken olmasın|not early (?:in the )?morning/i.test(text);
  const window = requestedAppointmentWindow(text, zone, at);
  const periodOnly = /(?:öğleden sonra|afternoon).{0,25}(?:herhangi|any|olur)/i.test(text);
  if (!any && !week && !excludeTomorrow && !notEarly && !periodOnly && !window.period) return null;
  if (/(?:sabah|morning).{0,30}(?:yalnızca|only).{0,30}(?:öğleden sonra|afternoon)|(?:öğleden sonra|afternoon).{0,30}(?:yalnızca|only).{0,30}(?:sabah|morning)/i.test(text))
    return { dates: [], startMinute: 0, endMinute: 1440, needsClarification: true };
  const explicitDates = requestedAppointmentDates(text, zone, at);
  let dates = excludeTomorrow ? [add(2), add(3)] : explicitDates;
  if (!dates.length && priorDate && !any && !week) dates = [priorDate];
  if (!dates.length) dates = Array.from({ length: week ? 7 - ((local.day + 6) % 7) : 7 }, (_, i) => add(i));
  // A named weekday can resolve to exactly one week ahead when today has that weekday.
  const horizon = add(explicitDates.length ? 7 : 6);
  dates = dates.filter((date) => date >= local.date && date <= horizon).slice(0, 7);
  // “Not early” has no universal numeric meaning. Ask rather than inventing a preference.
  return { dates, startMinute: window.startMinute ?? 0, endMinute: window.endMinute ?? 1440,
    needsClarification: notEarly };
};
export type OfferedSlot = { startAt: string; staffId: string; durationMinutes: number };
export const findFlexibleSlots = async (organizationId: Types.ObjectId, staff: Types.ObjectId[],
  plan: NonNullable<ReturnType<typeof flexibleDatePlan>>, duration: number, at: Date) => {
  const options: OfferedSlot[] = [];
  const reasons = new Set<string>();
  if (plan.needsClarification) return { options, reasons: ["clarification_required"] };
  for (const date of plan.dates.slice(0, 7)) {
    for (const staffId of staff.slice(0, 2)) {
      const result = await inspectAvailability(organizationId, staffId, date, duration,
        { startMinute: plan.startMinute, endMinute: plan.endMinute }, at);
      if (result.reason) reasons.add(result.reason);
      for (const slot of result.available) {
        if (options.some((item) => Math.abs(Date.parse(item.startAt) - Date.parse(slot.startAt)) < 30 * 60_000)) continue;
        options.push({ startAt: slot.startAt, staffId: staffId.toString(), durationMinutes: duration });
        if (options.length === 3) return { options, reasons: [...reasons] };
      }
    }
  }
  return { options, reasons: [...reasons] };
};
