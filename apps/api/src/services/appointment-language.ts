import { localParts } from "./appointments.js";

export type DayPeriod = "morning" | "afternoon" | "evening";
export type MinuteWindow = { startMinute: number; endMinute: number };
const parseMinute = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid appointment period time");
  const hour = Number(match[1]);
  const part = Number(match[2]);
  const minute = hour * 60 + part;
  if (hour > 24 || part > 59 || minute > 1440 || minute % 15 !== 0 || (hour === 24 && part !== 0))
    throw new Error("Invalid appointment period time");
  return minute;
};
export const parsePeriodWindow = (value: string): MinuteWindow => {
  const parts = value.split("-");
  if (parts.length !== 2) throw new Error("Invalid appointment period window");
  const startMinute = parseMinute(parts[0]!);
  const endMinute = parseMinute(parts[1]!);
  if (startMinute >= endMinute || endMinute > 1440) throw new Error("Invalid appointment period window");
  return { startMinute, endMinute };
};
export const appointmentPeriods: Record<DayPeriod, MinuteWindow> = {
  morning: parsePeriodWindow(process.env.APPOINTMENT_MORNING_WINDOW ?? "09:00-12:00"),
  afternoon: parsePeriodWindow(process.env.APPOINTMENT_AFTERNOON_WINDOW ?? "12:00-17:00"),
  evening: parsePeriodWindow(process.env.APPOINTMENT_EVENING_WINDOW ?? "17:00-21:00"),
};
if (appointmentPeriods.morning.endMinute > appointmentPeriods.afternoon.startMinute ||
  appointmentPeriods.afternoon.endMinute > appointmentPeriods.evening.startMinute)
  throw new Error("Appointment periods must not overlap");

const dateAdd = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const weekdays: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  pazar: 0, pazartesi: 1, salı: 2, sali: 2, çarşamba: 3, carsamba: 3, perşembe: 4, persembe: 4,
  cuma: 5, cumartesi: 6,
};
export const requestedAppointmentWindow = (query: string, timeZone: string, requestedAt: Date,
  periods: Record<DayPeriod, MinuteWindow> = appointmentPeriods) => {
  const local = localParts(requestedAt, timeZone);
  const period: DayPeriod | undefined = /öğleden sonra|ogleden sonra|afternoon/i.test(query) ? "afternoon"
    : /akşam|aksam|evening/i.test(query) ? "evening"
      : /sabah|morning/i.test(query) ? "morning" : undefined;
  let date: string | undefined;
  if (/yarın|yarin|\btomorrow\b/i.test(query)) date = dateAdd(local.date, 1);
  else {
    const next = /(?:next|gelecek|önümüzdeki|onumuzdeki)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar)/i.exec(query);
    if (next) {
      const target = weekdays[next[1]!.toLocaleLowerCase("tr")];
      if (target !== undefined) date = dateAdd(local.date, (target - local.day + 7) % 7 || 7);
    } else if (/\btoday\b|\bthis\s+(?:morning|afternoon|evening)\b|bugün|bugun|bu\s+(?:sabah|öğleden sonra|ogleden sonra|akşam|aksam)/i.test(query)) date = local.date;
  }
  return { date, period, ...(period ? periods[period] : {}) };
};

const monthNumbers: Record<string, number> = { ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4,
  mayıs: 5, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9,
  ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12 };
