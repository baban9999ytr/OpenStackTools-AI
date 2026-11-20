import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, readFile, readdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { recordedLunaPlans } from "./apps/api/evals/luna-integrated-widget-fixture.js";
import { DEMO_OWNER_EMAIL, DEMO_ORGANIZATION_NAME } from "./apps/api/src/scripts/demo-data.js";
import type { AIResponder } from "./apps/api/src/services/ai.js";

const origin = "http://127.0.0.1:5198";
const dist = fileURLToPath(new URL("./apps/web/dist/", import.meta.url));
await access(join(dist, "embed.js"));
const cssAssets = new Map<string, string>();
for (const asset of await readdir(join(dist, "assets"))) {
  if (!asset.endsWith(".css")) continue;
  const css = await readFile(join(dist, "assets", asset), "utf8");
  cssAssets.set(asset, css.replace(/@import\s+["']https:\/\/fonts\.googleapis\.com\/[^"']+["'];?/g, ""));
}
for (const key of Object.keys(process.env)) {
  if (/^(?:OPENAI_|AI_|EVAL_|SMTP_|TELEGRAM_|CHANNEL_CREDENTIAL_)/.test(key)) delete process.env[key];
}

const localFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== origin) return Promise.reject(new Error("Offline demo only permits its loopback origin"));
  return localFetch(input, { ...init, redirect: "error" });
};

