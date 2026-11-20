import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { initial, type Scenario } from "./customer-qa-corpus.js";
import type { AIResponder } from "../src/services/ai.js";

const origin = "https://synthetic-qa.example.test";
const report = process.argv[2];
assert.ok(report, "Pass a new transcript path in a private directory");
const [mode, ...args] = process.argv.slice(3);
const holdoutMode = mode === "--holdout" || mode === "--blocker-holdout";
const selected = holdoutMode ? args : process.argv.slice(3);
const catalogue: Scenario[] = holdoutMode
  ? (await import("./customer-qa-holdout.js"))[mode === "--holdout" ? "holdout" : "finalBlockerHoldout"]
  : initial;
const suite = catalogue.filter(({ id }) => !selected.length || selected.includes(id));
assert.ok(suite.length && suite.length <= (holdoutMode ? 10 : 30) && new Set(suite.map(({ id }) => id)).size === suite.length);
assert.ok(selected.every((id) => suite.some((scenario) => scenario.id === id)));

Object.assign(process.env, {
  NODE_ENV: "test", DOTENV_CONFIG_PATH: "/dev/null", LOG_LEVEL: "silent",
  SESSION_SECRET: "synthetic-qa-secret-at-least-32-characters", DASHBOARD_ORIGIN: "http://127.0.0.1:5173",
  MONGODB_URL: "mongodb://127.0.0.1:1/offline", MONGOMS_RUNTIME_DOWNLOAD: "false",
  OPENAI_API_KEY: "offline-placeholder", OPENAI_MODEL: "qa-fixture", OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1",
  OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1", AI_EXPERIMENTAL_RECEPTIONIST_INTENTS: "true",
  DEFAULT_DAILY_BUDGET_USD: "1", DEFAULT_MONTHLY_BUDGET_USD: "1", SMTP_HOST: "127.0.0.1", SMTP_FROM: "qa@example.test",
});
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("Network disabled in customer QA"); };
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: "127.0.0.1" }, binary: { version: "8.0.12" } });
const scrub = (value: string) => value.replace(/(?:misafir|diger)@example\.test|\+905550000001|Örnek Ziyaretçi/g, "[synthetic visitor detail]");

