import assert from "node:assert/strict";
import { test } from "node:test";
import { extractBusinessTurn, mergeBusinessState, validateBusinessProposal } from "../src/services/business-conversation.js";
import { selectedListingFromText, isViewingRequest, simpleAssent } from "../src/services/conversation-flow.js";
import { listingFollowUpIntent } from "../src/services/customer-listings.js";
import { requestedContactFields } from "../src/services/business-data.js";
import { asksForWeekendViewing, propertyFactReply, requestedPropertyFacts } from "../src/services/property-facts.js";
import { decisionBoundary, receptionistDecisionContext } from "../src/services/receptionist-decision.js";

const id = "1234567890abcdef12345678";
const records = [
  { title: "Maple court flat", location: "Görükle", currency: "TRY", price: 30_000,
    facts: { furnished: false, maintenanceFee: 0 } },
  { title: "Cedar terrace home", location: "Özlüce", currency: "TRY", price: 38_000,
    facts: { deposit: 15_000 } },
];
const priorText = "Görükle'de kiralık 3+1 daire arıyorum, bütçem 35000 TL.";
const prior = mergeBusinessState(undefined, extractBusinessTurn(priorText, id));

const facts = [
  ["Aidat belli mi?", ["maintenanceFee"]],
  ["Bu dairenin depozitosu?", ["deposit"]],
  ["İkinci ilanın aidatı ve depozitosu belli mi?", ["maintenanceFee", "deposit"]],
  ["Eşyali mi?", ["furnished"]],
  ["Earlier flat: is it furnished?", ["furnished"]],
  ["Metro yürüyerek kaç dk?", ["transit"]],
  ["Who owns this and what's the deposit?", ["deposit", "ownership"]],
  ["Bina yaşı nedir, 1st flat?", ["buildingAge"]],
  ["Tapu kimde?", ["ownership"]],
  ["Maintenance fee ve depozito, ikisi de?", ["maintenanceFee", "deposit"]],
  ["Eşyalı mı, hafta sonu görebilir miyim?", ["furnished"]],
  ["Metro yürüyerek kaç dakika, tapu kimin üstüne?", ["transit", "ownership"]],
] as const;
const references = [
  ["İlkini görmek istiyorum.", 0], ["İkinci dairenin aidatı ne?", 1],
  ["Yok, ilk ilanın depozitosunu sordum.", 0], ["The 2nd one please", 1],
  ["Ucuz olan", 0], ["Cedar terrace home eşyalı mı?", 1],
  ["First or second, which has a balcony?", undefined], ["O evin aidatı?", undefined],
] as const;
const inventory = [
  ["İki ilanı karşılaştır, hangisini önerirsin?", "recommend"],
  ["Cheapest first, lütfen", "sort"], ["Farklı bir mahalleye bakalım", "broaden"],
  ["Bu sefer 4+1 olsun", "search"], ["Peki onun için?", "reference"],
  ["İkinci ilanın aidatı ne kadar?", "attribute"], ["Çalışma saatleriniz nedir?", "topic"],
] as const;
const contact = [
  ["Thanks, just the contact email one more time, olur mu?", ["email"]],
  ["Web siteniz nedir?", ["website"]], ["Telefon ve email alabilir miyim?", ["email", "phone"]],
  ["E-posta adresiniz?", ["email"]], ["Office address, please", ["address"]],
] as const;

for (const [text, expected] of facts) test(`decision dataset facts: ${text}`, () => {
  assert.deepEqual(requestedPropertyFacts(text).map(([key]) => key), expected);
  assert.deepEqual(extractBusinessTurn(text, id).updates, {});
});
for (const [text, expected] of references) test(`decision dataset reference: ${text}`, () => {
  assert.equal(selectedListingFromText(text, records), expected === undefined ? undefined : records[expected]);
});
for (const [text, expected] of inventory) test(`decision dataset inventory: ${text}`, () => {
  assert.equal(listingFollowUpIntent(text, true), expected);
});
for (const [text, expected] of contact) test(`decision dataset contact: ${text}`, () => {
  assert.deepEqual(requestedContactFields(text), expected);
});

test("decision dataset alternative preferences keep OR values with current evidence and no budget", () => {
  const text = "Görükle veya Özlüce olur, 2+1 ya da 3+1 olabilir.";
  const proposal = { fields: [
    { field: "rooms", value: 2, evidence: text },
    { field: "rooms", value: 3, evidence: text },
    { field: "location", value: "Görükle", evidence: text },
    { field: "location", value: "Özlüce", evidence: text },
  ] };
  const verified = validateBusinessProposal(proposal, text, id);
  assert.deepEqual(verified?.alternatives, { rooms: [2, 3], location: ["Görükle", "Özlüce"] });
  assert.equal(verified?.updates.budget, undefined);
  assert.equal(validateBusinessProposal({ fields: [{ ...proposal.fields[0], value: "2+1 or 3+1" }] }, text, id), null);
});

