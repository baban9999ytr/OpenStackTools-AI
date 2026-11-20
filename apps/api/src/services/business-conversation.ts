import { z } from "zod";
import { statedListingLimit } from "./listing-money.js";

const fields = ["name", "location", "budget", "currency", "rooms", "propertyType", "listingType", "furnished", "balcony"] as const;
const fieldSchema = z.enum(fields);
export type PreferenceField = typeof fields[number];
const evidenceSchema = z.strictObject({ value: z.union([z.string().max(100), z.number().finite(), z.boolean()]),
  evidence: z.string().min(1).max(160), requestId: z.string().regex(/^[a-f\d]{24}$/i) });
export const businessStateSchema = z.strictObject({
  alternatives: z.strictObject({
    location: z.array(z.string().trim().min(2).max(60)).min(2).max(3).optional(),
    rooms: z.array(z.number().int().min(0).max(50)).min(2).max(3).optional(),
  }).default({}),
  budgetUnknown: z.boolean().default(false),
  budgetExclusive: z.boolean().optional(),
  viewingOffered: z.boolean().default(false),
  values: z.partialRecord(fieldSchema, evidenceSchema), asked: z.array(fieldSchema).max(9),
  refused: z.array(z.enum([...fields, "phone"])).max(10),
});
export type BusinessState = z.infer<typeof businessStateSchema>;
export const emptyBusinessState = (): BusinessState => ({ values: {}, alternatives: {}, budgetUnknown: false, asked: [], refused: [], viewingOffered: false });
export function extractBusinessTurn(text: string, requestId: string, prior?: unknown) {
  const input = text.slice(0, 4000);
  const updates: BusinessState["values"] = {};
  const alternatives: BusinessState["alternatives"] = {};
  const clearLocation = /(?:konum|semt|mahalle).{0,12}fark etmez|(?:any|no preferred) (?:location|neighbou?rhood)/i.test(input);
  let clearRooms = /oda sayısı.{0,12}fark etmez|any (?:room count|layout)/i.test(input);
  const budgetUnknown = /bütçem? (?:henüz )?belli değil|budget (?:is )?(?:unknown|not set|undecided)/i.test(input);
  const conflicts = new Set<PreferenceField>();
  const put = (field: PreferenceField, value: string | number | boolean, evidence: string) => {
    if (updates[field] && updates[field]?.value !== value) conflicts.add(field);
    updates[field] = { value, evidence: evidence.slice(0, 160), requestId };
  };
  const pending = businessStateSchema.safeParse(prior).data;
  const lastQuestion = pending?.asked.filter((field) => !pending.values[field] && !pending.refused.includes(field) && !(field === "location" && pending.alternatives.location)).at(-1);
  if (lastQuestion === "location" && /^[\p{L} ]{2,60}$/u.test(input.trim()) &&
      !/istemiyorum|hayır|bilmiyorum|no|help|yardım|merhaba|hello/i.test(input))
    put("location", input.trim(), input);
  if (lastQuestion === "budget" && /^\d{1,9}$/.test(input.trim())) put("budget", Number(input), input);
  const name = /(?:^|[.,!]\s*)(?:ben|adım|adim|my name is|i am)\s+([\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){0,2})(?=[.,!]|$)/iu.exec(input);
  if (name && !/değil|degil|not|adına/i.test(name[0])) put("name", name[1]!, name[0]);
  for (const m of input.matchAll(/\b(\d{1,2})\s*\+\s*1\b/g)) if (Number(m[1]) <= 50) put("rooms", Number(m[1]), m[0]);
  const limits = statedListingLimit(input);
  const limit = limits[0];
  // Preserve offsets and split tokens at money spans before extracting a place.
  // Blanking with whitespace would still let a two-word place span the budget.
  const locationText = input.split("");
  const maskMoney = (start: number, length: number) => locationText.fill(",", start, start + length);
  for (const bound of limits) {
    maskMoney(bound.start, bound.evidence.length);
    put("budget", bound.value, bound.evidence);
  }
  if (limit?.currency) put("currency", limit.currency, limit.evidence);
  for (const m of input.matchAll(/\b(\d{1,3}(?:[.,]\d{3})+|\d{1,9})\s*(bin(?:e|in)?\b|k\b|TL\b|TRY\b|USD\b|EUR\b|GBP\b|lira\b|dolar\b|euro\b)/giu)) {
    maskMoney(m.index, m[0].length);
    if (limit) continue;
    const amount = Number(m[1]!.replace(/[.,]/g, "")) * (/^(bin|k)/i.test(m[2]!) ? 1000 : 1);
    if (amount <= 1e9) put("budget", amount, m[0]);
  }
  for (const m of input.matchAll(/\b(TL|TRY|lira|USD|dolar|EUR|euro|GBP)\b/gi)) {
    maskMoney(m.index, m[0].length);
    put("currency", /^(TL|TRY|lira)$/i.test(m[1]!) ? "TRY" : /^(USD|dolar)$/i.test(m[1]!) ? "USD" : /^(EUR|euro)$/i.test(m[1]!) ? "EUR" : "GBP", m[0]);
  }
  const placeInput = locationText.join("");
  for (const m of placeInput.matchAll(/(?<![\p{L}\p{N}])((?:[\p{L}]+|\d{1,2})(?:[ \t]+[\p{L}]+)?)[’'](?:de|da|te|ta)(?!\p{L})/giu)) {
    if (/^\d+$/.test(m[1]!)) continue;
    put("location", m[1]!.replace(/^(?:ben|in)\s+/i, ""), input.slice(m.index, m.index + m[0].length));
  }
  const location = /(?:location|konum|semt|mahalle)\s*:\s*([\p{L}\p{N} ]{2,60})(?=[,.!?]|$)/iu.exec(placeInput);
  if (location) put("location", location[1]!.trim(), input.slice(location.index, location.index + location[0].length));
  const mappings: Array<[PreferenceField, string | boolean, RegExp]> = [
    ["propertyType", "apartment", /\bdaire\b|\bapartment\b/i], ["propertyType", "house", /\bmüstakil\b|\bhouse\b/i],
    ["propertyType", "land", /\barsa\b|\bland\b/i], ["propertyType", "commercial", /\bdükkan\b|\bcommercial\b/i],
    ["listingType", "rent", /kiral[iı]k|\brent(?:al)?\b/i], ["listingType", "sale", /sat[iı]l[iı]k|\bbuy\b|\bfor sale\b/i],
    ["furnished", false, /eşyasız|esyasiz|mobilyasız|mobilyasiz|unfurnished/i], ["furnished", true, /eşyalı|esyali|(?<!un)\bfurnished\b/i],
    ["balcony", true, /balkon.{0,8}(?:olsun|istiyorum)|want.{0,8}balcony/i],
  ];
  for (const [field, value, regex] of mappings) {
    const match = regex.exec(input);
    if (!match) continue;
    const following = input.slice(match.index + match[0].length);
    if (field === "listingType" && /^\s+(?:değil|degil)(?=\s|[,!.?]|$)/i.test(following)) continue;
    if (field === "furnished" && value === true && /^\s+diye düşünmüştüm[,.;]/i.test(following) && /mobilyasız|eşyasız/i.test(following)) continue;
    put(field, value, match[0]);
  }
  const refusePhone = /telefon.{0,25}(?:vermek|paylaşmak).{0,10}istemiyorum|(?:won't|do not want to|don't want to).{0,20}(?:phone|number)/i.test(input);
  const refused: BusinessState["refused"] = refusePhone ? ["phone"] : [];
  if (/bütçe.{0,25}(?:söylemek|paylaşmak).{0,10}istemiyorum|prefer not to share.{0,10}budget/i.test(input)) refused.push("budget");
  if (/eşya.{0,25}(?:fark etmez|şart değil|zorunlu değil)|furnish.{0,25}(?:doesn't matter|no preference|not required)/i.test(input)) {
    refused.push("furnished");
    delete updates.furnished;
    conflicts.delete("furnished");
  }
  if (/[?]|ne kadar|fiyatı|what price|how much/i.test(input) && !limit && !/bütçe|budget|under|altında|geçmesin|istiyorum|prefer/i.test(input)) {
    delete updates.budget; delete updates.currency; delete updates.furnished;
  }
  const layouts = [...input.matchAll(/\b(\d{1,2})\s*\+\s*1\b/g)];
  const alternativesLinked = layouts.length >= 2 && layouts.length <= 3 && layouts.slice(1).every((current, i) => {
    const previous = layouts[i]!;
    return /^\s*(?:ya da|veya|or|\/|,)\s*$/i.test(input.slice(previous.index + previous[0].length, current.index));
  });
  const roomWords = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı"];
  const roomOptions = /(?:^|\s)(bir|iki|üç|dört|beş|altı|\d{1,2})\s+(?:ya da|veya)\s+(bir|iki|üç|dört|beş|altı|\d{1,2})\s+odal[ıi]/i.exec(input);
  const roomValues = [...new Set((alternativesLinked ? layouts.map((layout) => layout[1]!) : roomOptions?.slice(1))?.map((value) =>
    /^\d+$/.test(value) ? Number(value) : roomWords.indexOf(value.toLocaleLowerCase("tr"))))];
  if (roomValues.length > 1 && roomValues.every((value) => value >= 0 && value <= 50)) {
    alternatives.rooms = roomValues;
    conflicts.delete("rooms");
    delete updates.rooms;
  }
  const places = /(?:^|[,.!?;]\s*)([\p{Lu}][\p{L}-]{1,59})\s+(?:de|da|veya|ya da)\s+([\p{Lu}][\p{L}-]{1,59})(?:\s+(?:de|da))?\s+olur(?=[,.!?;]|$)/u.exec(input);
  const acceptedPlaces = [...input.matchAll(/(?:^|[,.!?;]\s*)((?:[\p{Lu}\d][\p{L}\p{N}-]*)(?: +[\p{Lu}\p{N}][\p{L}\p{N}-]*){0,3})\s+(?:de|da)\s+olur(?=[,.!?;]|$)/gu)];
  const accepted = [...new Set(acceptedPlaces.map((match) => match[1]!))];
  if (accepted.length >= 2 && accepted.length <= 3) alternatives.location = accepted;
  if (places && places[1]!.toLocaleLowerCase("tr") !== places[2]!.toLocaleLowerCase("tr")) {
    alternatives.location = [places[1]!, places[2]!];
    conflicts.delete("location");
    delete updates.location;
  }
  const labeledPlaces = /(?:locations?|konum|semt|mahalle)\s*:\s*([\p{L} '-]{2,60}?)\s+(?:or|veya|ya da)\s+([\p{L} '-]{2,60})(?=[,.!?;]|$)/iu.exec(input);
  if (labeledPlaces && !places) {
    const [first, second] = labeledPlaces.slice(1).map((place) => place.trim());
    if (first && second && first.toLocaleLowerCase("tr") !== second.toLocaleLowerCase("tr")) {
      alternatives.location = [first, second];
      delete updates.location;
      conflicts.delete("location");
    }
  }
  const dropLocation = /(?:^|[.!?]\s*)(?:drop|remove|çıkar|cikar)\s+([\p{L} '-]{2,60})(?=[,.!?;]|$)/iu.exec(input);
  if (dropLocation && pending?.alternatives.location && !alternatives.location) {
    const remaining = pending.alternatives.location.filter((place) =>
      place.toLocaleLowerCase("tr") !== dropLocation[1]!.trim().toLocaleLowerCase("tr"));
    if (remaining.length < pending.alternatives.location.length) {
      if (remaining.length === 1) put("location", remaining[0]!, dropLocation[0]);
      else alternatives.location = remaining;
    }
  }
  const dropRoom = /^(\d{1,2})\s*\+\s*1\s+(?:olmasın|olmasin)\s*[.!]?$/i.exec(input.trim());
  if (dropRoom) {
    delete updates.rooms;
    const removed = Number(dropRoom[1]);
    const remaining = pending?.alternatives.rooms?.filter((layout) => layout !== removed);
    if (remaining && remaining.length !== pending?.alternatives.rooms?.length) {
      if (remaining.length === 1) put("rooms", remaining[0]!, dropRoom[0]);
      else alternatives.rooms = remaining;
    } else if (pending?.values.rooms?.value === removed) clearRooms = true;
  }
  // A broad preference withdrawal takes priority over a nearby extracted value.
  if (clearLocation) { delete updates.location; delete alternatives.location; }
  if (clearRooms) { delete updates.rooms; delete alternatives.rooms; }
  const correction = /önceki|artık|yerine|değil|degil|instead|actually|previous|change/i.test(input);
  // Contradictory values in one message need clarification; don't guess which clause wins.
  for (const field of conflicts) delete updates[field];
  const withdrawBudget = !updates.budget &&
    (budgetUnknown || /bütçe(?:mi|yi)?(?:\s+[^,.!? ]+){0,2}\s+(?:unut|boş ver)|(?:forget|drop|remove).{0,32}(?:budget|price limit)/i.test(input));
  return { updates, alternatives, clearLocation, clearRooms, budgetUnknown, withdrawBudget, budgetExclusive: limit?.exclusive, conflicts: [...conflicts], refused, correction,
    searching: /ar[iı]yorum|looking for|search|kiral[iı]k|sat[iı]l[iı]k/i.test(input),
    handoff: /(?:insan|danışman|danisman|human|person|agent).{0,25}(?:konuş|görüş|aktar|speak|talk)|(?:speak|talk).{0,15}(?:human|person|agent)/i.test(input),
    injection: /ignore.{0,20}(?:rules|instructions)|sistem talimat|başka kiracı|another tenant|organizationId|run_arbitrary_code/i.test(input),
    topicChange: /hizmet|services|iletişim|contact|politika|policy|çalışma saat|opening hours/i.test(input),
  };
}
export function mergeBusinessState(raw: unknown, turn: ReturnType<typeof extractBusinessTurn>): BusinessState {
  const state = businessStateSchema.safeParse(raw).data ?? emptyBusinessState();
  if (turn.injection || turn.conflicts.length || turn.topicChange) return state;
  const refused = [...new Set([...state.refused.filter((field) => field === "phone" || !turn.updates[field]), ...turn.refused])];
  const values = { ...state.values, ...turn.updates };
  const alternatives = { ...state.alternatives };
  for (const [field, clear] of [["location", turn.clearLocation], ["rooms", turn.clearRooms]] as const) {
    if (values[field] && (turn.alternatives[field] || clear)) delete values[field];
    if (turn.updates[field] || clear) delete alternatives[field];
  }
  Object.assign(alternatives, turn.alternatives);
  if (turn.updates.location && turn.alternatives.location) values.location = turn.updates.location;
  for (const field of refused) if (field !== "phone") delete values[field];
  if (turn.withdrawBudget) {
    delete values.budget;
    delete values.currency;
  }
  const asked = turn.withdrawBudget && state.values.budget
    ? state.asked.filter((field) => field !== "budget" && field !== "currency") : state.asked;
  const budgetExclusive = values.budget && (turn.updates.budget ? turn.budgetExclusive : state.budgetExclusive);
  return businessStateSchema.parse({ values, alternatives, ...(budgetExclusive ? { budgetExclusive } : {}), budgetUnknown: !values.budget && (turn.budgetUnknown || state.budgetUnknown), refused, asked, viewingOffered: state.viewingOffered });
}
// Generic question planner: business adapters own labels and priorities, never shared orchestration.
export function nextQuestions(state: BusinessState, priorities: readonly PreferenceField[], limit = 2) {
  return priorities.filter((field) => !state.values[field] && !(field === "location" && state.alternatives.location) && !(field === "budget" && state.budgetUnknown) && !state.refused.includes(field) && !state.asked.includes(field))
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
    ...(state.alternatives.location ? { locations: state.alternatives.location } : {}), ...(v.location ? { location: v.location.value } : {}),
    ...(v.budget ? { budgetMax: v.budget.value, ...(state.budgetExclusive ? { budgetExclusive: true } : {}) } : {}),
    ...(v.currency ? { currency: v.currency.value } : {}), ...(state.alternatives.rooms ? { roomLayouts: state.alternatives.rooms } : v.rooms ? { exactRooms: v.rooms.value } : {}),
    ...(v.propertyType ? { propertyType: v.propertyType.value } : {}) };
}
const proposals = z.strictObject({ fields: z.array(z.strictObject({
  field: fieldSchema, value: z.union([z.string().max(100), z.number().finite(), z.boolean()]),
  evidence: z.string().min(1).max(160) })).max(9) });
export function validateBusinessProposal(raw: unknown, text: string, requestId: string) {
  const parsed = proposals.safeParse(raw);
  if (!parsed.success) return null;
  const base = extractBusinessTurn(text, requestId);
  if (base.injection || (base.withdrawBudget && !base.budgetUnknown) || base.conflicts.length) return null;
  const updates: BusinessState["values"] = { ...base.updates };
  for (const item of parsed.data.fields) {
    if (!text.includes(item.evidence)) return null;
    let checked = extractBusinessTurn(item.evidence, requestId).updates[item.field];
    // The model may identify an exact place span in an explicit proximity phrase.
    // It cannot normalize, translate or invent a place the customer did not supply.
    if (!checked && item.field === "location" && item.value === item.evidence &&
        /^[\p{L} ]{2,60}$/u.test(item.evidence) &&
        (text.includes(`near ${item.evidence}`) || text.includes(`${item.evidence} civarı`)))
      checked = { value: item.value, evidence: item.evidence, requestId };
    if (item.field === "location" || item.field === "rooms") {
      const options = extractBusinessTurn(item.evidence, requestId).alternatives[item.field];
      if (options?.some((option) => option === item.value) && base.alternatives[item.field]?.some((option) => option === item.value)) continue;
    }
    if (!checked || checked.value !== item.value || (updates[item.field] && updates[item.field]?.value !== item.value)) return null;
    updates[item.field] = checked;
  }
  return { ...base, updates };
}
