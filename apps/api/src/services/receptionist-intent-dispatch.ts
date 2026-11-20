import { Types } from "mongoose";
import { actionReply, stageAction, type ActionContext } from "./agent-actions.js";
import { requestedAppointmentDates, requestedAppointmentWindow, requestedClockMinute, staffCanShowProperty } from "./appointment-language.js";
import { localAppointmentLabel } from "./appointment-presentation.js";
import { retrieveKnowledge, requestedContactFields, searchListings } from "./business-data.js";
import { businessFilters, mergeBusinessState, type extractBusinessTurn } from "./business-conversation.js";
import { displayedListingIds, formatListingReply, listingFollowUpIntent, type VerifiedListing } from "./customer-listings.js";
import { flexibleDatePlan, findFlexibleSlots } from "./flexible-scheduling.js";
import { asksForWeekendViewing, propertyFactReply, requestedPropertyFacts } from "./property-facts.js";
import { intentClarification, type parseIntentAdvice } from "./receptionist-intent.js";

type Listing = VerifiedListing & { _id: Types.ObjectId; facts?: unknown };
type Plan = Pick<NonNullable<ReturnType<typeof parseIntentAdvice>>, "intents">;
type Input = {
  text: string; context: ActionContext & { locale: "en" | "tr" }; requestId: string;
  displayed: Array<Listing | undefined>; focused?: Listing; resolved?: Listing;
  business: unknown; turn: ReturnType<typeof extractBusinessTurn>;
  activeWorkflow: boolean; viewingRequested: boolean;
  staff: Array<{ id: string; services?: string[] }>; zone: string; at: Date; duration: number;
};

export const standalonePropertyQuestion = (text: string) =>
  /^(?:(?:(?:ilk|birinci|ikinci) (?:ilanın|dairenin|evin) )?(?:aidatı? (?:ve depozitosu )?(?:belli mi|ne kadar)|depozitosu? (?:ve aidatı )?(?:belli mi|ne kadar))|eşyalı mı)[.!?]?$/u
    .test(text.trim().toLocaleLowerCase("tr"));
export const standaloneContactQuestion = (text: string) =>
  /^(?:e-posta adresiniz nedir|telefon numaranız nedir|what is your (?:email address|phone number))[.!?]?$/iu.test(text.trim().toLocaleLowerCase("tr"));

export async function scopedContactReply(context: Input["context"], text: string) {
  const only = /(?:yalnızca|sadece|\bonly|\bjust)\s+([^,.?!]+)/iu.exec(text);
  const narrowed = only ? requestedContactFields(only[1]!) : [];
  const fields = narrowed.length === 1 ? narrowed : requestedContactFields(text);
  if (!fields.length) return "";
  const result = await retrieveKnowledge(context.organizationId, fields.join(" "));
  return actionReply({ name: "get_business_knowledge", status: "completed", result, locale: context.locale }, { query: text });
}

