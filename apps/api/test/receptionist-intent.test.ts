import assert from "node:assert/strict";
import { test } from "node:test";
import { recordedLunaPlans } from "../evals/luna-integrated-widget-fixture.js";
import { phase2gLiveEvidence } from "../evals/phase2g-observed-decisions.js";
import { intentClarification, intentPlanSchema, isConfirmationDeferral, isTentativeAlternativePreference, parseIntentAdvice, receptionistIntentFormat, standaloneListingComparison } from "../src/services/receptionist-intent.js";
import { ambiguous, item, position, unseen } from "../evals/receptionist-intent-cases.js";

const historical = [
  [phase2gLiveEvidence.decisions["2g-a-flexible-preferences"][0].text, [item("preference", "preference", "Görükle de Özlüce de olur", { locations: ["Görükle", "Özlüce"] }), item("preference", "preference", "iki ya da üç odalı olabilir", { rooms: [2, 3] })]],
  [phase2gLiveEvidence.decisions["2g-b-email-only"][0].text, [item("contact", "request", "just the contact email")]],
  [phase2gLiveEvidence.decisions["2g-c-listing-references"][1].text, [item("comparison", "request", "İki ilanı karşılaştır")]],
  [phase2gLiveEvidence.decisions["2g-c-listing-references"][2].text, [item("property_fact", "question", "İkinci ilanın aidatı", { ...position(2), attributes: ["maintenanceFee"] })]],
  [phase2gLiveEvidence.decisions["2g-c-listing-references"][3].text, [item("property_fact", "question", "ilkini kastetmiştim, onun depozitosu", { ...position(1), attributes: ["deposit"] })]],
  [phase2gLiveEvidence.decisions["2g-d-unknown-and-viewing"][0].text, [item("property_fact", "question", "Metro yürüyerek kaç dakika", { ...ambiguous, attributes: ["transit"] }), item("property_fact", "question", "tapu kimin üstüne", { ...ambiguous, attributes: ["ownership"] })]],
  [phase2gLiveEvidence.decisions["2g-d-unknown-and-viewing"][1].text, [item("property_fact", "question", "eşyalı mı", { ...ambiguous, attributes: ["furnished"] }), item("viewing", "question", "hafta sonu gezme ihtimalimiz var mı", ambiguous)]],
] as const;

test("structured intent corpus accepts evidence-linked reference plans for 7 historical and 8 unseen turns", () => {
  for (const [text, intents] of historical) {
    const raw = JSON.stringify({ intents });
    assert.ok(parseIntentAdvice(raw, text, 2, true), text);
  }
  for (const entry of unseen) {
    const raw = JSON.stringify({ intents: entry.plan });
    assert.ok(parseIntentAdvice(raw, entry.latest, 2, true), entry.latest);
  }
  assert.equal(unseen[0].plan[0]!.mode, "question");
  assert.equal(unseen[1].plan[0]!.mode, "preference");
  assert.equal(unseen[2].plan[0]!.reference.position, 2);
  assert.equal(unseen[4].plan.length, 2);
});

test("structured intent validator rejects stale evidence, false ordinals, oversized plans and executable fields", () => {
  const latest = "İkinci evin aidatı ne kadar?";
  const valid = item("property_fact", "question", "İkinci evin aidatı", { ...position(2), attributes: ["maintenanceFee"] });
  assert.ok(parseIntentAdvice(JSON.stringify({ intents: [valid] }), latest, 2, false));
  for (const intents of [[{ ...valid, evidence: "Bütçem 35000 TL" }], [{ ...valid, ...position(1) }],
    [{ ...valid, action: "create_appointment" }], Array.from({ length: 6 }, () => valid)]) {
    assert.equal(parseIntentAdvice(JSON.stringify({ intents }), latest, 2, false), null);
  }
  assert.equal(parseIntentAdvice(JSON.stringify({ intents: [valid] }), latest, 1, false), null);
  const falseOrdinal = { ...valid, evidence: "2.000 TL aidat mı?" };
  assert.equal(parseIntentAdvice(JSON.stringify({ intents: [falseOrdinal] }), falseOrdinal.evidence, 2, false), null);
  assert.equal(parseIntentAdvice("".padEnd(9_001, " "), latest, 2, false), null);
  assert.match(intentClarification(null, latest, "tr"), /netleştirir/);
  assert.match(intentClarification({ intents: [{ ...valid, ...ambiguous }] }, latest, "tr"), /Hangi ilanı/);
});

test("only complete standalone comparison commands can skip inference", () => {
  assert.equal(standaloneListingComparison(historical[2][0]), true);
  assert.equal(standaloneListingComparison("İki ilanı karşılaştır, hafta sonu da görelim."), false);
  assert.equal(standaloneListingComparison("Hangisi daha iyi, bütçeyi düşürelim mi?"), false);
});

