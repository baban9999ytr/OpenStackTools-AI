import { z } from "zod";
import { requestedPropertyFacts } from "./property-facts.js";

// Nested anyOf in the provider JSON schema, with disjoint kind values.
const reference = z.union([
  z.strictObject({ kind: z.enum(["position"]), position: z.number().int().min(1).max(10) }),
  z.strictObject({ kind: z.enum(["focused"]), position: z.null() }),
  z.strictObject({ kind: z.enum(["none"]), position: z.null() }),
  z.strictObject({ kind: z.enum(["ambiguous"]), position: z.null() }),
]);
const intent = z.strictObject({
  kind: z.enum(["comparison", "property_fact", "preference", "listing_search", "contact",
    "viewing", "booking", "confirmation_deferral", "handoff", "clarification", "other"]),
  mode: z.enum(["question", "preference", "request", "unclear"]),
  evidence: z.string().min(1).max(160),
  reference,
  attributes: z.array(z.enum(["maintenanceFee", "deposit", "furnished", "transit", "buildingAge", "ownership", "balcony"])).max(7),
  locations: z.array(z.string().min(1).max(60)).max(3),
  rooms: z.array(z.number().int().min(0).max(50)).max(3),
  furnishing: z.boolean().nullable(),
  uncertainty: z.array(z.enum(["which_listing", "missing_time", "ambiguous_criteria", "uncertain_intent"])).max(5),
});
export const intentPlanSchema = z.strictObject({ intents: z.array(intent).min(1).max(5) });
const { $schema: _schema, ...schema } = z.toJSONSchema(intentPlanSchema, {
  override: ({ jsonSchema }) => {
    // Length checks are enforced locally; keep the provider schema within the
    // documented subset for string properties.
    delete jsonSchema.minLength;
    delete jsonSchema.maxLength;
  },
});
export const receptionistIntentFormat = { type: "json_schema", name: "receptionist_intents", strict: true, schema } as const;
export const receptionistIntentInstructions = [
  "Classify the final visitor message only. Earlier turns and the listing snapshot are reference data.",
  "Return a separate intent per independent need, with a verbatim quote from the latest message for each.",
  "A question about furnishing is a property fact. Wanting a furnished property is a preference.",
  "Use displayed position only for explicit ordinal references and focused only for an existing implied reference.",
  "Preserve alternative locations and room counts as individual values. Tentative criteria (e.g. ‘bakabiliriz’) are preferences. Use listing_search only for an explicit request to retrieve listings now; split that request from any independent preference updates.",
  "Use confirmation_deferral in request mode for an explicit request to wait or not finalize. A tentative yes followed by such a request is a deferral, with no transaction authorization.",
  "For a property question identify the attributes requested. The server determines whether facts are known, including verified zero values. Do not guess fact availability.",
  "Mark unresolved references and missing request details.",
  "Do not return any tool, action authorization, customer reply, appointment, price or other factual answer.",
].join("\n");

const namedPositions = [/\b(?:ilk|ilkini|birinci|birincisini|first)\b/iu, /\b(?:ikinci|ikincisini|second)\b/iu,
  /(?:^|\s)(?:üçüncü|third)(?=\s|$)/iu, /\b(?:dördüncü|fourth)\b/iu,
  /\b(?:beşinci|fifth)\b/iu, /(?:^|\s)(?:altıncı|sixth)(?=\s|$)/iu,
  /\b(?:yedinci|seventh)\b/iu, /\b(?:sekizinci|eighth)\b/iu, /\b(?:dokuzuncu|ninth)\b/iu,
  /\b(?:onuncu|tenth)\b/iu];

type IntentPlan = z.infer<typeof intentPlanSchema>;
const wordCharacter = /[\p{L}\p{M}\p{N}_]/u;

