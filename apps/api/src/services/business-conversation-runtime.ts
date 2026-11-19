import type { Types } from "mongoose";
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
  const searchChange = Object.entries(turn.updates).some(([field, entry]) => field !== "name" &&
    previous?.values[field as keyof BusinessState["values"]]?.value !== entry?.value);
  if (turn.withdrawBudget && !turn.topicChange) {
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
  if (filters) {
    const action = await stageAction(context, { name: "search_listings", arguments: filters }, `business:${requestId}:search`);
    matches = ((action.result as { listings?: unknown[] })?.listings ?? []).length;
    actionId = action._id;
    answer = actionReply(action, { responseLength: "short" });
    // Preferences aren't facts: the schema cannot certify these attributes.
    if (state.values.furnished || state.values.balcony) answer += tr
      ? " Eşya ve balkon tercihlerinizi not aldım; bu özellikler için doğrulanmış alanlar bulunmadığından tam uygunluklarını teyit edemiyorum."
      : "I've noted your furnishing and balcony preferences; these attributes are not verified, so I cannot confirm a complete match.";
  }
  const follow = realEstateFollowUp(state, context.locale, matches);
  state = follow.state as BusinessState;
  const acknowledgement = turn.correction ? tr ? "Tercihinizi güncelledim. " : "I've updated your preference. " : "";
  const fallback = tr ? "Tercihlerinizi not aldım. İsterseniz bir ekip üyesinden yardım isteyebilirsiniz."
    : "I've noted your preferences. You can ask for a team member if you wish.";
  return { state, actionId, text: acknowledgement + [answer, follow.text].filter(Boolean).join(" ") || fallback };
}

export function viewingFollowUp(text: string, state: BusinessState, locale: "en" | "tr", hasVerifiedListing: boolean) {
  if (!hasVerifiedListing || state.viewingOffered || /istemiyorum|not interested|don't want/i.test(text) ||
      !/daha iyiymiş|beğendim|begendim|looks good|i like/i.test(text) || /[?]|balkon|price|fiyat/i.test(text)) return null;
  return { state: { ...state, viewingOffered: true }, text: locale === "tr"
    ? "İsterseniz bu ilan için bir gösterim zamanı kontrol edebilirim. İster misiniz?"
    : "If you wish, I can check viewing times for this listing. Would you like that?" };
}
