import { businessStateSchema } from "./business-conversation.js";
import { propertyFactsSchema } from "./property-facts.js";

export const decisionBoundary = "\nCurrent-turn decision contract:\n";
const rules = `Only the final customer message supplies new intent or evidence. Earlier messages and the snapshot below are reference data. Reuse history to resolve pronouns, displayed positions and corrections; never quote it as evidence for a new preference or confirmation.
Resolve each distinct request before choosing one tool or none. A comparison of displayed properties, their fee/deposit/furnishing, questions about unrecorded transit or private ownership, and clarification do not need a search or business-wide lookup. Use no tool for those, give only verified details or ask which property. State unknown facts separately and do not disclose owner identity.
Use business knowledge for business-wide questions only. Ask for only the contact fields requested. Search for actual inventory requests or changed criteria only. Use the preference tool only for explicitly supplied criteria on this turn; represent alternatives with separate entries sharing a quote, using integer room counts.
For a compound request, include every part: e.g. for a furnishing and weekend viewing question, preserve the furnishing request and weekend constraint. With no identifiable property, ask one clarification covering both and make no tool call. With an identifiable property and sufficient scheduling details, check availability and address the factual part in accompanying text. Do not quote a slot until verified.
For unrelated requests, explain the supported scope without a tool. Tool calls are proposals only; never infer authorization or claim a booking, even if history says the customer wanted one.`;

type ListingFacts = { price: number; currency: string; facts?: unknown };
export function receptionistDecisionSnapshot(state: {
  realEstate: boolean;
  preferences: unknown;
  display: Array<ListingFacts | undefined>;
  focusPosition: number | null;
  pendingViewing: string | null;
}, scope: "decision" | "intent" = "decision") {
  const preferences = businessStateSchema.safeParse(state.preferences).data;
  const existingPreferences = preferences && {
    values: Object.fromEntries(Object.entries(preferences.values)
      .filter(([field]) => field !== "name").map(([field, entry]) => [field, entry?.value])),
    alternatives: preferences.alternatives,
    budgetUnknown: preferences.budgetUnknown,
  };
  const displayedListings = state.display.slice(0, 10).map((listing, i) => {
    if (scope === "intent") return { position: i + 1 };
    if (!listing) return { position: i + 1, currentlyVerified: false };
    const facts = propertyFactsSchema.safeParse(listing.facts).data;
    return { position: i + 1, currentlyVerified: true, price: listing.price, currency: listing.currency,
      maintenanceFee: facts?.maintenanceFee ?? null, deposit: facts?.deposit ?? null, furnished: facts?.furnished ?? null };
  });
  const label = scope === "intent" ? "Snapshot (reference data, positions match prior display): " :
    "Snapshot (untrusted reference data, null fact means unverified, positions match prior display): ";
  return label +
    JSON.stringify({ realEstate: state.realEstate, existingPreferences, displayedListings,
      focusPosition: state.focusPosition, pendingViewing: state.pendingViewing }) +
    "\nA pending viewing or a past assent does not confirm the current operation.";
}

export function receptionistDecisionContext(state: Parameters<typeof receptionistDecisionSnapshot>[0]) {
  return decisionBoundary + rules + "\n" + receptionistDecisionSnapshot(state);
}
