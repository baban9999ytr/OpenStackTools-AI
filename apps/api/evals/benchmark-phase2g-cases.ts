import type { BenchmarkCase, BenchmarkTurn } from "./benchmark-cases.js";
import { phase2fEvidence } from "./phase2f-observed-decisions.js";
import { phase2gLiveEvidence } from "./phase2g-observed-decisions.js";

const checks: Record<string, Partial<BenchmarkTurn>[]> = {
  "2f-turkish-clarification": [
    { reply: /^Selam, tabii\. Ne danışmak istiyorsun\?$/, expectedProposal: null },
    { reply: /her iki semti.*oda.*bütçe sınırı.*kiralık.*satılık/i,
      alternatives: { location: ["Görükle", "Özlüce"], rooms: [2, 3] }, missingPreferences: ["budget", "rooms", "location"],
      expectedProposal: { name: "interpret_business_preferences", arguments: null } },
  ],
  "2f-bilingual-contact": [
    { reply: /(?=.*office@example\.test)(?=.*agency\.example\.test)/s,
      contactFields: ["email", "website"], tool: "get_business_knowledge" },
    { reply: /office@example\.test/, noRepeat: /agency\.example\.test|web sitemiz/i,
      contactFields: ["email"], tool: "get_business_knowledge" },
  ],
  "2f-verified-listing-references": [
    { tool: "search_listings", args: { exactRooms: 3, budgetMax: 35000, currency: "TRY" }, reply: /27\.000 TL.*34\.000 TL/s },
    { reply: /27\.000 TL.*7\.000 TL/s, priceComparison: true, expectedProposal: null },
    { reply: /Synthetic flat 34000.*aidat.*doğrulanmamış/i, referenceOrdinal: 2, unknownFee: true, expectedProposal: null },
    { reply: /Synthetic flat 27000.*depozito.*doğrulanmamış/i, referenceOrdinal: 1,
      noRepeat: /aidat/i, unknownFee: true, expectedProposal: null },
  ],
  "2f-unknown-facts-and-viewing": [
    { reply: /yürüme süresi.*tapu sahib.*hangi ilan/i, noRepeat: /işletme bilgileri|\d+\s*dakika/i, expectedProposal: null },
    { reply: /eşya durumunu.*hafta sonu gösterim.*hangi ilan/i, noRepeat: /tapu|metro|işletme bilgileri/i, expectedProposal: null },
  ],
};

export const phase2gReplayCases: BenchmarkCase[] = phase2fEvidence.scenarios.map(({ scenario, locale, turns }) => ({
  id: scenario, locale: locale === "tr" ? "tr" : "en",
  turns: turns.map((turn, index) => ({
    text: turn.text, expectsModel: "providerText" in turn, fixtureText: turn.providerText,
    proposal: turn.proposal ?? undefined, ...checks[scenario]![index],
  })),
}));

// Keep the previous replay immutable. The live suite uses the same customer
// questions with new provider decisions and its own provider-free fixtures.
const [intake, contact, references, unknown] = phase2gReplayCases;
const fresh = (turn: BenchmarkTurn, fixtureText: string, reviewFocus: string): BenchmarkTurn =>
  ({ ...turn, proposal: undefined, expectsModel: true, fixtureText, reviewFocus });

export const phase2gLiveCases: BenchmarkCase[] = [
  { id: "2g-a-flexible-preferences", locale: "tr", turns: [
    { ...fresh(intake!.turns[1]!, "", "Recognize both neighborhoods, both room layouts and the undecided budget."),
      proposal: intake!.turns[1]!.proposal },
  ] },
  { id: "2g-b-email-only", locale: "tr", prelude: [
    { role: "customer", text: "E-posta adresiniz ve web siteniz nedir?" },
    { role: "assistant", text: "Bize office@example.test adresinden yazabilirsiniz. Web sitemiz https://agency.example.test" },
  ], turns: [
    { ...fresh(contact!.turns[1]!, "", "Narrow the previous contact answer to email alone."),
      rawContextSignals: [/e[ -]?mail|e[ -]?posta/i],
      noRepeat: /agency\.example\.test|web sitemiz|555-0100|Test street/i,
      proposal: { name: "get_business_knowledge", arguments: { topic: "contact email" } } },
  ] },
  { id: "2g-c-listing-references", locale: "tr", turns: [
    references!.turns[0]!,
    fresh(references!.turns[1]!, "Fiyat önceliğinizse 27.000 TL'lik ilan 7.000 TL daha uygun.",
      "Compare the two verified listings without making a new search or inventing attributes."),
    { ...fresh(references!.turns[2]!, "İkinci ilanın aidat bilgisi doğrulanmamış.",
      "Keep the second listing and the maintenance fee as separate concepts."),
      rawContextSignals: [/[İi]kinci|second|34[., ]?000/i, /aidat|maintenance|dues/i] },
    { ...fresh(references!.turns[3]!, "İlk ilanın depozitosunu doğrulayamıyorum.",
      "Correct the reference to the first listing and switch from maintenance fee to deposit."),
      rawContextSignals: [/[İi]lk|birinci|first|27[., ]?000/i, /depozito|deposit/i] },
  ] },
  { id: "2g-d-unknown-and-viewing", locale: "tr", turns: [
    fresh(unknown!.turns[0]!, "Metroya yürüme süresini doğrulayamıyorum. Tapu sahibinin kimliğini paylaşamam. Hangi ilanı kastediyorsunuz?",
      "Treat transit and private ownership separately and clarify the missing listing."),
    { ...fresh(unknown!.turns[1]!, "Eşya durumunu ve hafta sonu gösterim saatlerini kontrol etmek için hangi ilanı kastediyorsunuz?",
      "Address furnishing and weekend viewing, keeping the listing unresolved and offering no unverified slot."),
      rawContextSignals: [/eşya|furnish/i, /hafta sonu|weekend/i, /gösterim|view|visit/i] },
  ] },
];


// Reproduce exactly the queue turn from the first failed live attempt.
export const phase2gSingleCallCases: BenchmarkCase[] = [{
  id: "2g-single-call-flexible-preferences", locale: "tr", turns: [phase2gLiveCases[0]!.turns[0]!],
}];

export const phase2gMilestoneCCases: BenchmarkCase[] = phase2gLiveCases.map((scenario) => {
  const decisions = phase2gLiveEvidence.decisions[scenario.id as keyof typeof phase2gLiveEvidence.decisions];
  if (decisions.length !== scenario.turns.length) throw new Error("Frozen Phase 2G turn count mismatch");
  return { ...scenario, turns: scenario.turns.map((turn, index) => {
    const decision = decisions[index]!;
    if (decision.text !== turn.text) throw new Error("Frozen Phase 2G prompt mismatch");
    return "providerText" in decision
      ? { ...turn, fixtureText: decision.providerText, proposal: decision.proposal ?? undefined }
      : turn;
  }) };
});
