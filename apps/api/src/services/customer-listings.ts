export type VerifiedListing = {
  _id?: unknown; title: string; description?: string; location: string; price: number; currency: string;
  listingType?: string | null; propertyType?: string; rooms?: number | null; areaSqm?: number; publicUrl?: string | null;
};
export type ListingReplyOptions = {
  locale: "en" | "tr"; query?: string; responseLength?: "short" | "balanced" | "detailed";
  previousIds?: string[]; reused?: boolean; broadened?: boolean; repeatedNoMatch?: boolean;
};
export type ListingFollowUp = "none" | "recommend" | "attribute" | "sort" | "reference" | "broaden" | "search" | "topic";
export const listingFollowUpIntent = (query: string, hasPrior: boolean): ListingFollowUp => {
  if (!hasPrior) return "none";
  if (/hizmet|service|iletişim|contact|çalışma saat|opening hour|randevu|appointment|insan|human/i.test(query)) return "topic";
  if (/farklı.{0,25}mahalle|başka.{0,25}mahalle|different neighborhood|other neighborhood/i.test(query)) return "broaden";
  if (/\b(?:buy|purchase|rent|rental)\b|satın al|satılık|kiralık|bütçe|budget|\bunder\b|altında|\b\d+\s*\+\s*1\b|oda sayısı|room count|yeni arama|new search/i.test(query)) return "search";
  if (/\b(?:balcony|balconies|parking|elevator)\b|balkon|otopark|asansör/i.test(query)) return "attribute";
  if (/öner|tavsiye|hangisini seç|hangisi daha iyi|recommend|which one|compare|karşılaştır/i.test(query)) return "recommend";
  if (/ucuzdan pahalıya|pahalıdan ucuza|cheapest first|lowest to highest|highest to lowest/i.test(query)) return "sort";
  if (/ucuz olan|pahalı olan|cheaper one|more expensive one|\b(?:it|that one|those apartments)\b|onun|o daire|daha ucuz|daha pahalı|o ilanlar|önceki ilan|back to/i.test(query)) return "reference";
  return "none";
};
const priceText = (listing: VerifiedListing, locale: "en" | "tr") => {
  const amount = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: 0 }).format(listing.price);
  return listing.currency === "TRY" ? locale === "tr" ? `${amount} TL` : `TRY ${amount}` : `${amount} ${listing.currency}`;
};
const listingId = (listing: VerifiedListing) => String(listing._id ?? "");
export const formatListingReply = (raw: VerifiedListing[], options: ListingReplyOptions) => {
  const { locale, query = "", responseLength = "short" } = options;
  const tr = locale === "tr";
  const prior = new Set(options.previousIds ?? []);
  const all = raw.filter((item) => Number.isFinite(item.price) && item.title && item.location).slice(0, 10);
  const listings = options.broadened ? all.filter((item) => !prior.has(listingId(item))) : all;
  if (!listings.length) {
    if (options.broadened && all.length) return tr
      ? "Nilüfer'deki güncel uygun ilanları yeniden kontrol ettim; daha önce gösterdiklerime ek bir seçenek bulamadım. İsterseniz bütçeyi veya oda sayısını değiştirebiliriz."
      : "I checked the current matching listings again and found no additional options beyond those already shown. We can adjust the budget or room count.";
    return tr ? `${options.repeatedNoMatch ? "Tekrar kontrol ettim; " : ""}Bu ölçütlere uyan güncel ve uygun bir ilan bulamadım. Konumu, bütçeyi veya oda sayısını değiştirmek ister misiniz?`
      : `${options.repeatedNoMatch ? "I checked again; " : ""}I couldn't find a current available listing matching those criteria. Would you like to change the location, budget, or room count?`;
  }
  const ascending = /en ucuzdan pahalıya|ucuzdan pahalıya|lowest to highest|cheapest first|price ascending/i.test(query);
  const descending = /en pahalıdan ucuza|pahalıdan ucuza|highest to lowest|most expensive first|price descending/i.test(query);
  if (ascending || descending) listings.sort((a, b) => (a.price - b.price) * (descending ? -1 : 1));
  const ordinal = /(?:ilk|birinci|first)\s+(?:ilan|listing|property)/i.test(query) ? 0
    : /(?:ikinci|second)\s+(?:ilan|listing|property)/i.test(query) ? 1 : -1;
  const namedIndex = options.reused ? listings.findIndex((item) => {
    const name = item.title.replace(/^DEMO\s*[—-]\s*/i, "").toLocaleLowerCase("tr");
    return name.length >= 8 && query.toLocaleLowerCase("tr").includes(name);
  }) : -1;
  const cheaper = /cheaper one|cheapest|daha ucuz|en ucuz|ucuz olan/i.test(query);
  const pricier = /more expensive one|most expensive|daha pahalı|en pahalı|pahalı olan/i.test(query);
  const extreme = cheaper ? Math.min(...listings.map((value) => value.price)) : pricier ? Math.max(...listings.map((value) => value.price)) : undefined;
  const priceIndex = ascending || descending || extreme === undefined || listings.filter((item) => item.price === extreme).length !== 1
    ? -1 : listings.findIndex((item) => item.price === extreme);
  const chosenIndex = namedIndex >= 0 ? namedIndex : ordinal >= 0 ? ordinal : priceIndex;
  const selected = chosenIndex >= 0 && options.reused ? listings.slice(chosenIndex, chosenIndex + 1) : listings;
  const attribute = /\b(?:balcony|balconies)\b|balkon/i.test(query) ? { en: "balcony", tr: "balkon" }
    : /\bparking\b|otopark/i.test(query) ? { en: "parking", tr: "otopark" }
      : /\belevator\b|asansör/i.test(query) ? { en: "elevator", tr: "asansör" } : null;
  if (attribute && options.reused && selected.length !== 1) return tr
    ? "Hangi ilanı kastettiğinizi netleştirir misiniz? Özelliği kayıtlı bilgilerden kontrol edebilirim."
    : "Which listing do you mean? I can check its stored details.";
  if (attribute && selected.length === 1 && options.reused) {
    const item = selected[0]!;
    const confirmed = new RegExp(`${attribute.en}|${attribute.tr}`, "i").test(item.description ?? "");
    return confirmed ? tr ? `${item.title} ilanının açıklamasında ${attribute.tr} belirtiliyor. Ayrıntıları danışmanla doğrulamak ister misiniz?`
      : `${item.title} mentions ${attribute.en} in its stored description. Would you like staff to confirm the details?`
      : tr ? `${item.title} için ${attribute.tr} bilgisi kayıtlı ilanda doğrulanmamış. İsterseniz danışmana sorabilirim.`
        : `${attribute.en} is not confirmed in the stored details for ${item.title}. I can ask a team member.`;
  }
  if (options.reused && /öner|tavsiye|hangisini seç|hangisi daha iyi|recommend|which one|compare|karşılaştır/i.test(query)) {
    if (listings.length < 2) return tr ? "Karşılaştırmak için şu anda yalnızca bir güncel ilan var. Başka ölçütlerle aramamı ister misiniz?"
      : "Only one current listing remains to compare. Would you like to try different criteria?";
    const [first, second] = [...listings].sort((a, b) => a.price - b.price);
    if (!first || !second || first.currency !== second.currency) return tr
      ? "Bu ilanların fiyatlarını aynı para biriminde doğrulayamıyorum. Konum veya özellik önceliğinizi söylerseniz seçenekleri birlikte değerlendirebiliriz."
      : "I can't verify a price comparison in one currency. Tell me whether location or property details matter most.";
    const difference = second.price - first.price;
    if (difference === 0) return tr
      ? `İki ilanın fiyatı da ${priceText(first, locale)}. Fiyata göre birini öne çıkaramam; konum veya kayıtlı özelliklerden hangisi sizin için daha önemli?`
      : `Both listings cost ${priceText(first, locale)}. Price doesn't distinguish them; which location or verified property detail matters more to you?`;
    const firstPlace = first.location.split(",").map((part) => part.trim()).filter(Boolean).at(-1) ?? first.title;
    const secondPlace = second.location.split(",").map((part) => part.trim()).filter(Boolean).at(-1) ?? second.title;
    return tr
      ? `Fiyat önceliğinizse ${firstPlace} konumundaki ${priceText(first, locale)} tutarındaki ilanı öneririm; ${secondPlace} konumundaki seçeneğe göre ${priceText({ ...first, price: difference }, locale)} daha uygun. Konum veya diğer özellikler sizin için önemliyse tercihlerinizi söyleyin; kayıtlı ayrıntıları karşılaştıralım.`
      : `If price is your priority, I'd suggest the ${firstPlace} listing at ${priceText(first, locale)}. It costs ${priceText({ ...first, price: difference }, locale)} less than the ${secondPlace} option. Tell me whether location or other verified details matter more to you.`;
  }
  const max = responseLength === "short" && !options.reused ? 3 : 10;
  const shown = selected.slice(0, max);
  const introduction = options.reused
    ? ascending ? tr ? "Önceki uygun ilanları fiyatlarına göre ucuzdan pahalıya sıraladım:" : "Here are the previously found listings, cheapest first:"
      : descending ? tr ? "Önceki uygun ilanları pahalıdan ucuza sıraladım:" : "Here are the previously found listings, most expensive first:"
        : tr ? "Önceki uygun ilanlardan istediğiniz bilgi:" : "From the previously found listings:"
    : options.broadened ? tr ? "Farklı mahallelerde yeni uygun seçenekler buldum:" : "I found these additional current options in other neighborhoods:"
      : tr ? "Güncel uygun ilanlar:" : "I found these current listings:";
  const lines = shown.map((item, index) => {
    const kind = item.listingType === "rent" ? tr ? "kiralık" : "for rent" : item.listingType === "sale" ? tr ? "satılık" : "for sale" : "";
    const rooms = typeof item.rooms === "number" ? `${item.rooms}+1` : "";
    const area = responseLength === "detailed" && typeof item.areaSqm === "number" ? `${item.areaSqm} m²` : "";
    const details = [item.location, rooms, kind, area].filter(Boolean).join(" · ");
    const link = responseLength === "detailed" && item.publicUrl ? ` ${item.publicUrl}` : "";
    return `${index + 1}. ${item.title}: ${details} — ${priceText(item, locale)}.${link}`;
  });
  return `${introduction}\n${lines.join("\n")}${shown.length < listings.length ? tr ? "\nBaşka seçenekler de var; isterseniz devamını paylaşabilirim." : "\nMore matches are available; ask to see the rest." : ""}`;
};
