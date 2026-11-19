import type { AIReply } from "./ai.js";
import type { VerifiedListing } from "./customer-listings.js";

const instructionLike = /ignore (?:previous|all|the above)|system prompt|developer message|you are (?:now|an? assistant)|follow these instructions|önceki talimat|talimatları görmezden|<\/?(?:system|developer|assistant)>/i;
export const verifiedFactsForSynthesis = (name: string, result: unknown, query: string, locale: "en" | "tr") => {
  if (!result || typeof result !== "object") return null;
  const data = result as Record<string, unknown>;
  let facts: Record<string, unknown>;
  if (name === "search_listings") {
    const listings = Array.isArray(data.listings) ? data.listings as VerifiedListing[] : [];
    if (!listings.length) return null;
    facts = { kind: "listings", listings: listings.slice(0, 10).map((item) => ({
      id: String(item._id ?? ""), title: item.title, description: (item as VerifiedListing & { description?: string }).description?.slice(0, 350),
      location: item.location, price: item.price, currency: item.currency, listingType: item.listingType,
      propertyType: item.propertyType, rooms: item.rooms, areaSqm: item.areaSqm, publicUrl: item.publicUrl,
    })) };
  } else if (name === "get_business_knowledge") {
    const entries = (value: unknown, keys: string[], limit: number) => Array.isArray(value)
      ? value.slice(0, limit).map((item) => Object.fromEntries(keys.map((key) => [key, item?.[key]]).filter(([, field]) => typeof field === "string"))) : [];
    facts = { kind: "business_knowledge", profile: data.profile,
      services: entries(data.services, ["name", "description", "price"], 8),
      faqs: entries(data.faqs, ["question", "answer"], 8),
      policies: entries(data.policies, ["title", "text"], 5),
      facts: entries(data.facts, ["label", "value"], 8),
      contact: data.contact && typeof data.contact === "object" ? Object.fromEntries(["email", "phone", "address", "website"].map((key) => [key, (data.contact as Record<string, unknown>)[key]]).filter(([, value]) => typeof value === "string")) : null,
      openingHours: data.openingHours, timeZone: data.timeZone };
    if (!facts.profile && !(facts.services as unknown[]).length && !(facts.faqs as unknown[]).length && !(facts.policies as unknown[]).length && !(facts.facts as unknown[]).length && !facts.contact && !(Array.isArray(facts.openingHours) && facts.openingHours.length)) return null;
  } else return null;
  const payload = JSON.stringify({ visitorQuestion: query.slice(0, 400), language: locale, ...facts });
  if (Buffer.byteLength(payload) > 6000 || instructionLike.test(payload)) return null;
  return payload;
};

export const synthesisIsGrounded = (reply: string, name: string, result: unknown, query: string, locale: "en" | "tr") => {
  if (!reply.trim() || reply.length > 3500 || /\b(?:retrieval|tool_call|matching stored listings)\b/i.test(reply)) return false;
  if (/\b(?:Europe|America|Asia|Africa|Pacific|Australia)\/[A-Za-z_]+\b/.test(reply)) return false;
  if (locale === "tr" && /\b(?:I found|here are|would you like|the cheapest|business information)\b/i.test(reply)) return false;
  const trustedText = JSON.stringify(result ?? {});
  for (const url of reply.match(/https?:\/\/[^\s)]+/g) ?? []) if (!trustedText.includes(url)) return false;
  if (name === "search_listings") {
    const listings = ((result as { listings?: VerifiedListing[] })?.listings ?? []).slice(0, 10);
    if (/öner|tavsiye|hangisini seç|hangisi daha iyi|recommend|which one|compare|karşılaştır/i.test(query)
      && (/Güncel uygun ilanlar|Matching stored listings|Here are the previously found listings|^\s*1\./im.test(reply)
        || !/öner|tavsiye|seç|uygun|recommend|suggest|choose|cheaper|less|better|daha/i.test(reply))) return false;
    const allowedNumbers = new Set<string>();
    for (const item of listings) for (const value of [item.price, item.rooms, item.areaSqm])
      if (typeof value === "number") allowedNumbers.add(String(value));
    if (/öner|tavsiye|karşılaştır|recommend|compare|which one/i.test(query))
      for (const left of listings) for (const right of listings)
        if (left.currency === right.currency) allowedNumbers.add(String(Math.abs(left.price - right.price)));
    // A customer's budget is not evidence that any stored listing has that price.
    const currencyAmounts = [
      ...[...reply.matchAll(/(\d[\d.,]*)\s*(?:TL|TRY|USD|EUR|GBP)\b/gi)].map((match) => match[1]),
      ...[...reply.matchAll(/\b(?:TL|TRY|USD|EUR|GBP)\s*(\d[\d.,]*)/gi)].map((match) => match[1]),
    ];
    for (const amount of currencyAmounts) {
      const number = String(Number(amount?.replace(/[.,]/g, "")));
      if (!allowedNumbers.has(number)) return false;
    }
    const mentionedPrices = [...reply.matchAll(/(\d[\d.,]*)\s*(?:TL|TRY)\b/gi)].map((match) => Number(match[1]?.replace(/[.,]/g, "")));
    if (/ucuzdan pahalıya|cheapest first|lowest to highest/i.test(query) && mentionedPrices.some((value, index) => index > 0 && value < mentionedPrices[index - 1]!)) return false;
    if (/pahalıdan ucuza|highest to lowest/i.test(query) && mentionedPrices.some((value, index) => index > 0 && value > mentionedPrices[index - 1]!)) return false;
    const allowedRooms = new Set(listings.map((item) => item.rooms).filter((value): value is number => typeof value === "number"));
    for (const match of reply.matchAll(/\b(\d{1,2})\s*\+\s*1\b/g)) if (!allowedRooms.has(Number(match[1]))) return false;
    const descriptions = listings.map((item) => (item as VerifiedListing & { description?: string }).description ?? "").join(" ").toLocaleLowerCase("tr");
    for (const feature of [/balkon|balcony/i, /otopark|parking/i, /asansör|elevator/i])
      if (feature.test(reply) && !feature.test(descriptions)) return false;
    if (listings.every((item) => item.listingType === "rent") && /(?:for sale|satılık)/i.test(reply)) return false;
    if (listings.every((item) => item.listingType === "sale") && /(?:for rent|kiralık)/i.test(reply)) return false;
  }
  if (/(?:your appointment (?:is|has been) (?:booked|confirmed|cancelled|rescheduled)|randevunuz (?:oluşturuldu|onaylandı|iptal edildi|değiştirildi))/i.test(reply)) return false;
  if (name === "get_business_knowledge") {
    for (const match of reply.matchAll(/\d[\d.,]*\s*(?:TL|TRY|USD|EUR|GBP)\b/gi))
      if (!trustedText.includes(match[0]) && !query.includes(match[0])) return false;
  }
  return true;
};

export const combineProviderUsage = (first: AIReply, second: AIReply): AIReply => ({
  ...first, text: second.text,
  inputTokens: first.inputTokens + second.inputTokens,
  outputTokens: first.outputTokens + second.outputTokens,
  cachedInputTokens: (first.cachedInputTokens ?? 0) + (second.cachedInputTokens ?? 0),
  cacheWriteTokens: (first.cacheWriteTokens ?? 0) + (second.cacheWriteTokens ?? 0),
  reasoningTokens: (first.reasoningTokens ?? 0) + (second.reasoningTokens ?? 0),
  usageBreakdownKnown: Boolean(first.usageBreakdownKnown && second.usageBreakdownKnown),
});
