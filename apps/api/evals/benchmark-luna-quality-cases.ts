import type { BenchmarkCase, BenchmarkTurn } from "./benchmark-cases.js";

function decision(text: string, fixtureText: string, reply: RegExp, reviewFocus: string): BenchmarkTurn {
  return { text, fixtureText, reply, reviewFocus, expectsModel: true, expectedProposal: null };
}

function contact(text: string, reply: RegExp, reviewFocus: string): BenchmarkTurn {
  const proposal = { name: "get_business_knowledge", arguments: { topic: text } };
  return { text, proposal, expectedProposal: proposal, tool: "get_business_knowledge", reply, reviewFocus };
}

export const lunaQualityCases: BenchmarkCase[] = [
  { id: "2f-turkish-clarification", locale: "tr", turns: [
    decision("Abi selam, bi şey danışacaktım.", "Selam, tabii. Nasıl yardımcı olayım?", /selam|merhaba/i,
      "Match the informal register without guessing the customer's goal."),
    { ...decision("Görükle de Özlüce de olur, iki ya da üç odalı olabilir. Bütçem henüz belli değil.",
      "İki semt de seçenek, oda sayısında da esneksiniz. Kiralık mı, satılık mı bakıyorsunuz?", /kiralık.*satılık/i,
      "Recognize both location and room alternatives and ask one useful question. Do not invent a budget."),
      alternatives: { location: ["Görükle", "Özlüce"], rooms: [2, 3] }, missingPreferences: ["budget", "rooms", "location"] },
  ] },
  { id: "2f-bilingual-contact", locale: "tr", turns: [
    contact("E-posta adresiniz ve web siteniz nedir?", /(?=.*office@example\.test)(?=.*agency\.example\.test)/s,
      "Select the knowledge tool and address both requested contact fields."),
    { ...contact("Thanks, just the contact email one more time, olur mu?", /office@example\.test/,
      "Recognize a code-switched email-only follow-up."), noRepeat: /agency\.example\.test/ },
  ] },
  { id: "2f-verified-listing-references", locale: "tr", turns: [
    { text: "Görükle'de kiralık 3+1 daire arıyorum, bütçem 35000 TL.",
      tool: "search_listings", args: { exactRooms: 3, budgetMax: 35000, currency: "TRY" },
      preferences: { budget: 35000, location: "Görükle", rooms: 3 }, reply: /27\.000 TL/ },
    decision("İki ilanı karşılaştır, hangisini önerirsin?", "Fiyat en önemli ölçüt mü, yoksa önce başka bir özelliği mi karşılaştıralım?",
      /27\.000 TL.*7\.000 TL/s, "Compare only verified facts. Do not make stronger claims than the stored listings support."),
    // The fixture deliberately reproduces the 2E wrong search. The delivered reply must still be safe.
    { ...decision("İkinci ilanın aidatı ne kadar?", "", /aidat.*doğrulanmamış/i,
      "Resolve the second listing and disclose missing dues. A generic search does not resolve the requested attribute."),
      proposal: { name: "search_listings", arguments: { budgetMax: 35000, currency: "TRY", location: "Görükle" } },
      unknownFee: true, referenceOrdinal: 2 },
    { ...decision("Yok yok, ilkini kastetmiştim, onun depozitosu belli mi?",
      "İlk seçeneğin depozitosunu kayıtlardan doğrulayamıyorum.", /depozito.*doğrulanmamış/i,
      "Use the corrected first listing and answer the deposit question, independent of the preceding dues request."),
      unknownFee: true, referenceOrdinal: 1 },
  ] },
  { id: "2f-unknown-facts-and-viewing", locale: "tr", turns: [
    decision("Metro yürüyerek kaç dakika, tapu kimin üstüne?",
      "Yürüme süresi ve tapu sahibi hakkında doğrulanmış bilgim yok.", /yürüme süresi.*tapu.*hangi ilan/i,
      "Acknowledge missing transit and ownership data. Do not estimate or identify an owner."),
    decision("Bir de eşyalı mı, hafta sonu gezme ihtimalimiz var mı?",
      "Eşya durumunu doğrulayamıyorum. Gösterim için önce hangi ilanı düşündüğünüzü söyler misiniz?",
      /eşya.*gösterim.*hangi ilan/i,
      "Address both furnishing and viewing. Ask for the missing listing and avoid offering an invented time or booking."),
  ] },
];