export async function dispatchReceptionistIntent(plan: Plan, input: Input) {
  const { context, text, turn, displayed } = input;
  const tr = context.locale === "tr";
  const output = new Set<string>();
  const propertyQuestion = tr ? "Hangi ilanı kastettiğinizi söyler misiniz?" : "Which listing do you mean?";
  const clarify = tr ? "Hangi bilgiyi veya işlemi istediğinizi netleştirir misiniz?" : "Could you clarify what you need?";
  const supported = tr ? "İlanları karşılaştırabilir, doğrulanmış bilgileri ve gösterim saatlerini kontrol edebilir veya sizi ekibe aktarabilirim."
    : "I can compare listings, check verified details or viewing times, or connect you with the team.";
  let workflowPatch: { business?: ReturnType<typeof mergeBusinessState>; selectedListingId?: Types.ObjectId;
    propertyFocusId?: Types.ObjectId | null; displayedListingIds?: Types.ObjectId[];
    pendingQuestion?: "preferred_time"; offeredSlots?: Awaited<ReturnType<typeof findFlexibleSlots>>["options"];
    preferredDate?: null; preferredMinute?: null; proposedStartAt?: null; staffId?: null; durationMinutes?: null } = {};
  let actionId: Types.ObjectId | undefined;
  if (turn.injection) return { text: supported, workflowPatch, actionId, retrieval: false };

  const resolve = (ref: Plan["intents"][number]["reference"]) => {
    if (ref.kind === "ambiguous") return undefined;
    const candidate = ref.kind === "position" ? displayed[ref.position - 1] : ref.kind === "focused" ? input.focused : input.resolved;
    return input.resolved && candidate && String(input.resolved._id) !== String(candidate._id) ? undefined : candidate;
  };
  // Do not apply model-supplied preference values. Reuse only server extraction
  // of the latest utterance, and leave compound state writes to a follow-up.
  const kinds = new Set(plan.intents.map((item) => item.kind));
  const factGroups = new Map<Listing | undefined, Set<string>>();
  const mentionedFacts = /\?|ne kadar|nedir|öğren|bilgi verir|tell me|what|how much/i.test(text)
    ? requestedPropertyFacts(text) : [];
  const comparisonRequested = (evidence: string) => listingFollowUpIntent(evidence, true) === "recommend" || /kıyasla|hangisi.*(?:ucuz|pahalı)/iu.test(evidence);
  const addFacts = (listing: Listing | undefined, fields: string[]) => {
    const values = factGroups.get(listing) ?? new Set<string>();
    fields.forEach((field) => values.add(field));
    factGroups.set(listing, values);
  };
  for (const item of plan.intents.filter(({ kind, mode }) => kind === "property_fact" && mode === "question")) {
    const fields = requestedPropertyFacts(item.evidence).filter(([key]) => item.attributes.some((attr) => attr === key)).map(([key]) => key);
    if (fields.length) addFacts(resolve(item.reference), fields);
    else if (!item.attributes.includes("balcony")) output.add(tr
      ? "İstediğiniz özelliği kayıtlı ilan bilgilerinden doğrulayamıyorum."
      : "I can’t verify that feature from the listing records.");
    if (item.attributes.includes("balcony") && /balkon|balcon/i.test(item.evidence)) output.add(tr
      ? "Balkon bilgisi doğrulanmamış." : "Balcony information is unverified.");
  }
  const supplied = new Set([...factGroups.values()].flatMap((fields) => [...fields]));
  const missing = mentionedFacts.filter(([key]) => !supplied.has(key));
  if (missing.length) addFacts(factGroups.size > 1 ? undefined : input.resolved, missing.map(([key]) => key));
  for (const [listing, fields] of factGroups) {
    const result = propertyFactReply(listing, mentionedFacts.filter(([key]) => fields.has(key)), context.locale);
    if (result) output.add(result);
    if (!listing && [...fields].some((key) => key !== "ownership")) output.add(propertyQuestion);
    if (listing && factGroups.size === 1 && !input.activeWorkflow) workflowPatch.propertyFocusId = listing._id;
  }

  // A positive field match must come from the current utterance. The contact
  // helper receives a fixed field list and cannot fall back to a business profile.
  if (requestedContactFields(text).length && !turn.refused.includes("phone")) output.add(await scopedContactReply(context, text));
  else if (kinds.has("contact")) output.add(tr ? "Hangi iletişim bilgisini istersiniz?" : "Which contact detail do you need?");

  if (kinds.has("comparison") || comparisonRequested(text)) {
    const first = displayed[0], second = displayed[1];
    const comparison = plan.intents.find((item) => item.kind === "comparison");
    if (!first || !second || displayed.length !== 2 ||
        comparison && (comparison.reference.kind !== "none" || !comparisonRequested(comparison.evidence))) output.add(tr
      ? "Karşılaştırmak istediğiniz iki güncel ilanı belirtir misiniz?" : "Which two current listings would you like to compare?");
    else if (first.currency !== second.currency || !first.listingType || first.listingType !== second.listingType) output.add(tr
      ? "Fiyatları doğrudan karşılaştırmak için aynı para birimi ve işlem türü gerekiyor."
      : "A direct price comparison requires the same currency and transaction type.");
    else output.add(formatListingReply([first, second], { locale: context.locale, reused: true,
      query: tr ? "İki ilanı karşılaştır, hangisini önerirsin?" : "Compare the two listings. Which do you recommend?" }));
  }

  if (input.viewingRequested && !/istemiyorum|vazgeçtim|don.t want|no longer/i.test(text)) {
    const viewing = plan.intents.find((item) => item.kind === "viewing");
    const listing = viewing ? resolve(viewing.reference) : input.resolved;
    if (!listing) output.add(propertyQuestion);
    else if (input.activeWorkflow) output.add(tr
      ? "Mevcut gösterim adımına devam etmek mi, başka bir zaman aramak mı istersiniz?"
      : "Would you like to continue the current viewing request or look for another time?");
    else {
      const dates = requestedAppointmentDates(text, input.zone, input.at);
      const window = requestedAppointmentWindow(text, input.zone, input.at);
      const minute = requestedClockMinute(text);
      const period = asksForWeekendViewing(text) ? flexibleDatePlan(text, input.zone, input.at) : null;
      const availability = period ?? (dates.length ? { dates, startMinute: window.startMinute ?? 0,
        endMinute: window.endMinute ?? 1440, needsClarification: false } : null);
      if (!availability || availability.needsClarification || !availability.dates.length) output.add(tr
        ? "Bu ilanı hangi gün ve saat görmek istersiniz?" : "What day and time would you like to view this listing?");
      else {
        if (minute !== undefined) {
          availability.startMinute = Math.max(availability.startMinute, minute);
          availability.endMinute = Math.min(availability.endMinute, minute + input.duration);
        }
        const eligible = input.staff.filter((person) => staffCanShowProperty(person.services ?? [])).slice(0, 2);
        const { options, reasons } = await findFlexibleSlots(context.organizationId, eligible.map(({ id }) => new Types.ObjectId(id)),
          availability, input.duration, input.at);
        const times = options.map((slot) => localAppointmentLabel(slot.startAt, input.zone, context.locale));
        output.add(times.length ? tr ? `${listing.title} için gösterim saatleri: ${times.join(" veya ")}. Hangisi size uyar?`
          : `Viewing times for ${listing.title}: ${times.join(" or ")}. Which works for you?`
          : !eligible.length || reasons.includes("missing_schedule")
            ? tr ? "Gösterim için bir danışman takvimini doğrulayamıyorum." : "I can’t verify a viewing consultant’s schedule."
            : tr ? "Bu aralıkta doğrulanmış bir gösterim saati bulamadım." : "I found no verified viewing time in that window.");
        if (options.length) workflowPatch = { ...workflowPatch, selectedListingId: listing._id,
          propertyFocusId: listing._id, pendingQuestion: "preferred_time", offeredSlots: options,
          preferredDate: null, preferredMinute: null, proposedStartAt: null, staffId: null, durationMinutes: null };
      }
    }
  } else if (kinds.has("viewing")) output.add(tr ? "Gösterim zamanı mı arıyorsunuz?" : "Are you looking for a viewing time?");

  if (kinds.has("preference")) {
    const explicit = Object.keys(turn.alternatives).length || Object.keys(turn.updates).some((key) => key !== "name");
    if (kinds.size === 1 && !output.size && explicit && !turn.conflicts.length && !turn.topicChange && !input.activeWorkflow &&
        plan.intents.every((item) => item.mode === "preference")) {
      workflowPatch.business = mergeBusinessState(input.business, turn);
      output.add(tr ? "Tercihlerinizi not aldım. İsterseniz ilanlara bakabiliriz." : "I noted your preferences. I can look for listings if you’d like.");
    } else output.add(tr ? "Hangi tercihi güncellemek istediğinizi belirtir misiniz?" : "Which preference would you like to update?");
  }
  if (kinds.has("listing_search")) {
    const filters = turn.searching && !turn.conflicts.length && businessFilters(mergeBusinessState(input.business, turn));
    if (filters && !input.activeWorkflow && kinds.size === 1 && !output.size) {
      const rows = await searchListings(context.organizationId, filters);
      const reply = formatListingReply(rows, { locale: context.locale });
      output.add(reply);
      workflowPatch.displayedListingIds = displayedListingIds(reply, rows).map((id) => new Types.ObjectId(id));
      workflowPatch.propertyFocusId = null;
    } else output.add(tr ? "Yeni bir ilan araması yapmamı ister misiniz?" : "Would you like me to run a new listing search?");
  }
  if (kinds.has("handoff") && turn.handoff) {
    const action = await stageAction(context, { name: "handoff_to_human", arguments: { reason: "Customer requested human assistance" } },
      `intent:${input.requestId}:handoff`);
    actionId = action._id;
  }
  if (kinds.has("booking")) output.add(tr ? "Randevu için mevcut adımları ve açık onayınızı kullanmamız gerekiyor."
    : "Bookings use the existing steps and require your explicit confirmation.");
  if (![...output].some(Boolean)) output.add(kinds.size ? clarify : intentClarification(null, text, context.locale));
  return { text: [...output].filter(Boolean).join(" "), workflowPatch, actionId, retrieval: factGroups.size > 0 ||
    requestedContactFields(text).length > 0 || kinds.has("comparison") || Boolean(workflowPatch.displayedListingIds) };
}