test("decision dataset price history cannot furnish evidence for maintenance fees", () => {
  const text = "İkinci dairenin aidatı ne?";
  assert.equal(validateBusinessProposal({ fields: [{ field: "budget", value: 35000, evidence: "35000 TL" }] }, text, id), null);
  assert.deepEqual(mergeBusinessState(prior, extractBusinessTurn(text, id, prior)), prior);
});

test("decision dataset explicit budget correction uses the new amount", () => {
  const text = "Aslında 40000 TL bütçem var.";
  assert.equal(mergeBusinessState(prior, extractBusinessTurn(text, id, prior)).values.budget?.value, 40000);
});

test("decision dataset compound facts and viewing preserve both requests", () => {
  const text = "Bir de eşyalı mı, hafta sonu gezme ihtimalimiz var mı?";
  assert.equal(asksForWeekendViewing(text), true);
  assert.match(propertyFactReply(records[0], requestedPropertyFacts(text), "tr"), /eşyasız/);
  assert.equal(simpleAssent(text), false);
});

test("decision dataset contact history cannot authorize a viewing", () => {
  assert.equal(simpleAssent("Evet, e-posta adresinizi soruyorum."), false);
  assert.equal(isViewingRequest("I want to view the second property tomorrow."), true);
});

test("decision dataset conflicting property references remain ambiguous", () => {
  assert.equal(selectedListingFromText("Maple court flat / Cedar terrace home, aidat nedir?", records), undefined);
});

test("decision dataset opt-out has no interpretation that changes persisted budget", () => {
  const text = "Telefon numaramı vermek istemiyorum.";
  assert.ok(extractBusinessTurn(text, id, prior).refused.includes("phone"));
  assert.equal(mergeBusinessState(prior, extractBusinessTurn(text, id, prior)).values.budget?.value, 35000);
});

test("decision dataset unrelated question has no inventory, contact or booking intent", () => {
  const text = "Can you solve my calculus homework?";
  assert.equal(listingFollowUpIntent(text, true), "none");
  assert.deepEqual(requestedContactFields(text), []);
  assert.equal(isViewingRequest(text), false);
  assert.equal(simpleAssent(text), false);
});

// Held out from the representative prompt examples. These assertions use
// previously persisted state and records, with no fixture-generated model score.
test("held out: second displayed listing retains its ordinal after first becomes unavailable", () => {
  const summary = receptionistDecisionContext({ realEstate: true, preferences: prior, display: [undefined, records[1]],
    focusPosition: 2, pendingViewing: null });
  assert.match(summary, /"position":1,"currentlyVerified":false/);
  assert.match(summary, /"position":2,"currentlyVerified":true/);
  assert.match(summary, /"deposit":15000/);
  assert.doesNotMatch(summary, /Cedar terrace|bütçem|"evidence"|"requestId"/);
});

test("held out: comparison keeps zero and false separate from explicitly unknown", () => {
  const summary = receptionistDecisionContext({ realEstate: true, preferences: prior, display: records,
    focusPosition: null, pendingViewing: "customer_name" });
  assert.match(summary, /"maintenanceFee":0,"deposit":null,"furnished":false/);
  assert.match(summary, /"pendingViewing":"customer_name"/);
  assert.match(summary, /does not confirm the current operation/);
});

test("held out: 'O zaman ikincisi; aidat ve depozito?' grounds each fact", () => {
  const text = "O zaman ikincisini kastediyorum; aidat ve depozito?";
  const listing = selectedListingFromText(text, records);
  const reply = propertyFactReply(listing, requestedPropertyFacts(text), "tr");
  assert.match(reply, /aidat bilgisi .*doğrulanmamış/);
  assert.match(reply, /depozito: 15\.000 TL/);
});

test("held out: current-turn evidence cannot be a supplied state snapshot", () => {
  const query = "Balkonu var mı? O kadar.";
  assert.equal(validateBusinessProposal({ fields: [{ field: "rooms", value: 3, evidence: "3+1" }] }, query, id), null);
  assert.equal(selectedListingFromText(query, records), undefined);
});