const validDate = (year: number, month: number, day: number) => {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : undefined;
};
export const requestedAppointmentDates = (query: string, timeZone: string, requestedAt: Date) => {
  const dates: string[] = [];
  for (const match of query.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const date = validDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date && !dates.includes(date)) dates.push(date);
  }
  const localYear = Number(localParts(requestedAt, timeZone).date.slice(0, 4));
  for (const match of query.matchAll(/\b(?:(\d{1,2})\s*(?:veya|ya da|ve|or|and)\s*)?(\d{1,2})\s*(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:['’]?(?:da|de|ta|te|ın|in))?(?:\s+(20\d{2}))?/giu)) {
    const month = monthNumbers[match[3]!.toLocaleLowerCase("tr")];
    const year = Number(match[4] ?? localYear);
    if (!month) continue;
    for (const day of [match[1], match[2]]) {
      if (!day) continue;
      const date = validDate(year, month, Number(day));
      if (date && !dates.includes(date)) dates.push(date);
    }
  }
  const relative = requestedAppointmentWindow(query, timeZone, requestedAt).date;
  if (relative && !dates.includes(relative)) dates.push(relative);
  return dates.slice(0, 3);
};

export const requestedClockMinute = (query: string) => {
  const match = /(?:\bsaat\s*|\bat\s+)?\b([01]?\d|2[0-3])[:.]([0-5]\d)\b|\bsaat\s+([01]?\d|2[0-3])\b/i.exec(query);
  if (!match) return undefined;
  const minute = Number(match[1] ?? match[3]) * 60 + Number(match[2] ?? 0);
  return minute % 15 === 0 ? minute : undefined;
};

export const correctedClockMinute = (query: string) => {
  if (!/\b(?:ama|but|instead|yerine|dedim|correction)\b/i.test(query)) return undefined;
  const clocks = [...query.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)]
    .map((match) => Number(match[1]) * 60 + Number(match[2]));
  const last = clocks.at(-1);
  return clocks.length >= 2 && last !== undefined && last % 15 === 0 ? last : undefined;
};

export const correctedAppointmentDate = (query: string, timeZone: string, at: Date) => {
  const match = /(?:yerine|değil|degil|instead of|not)\s+([\p{L}]+)/iu.exec(query);
  const alternative = match ?? /(?:gelemem|olmaz|cannot come|can't come)[,; ]+(?:ama\s+)?(pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/iu.exec(query);
  if (!alternative) return undefined;
  const day = weekdays[alternative[1]!.toLocaleLowerCase("tr")];
  if (day === undefined) return undefined;
  const local = localParts(at, timeZone);
  return dateAdd(local.date, (day - local.day + 7) % 7 || 7);
};

export const requestedDurationMinutes = (query: string) => {
  const minutes = /\b(15|30|45|60|90|120)\s*(?:dakika|minutes?|mins?)\b/i.exec(query);
  if (minutes) return Number(minutes[1]);
  if (/\b(?:bir|1)\s*(?:saat|hours?)\b/i.test(query)) return 60;
  if (/\b(?:iki|2)\s*(?:saat|hours?)\b/i.test(query)) return 120;
  return undefined;
};

export const isAvailabilityFollowUp = (query: string) =>
  /(?:başka|alternatif|farklı|other|alternative).{0,55}(?:saat|zaman|gün|tarih|slot|time|day|date)|(?:müsait|uygun|available|availability).{0,70}(?:bak|kontrol|check|ara|search)|(?:bak|kontrol|check|ara|search).{0,70}(?:müsait|uygun|available|availability)/i.test(query);

export const asksForPropertyViewing = (query: string) => /\b(?:view|viewing|showing|see (?:the|that) (?:apartment|property|flat|house))\b|(?:daire|ev|ilan|konut).{0,35}(?:görmek|gezmek|gösterim)|yer gösterimi/i.test(query);
export const staffCanShowProperty = (services: string[]) => services.some((service) => /yer gösterimi|ev gösterimi|konut gösterimi|property showing|property viewing|viewings?/i.test(service));
export const asksForSchedulingAvailability = (query: string) =>
  /müsait|musait|randevu|appointment|availability|available|openings|\bslots?\b/i.test(query) &&
  /danışman|danisman|consultant|staff|randevu|appointment|görmek|gezmek|viewing|showing|saat|time|yarın|yarin|tomorrow|akşam|aksam|evening|sabah|morning|afternoon|öğleden sonra/i.test(query);
