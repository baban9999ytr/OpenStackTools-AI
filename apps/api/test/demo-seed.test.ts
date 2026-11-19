import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { demoConsultants, demoListings, DEMO_ORGANIZATION_NAME, DEMO_OWNER_EMAIL } from "../src/scripts/demo-data.js";

let replica: MongoMemoryReplSet;
const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const execFileAsync = promisify(execFile);
const runSeed = async (url: string, extra: Record<string, string> = {}) => (await execFileAsync(process.execPath,
  ["--import", "tsx", "src/scripts/seed-demo.ts"], {
    cwd: apiRoot, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_ENV: "development", MONGODB_URL: url,
      SESSION_SECRET: "test-only-demo-session-secret-32-characters", OPENAI_API_KEY: "unused-test-key", OPENAI_MODEL: "test-model",
      DEFAULT_DAILY_BUDGET_USD: "1", DEFAULT_MONTHLY_BUDGET_USD: "10",
      OPENAI_INPUT_USD_PER_MILLION_TOKENS: "1", OPENAI_OUTPUT_USD_PER_MILLION_TOKENS: "1",
      DASHBOARD_ORIGIN: "http://localhost:5173", SMTP_HOST: "localhost", SMTP_FROM: "test@example.test",
      DEMO_SEED_CONFIRM: "local-demo-only", DEMO_OWNER_PASSWORD: "local-demo-password-for-tests-only", ...extra },
  })).stdout;

before(async () => { replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } }); });
after(async () => { await mongoose.disconnect(); await replica?.stop(); });

test("demo seed is isolated, idempotent and never claims the requested Gmail account", async () => {
  const url = replica.getUri("demo_seed_test");
  await mongoose.connect(url);
  const { User, Organization, Membership, Listing, Appointment, StaffAvailability, DemoSeed } = await import("../src/models/index.js");
  const original = await User.create({ email: "test@gmail.com", name: "Existing unrelated owner", passwordHash: "unchanged-hash" });
  await mongoose.disconnect();
  assert.match(await runSeed(url), /13 listings, 3 consultants, 2 occupied appointment fixtures/);
  assert.match(await runSeed(url), /No records changed/);
  await mongoose.connect(url);
  assert.equal((await User.findById(original._id).select("+passwordHash").lean())?.passwordHash, "unchanged-hash");
  const org = await Organization.findOne({ name: DEMO_ORGANIZATION_NAME }).lean();
  assert.ok(org);
  assert.equal(org.timeZone, "Europe/Istanbul");
  const owner = await User.findOne({ email: DEMO_OWNER_EMAIL }).lean();
  assert.ok(owner?.emailVerifiedAt);
  assert.ok(await Membership.exists({ organizationId: org._id, userId: owner._id, role: "owner" }));
  assert.equal(await Listing.countDocuments({ organizationId: org._id }), demoListings.length);
  assert.equal(await StaffAvailability.countDocuments({ organizationId: org._id }), demoConsultants.length);
  const consultants = await StaffAvailability.find({ organizationId: org._id }).lean();
  assert.ok(consultants.every((item) => item.services.length > 0 && item.appointmentDurationsMinutes.includes(30) && item.windows.length === 5));
  assert.equal(await Appointment.countDocuments({ organizationId: org._id, status: "booked" }), 2);
  const occupied = await Appointment.findOne({ organizationId: org._id, status: "booked" }).lean();
  assert.ok(occupied);
  const { checkAvailability, localParts } = await import("../src/services/appointments.js");
  const occupiedDate = localParts(occupied.startAt, "Europe/Istanbul").date;
  const openSlots = await checkAvailability(org._id, occupied.staffId, occupiedDate, 30);
  assert.equal(openSlots.some((slot) => slot.startAt === occupied.startAt.toISOString()), false);
  assert.ok(openSlots.length > 0);
  assert.equal((await checkAvailability(org._id, occupied.staffId, occupiedDate, 45)).length, 0);
  assert.ok(await DemoSeed.exists({ _id: "nilufer-demo-emlak-v1", organizationId: org._id }));
  const { searchListings } = await import("../src/services/business-data.js");
  const matches = await searchListings(org._id, { location: "Bursa Nilüfer", budgetMax: 30_000,
    currency: "TRY", listingType: "rent", propertyType: "apartment", minRooms: 3 });
  assert.equal(matches.length, 2);
  assert.equal((await searchListings(org._id, { location: "Nilüfer", budgetMax: 10_000, currency: "TRY", listingType: "rent" })).length, 0);
  assert.equal((await searchListings(new mongoose.Types.ObjectId(), { location: "Nilüfer" })).length, 0);
  assert.equal((await searchListings(org._id, { location: "Ertuğrul", listingType: "rent" })).length, 0);
  assert.equal((await searchListings(org._id, { location: "İhsaniye", listingType: "rent" })).length, 0);
  await mongoose.disconnect();
});

test("demo seed refuses existing synthetic identity and production mode", async () => {
  const url = replica.getUri("demo_conflict_test");
  await mongoose.connect(url);
  const { User } = await import("../src/models/index.js");
  await User.create({ email: DEMO_OWNER_EMAIL, name: "Unrelated owner", passwordHash: "keep-this" });
  await mongoose.disconnect();
  await assert.rejects(runSeed(url), /refusing to take ownership/);
  await assert.rejects(runSeed(url, { NODE_ENV: "production", DASHBOARD_ORIGIN: "https://localhost" }), /Demo seed requires/);
  await mongoose.connect(url);
  assert.equal((await User.findOne({ email: DEMO_OWNER_EMAIL }).select("+passwordHash").lean())?.passwordHash, "keep-this");
});