test("Luna A/B requests keep history and choices, and only B sends the typed schema and turn boundary", async () => {
  Object.assign(process.env, {
    MONGODB_URL: "mongodb://127.0.0.1:27017/unused-luna-fixture",
    DASHBOARD_ORIGIN: "https://staging.example.invalid",
    SESSION_SECRET: "unused-synthetic-session-secret-32chars",
    OPENAI_API_KEY: "unused-synthetic-provider-key",
    OPENAI_MODEL: "gpt-6-luna", OPENAI_REASONING_EFFORT: "none",
    DEFAULT_DAILY_BUDGET_USD: "1", DEFAULT_MONTHLY_BUDGET_USD: "1",
    OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1", OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1",
    SMTP_HOST: "localhost", SMTP_FROM: "fixture@example.invalid",
  });
  const { createOpenAIResponder } = await import("../src/services/ai.js");
  const outgoing: Array<Record<string, any>> = [];
  const fixtureFetch: typeof fetch = async (_url, init) => {
    outgoing.push(JSON.parse(String(init?.body)));
    return Response.json({ model: "gpt-6-luna", status: "completed", output_text: "Hangi ilanı kastediyorsunuz?", output: [{
      type: "message", content: [{ type: "output_text", text: "Hangi ilanı kastediyorsunuz?" }],
    }], usage: { input_tokens: 12, output_tokens: 6 } });
  };
  const prompt = "Baseline instructions" + receptionistDecisionContext({ realEstate: true, preferences: prior, display: records,
    focusPosition: 2, pendingViewing: null });
  const history = [{ role: "customer" as const, text: priorText }, { role: "assistant" as const, text: "Two options." },
    { role: "customer" as const, text: "İkinci ilanın aidatı ne kadar?" }];
  for (const decisionContract of ["baseline", "improved"] as const)
    await createOpenAIResponder({ model: "gpt-6-luna", endpoint: "responses", apiKey: "fixture",
      maxCompletionTokens: 512, fetch: fixtureFetch, decisionContract })(prompt, history, true);
  const [a, b] = outgoing;
  assert.equal(a?.instructions, "Baseline instructions");
  assert.ok(b?.instructions.includes(decisionBoundary));
  assert.deepEqual(a?.input, b?.input);
  assert.equal(b?.input.at(-1).content, history.at(-1)?.text);
  assert.equal(a?.tool_choice, "auto");
  assert.equal(b?.tool_choice, "auto");
  assert.equal(b?.parallel_tool_calls, false);
  assert.deepEqual(a?.tools.map((tool: { name: string }) => tool.name), b?.tools.map((tool: { name: string }) => tool.name));
  const schema = b?.tools[0];
  assert.equal(schema.strict, true);
  const roomEntry = schema.parameters.properties.fields.items.anyOf[0];
  assert.deepEqual(roomEntry.properties.field.enum, ["rooms"]);
  assert.equal(roomEntry.properties.value.type, "integer");
});

test("held out: superficially similar landmarks do not change active location on a transit question", () => {
  const text = "Bu evden metroya yürüyerek kaç dakika?";
  assert.deepEqual(requestedPropertyFacts(text).map(([field]) => field), ["transit"]);
  assert.deepEqual(mergeBusinessState(prior, extractBusinessTurn(text, id, prior)), prior);
});

test("held out: unfurnished preference remains an explicit false when changed", () => {
  const text = "Aslında eşyasız olsun.";
  const proposal = { fields: [{ field: "furnished", value: false, evidence: text }] };
  assert.equal(validateBusinessProposal(proposal, text, id)?.updates.furnished?.value, false);
});

test("held out: title-holder information remains private even with a resolvable property", () => {
  const text = "Cedar terrace home, who owns this?";
  const listing = selectedListingFromText(text, records);
  assert.equal(listing, records[1]);
  assert.match(propertyFactReply(listing, requestedPropertyFacts(text), "en"), /cannot share/);
});

test("held out: a request to book a time is distinct from a fresh approval", () => {
  assert.equal(simpleAssent("Please reserve Saturday at 2."), false);
  assert.equal(asksForWeekendViewing("Can I view the second apartment next weekend?"), true);
});

test("each live contract arm rejects the historical and other arm approval", async () => {
  const { assertPhase2gEnvelope, lunaContractApprovals } = await import("../evals/benchmark-admission.js");
  const limits = { global: 80_000, perModel: 80_000, requests: 7 };
  const profile = { profile: "standard", maxOutputTokens: 512, effort: "none" };
  for (const arm of ["a", "b"] as const) {
    const attestations = { EVAL_VERIFIED_MODELS: "gpt-6-luna", EVAL_PRICE_CHECKED_AT: "2026-11-19T12:00:00Z",
      EVAL_PROVIDER_QUOTA_CONFIRMED: "1", EVAL_PROVIDER_PROJECT_LIMIT_REVIEWED: "1", EVAL_2I_EXECUTE_APPROVED: "1",
      [lunaContractApprovals[arm === "a" ? "b" : "a"]]: "1" };
    const admit = (environment: NodeJS.ProcessEnv) =>
      assertPhase2gEnvelope(environment, 7, 10_259, limits, profile, false, false, arm);
    assert.throws(() => admit(attestations), /requires separate execution approval/);
    assert.doesNotThrow(() => admit({ ...attestations, [lunaContractApprovals[arm]]: "1" }));
  }
});