test("Luna Responses structured adapter uses strict JSON without executable tools", async () => {
  Object.assign(process.env, { MONGODB_URL: "mongodb://127.0.0.1:27017/unused-intent-test",
    DASHBOARD_ORIGIN: "https://test.example.invalid", SESSION_SECRET: "synthetic-unused-test-session-secret",
    OPENAI_API_KEY: "synthetic-unused-test-key", OPENAI_MODEL: "gpt-6-luna", OPENAI_REASONING_EFFORT: "none",
    DEFAULT_DAILY_BUDGET_USD: "1", DEFAULT_MONTHLY_BUDGET_USD: "1",
    OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1", OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1",
    SMTP_HOST: "localhost", SMTP_FROM: "test@example.invalid" });
  const { createOpenAIResponder } = await import("../src/services/ai.js");
  const fixture = JSON.stringify({ intents: unseen[0].plan });
  let sent: Record<string, unknown> = {};
  const responder = createOpenAIResponder({ model: "gpt-6-luna", endpoint: "responses", reasoningEffort: "none",
    apiKey: "synthetic-fixture", maxCompletionTokens: 512, fetch: async (_url, request) => {
      sent = JSON.parse(String(request?.body));
      return Response.json({ model: "gpt-6-luna", status: "completed", output_text: fixture,
        output: [], usage: { input_tokens: 70, output_tokens: 30 } });
    } });
  assert.ok(responder.interpretIntent);
  const result = await responder.interpretIntent("Classify only.", [{ role: "customer", text: unseen[0].latest }]);
  assert.equal(result.action, undefined);
  assert.equal(result.inputTokens, 70);
  assert.deepEqual(parseIntentAdvice(result.text, unseen[0].latest, 2, true)?.intents, unseen[0].plan);
  assert.deepEqual(sent.text, { format: receptionistIntentFormat });
  assert.equal(sent.tool_choice, "none");
  assert.equal(sent.tools, undefined);
  assert.equal(sent.store, false);
});

test("intent measurement separates correct topic from mode, ordinal and compound errors", async () => {
  const { scoreIntentAdvice } = await import("../evals/receptionist-intent-scoring.js");
  const expected = { intents: [
    item("property_fact", "question", "İkinci ilan", { ...position(2), attributes: ["furnished"] }),
    item("viewing", "question", "hafta sonu"),
  ] };
  assert.deepEqual(scoreIntentAdvice(expected, { intents: [
    { ...expected.intents[0]!, mode: "preference", ...position(1) }, expected.intents[1]!,
  ] }), { intent: true, questionVersusPreference: false, reference: false, compoundCompleteness: false });
  assert.deepEqual(scoreIntentAdvice(expected, { intents: [expected.intents[0]!] }),
    { intent: false, questionVersusPreference: false, reference: true, compoundCompleteness: false });
  assert.deepEqual(scoreIntentAdvice(expected, null),
    { intent: false, questionVersusPreference: false, reference: false, compoundCompleteness: false });
});


