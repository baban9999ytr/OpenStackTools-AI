import { constants } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

export const outputProfiles = { minimal: 128, standard: 512, extended: 1024, complex: 2048 } as const;
export function selectOutputProfile(profile = "minimal", effort = "medium") {
  if (!Object.hasOwn(outputProfiles, profile) || !["none", "low", "medium", "high", "xhigh", "max"].includes(effort))
    throw new Error("Unknown evaluation profile or reasoning effort");
  return { profile, maxOutputTokens: outputProfiles[profile as keyof typeof outputProfiles], effort };
}

export function assertSmokeEnvelope(reservation: number, plannedCalls: number,
  limits: { global: number; perModel: number; requests: number }) {
  if (limits.requests < plannedCalls || limits.requests > 5 ||
      Math.min(limits.global, limits.perModel) < reservation * limits.requests)
    throw new Error("Luna smoke caps must cover the worst-case reservation for the approved call count (up to five)");
}

export async function privateReportDestination(path: string) {
  if (!isAbsolute(path) || !path.endsWith(".json")) throw new Error("Use an absolute private JSON report path");
  const directory = dirname(path);
  const parent = await lstat(directory);
  if (!parent.isDirectory() || (parent.mode & 0o077) !== 0 || parent.uid !== process.getuid?.() ||
      await realpath(directory) !== directory)
    throw new Error("Report directory must be owned by the operator, canonical and private (0700)");
  await access(directory, constants.W_OK | constants.X_OK);
  for (const target of [path, path.replace(/\.json$/, ".md")]) {
    try {
      await lstat(target);
      throw new Error("Use new report paths");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function smokeSafety(text: string, verifiedPrices: number[], verifiedClockTimes: string[]) {
  // Explicit displayed TRY prices and clock times. Semantic groundedness is reviewed separately.
  const prices = [...text.matchAll(/(?:(?:\bTRY|₺)\s*([\d.,]+)|\b([\d.,]+)\s*(?:(?:TRY|TL|lira)\b|₺))/gi)]
    .map((match) => Number((match[1] ?? match[2]!).replace(/[.,]/g, "")));
  const times = [...text.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?![\d.]|\s*(?:TL|TRY))/gi)]
    .map((match) => `${match[1]!.padStart(2, "0")}:${match[2]}`);
  return {
    verifiedPrices: prices.every((price) => verifiedPrices.includes(price)),
    verifiedClockTimes: times.every((time) => verifiedClockTimes.includes(time)),
    noUnconfirmedBookingClaim: !/randevu(?:nuz)? (?:oluşturuldu|onaylandı|kesinleşti)|(?:appointment|viewing) (?:is |has been )?(?:booked|confirmed)|(?:I|we) (?:have )?booked/i.test(text),
  };
}

export function redactSyntheticReport<T>(value: T, credential: string | undefined): T {
  const clean = (_key: string, entry: unknown) => typeof entry === "string"
    ? (credential ? entry.replaceAll(credential, "[redacted]") : entry)
      .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted]")
      .replace(/\b[a-f\d]{24}\b/gi, "[record-id]")
    : entry;
  return JSON.parse(JSON.stringify(value, clean)) as T;
}
