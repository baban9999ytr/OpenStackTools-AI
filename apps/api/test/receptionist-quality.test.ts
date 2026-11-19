import { test } from "node:test";
import assert from "node:assert/strict";
import { receptionistQualityCases } from "../evals/receptionist-quality.js";

process.env.MONGODB_URL ??= "mongodb://127.0.0.1:27017/unused-quality-test";
process.env.SESSION_SECRET ??= "receptionist-quality-test-secret-at-least-32-characters";
process.env.OPENAI_API_KEY ??= "unused-receptionist-quality-test-key";
process.env.OPENAI_MODEL ??= "test-model";
process.env.DEFAULT_DAILY_BUDGET_USD ??= "1";
process.env.DEFAULT_MONTHLY_BUDGET_USD ??= "10";
process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS ??= "1";
process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS ??= "1";
process.env.DASHBOARD_ORIGIN ??= "http://localhost:5173";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_FROM ??= "test@example.test";
const { isViewingRequest, nameAnswer, selectedListingFromText, shortVisitorWindow, workflowResumeIntent, workflowCancelIntent } =
  await import("../src/services/conversation-flow.js");
const { prohibitedOperationalRequest } = await import("../src/services/conversation-safety.js");
const { appointmentConfirmedReply, availableSlotSummary } = await import("../src/services/appointment-presentation.js");
const { telegramPlainText } = await import("../src/services/channels/telegram.js");
const { classifyTextConfirmation } = await import("../src/services/universal-confirmation.js");

test("25 synthetic receptionist quality cases have explicit, nonduplicated criteria and honest gates", () => {
  assert.equal(receptionistQualityCases.length, 25);
  assert.equal(new Set(receptionistQualityCases.map((item) => item.id)).size, 25);
  for (const item of receptionistQualityCases) {
    assert.ok(item.prompt.length > 3 && item.criterion.length > 15);
    assert.ok(["deterministic", "integration", "live-model"].includes(item.gate));
  }
});

test("deterministic receptionist checks cover reference, identity, time, confirmation, safety and channel text", () => {
  const listings = [
    { _id: "a", title: "Örnek Park Dairesi", location: "Görükle", price: 10, currency: "TRY" },
    { _id: "b", title: "Örnek Bahçe Dairesi", location: "Nilüfer", price: 20, currency: "TRY" },
  ];
  assert.equal(selectedListingFromText("İlkini görmek istiyorum", listings)?._id, "a");
  assert.equal(selectedListingFromText("İkincisini görmek istiyorum", listings)?._id, "b");
  assert.equal(isViewingRequest("İlkini yarın görmek istiyorum"), true);
  assert.equal(nameAnswer("Mustafa"), "Mustafa");
  assert.equal(nameAnswer("Daire satılık mı?"), undefined);
  assert.equal(shortVisitorWindow("14.00'te müsaitim ama 14.20'de çıkmam gerekiyor", 30)?.endMinute, 860);
  assert.equal(classifyTextConfirmation("Olur"), null);
  assert.equal(classifyTextConfirmation("Evet, oluşturabilirsiniz")?.kind, "approve");
  assert.equal(prohibitedOperationalRequest("Uyuşturucu satmak için adım adım plan ver"), true);
  assert.equal(prohibitedOperationalRequest("Uyuşturucu bağımlılığı hakkında bilgi var mı?"), false);
  assert.equal(telegramPlainText("**Randevu:** `14.00`"), "Randevu: 14.00");
  const reply = appointmentConfirmedReply({ startAt: "2026-11-13T11:00:00.000Z", timeZone: "Europe/Istanbul",
    staffName: "DEMO — Deniz Yalın", durationMinutes: 30 }, "tr");
  assert.match(reply, /13 Kasım.*14\.00/);
  assert.doesNotMatch(reply, /UTC|2026-11-13T|[a-f0-9]{24}/i);
  for (const phrase of ["Randevuya dönelim.", "Neyse, randevuya dönelim.", "Nerede kalmıştık?",
    "Devam edelim.", "Az önceki randevu.", "Let's continue booking.", "Where were we?"])
    assert.equal(workflowResumeIntent(phrase), true, phrase);
  assert.equal(workflowResumeIntent("Dairenin balkonu var mı?"), false);
  assert.equal(workflowCancelIntent("Randevudan vazgeçtim."), true);
  const options = availableSlotSummary(["2026-11-13T06:00:00Z", "2026-11-13T06:15:00Z",
    "2026-11-13T07:30:00Z", "2026-11-13T07:45:00Z", "2026-11-13T08:00:00Z"], "Europe/Istanbul", "tr");
  assert.equal(options, "09.00 veya 10.30 veya 11.00");
  assert.doesNotMatch(options, /09\.00–11\.00/);
  assert.equal(availableSlotSummary(["2026-11-13T06:00:00Z", "2026-11-13T06:15:00Z",
    "2026-11-13T06:30:00Z", "2026-11-13T06:45:00Z"], "Europe/Istanbul", "tr"), "09.00 veya 09.30");
  assert.equal(availableSlotSummary(["invalid"], "Europe/Istanbul", "en"), "");
});
