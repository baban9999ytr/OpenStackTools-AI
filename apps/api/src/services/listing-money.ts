// Dots/commas in grouped integers are thousands separators. A decimal
// fraction is accepted only with the explicit "bin" multiplier.
const amountPattern = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d{1,9}(?:[.,]\d{1,2}(?=\s+bin))?)`;

function amount(value: string, thousands: boolean) {
  const decimalThousands = thousands && /^\d+[.,]\d{1,2}$/.test(value);
  const numeric = Number(decimalThousands ? value.replace(",", ".") : value.replace(/[.,]/g, ""));
  return numeric * (thousands ? 1000 : 1);
}

export function statedListingLimit(text: string) {
  const input = text.toLocaleLowerCase("tr");
  const money = String.raw`${amountPattern}(?:\s*(bin)(?:in|e|i|ı)?)?(?:\s*(tl|try|lira|usd|dolar|eur|euro|gbp))?`;
  const prefix = new RegExp(String.raw`\b(en fazla|en çok|en cok|up to|under|below)\s+${money}(?![\p{L}\p{N}]|[.,+]\d)`, "gu");
  const suffix = new RegExp(String.raw`\b${money}(?:['’]?e|['’]?a|['’]?(?:yı|yi))?\s+(kadar|altında|altı|alti|altinda|geçmesin|gecmesin)(?![\p{L}\p{N}])`, "gu");
  const limits = [
    ...[...input.matchAll(prefix)].map((match) => ({ match, marker: match[1]!, raw: match[2]!, scale: match[3], unit: match[4] })),
    ...[...input.matchAll(suffix)].map((match) => ({ match, marker: match[4]!, raw: match[1]!, scale: match[2], unit: match[3] })),
  ];
  return limits.flatMap(({ match, marker, raw, scale, unit }) => {
    const value = amount(raw, Boolean(scale));
    if (!Number.isSafeInteger(value) || value > 1e9) return [];
    const currency = /^(?:usd|dolar)$/.test(unit ?? "") ? "USD"
      : /^(?:eur|euro)$/.test(unit ?? "") ? "EUR" : unit === "gbp" ? "GBP"
        : unit || !/^(?:up to|under|below)$/.test(marker) ? "TRY" : undefined;
    return [{ value, currency, exclusive: /^(?:alt|under|below)/.test(marker), evidence: text.slice(match.index, match.index + match[0].length) }];
  });
}

export function listingPriceReferences(text: string) {
  const pattern = new RegExp(String.raw`\b${amountPattern}(?:\s*(bin))?\s*(?:(tl|try|usd|eur|gbp)\s*)?['’]?(?:lik|lık|luk|lük)(?!\p{L})`, "gu");
  return [...text.toLocaleLowerCase("tr").matchAll(pattern)].map((match) =>
    ({ price: amount(match[1]!, Boolean(match[2])), currency: match[3] === "tl" ? "TRY" : match[3]?.toUpperCase() ?? "TRY" }));
}
