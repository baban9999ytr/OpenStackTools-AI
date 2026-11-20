import { z } from "zod";

export const bookingIntakeSchema = z.object({
  staffId: z.string(), startAt: z.iso.datetime(), durationMinutes: z.number(),
  listingId: z.string().optional(), name: z.string().optional(),
  contact: z.string().optional(), method: z.enum(["phone", "email"]).optional(),
  deferred: z.boolean().optional(), consentExplained: z.boolean().optional(),
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
const bookingStatement = (text: string) => text.trim().toLowerCase().replace(/i\u0307/g, "i").replace(/[.!]+$/, "");
export const bookingConsent = (text: string) =>
  /^(?:(?:evet,? )?(?:(?:sadece |yalnızca )?(?:bu )?randevu(?:m)? (?:için|hakkında) )?(?:iletişime izin veriyorum|iletişim kurmanıza izin veriyorum|benimle iletişime geçebilirsiniz|beni arayabilirsiniz|bana e-posta gönderebilirsiniz)|(?:yes,? )?(?:i agree to booking contact|i consent to being contacted about (?:this|my) (?:booking|viewing)|you (?:can|may) contact me about (?:this|my) (?:booking|viewing)))$/u.test(bookingStatement(text));
export const bookingContactDeclined = (text: string) =>
  /^(?:paylaşmak istemiyorum|(?:telefon numaramı|e-posta adresimi|iletişim bilgilerimi) paylaşmak istemiyorum|iletişime izin vermiyorum|reddediyorum|i decline|i do not agree|please do not contact me about this booking)$/u.test(bookingStatement(text));

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