function matchEvidence(item: IntentPlan["intents"][number], currentTurn: string) {
  const quote = item.evidence;
  if (!quote.trim()) return null;
  // Only a Turkish yes/no property question may quote a separating comma as
  // a question mark. Its words, spacing, accents, and case must still match.
  const clause = item.kind === "property_fact" && item.mode === "question" &&
    /\s(?:mı|mi|mu|mü)\?$/u.test(quote) && requestedPropertyFacts(quote).length
    ? quote.slice(0, -1) + "," : null;
  let match: { quote: string; span: string; start: number; end: number; kind: "exact" | "clause_separator" } | null = null;
  for (const span of clause ? [quote, clause] : [quote]) {
    for (let start = currentTurn.indexOf(span); start !== -1; start = currentTurn.indexOf(span, start + 1)) {
      const end = start + span.length;
      const before = currentTurn.slice(0, start);
      const after = currentTurn.slice(end);
      if ((wordCharacter.test(span[0]!) && /[\p{L}\p{M}\p{N}_]$/u.test(before)) ||
          (wordCharacter.test(span.at(-1)!) && /^[\p{L}\p{M}\p{N}_]/u.test(after)) ||
          (/\p{N}$/u.test(span) && /^[.,+:]\p{N}/u.test(after)) ||
          (/^\p{N}/u.test(span) && /\p{N}[.,+:]$/u.test(before)) ||
          (/\p{N}[.,+:]$/u.test(span) && /^\p{N}/u.test(after))) continue;
      if (span === clause && !/^\s+\p{L}/u.test(after)) continue;
      if (match) return null;
      match = { quote, span, start, end, kind: span === quote ? "exact" : "clause_separator" };
    }
  }
  return match;
}

export function parseIntentAdvice(text: string, currentTurn: string, displayedCount: number, hasFocus: boolean) {
  if (text.length > 9_000) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const parsed = intentPlanSchema.safeParse(raw);
  if (!parsed.success) return null;
  const deferral = isConfirmationDeferral(currentTurn);
  if (deferral && (parsed.data.intents.length !== 1 || parsed.data.intents[0]?.kind !== "confirmation_deferral")) return null;
  const evidenceMatches = [];
  for (const item of parsed.data.intents) {
    const match = matchEvidence(item, currentTurn);
    if (!match) return null;
    if (item.kind === "listing_search" && item.mode !== "request" && item.mode !== "question") return null;
    if (item.kind === "confirmation_deferral" && (item.mode !== "request" ||
      !deferral || !isConfirmationDeferral(match.span))) return null;
    const { kind, position } = item.reference;
    if (kind === "position" && (position > displayedCount ||
      !(namedPositions[position - 1]?.test(match.span.toLocaleLowerCase("tr")) ||
        new RegExp(`\\b${position}(?:(?:st|nd|rd|th)\\b|\\.(?=\\s|$))`, "i").test(match.span)))) return null;
    if (kind === "focused" && !hasFocus) return null;
    evidenceMatches.push(match);
  }
  return { ...parsed.data, evidenceMatches };
}

// Advice can shape a question. Routing and all data-bearing answers remain in
// the existing server-validated handlers. Never interpolate model text here.
export function intentClarification(plan: IntentPlan | null, text: string, locale: "tr" | "en") {
  const tr = locale === "tr";
  if (plan?.intents.some((item) => item.kind === "property_fact" && item.mode === "question" &&
    item.uncertainty.includes("which_listing")) && requestedPropertyFacts(text).length)
    return tr ? "Hangi ilanı kastettiğinizi söyler misiniz?" : "Which listing do you mean?";
  return tr ? "Tam olarak neyi öğrenmek veya yapmak istediğinizi netleştirir misiniz?"
    : "Could you clarify what you'd like to know or do?";
}

// Deliberately matches a complete, simple request. Compound or open-ended
// comparisons are left to the ordinary routing and validation.
export const standaloneListingComparison = (text: string) =>
  /^(?:iki ilanı karşılaştır(?:[,;]\s*hangisini önerirsin)?|iki ilanı karşılaştırır mısın|compare (?:the |these )?two listings)[.!?]?$/iu.test(text.trim().toLocaleLowerCase("tr"));


// Standalone explicit deferrals only. These never enter the confirmation path.
export const isConfirmationDeferral = (text: string) =>
  /^(?:(?:olur gibi|olabilir|evet|tamam)[, ]+(?:ama|fakat)\s+)?(?:şimdilik\s+)?(?:randevuyu\s+)?(?:kesinleştirmeyelim|onaylamayalım)[.!?]?$/u.test(text.trim().toLocaleLowerCase("tr")) ||
  /^(?:please\s+)?(?:don['’]t|do not|let['’]s not)\s+(?:confirm|finalize)(?:\s+(?:it|the appointment))?(?:\s+yet)?[.!?]?$/i.test(text.trim());

// Narrow fast path for a standalone pair of place and room alternatives.
// Other utterances continue through the ordinary business and booking routes.
export const isTentativeAlternativePreference = (text: string) =>
  /^[\p{L}-]+\s+(?:ya da|veya)\s+[\p{L}-]+(?:\s+(?:de|da))?\s+olur,\s*\d{1,2}\s*\+\s*1\s+(?:ya da|veya)\s+\d{1,2}\s*\+\s*1\s+bakabiliriz[.!]?$/iu.test(text.trim());
