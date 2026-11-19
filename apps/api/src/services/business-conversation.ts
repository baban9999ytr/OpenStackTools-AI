import { z } from "zod";

const fields = ["name", "location", "budget", "currency", "rooms", "propertyType", "listingType", "furnished", "balcony"] as const;
const fieldSchema = z.enum(fields);
export type PreferenceField = typeof fields[number];
const evidenceSchema = z.strictObject({ value: z.union([z.string().max(100), z.number().finite(), z.boolean()]),
  evidence: z.string().min(1).max(160), requestId: z.string().regex(/^[a-f\d]{24}$/i) });
export const businessStateSchema = z.strictObject({
  viewingOffered: z.boolean().default(false),
  values: z.partialRecord(fieldSchema, evidenceSchema), asked: z.array(fieldSchema).max(9),
  refused: z.array(z.enum([...fields, "phone"])).max(10),
});
export type BusinessState = z.infer<typeof businessStateSchema>;
export const emptyBusinessState = (): BusinessState => ({ values: {}, asked: [], refused: [], viewingOffered: false });
export function extractBusinessTurn(text: string, requestId: string, prior?: unknown) {
  const input = text.slice(0, 4000);
  const updates: BusinessState["values"] = {};
  const conflicts = new Set<PreferenceField>();
  const put = (field: PreferenceField, value: string | number | boolean, evidence: string) => {
    if (updates[field] && updates[field]?.value !== value) conflicts.add(field);
    updates[field] = { value, evidence: evidence.slice(0, 160), requestId };
  };
  const pending = businessStateSchema.safeParse(prior).data;
  const lastQuestion = pending?.asked.filter((field) => !pending.values[field] && !pending.refused.includes(field)).at(-1);
  if (lastQuestion === "location" && /^[\p{L} ]{2,60}$/u.test(input.trim()) &&
      !/istemiyorum|hayır|bilmiyorum|no|help|yardım|merhaba|hello/i.test(input))
    put("location", input.trim(), input);
  if (lastQuestion === "budget" && /^\d{1,9}$/.test(input.trim())) put("budget", Number(input), input);
  const name = /(?:^|[.,!]\s*)(?:ben|adım|adim|my name is|i am)\s+([\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){0,2})(?=[.,!]|$)/iu.exec(input);
  if (name && !/değil|degil|not|adına/i.test(name[0])) put("name", name[1]!, name[0]);
  for (const m of input.matchAll(/([\p{L}]+(?:\s+[\p{L}]+)?)[’'](?:de|da)\b/giu)) put("location", m[1]!.replace(/^(?:ben|in)\s+/i, ""), m[0]);
  const location = /(?:location|konum|semt|mahalle)\s*:\s*([\p{L} ]{2,60})(?=[,.!?]|$)/iu.exec(input);
  if (location) put("location", location[1]!.trim(), location[0]);
  for (const m of input.matchAll(/\b(\d{1,2})\s*\+\s*1\b/g)) if (Number(m[1]) <= 50) put("rooms", Number(m[1]), m[0]);
  for (const m of input.matchAll(/\b(\d{1,3}(?:[.,]\d{3})+|\d{1,9})\s*(bin\w*|k\b|TL\b|TRY\b|USD\b|EUR\b|GBP\b|lira\b|dolar\b|euro\b)/giu)) {
    const amount = Number(m[1]!.replace(/[.,]/g, "")) * (/^(bin|k)/i.test(m[2]!) ? 1000 : 1);
    if (amount <= 1e9) put("budget", amount, m[0]);
  }
  for (const m of input.matchAll(/\b(TL|TRY|lira|USD|dolar|EUR|euro|GBP)\b/gi))
    put("currency", /^(TL|TRY|lira)$/i.test(m[1]!) ? "TRY" : /^(USD|dolar)$/i.test(m[1]!) ? "USD" : /^(EUR|euro)$/i.test(m[1]!) ? "EUR" : "GBP", m[0]);
  const mappings: Array<[PreferenceField, string | boolean, RegExp]> = [
    ["propertyType", "apartment", /\bdaire\b|\bapartment\b/i], ["propertyType", "house", /\bmüstakil\b|\bhouse\b/i],
    ["propertyType", "land", /\barsa\b|\bland\b/i], ["propertyType", "commercial", /\bdükkan\b|\bcommercial\b/i],
    ["listingType", "rent", /kiral[iı]k|\brent(?:al)?\b/i], ["listingType", "sale", /sat[iı]l[iı]k|\bbuy\b|\bfor sale\b/i],
    ["furnished", false, /eşyasız|esyasiz|unfurnished/i], ["furnished", true, /eşyalı|esyali|(?<!un)\bfurnished\b/i],
    ["balcony", true, /balkon.{0,8}(?:olsun|istiyorum)|want.{0,8}balcony/i],
  ];
  for (const [field, value, regex] of mappings) {
    const match = regex.exec(input);
    if (!match) continue;
    const following = input.slice(match.index + match[0].length);
    if (field === "listingType" && /^\s+(?:değil|degil)(?=\s|[,!.?]|$)/i.test(following)) continue;
    put(field, value, match[0]);
  }
  const refusePhone = /telefon.{0,25}(?:vermek|paylaşmak).{0,10}istemiyorum|(?:won't|do not want to|don't want to).{0,20}(?:phone|number)/i.test(input);
  const refused: BusinessState["refused"] = refusePhone ? ["phone"] : [];
  if (/bütçe.{0,25}(?:söylemek|paylaşmak).{0,10}istemiyorum|prefer not to share.{0,10}budget/i.test(input)) refused.push("budget");
  if (/eşya.{0,15}fark etmez|furnish.{0,15}(?:doesn't matter|no preference)/i.test(input)) refused.push("furnished");
  if (/[?]|ne kadar|fiyatı|what price|how much/i.test(input) && !/bütçe|budget|under|altında|geçmesin|istiyorum|prefer/i.test(input)) {
    delete updates.budget; delete updates.currency; delete updates.furnished;
  }
  const correction = /önceki|artık|yerine|değil|degil|instead|actually|previous|change/i.test(input);
  // Contradictory values in one message need clarification; don't guess which clause wins.
  for (const field of conflicts) delete updates[field];
  return { updates, conflicts: [...conflicts], refused, correction,
    searching: /ar[iı]yorum|looking for|search|kiral[iı]k|sat[iı]l[iı]k/i.test(input),
    handoff: /(?:insan|danışman|danisman|human|person|agent).{0,25}(?:konuş|görüş|aktar|speak|talk)|(?:speak|talk).{0,15}(?:human|person|agent)/i.test(input),
    injection: /ignore.{0,20}(?:rules|instructions)|sistem talimat|başka kiracı|another tenant|organizationId|run_arbitrary_code/i.test(input),
    topicChange: /hizmet|services|iletişim|contact|politika|policy|çalışma saat|opening hours/i.test(input),
  };
}
export function mergeBusinessState(raw: unknown, turn: ReturnType<typeof extractBusinessTurn>): BusinessState {
  const state = businessStateSchema.safeParse(raw).data ?? emptyBusinessState();
  if (turn.injection || turn.conflicts.length || turn.topicChange) return state;
  const refused = [...new Set([...state.refused, ...turn.refused])];
  const values = { ...state.values, ...turn.updates };
  for (const field of refused) if (field !== "phone") delete values[field];
  return businessStateSchema.parse({ values, refused, asked: state.asked, viewingOffered: state.viewingOffered });
}
// Generic question planner: business adapters own labels and priorities, never shared orchestration.
export function nextQuestions(state: BusinessState, priorities: readonly PreferenceField[], limit = 2) {
  return priorities.filter((field) => !state.values[field] && !state.refused.includes(field) && !state.asked.includes(field))
    .slice(0, Math.max(0, Math.min(2, limit)));
}
const questions: Record<string, [string, string]> = {
  listingType: ["Kiralık mı, satılık mı düşünüyorsunuz?", "Are you looking to rent or buy?"],
  location: ["Özellikle düşündüğünüz bir semt var mı?", "Do you have a preferred neighborhood?"],
  budget: ["Yaklaşık bütçeniz nedir?", "What is your approximate budget?"],
  currency: ["Bütçeniz hangi para biriminde?", "Which currency is your budget in?"],
  furnished: ["Eşyalı veya eşyasız tercihiniz var mı?", "Do you prefer furnished or unfurnished?"],
};
export function realEstateFollowUp(state: BusinessState, locale: "tr" | "en", matches: number) {
  const priorities: PreferenceField[] = !state.values.listingType ? ["listingType", "location"]
    : state.values.budget && !state.values.currency ? ["currency"]
      : ["location", "budget", ...(matches > 0 ? ["furnished" as const] : [])];
  const selected = nextQuestions(state, priorities);
  return { text: selected.map((field) => questions[field]?.[locale === "tr" ? 0 : 1]).filter(Boolean).join(" "),
    state: { ...state, asked: [...new Set([...state.asked, ...selected])] } };
}
export function businessFilters(state: BusinessState) {
  const v = state.values;
  if (!v.listingType || (v.budget && !v.currency)) return null;
  return { listingType: v.listingType.value, availability: "available",
    ...(v.location ? { location: v.location.value } : {}), ...(v.budget ? { budgetMax: v.budget.value } : {}),
    ...(v.currency ? { currency: v.currency.value } : {}), ...(v.rooms ? { exactRooms: v.rooms.value } : {}),
    ...(v.propertyType ? { propertyType: v.propertyType.value } : {}) };
}
const proposals = z.strictObject({ fields: z.array(z.strictObject({
  field: fieldSchema, value: z.union([z.string().max(100), z.number().finite(), z.boolean()]),
  evidence: z.string().min(1).max(160) })).max(9) });
export function validateBusinessProposal(raw: unknown, text: string, requestId: string) {
  const parsed = proposals.safeParse(raw);
  if (!parsed.success) return null;
  const base = extractBusinessTurn(text, requestId);
  if (base.injection || base.conflicts.length) return null;
  const updates: BusinessState["values"] = {};
  for (const item of parsed.data.fields) {
    if (!text.includes(item.evidence)) return null;
    let checked = extractBusinessTurn(item.evidence, requestId).updates[item.field];
    // The model may identify an exact place span in an explicit proximity phrase.
    // It cannot normalize, translate or invent a place the customer did not supply.
    if (!checked && item.field === "location" && item.value === item.evidence &&
        /^[\p{L} ]{2,60}$/u.test(item.evidence) &&
        (text.includes(`near ${item.evidence}`) || text.includes(`${item.evidence} civarı`)))
      checked = { value: item.value, evidence: item.evidence, requestId };
    if (!checked || checked.value !== item.value || (updates[item.field] && updates[item.field]?.value !== item.value)) return null;
    updates[item.field] = checked;
  }
  return { ...base, updates };
}
