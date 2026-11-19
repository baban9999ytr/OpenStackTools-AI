import { z } from "zod";

const intentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("booking_name"), value: z.string().min(2).max(100), sourceRequestId: z.string().regex(/^[a-f\d]{24}$/i), confidence: z.literal("high") }),
  z.strictObject({ type: z.literal("listing_feature"), feature: z.enum(["balcony", "parking", "elevator"]) }),
  z.strictObject({ type: z.literal("listing_price") }),
  z.strictObject({ type: z.literal("cancel_unfinished_booking") }),
  z.strictObject({ type: z.literal("name_refusal") }),
  z.strictObject({ type: z.literal("other_person_name") }),
  z.strictObject({ type: z.literal("change_date"), value: z.iso.date(), sourceRequestId: z.string().regex(/^[a-f\d]{24}$/i) }),
  z.strictObject({ type: z.literal("change_time"), minute: z.number().int().min(0).max(1425).multipleOf(15), sourceRequestId: z.string().regex(/^[a-f\d]{24}$/i) }),
]);
export const turnInterpretationSchema = z.strictObject({ intents: z.array(intentSchema).max(8),
  needsClarification: z.boolean() });
export type TurnInterpretation = z.infer<typeof turnInterpretationSchema>;
export const preferenceCandidateSchema = z.strictObject({ version: z.literal(1),
  name: z.string().min(2).max(100).nullable(), evidence: z.string().min(2).max(200).nullable(),
  ambiguous: z.boolean() });
export const validatePreferenceCandidate = (raw: unknown, customerText: string) => {
  const candidate = preferenceCandidateSchema.safeParse(raw);
  if (!candidate.success || candidate.data.ambiguous) return null;
  const { name, evidence } = candidate.data;
  if (!name || !evidence || !customerText.includes(evidence) || !evidence.includes(name) ||
    !/\b(?:ben|adım|ismim|my name is|i am)\b/iu.test(evidence) ||
    /adına|for my|arkadaş|friend|değil|not|istemiyorum/i.test(evidence) ||
    !/^[\p{L}'’-]{2,40}(?:\s+[\p{L}'’-]{2,40}){0,3}$/u.test(name)) return null;
  return { name, evidence };
};

const nameValue = (value: string) => {
  const candidate = value.trim().replace(/[.!]+$/, "");
  if (!/^[\p{Lu}][\p{L}'’-]{1,39}(?:\s+[\p{Lu}][\p{L}'’-]{1,39}){0,3}$/u.test(candidate)) return undefined;
  if (/^(?:Balkon|Otopark|Asansör|Randevu|Daire|Ev|Hayır|Evet|Tamam|Olur|Price|Balcony|Parking)$/iu.test(candidate)) return undefined;
  return candidate;
};

