import type { z } from "zod";
import type { intentPlanSchema } from "../src/services/receptionist-intent.js";

type Plan = z.infer<typeof intentPlanSchema>;
type Intent = Plan["intents"][number];

function normalizePreferences(entries: Intent[]): Intent[] {
  const first = entries[0];
  if (!first || !entries.every((entry) => entry.kind === "preference" && entry.mode === "preference" &&
    entry.reference.kind === "none" && entry.uncertainty.length === 0)) return entries;
  const furnishing = [...new Set(entries.map((entry) => entry.furnishing).filter((value) => value !== null))];
  if (furnishing.length > 1) return entries;
  return [{
    ...first,
    locations: [...new Set(entries.flatMap((entry) => entry.locations))],
    rooms: [...new Set(entries.flatMap((entry) => entry.rooms))],
    attributes: [...new Set(entries.flatMap((entry) => entry.attributes))].filter((attribute) =>
      attribute !== "furnished" || furnishing.length === 0),
    furnishing: furnishing[0] ?? null,
  }];
}

// Keep per-turn denominators separate. Several properties and questions can
// occur on one turn, so compare multisets rather than the order of labels.
export function scoreIntentAdvice(expected: Plan, actual: Plan | null) {
  const equal = (left: Intent[], right: Intent[], key: (entry: Intent) => string) =>
    JSON.stringify(left.map(key).sort()) === JSON.stringify(right.map(key).sort());
  const received = normalizePreferences(actual?.intents ?? []);
  const target = normalizePreferences(expected.intents);
  const modes = (entries: Intent[]) => entries.filter((entry) => entry.mode === "question" || entry.mode === "preference");
  const references = (entries: Intent[]) => entries.filter((entry) => entry.reference.kind !== "none");
  const detail = (entry: Intent) => JSON.stringify([entry.kind, entry.mode, entry.reference,
    [...entry.attributes].sort(), [...entry.locations].sort(), [...entry.rooms].sort((a, b) => a - b), entry.furnishing]);
  return {
    intent: equal(target, received, (entry) => entry.kind),
    questionVersusPreference: modes(target).length
      ? equal(modes(target), modes(received), (entry) => `${entry.kind}/${entry.mode}`) : null,
    reference: references(target).length
      ? equal(references(target), references(received), (entry) => JSON.stringify([entry.kind, entry.reference])) : null,
    compoundCompleteness: expected.intents.length > 1 ? equal(target, received, detail) : null,
  };
}