test("the exact Luna focused-plus-position plan fails the provider-shaped and server schemas", () => {
  const raw = `{"intents":[{"kind":"property_fact","mode":"question","evidence":"Eşyalı mı?","reference":{"kind":"focused","position":2},"attributes":["furnished"],"locations":[],"rooms":[],"furnishing":null,"uncertainty":["missing_fact"]}]}`;
  const plan = JSON.parse(raw);
  assert.equal(intentPlanSchema.safeParse(plan).success, false);
  assert.equal(parseIntentAdvice(raw, "Eşyalı mı?", 2, true), null);
  // Remove only fact-availability speculation. The reference still fails.
  plan.intents[0].uncertainty = [];
  assert.equal(intentPlanSchema.safeParse(plan).success, false);
  plan.intents[0].reference.position = null;
  assert.ok(parseIntentAdvice(JSON.stringify(plan), "Eşyalı mı?", 2, true));
  assert.equal(parseIntentAdvice(JSON.stringify(plan), "Eşyalı mı?", 2, false), null);
  const provider = JSON.stringify(receptionistIntentFormat.schema);
  assert.match(provider, /"reference":\{"anyOf":\[/);
  assert.doesNotMatch(provider, /"(?:oneOf|if|then|else|missing_fact)"/);
});

test("explicit deferral is non-authorizing and tentative criteria do not imply search", async () => {
  const { scoreIntentAdvice } = await import("../evals/receptionist-intent-scoring.js");
  const { classifyTextConfirmation } = await import("../src/services/universal-confirmation.js");
  const deferral = unseen[5];
  assert.equal(isConfirmationDeferral(deferral.latest), true);
  assert.equal(isConfirmationDeferral("Evet, randevuyu onaylıyorum."), false);
  assert.equal(classifyTextConfirmation(deferral.latest), null);
  assert.ok(parseIntentAdvice(JSON.stringify({ intents: deferral.plan }), deferral.latest, 0, false));
  const oldViewing = item("viewing", "unclear", deferral.latest, { uncertainty: ["uncertain_intent", "missing_time"] });
  assert.equal(parseIntentAdvice(JSON.stringify({ intents: [oldViewing] }), deferral.latest, 0, false), null);
  assert.equal(parseIntentAdvice(JSON.stringify({ intents: deferral.plan }), "Randevuyu onaylıyorum.", 0, false), null);

  const options = unseen[3];
  assert.equal(isTentativeAlternativePreference(options.latest), true);
  assert.equal(isTentativeAlternativePreference(options.latest + " İlanları hemen göster."), false);
  const grouped = item("preference", "preference", options.latest, { locations: ["Kültür", "Balat"], rooms: [2, 1] });
  const expected = { intents: [...options.plan] };
  assert.equal(scoreIntentAdvice(expected, { intents: [grouped] }).compoundCompleteness, true);
  assert.equal(scoreIntentAdvice(expected, { intents: [{ ...grouped, rooms: [1] }] }).compoundCompleteness, false);
  const improperSearch = { ...grouped, kind: "listing_search" as const };
  assert.equal(parseIntentAdvice(JSON.stringify({ intents: [improperSearch] }), options.latest, 0, false), null);
  assert.equal(scoreIntentAdvice(expected, { intents: [improperSearch] }).intent, false);
});

test("intent snapshots omit availability of property facts and server rendering distinguishes zero from missing", async () => {
  const { receptionistDecisionSnapshot } = await import("../src/services/receptionist-decision.js");
  const { propertyFactReply, requestedPropertyFacts } = await import("../src/services/property-facts.js");
  const listing = { price: 27000, currency: "TRY", title: "Synthetic second property", facts: { maintenanceFee: 0 } };
  const snapshot = { realEstate: true, preferences: undefined, display: [listing], focusPosition: 1, pendingViewing: null };
  const intent = receptionistDecisionSnapshot(snapshot, "intent");
  assert.doesNotMatch(intent, /maintenanceFee|deposit|furnished|currentlyVerified|27000/);
  assert.match(receptionistDecisionSnapshot(snapshot), /"maintenanceFee":0,"deposit":null/);
  const response = propertyFactReply(listing, requestedPropertyFacts("Aidat ve depozito belli mi?"), "tr");
  assert.match(response, /aidat: 0 TL/);
  assert.match(response, /depozito .*doğrulanmamış/);
});

test("the exact integrated Luna quote matches only a unique current-turn question clause", () => {
  const text = "Eşyalı mı, hafta sonu görebilir miyim?";
  const raw = recordedLunaPlans[1];
  const plan = parseIntentAdvice(raw, text, 2, true);
  assert.equal(plan?.intents.length, 2);
  assert.deepEqual(plan?.evidenceMatches[0], {
    quote: "Eşyalı mı?", span: "Eşyalı mı,", start: 0, end: 10, kind: "clause_separator",
  });
  assert.equal(plan?.evidenceMatches[1]?.kind, "exact");
  assert.equal(parseIntentAdvice(raw, text, 2, false), null);
  for (const latest of [
    "Eşyalı olsun. Hafta sonu görebilir miyim?",
    "Eşyalı mı. hafta sonu görebilir miyim?",
    "Eşyalı mı; hafta sonu görebilir miyim?",
    "Eşyalı mı? Eşyalı mı, hafta sonu görebilir miyim?",
    "Eşyalı mı, Eşyalı mı, hafta sonu görebilir miyim?",
    "hafta sonu görebilir miyim?",
  ]) assert.equal(parseIntentAdvice(raw, latest, 2, true), null, latest);
});

test("evidence matching preserves authorization language, ordinals, numbers and identity", () => {
  const pairs = [
    ["Onaylamayalım", "onaylayalım"],
    ["onaylayalım", "onaylamayalım"],
    ["Randevu oluştur", "Randevu oluşturma"],
    ["İlk ilan", "ikinci ilan"],
    ["27.000 TL", "37.000 TL"],
    ["27", "27.000 TL"],
    ["2.", "2.000 TL"],
    ["2", "2+1"],
    ["000 TL", "37.000 TL"],
    ["1+1", "2+1"],
    ["1+1", "11+1"],
    ["Görükle", "Görüklede"],
    ["Eşyalı mı", "Eşyalı değil mi"],
  ];
  for (const [quote, latest] of pairs) {
    const claimed = item("booking", "request", quote!);
    assert.equal(parseIntentAdvice(JSON.stringify({ intents: [claimed] }), latest!, 2, true), null, latest);
  }
});