process.env.MONGOMS_RUNTIME_DOWNLOAD = "false";
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: "127.0.0.1" }, binary: { version: "8.0.12", checkMD5: true } });
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
try {
  const password = randomBytes(24).toString("base64url");
  Object.assign(process.env, {
    NODE_ENV: "test", DOTENV_CONFIG_PATH: "/dev/null", LOG_LEVEL: "silent",
    MONGODB_URL: mongo.getUri("astra_private_demo"), DASHBOARD_ORIGIN: origin,
    SESSION_SECRET: randomBytes(32).toString("hex"), COOKIE_SECURE: "false", TRUST_PROXY: "0",
    OPENAI_API_KEY: "offline-demo-placeholder", OPENAI_MODEL: "offline-legacy-model",
    OPENAI_INPUT_USD_PER_MILLION_TOKENS: "0.10", OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "0.50",
    OPENAI_MAX_COMPLETION_TOKENS: "512", DEFAULT_DAILY_BUDGET_USD: "0.10", DEFAULT_MONTHLY_BUDGET_USD: "0.10",
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_FROM: "demo@example.test",
    AI_ENABLED_MODELS: "gpt-6-luna", AI_MAX_REASONING_EFFORT: "none",
    AI_EXPERIMENTAL_RECEPTIONIST_INTENTS: "true", TELEGRAM_SELF_SERVICE_ENABLED: "false",
  });

  const { createApp } = await import("./apps/api/src/app.js");
  const { Assistant, Listing, Organization, StaffAvailability, User } = await import("./apps/api/src/models/index.js");
  await mongoose.connect(process.env.MONGODB_URL!);
  // The existing seed writes in a transaction. Finish collection and index
  // creation first so startup DDL cannot compete with that transaction.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  const seed = fileURLToPath(new URL("./apps/api/src/scripts/seed-demo.ts", import.meta.url));
  await promisify(execFile)(process.execPath, ["--import", "tsx", seed], {
    env: { ...process.env, DEMO_OWNER_PASSWORD: password, DEMO_SEED_CONFIRM: "local-demo-only" }, timeout: 30_000,
  }).catch(() => { throw new Error("Synthetic demo seeding did not complete"); });

  const org = await Organization.findOne({ name: DEMO_ORGANIZATION_NAME }).orFail();
  const scope = { organizationId: org._id };
  const consultant = await User.findOne({ email: "deniz.yalin@openstacktools.test" }).orFail();
  const hours = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 840, endMinute: 930 }));
  await Organization.updateOne({ _id: org._id }, { openingHours: hours });
  await StaffAvailability.updateOne({ ...scope, staffId: consultant._id }, { windows: hours, services: ["property viewing"] });
  const garden = await Listing.findOneAndUpdate({ ...scope, title: "DEMO — Örnek Bahçe Dairesi" },
    { $set: { facts: { maintenanceFee: 0, furnished: false } } }, { returnDocument: "after" }).orFail();
  // Keep the customer's second-listing reference predictable in this disposable demo.
  await Listing.collection.updateOne({ ...scope, _id: garden._id }, { $set: { updatedAt: new Date(Date.now() - 60_000) } });
  const assistant = await Assistant.findOneAndUpdate(scope, { $set: {
    name: "DEMO — Nilüfer Emlak (Çevrimdışı)", conversationStrategy: "real_estate", bookingNameRequired: false,
    modelSelection: { mode: "custom", profile: "economical", model: "gpt-6-luna", reasoningEffort: "none", processingTier: "default" },
  } }, { returnDocument: "after" }).orFail();

  const respond: AIResponder = async () => ({
    text: "Bu çevrimdışı demo için ana sayfadaki örnek konuşmayı kullanabilirsiniz.", inputTokens: 0, outputTokens: 0,
  });
  respond.interpretIntent = async (_instructions, history) => {
    const text = history.at(-1)?.text ?? "";
    const plan = text === "İkinci evin depozitosunu ve aidatını ayrı ayrı söyler misin?" ? recordedLunaPlans[0]
      : text === "Eşyalı mı, hafta sonu görebilir miyim?" ? recordedLunaPlans[1]
        : JSON.stringify({ intents: [{ kind: "other", mode: "unclear", evidence: text.slice(0, 160),
          reference: { kind: "none", position: null }, attributes: [], locations: [], rooms: [], furnishing: null, uncertainty: [] }] });
    return { text: plan, inputTokens: 0, outputTokens: 0 };
  };

  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (req.get("host") !== new URL(origin).host) { res.sendStatus(403); return; }
    res.set("Cache-Control", "no-store");
    res.set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
    next();
  });
  app.get("/", (_req, res) => res.type("html").send(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASTRA · Özel çevrimdışı demo</title><link rel="stylesheet" href="/assistant-preview.css">
    <body><main><h1>ASTRA · Özel çevrimdışı demo</h1>
    <p>Bu ortamda tüm ilanlar, kişiler ve randevular kurgusaldır. Gerçek müşteri bilgisi girmeyin. Yanıtlar yerel örneklerle çalışır ve yapay zekâ sağlayıcısına istek gönderilmez.</p>
    <p><a href="/assistant-preview.html?assistant=${assistant.publicKey}&amp;lang=tr&amp;theme=dark">Sohbet demosunu aç</a></p>
    <p><a href="/app">İşletme panelini aç</a></p>
    <h2>Örnek konuşma</h2><ol>
      <li>Bursa Nilüfer'de 30.000 TL altında kiralık 3+1 daire arıyorum.</li>
      <li>İki ilanı karşılaştır, hangisini önerirsin?</li>
      <li>İkinci evin depozitosunu ve aidatını ayrı ayrı söyler misin?</li>
      <li>Eşyalı mı, hafta sonu görebilir miyim?</li>
      <li>Sunulan tarihi ve saati yazın. Sonra “Olur gibi ama kesinleştirmeyelim.” yazıp sayfayı yenileyin.</li>
      <li>Örnek randevuyu kaydetmek için “Evet, randevuyu onaylıyorum.” yazın.</li>
    </ol></main></body></html>`));
  app.get("/assets/:asset", (req, res, next) => {
    const css = cssAssets.get(req.params.asset);
    if (css === undefined) { next(); return; }
    res.type("css").send(css);
  });
  app.use(express.static(dist, { index: false }));
  app.get(["/app", "/app/{*path}"], (_req, res) => res.sendFile(join(dist, "index.html")));
  app.use(createApp(respond));

  await new Promise<void>((resolve, reject) => {
    server = app.listen(5198, "127.0.0.1", (error) => error ? reject(error) : resolve());
    server.once("error", reject);
  });
  const privateDir = await mkdtemp(join(tmpdir(), "astra-demo-login-"));
  await chmod(privateDir, 0o700);
  const login = join(privateDir, "owner.txt");
  await writeFile(login, `E-posta: ${DEMO_OWNER_EMAIL}\nParola: ${password}\n`, { mode: 0o600, flag: "wx" });
  console.log(`Demo: ${origin}/\nYönetici giriş bilgileri: ${login}\nKapatmak için Ctrl+C.`);

  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
} finally {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  await mongoose.disconnect();
  await mongo.stop();
}