try {
  const { createApp } = await import("../src/app.js");
  const { Assistant, Appointment, BusinessKnowledge, Conversation, Customer, Listing, Membership, Organization, StaffAvailability, User } =
    await import("../src/models/index.js");
  const { demoListings } = await import("../src/scripts/demo-data.js");
  const { localParts } = await import("../src/services/appointments.js");
  await mongoose.connect(mongo.getUri("astra_customer_qa"));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  const owner = await User.create({ email: "qa-owner@example.test", name: "Synthetic consultant", passwordHash: "offline-only-hash" });
  const foreign = await Organization.create({ name: "Separate synthetic tenant", dailyBudgetMicros: 1_000_000, monthlyBudgetMicros: 1_000_000 });
  await Listing.create({ ...demoListings[1], organizationId: foreign._id, title: "Foreign canary", facts: { maintenanceFee: 987654 } });
  await Customer.collection.insertOne({ organizationId: foreign._id, name: "Foreign visitor canary", contact: "foreign-visitor@example.test" });
  let fixtureCalls = 0;
  const respond: AIResponder = async () => {
    fixtureCalls++;
    return { text: "", inputTokens: 0, outputTokens: 0 };
  };
  respond.interpretIntent = async (_instructions, history) => {
    fixtureCalls++;
    return { text: JSON.stringify({ intents: [{ kind: "other", mode: "unclear", evidence: history.at(-1)?.text.slice(0, 160),
      reference: { kind: "none", position: null }, attributes: [], locations: [], rooms: [], furnishing: null, uncertainty: [] }] }),
    inputTokens: 0, outputTokens: 0 };
  };
  const app = createApp(respond);
  app.set("trust proxy", 1);
  const hours = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 840, endMinute: 900 }));
  const zone = "Europe/Istanbul";
  async function run(scenario: Scenario, index: number) {
    const org = await Organization.create({ name: scenario.id, timeZone: zone, openingHours: hours,
      dailyBudgetMicros: 1_000_000, monthlyBudgetMicros: 1_000_000 });
    const publicKey = `ost_${crypto.randomUUID()}`;
    await Promise.all([
      Assistant.create({ publicKey, name: "Sentetik emlak asistanı", instructions: "Synthetic QA only.",
        organizationId: org._id, allowedOrigins: [origin], conversationStrategy: "real_estate",
        bookingNameRequired: true, bookingContactMethod: "either" }),
      Membership.create({ organizationId: org._id, userId: owner._id, role: "owner" }),
      StaffAvailability.create({ organizationId: org._id, staffId: owner._id, windows: hours, services: ["property viewing"] }),
      BusinessKnowledge.create({ organizationId: org._id, contact: { email: "ofis@example.test", phone: "555-0100" } }),
      Listing.create(demoListings.slice(0, 3).map((listing, order) => ({ ...listing, organizationId: org._id,
        updatedAt: new Date(Date.now() - order * 60_000),
        facts: order === 0 ? { maintenanceFee: 650, deposit: 27_500, furnished: true }
          : order === 1 ? { maintenanceFee: 0, furnished: false } : {},
      }))),
    ]);
    const headers = { Origin: origin, "X-Forwarded-For": `192.0.2.${index + 30}` };
    const session = await request(app).post("/api/widget/sessions").set(headers).send({ publicKey, locale: "tr" });
    assert.equal(session.status, 201, scenario.id);
    const auth = { ...headers, Authorization: `Bearer ${session.body.token}` };
    let conversationId: string | undefined;
    let previousReply = "";
    let lastMessageId = "";
    let previousAppointments = 0;
    const turns = [];
    for (const step of scenario.steps) {
      const issues: string[] = [];
      let text = step.text;
      if (text.startsWith("$")) {
        const workflow = await Conversation.findOne({ _id: conversationId, organizationId: org._id }).lean();
        const slot = workflow?.workflow?.offeredSlots?.[0]?.startAt;
        if (!slot) {
          turns.push({ kind: "not_sent", input: text, issues: ["No verified slot was offered"] });
          continue;
        }
        const { date, minute } = localParts(new Date(slot), zone);
        const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
        text = `${date} saat ${clock}${text === "$deferredSlot" ? " Olur gibi ama kesinleştirmeyelim." : ""}`;
      }
      if (step.reload) {
        const history = await request(app).get(`/api/widget/conversations/${conversationId}/messages`).set(auth);
        if (history.status !== 200 || history.body.messages?.at(-1)?.text !== previousReply) issues.push("Reload lost the prior reply");
        if (scrub(JSON.stringify(history.body)) !== JSON.stringify(history.body)) issues.push("History disclosed intake data");
      }
      const clientMessageId = step.replay ? lastMessageId : crypto.randomUUID();
      const payload = { conversationId, text, clientMessageId };
      const send = () => request(app).post("/api/widget/messages").set(auth).send(payload);
      let response = await send();
      const retryAfter: number[] = [];
      // Obey real fixed-window throttling using the original visitor and message ID.
      while (response.status === 429 && retryAfter.length < 2) {
        const seconds = Number(response.headers["retry-after"]);
        if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) break;
        retryAfter.push(seconds);
        await wait(seconds * 1000 + 150);
        response = await send();
      }
      const reply: string = response.body.reply?.text ?? "";
      conversationId = response.body.conversationId ?? conversationId;
      if (!step.replay) lastMessageId = clientMessageId;
      previousReply = reply;
      if (![201, 202].includes(response.status)) issues.push(`HTTP ${response.status}`);
      for (const expected of step.expect) if (!expected.test(reply)) issues.push(`Missing ${expected.source}`);
      if (step.avoid?.test(reply)) issues.push(`Unexpected ${step.avoid.source}`);
      if (/İlanları karşılaştırabilir|Foreign canary|Foreign visitor canary|foreign-visitor@example|987[.,]?654/.test(reply)) issues.push("Generic fallback or foreign data");
      if (step.booking && response.body.action?.status !== step.booking) issues.push(`Expected action ${step.booking}`);
      if (!step.booking && response.body.action?.name === "create_appointment" && response.body.action?.status === "completed")
        issues.push("Unexpected booking completion");
      const scope = { _id: conversationId, organizationId: org._id };
      if (step.contactMethod) {
        const current = await Conversation.findOne(scope).select("+bookingIntake").lean();
        if (current?.bookingIntake?.method !== step.contactMethod || current.bookingIntake.consentAt || current.bookingIntake.actionId)
          issues.push(`Expected a fresh consent step for ${step.contactMethod}`);
        if (scrub(reply) !== reply) issues.push("Reply echoed private intake data");
      }
      if (step.handoff && !(await Conversation.exists({ ...scope, status: "handoff" }))) issues.push("Handoff not persisted");
      const appointments = await Appointment.countDocuments({ organizationId: org._id });
      const expectedAppointments = previousAppointments + Number(step.booking === "completed" && !step.replay);
      if (appointments !== expectedAppointments) issues.push(`Expected ${expectedAppointments} appointments, found ${appointments}`);
      if (step.storedMethod) {
        const booked = await Appointment.findOne({ organizationId: org._id }).select("customerId").lean();
        const contact = booked?.customerId
          ? await Customer.findOne({ organizationId: org._id, _id: booked.customerId }).select("bookingContactMethod bookingConsentAt").lean()
          : undefined;
        if (contact?.bookingContactMethod !== step.storedMethod || !contact.bookingConsentAt)
          issues.push(`Confirmed booking lacked consent for ${step.storedMethod}`);
      }
      previousAppointments = appointments;
      turns.push({ kind: "sent", input: scrub(text), reply: scrub(reply), status: response.status, retryAfter, issues });
    }
    return { id: scenario.id, category: scenario.category, planned: scenario.steps.length, turns };
  }
  // Long chats run side by side so their independent rate windows can elapse concurrently.
  const results = await Promise.all(suite.map((scenario, index) => run(scenario, index)));
  await writeFile(report, JSON.stringify({ fixtureCalls, networkAttempts, results }, null, 2), { mode: 0o600, flag: "wx" });
  assert.equal(networkAttempts, 0);
  const sent = results.flatMap(({ turns }) => turns).filter(({ kind }) => kind === "sent");
  const failed = sent.filter(({ issues }) => issues.length);
  console.log(JSON.stringify({ conversations: results.length, sent: sent.length, failed: failed.length,
    blocked: results.reduce((total, { turns }) => total + turns.filter(({ kind }) => kind !== "sent").length, 0), fixtureCalls, networkAttempts }));
  if (failed.length || results.some(({ turns }) => turns.some(({ kind }) => kind !== "sent"))) process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}
