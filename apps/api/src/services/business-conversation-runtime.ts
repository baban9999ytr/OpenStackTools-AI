import { displayedListingIds, type VerifiedListing } from "./customer-listings.js";
import { Types } from "mongoose";
import { stageAction, actionReply } from "./agent-actions.js";
import { businessStateSchema, businessFilters, mergeBusinessState, realEstateFollowUp, type extractBusinessTurn, type BusinessState } from "./business-conversation.js";

export async function composeBusinessTurn(context: { organizationId: Types.ObjectId; assistantId: Types.ObjectId;
  conversationId: Types.ObjectId; visitorId: string; locale: "en" | "tr" }, requestId: string,
  turn: ReturnType<typeof extractBusinessTurn>, prior: unknown, activeBooking: boolean) {
  let state = mergeBusinessState(prior, turn);
  const tr = context.locale === "tr";
  if (turn.injection) return { state, text: tr ? "Yalnızca bu işletmenin doğrulanmış bilgileriyle yardımcı olabilirim."
    : "I can help only with this business's verified information." };
  if (turn.conflicts.length) return { state, text: tr ? "Birbiriyle çelişen tercihler görüyorum. Hangi seçeneği kullanmamı istersiniz?"
    : "I see conflicting preferences. Which option should I use?" };
  if (turn.handoff) {
    const action = await stageAction(context, { name: "handoff_to_human", arguments: { reason: "Customer requested human assistance" } }, `business:${requestId}:handoff`);
    return { state, text: actionReply(action), actionId: action._id };
  }
  if (turn.refused.includes("phone")) return { state, text: tr
    ? "Telefon numaranızı paylaşmanız gerekmiyor. Buradan devam edebiliriz."
    : "You do not need to share your phone number. We can continue here." };
  const previous = businessStateSchema.safeParse(prior).data;
  const searchChange = turn.clearLocation || turn.clearRooms || Object.keys(turn.alternatives).length > 0 || Object.entries(turn.updates).some(([field, entry]) => field !== "name" &&
    previous?.values[field as keyof BusinessState["values"]]?.value !== entry?.value);
  if (turn.withdrawBudget && !searchChange && !turn.topicChange) {
    if (!previous?.values.budget || state.refused.includes("budget"))
      return { state, text: tr ? "Aramaya bir bütçe sınırı olmadan devam edebiliriz." : "We can continue without a budget limit." };
    const follow = realEstateFollowUp(state, context.locale, 0);
    return { state: follow.state, text: (tr ? "Önceki bütçe sınırını kaldırdım." : "I removed the previous budget limit.") +
      (follow.text ? ` ${follow.text}` : "") };
  }
  if (turn.topicChange || (activeBooking && !searchChange && !turn.searching)) return { state };
  if (!turn.searching && !searchChange && !turn.refused.length) return { state };
  const filters = businessFilters(state);
  let answer = "";
  let actionId: Types.ObjectId | undefined;
  let matches = 0;
  let displayed: Types.ObjectId[] | undefined;
  if (filters) {
    const action = await stageAction(context, { name: "search_listings", arguments: filters }, `business:${requestId}:search`);
    const listings = (action.result as { listings?: VerifiedListing[] })?.listings ?? [];
    matches = listings.length;
    actionId = action._id;
    answer = actionReply(action, { responseLength: "short" });
    if (listings.length) displayed = displayedListingIds(answer, listings).map((id) => new Types.ObjectId(id));
    // Preferences aren't facts: the schema cannot certify these attributes.
    if (state.values.furnished || state.values.balcony) answer += tr
      ? ` ${state.values.furnished?.value === false ? "Eşyasız tercihinizi" : state.values.furnished ? "Eşyalı tercihinizi" : "Balkon tercihinizi"} not aldım. Bu özellikleri kayıtlardan teyit edemiyorum.`
      : "I've noted your furnishing and balcony preferences; these attributes are not verified, so I cannot confirm a complete match.";
  }
  const follow = realEstateFollowUp(state, context.locale, matches);
  if (turn.budgetUnknown && !state.values.listingType && Object.keys(turn.alternatives).length)
    return { state: follow.state, text: tr
      ? `Her iki semti ve oda seçeneğini not aldım. Şimdilik bütçe sınırı koymayalım. ${follow.text}`
      : `I noted both locations and room options. We can leave the budget open for now. ${follow.text}` };
  state = follow.state as BusinessState;
  const acknowledgement = turn.correction ? tr ? "Tercihinizi güncelledim. " : "I've updated your preference. " : "";
  const fallback = tr ? "Tercihlerinizi not aldım. İsterseniz bir ekip üyesinden yardım isteyebilirsiniz."
    : "I've noted your preferences. You can ask for a team member if you wish.";
  return { state, actionId, displayedListingIds: displayed, text: acknowledgement + [answer, follow.text].filter(Boolean).join(" ") || fallback };
}

export function viewingFollowUp(text: string, state: BusinessState, locale: "en" | "tr", hasVerifiedListing: boolean) {
  if (!hasVerifiedListing || state.viewingOffered || /istemiyorum|not interested|don't want/i.test(text) ||
      !/daha iyiymiş|beğendim|begendim|looks good|i like/i.test(text) || /[?]|balkon|price|fiyat/i.test(text)) return null;
  return { state: { ...state, viewingOffered: true }, text: locale === "tr"
    ? "İsterseniz bu ilan için bir gösterim zamanı kontrol edebilirim. İster misiniz?"
    : "If you wish, I can check viewing times for this listing. Would you like that?" };
}
