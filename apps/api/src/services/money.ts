export const parseUsdMicros = (value: string): number => {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))
    throw new Error(
      "Expected a non-negative USD amount with at most six decimals",
    );
  const [whole, fraction = ""] = value.split(".");
  const amount =
    BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  if (amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("USD amount is too large");
  return Number(amount);
};
export const costMicros = (
  tokens: number,
  priceMicrosPerMillion: number,
): number => {
  if (!Number.isSafeInteger(tokens) || tokens < 0)
    throw new Error("Invalid token count");
  const amount =
    (BigInt(tokens) * BigInt(priceMicrosPerMillion) + 999_999n) / 1_000_000n;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Estimated cost is too large");
  return Number(amount);
};
