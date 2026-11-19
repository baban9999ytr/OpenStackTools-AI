import { localParts } from "./appointments.js";

export const localAppointmentLabel = (iso: string, timeZone: string, locale: "en" | "tr") => {
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return null;
  const date = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    timeZone, day: "numeric", month: "long", weekday: "long",
  }).format(value);
  const local = localParts(value, timeZone);
  const clock = `${String(Math.floor(local.minute / 60)).padStart(2, "0")}${locale === "tr" ? "." : ":"}${String(local.minute % 60).padStart(2, "0")}`;
  return locale === "tr" ? `${date} saat ${clock}` : `${date} at ${clock}`;
};

export const safeStaffName = (name?: string) => name?.replace(/^DEMO\s*[—-]\s*/i, "").trim().slice(0, 80) || undefined;

/** Earliest verified starts, preferring 30-minute spacing; never infer intermediate slots. */
export const availableSlotSummary = (starts: string[], timeZone: string, locale: "en" | "tr") => {
  const valid = [...new Set(starts.map((iso) => new Date(iso).getTime()).filter(Number.isFinite))].sort((a, b) => a - b);
  const chosen: number[] = [];
  for (const timestamp of valid) {
    if (!chosen.length || timestamp - chosen[chosen.length - 1]! >= 30 * 60_000) chosen.push(timestamp);
    if (chosen.length === 3) break;
  }
  const dates = new Set(valid.map((timestamp) => localParts(new Date(timestamp), timeZone).date));
  return chosen.map((timestamp) => {
    const iso = new Date(timestamp).toISOString();
    if (dates.size > 1) return localAppointmentLabel(iso, timeZone, locale)!;
    const minute = localParts(new Date(timestamp), timeZone).minute;
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}${locale === "tr" ? "." : ":"}${String(minute % 60).padStart(2, "0")}`;
  }).join(locale === "tr" ? " veya " : " or ");
};

export const appointmentProposalReply = (result: { startAt?: string; timeZone?: string; staffName?: string;
  durationMinutes?: number; customerName?: string; listingTitle?: string } | undefined, locale: "en" | "tr") => {
  const when = result?.startAt && result.timeZone ? localAppointmentLabel(result.startAt, result.timeZone, locale) : null;
  if (!when) return locale === "tr" ? "Randevu talebini gözden geçirip onaylayın. Henüz randevu oluşturulmadı."
    : "Please review and confirm this appointment request. No booking has been made yet.";
  const staff = safeStaffName(result?.staffName);
  const listing = result?.listingTitle?.replace(/^DEMO\s*[—-]\s*/i, "").trim();
  const duration = result?.durationMinutes;
  return locale === "tr"
    ? `${listing ? `${listing} için ` : ""}${when}${staff ? `, ${staff} ile` : ""}${duration ? ` ${duration} dakikalık` : ""} görüşme için randevu oluşturayım mı? Onayınızdan önce randevu kaydedilmeyecek.`
    : `Shall I book a${duration ? ` ${duration}-minute` : ""} appointment ${when}${staff ? ` with ${staff}` : ""}${listing ? ` for ${listing}` : ""}? It will not be booked until you confirm.`;
};

export const appointmentConfirmedReply = (result: { startAt?: string; timeZone?: string; staffName?: string;
  durationMinutes?: number; listingTitle?: string } | undefined, locale: "en" | "tr", changed = false) => {
  const when = result?.startAt && result.timeZone ? localAppointmentLabel(result.startAt, result.timeZone, locale) : null;
  if (!when) return locale === "tr" ? changed ? "Randevunuzun saati değiştirildi." : "Randevunuz oluşturuldu."
    : changed ? "Your appointment was rescheduled." : "Your appointment is booked.";
  const staff = safeStaffName(result?.staffName);
  const listing = result?.listingTitle?.replace(/^DEMO\s*[—-]\s*/i, "").trim();
  const duration = result?.durationMinutes;
  return locale === "tr"
    ? `${changed ? "Randevunuz güncellendi" : "Randevunuz oluşturuldu"}: ${when}${staff ? `, ${staff} ile` : ""}${listing ? `, ${listing} için` : ""}.${duration ? ` Görüşme yaklaşık ${duration} dakika sürecek.` : ""}`
    : `${changed ? "Your appointment was rescheduled" : "Your appointment is booked"} for ${when}${staff ? ` with ${staff}` : ""}${listing ? ` to view ${listing}` : ""}.${duration ? ` It will take about ${duration} minutes.` : ""}`;
};
