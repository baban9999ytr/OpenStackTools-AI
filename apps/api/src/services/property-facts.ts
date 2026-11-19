import { z } from "zod";

export const propertyFactsSchema = z.strictObject({
  maintenanceFee: z.number().finite().min(0).max(1_000_000_000).optional(),
  deposit: z.number().finite().min(0).max(1_000_000_000).optional(),
  furnished: z.boolean().optional(),
});

const questions = [
  ["maintenanceFee", /aidat|maintenance fee|\bdues\b/i, "aidat", "maintenance fee"],
  ["deposit", /depozito|\bdeposit\b/i, "depozito", "deposit"],
  ["furnished", /(?:e[şs]yal[ıi]|mobilyalı)\s+m[ıiuü]|eşya durum|\bis it furnished\b|\bfurnish(?:ed|ing)\b.{0,15}\?/i, "eşya durumu", "furnishing status"],
  ["transit", /metro.{0,35}(?:kaç dakika|kaç dk|yürüme|yürüyerek|ne kadar)|(?:walk|minutes?).{0,35}(?:metro|subway)|(?:metro|subway).{0,25}(?:walk|minutes?)/i, "metroya yürüyüş süresi", "walking time to the metro"],
  ["buildingAge", /bina\s+yaşı|building age|how old.{0,25}building/i, "bina yaşı", "building age"],
  ["ownership", /tapu.{0,25}(?:kimin|sahibi|kimde)|(?:who owns|title holder|property owner|owner of (?:the|this)|landlord.s (?:name|identity|phone))/i, "tapu sahibi", "ownership information"],
] as const;

export function requestedPropertyFacts(text: string) {
  return questions.filter(([, pattern]) => pattern.test(text));
}

export function propertyFactReply(
  listing: { title: string; currency: string; facts?: unknown; description?: string } | undefined,
  requested: ReturnType<typeof requestedPropertyFacts>,
  locale: "en" | "tr",
  guess = false,
) {
  const tr = locale === "tr";
  const facts = propertyFactsSchema.safeParse(listing?.facts).data;
  const statements = requested.map(([key, , turkish, english]) => {
    if (key === "ownership") return tr ? "Tapu sahibinin kimlik bilgilerini paylaşamam." : "I cannot share the title holder’s identity.";
    if (guess && (key === "deposit" || key === "maintenanceFee") && facts?.[key] === undefined) return tr
      ? `Doğrulanmamış ${turkish} tutarını tahmin edemem.` : `I cannot guess the unverified ${english} amount.`;
    if (!listing) {
      if (key === "buildingAge") return tr ? "Bina yaşı için doğrulanmış bilgim yok." : "I have no verified building age.";
      if (key === "transit") return tr ? "Metroya yürüme süresi için doğrulanmış bilgim yok."
        : "I cannot verify the walk to the metro without knowing the listing.";
      return "";
    }
    if (key === "transit" || key === "buildingAge")
      return tr ? `${turkish} için doğrulanmış bir kayıt alanımız yok.` : `Our listing records do not verify ${english}.`;
    const value = facts?.[key];
    if (typeof value === "boolean") return tr ? `Kayıtlara göre ilan ${value ? "eşyalı" : "eşyasız"}.`
      : `The listing is recorded as ${value ? "furnished" : "unfurnished"}.`;
    if (typeof value === "number" && ["TRY", "USD", "EUR", "GBP"].includes(listing.currency)) {
      const amount = new Intl.NumberFormat(tr ? "tr-TR" : "en-GB", { maximumFractionDigits: 2 }).format(value);
      return tr ? `${turkish}: ${amount} ${listing.currency === "TRY" ? "TL" : listing.currency}.`
        : `The recorded ${english} is ${amount} ${listing.currency}.`;
    }
    const mentioned = {
      furnished: /eşyalı|eşyasız|furnish/i, maintenanceFee: /aidat|maintenance fee|dues/i, deposit: /depozito|deposit/i,
    }[key].test(listing.description ?? "");
    if (mentioned) return tr ? `${turkish} açıklamada geçiyor, ancak doğrulanmamış.`
      : `The description mentions ${english}, but it is unverified.`;
    return tr ? `${turkish} bilgisi kayıtlarda yok ve doğrulanmamış.` : `There is no verified ${english} in the listing record.`;
  });
  const details = statements.filter(Boolean).join(" ");
  return listing && details ? `${listing.title} — ${details}` : details;
}

export const asksForWeekendViewing = (text: string) =>
  /hafta\s*sonu|weekend/i.test(text) && /gez(?:me|ebil)|gör(?:me|ebil)|gösterim|view|showing|visit/i.test(text);