/** Deterministic, bounded extraction. Business records and model prose never enter this parser. */
export const interpretVisitorTurn = (text: string, context: { pendingQuestion?: string; requestId: string;
  correctedDate?: string; correctedMinute?: number }): TurnInterpretation => {
  const value = text.trim().slice(0, 4000);
  const intents: TurnInterpretation["intents"] = [];
  const cancel = /(?:randevudan vazgeçtim|randevuyu boşver|şimdilik randevu istemiyorum|randevu planını iptal et|never mind (?:the )?booking|stop booking|cancel (?:the|this) booking request)/i.test(value);
  if (cancel) intents.push({ type: "cancel_unfinished_booking" });
  const refusal = /(?:adımı|ismimi|name)\s+(?:vermek istemiyorum|paylaşmak istemiyorum|won'?t (?:give|share)|prefer not to share)/i.test(value);
  if (refusal) intents.push({ type: "name_refusal" });
  const otherPerson = /\b[\p{Lu}][\p{L}'’-]{1,39}\s+adına\s+(?:alalım|oluştur|book)|\bbook (?:it|this) for\s+[\p{Lu}]/iu.test(value);
  if (otherPerson) intents.push({ type: "other_person_name" });
  const firstClause = value.split(/\s*,\s*/u)[0] ?? value;
  const explicit = /^(?:(?:ben|adım|[İi]smim|benim adım|my name is|i am|i'm)\s+)(.+)$/iu.exec(firstClause);
  const embedded = /(?:^|[^\p{L}])(?:adım|[İi]smim|benim adım|my name is|i am|i'm)\s+([\p{Lu}][\p{L}'’-]{1,39}(?:\s+[\p{Lu}][\p{L}'’-]{1,39}){0,3})/iu.exec(value);
  const correctedName = /(?:[İi]smim|adım|my name is)\s+[\p{L}'’-]+(?:\s+[\p{L}'’-]+)?\s+(?:değil|degil|not)[,\s]+([\p{Lu}][\p{L}'’-]{1,39}(?:\s+[\p{Lu}][\p{L}'’-]{1,39}){0,3})/iu.exec(value);
  const possibleName = !cancel && !refusal && !otherPerson && context.pendingQuestion && context.pendingQuestion !== "none"
    ? nameValue(correctedName?.[1] ?? explicit?.[1] ?? embedded?.[1] ?? (context.pendingQuestion === "customer_name" ? firstClause : "")) : undefined;
  if (possibleName && /^[a-f\d]{24}$/i.test(context.requestId)) intents.push({ type: "booking_name",
    value: possibleName, sourceRequestId: context.requestId, confidence: "high" });
  if (/\b(?:balkon\p{L}*|balcony|balconies)\b/iu.test(value)) intents.push({ type: "listing_feature", feature: "balcony" });
  else if (/\b(?:otopark\p{L}*|parking)\b/iu.test(value)) intents.push({ type: "listing_feature", feature: "parking" });
  else if (/\b(?:asansör\p{L}*|elevator)\b/iu.test(value)) intents.push({ type: "listing_feature", feature: "elevator" });
  if (/(?:fiyat|ücret|price|cost|how much|kaç (?:tl|lira))/i.test(value)) intents.push({ type: "listing_price" });
  if (context.correctedDate && /^[a-f\d]{24}$/i.test(context.requestId)) intents.push({ type: "change_date",
    value: context.correctedDate, sourceRequestId: context.requestId });
  if (context.correctedMinute !== undefined && /^[a-f\d]{24}$/i.test(context.requestId)) intents.push({ type: "change_time",
    minute: context.correctedMinute, sourceRequestId: context.requestId });
  return turnInterpretationSchema.parse({ intents, needsClarification: Boolean(otherPerson) });
};

/** Optional future model output gate; an invalid or oversized proposal is ignored. */
export const parseModelTurnInterpretation = (value: unknown): TurnInterpretation | null =>
  turnInterpretationSchema.safeParse(value).data ?? null;

export const turnResponsePlanSchema = z.strictObject({
  cancelUnfinishedBooking: z.boolean(),
  answerVerifiedListing: z.boolean(),
  applyScheduleCorrection: z.boolean(),
  acknowledgeName: z.string().max(100).nullable(),
  collectNameAndAnswer: z.boolean(),
  prepareConfirmation: z.boolean(),
  askForClarification: z.boolean(),
});
export const planVisitorTurn = (turn: TurnInterpretation, context: { activeWorkflow: boolean;
  pendingQuestion?: string; hasVerifiedSlot: boolean }) => {
  const name = turn.intents.find((item) => item.type === "booking_name");
  const cancel = turn.intents.some((item) => item.type === "cancel_unfinished_booking");
  const correction = turn.intents.some((item) => item.type === "change_date" || item.type === "change_time");
  return turnResponsePlanSchema.parse({
    cancelUnfinishedBooking: cancel,
    answerVerifiedListing: turn.intents.some((item) => item.type === "listing_feature" || item.type === "listing_price"),
    applyScheduleCorrection: !cancel && context.activeWorkflow && correction,
    acknowledgeName: name?.type === "booking_name" ? name.value : null,
    collectNameAndAnswer: !cancel && !correction && context.activeWorkflow &&
      context.pendingQuestion === "customer_name" && name?.type === "booking_name" &&
      turn.intents.some((item) => item.type === "listing_feature" || item.type === "listing_price"),
    prepareConfirmation: !cancel && !correction && context.activeWorkflow && context.hasVerifiedSlot &&
      context.pendingQuestion === "customer_name" && name?.type === "booking_name",
    askForClarification: turn.needsClarification,
  });
};

export const verifiedListingInformation = (listing: { price: number; currency: string } | undefined,
  intents: TurnInterpretation["intents"], locale: "en" | "tr") => {
  const feature = intents.find((item) => item.type === "listing_feature");
  const price = intents.some((item) => item.type === "listing_price");
  if (!feature && !price) return "";
  if (!listing) return locale === "tr" ? "Hangi ilandan söz ettiğinizi netleştirir misiniz?"
    : "Which listing do you mean?";
  const parts: string[] = [];
  if (feature?.type === "listing_feature") {
    const label = locale === "tr" ? { balcony: "Balkon", parking: "Otopark", elevator: "Asansör" }[feature.feature]
      : feature.feature;
    parts.push(locale === "tr" ? `${label} bilgisi kayıtlı ilanda doğrulanmamış; kesin bir şey söyleyemem.`
      : `${label} is not verified in the stored listing, so I cannot confirm it.`);
  }
  if (price) {
    if (!Number.isFinite(listing.price) || !["TRY", "USD", "EUR", "GBP"].includes(listing.currency))
      parts.push(locale === "tr" ? "Bu ilanın fiyatını şu anda doğrulayamıyorum." : "I cannot verify this listing's price right now.");
    else {
      const amount = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: 0 }).format(listing.price);
      const value = listing.currency === "TRY" ? locale === "tr" ? `${amount} TL` : `TRY ${amount}` : `${amount} ${listing.currency}`;
      parts.push(locale === "tr" ? `Bu ilanın kayıtlı fiyatı ${value}.` : `The listed price is ${value}.`);
    }
  }
  return parts.join(" ");
};
