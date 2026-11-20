import { z } from "zod";

export const bookingIntakeSchema = z.object({
  staffId: z.string(), startAt: z.iso.datetime(), durationMinutes: z.number(),
  listingId: z.string().optional(), name: z.string().optional(),
  contact: z.string().optional(), method: z.enum(["phone", "email"]).optional(),
  actionId: z.string().optional(), consentAt: z.coerce.date().optional(), expiresAt: z.coerce.date(),
});
export type BookingIntake = z.infer<typeof bookingIntakeSchema>;

export const bookingContactRequired = (value?: string | null) => value === "phone" || value === "email" || value === "either";
export const requiresBookingIntake = (policy?: { bookingNameRequired?: boolean; bookingContactMethod?: string | null } | null) =>
  bookingContactRequired(policy?.bookingContactMethod) ||
  (policy?.bookingContactMethod === "none" && policy.bookingNameRequired === true);
export const intakeName = (text: string) => {
  const name = text.trim().replace(/^(?:adım|ismim|my name is)\s+/iu, "").replace(/\.$/, "");
  const pattern = /^(?:adım|ismim|my name is)\s+/iu.test(text.trim())
    ? /^\p{L}[\p{L}\p{M}'’-]*(?:\s+\p{L}[\p{L}\p{M}'’-]*){1,4}$/u
    : /^\p{Lu}[\p{L}\p{M}'’-]*(?:\s+\p{Lu}[\p{L}\p{M}'’-]*){1,4}$/u;
  return name.length <= 80 && pattern.test(name) ? name : undefined;
};
export const intakeContact = (text: string, allowed: string | null | undefined) => {
  const value = text.trim();
  if (allowed !== "phone" && value.length <= 200 && z.email().safeParse(value).success)
    return { contact: value, method: "email" as const };
  const compact = value.replace(/[ ().-]/g, "");
  if (allowed !== "email" && /^\+?[0-9]{7,15}$/.test(compact))
    return { contact: compact, method: "phone" as const };
};
export const bookingConsent = (text: string) =>
  /^(?:iletişime izin veriyorum|i agree to booking contact)[.!]?$/iu.test(text.trim().toLocaleLowerCase("tr"));
export const bookingContactDeclined = (text: string) =>
  /^(?:paylaşmak istemiyorum|iletişime izin vermiyorum|reddediyorum|i decline|i do not agree)[.!]?$/iu.test(text.trim().toLocaleLowerCase("tr"));

export function readyIntake(value: unknown, policy: { bookingNameRequired?: boolean; bookingContactMethod?: string | null },
  slot: { staffId: string; startAt: string; durationMinutes: number; listingId?: string }) {
  const parsed = bookingIntakeSchema.safeParse(value);
  if (!parsed.success) return;
  const draft = parsed.data;
  const contact = draft.contact && intakeContact(draft.contact, policy.bookingContactMethod);
  if (draft.expiresAt <= new Date() ||
      (bookingContactRequired(policy.bookingContactMethod) && (!draft.consentAt || !contact || contact.method !== draft.method)) ||
      (policy.bookingNameRequired && (!draft.name || !intakeName(`my name is ${draft.name}`))) ||
      draft.staffId !== slot.staffId || draft.startAt !== slot.startAt ||
      draft.durationMinutes !== slot.durationMinutes || draft.listingId !== slot.listingId) return;
  return draft;
}
