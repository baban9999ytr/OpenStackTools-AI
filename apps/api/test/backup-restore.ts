// Isolated rehearsal against an ephemeral MongoDB replica set. Never point this
// script at an external database; the URI is created in this process.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AgentAction, Appointment, AppointmentSlot, Assistant, BusinessKnowledge, Conversation, Customer, Listing, Membership, Message, Organization, StaffAvailability, User } from "../src/models/index.js";

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
const backupDir = mkdtempSync(join(tmpdir(), "ost-restore-test-"));
try {
  await mongoose.connect(replica.getUri("pilot_source"));
  await Promise.all(Object.values(mongoose.connection.models).map(model => model.init()));
  const first = await Organization.create({ name: "Restore A", dailyBudgetMicros: 1000, monthlyBudgetMicros: 10000 });
  const second = await Organization.create({ name: "Restore B", dailyBudgetMicros: 1000, monthlyBudgetMicros: 10000 });
  for (const organization of [first, second]) {
    const owner = await User.create({ email: `restore-${organization.id}@example.test`, name: "Synthetic owner", passwordHash: "test-only-hash" });
    await Membership.create({ organizationId: organization._id, userId: owner._id, role: "owner" });
    const assistant = await Assistant.create({ organizationId: organization._id, name: "Restore assistant", instructions: "Test only", publicKey: `ost_restore_${organization.id}`, allowedOrigins: [] });
    const conversation = await Conversation.create({ organizationId: organization._id, assistantId: assistant._id, visitorId: `visitor_${organization.id}` });
    await Message.create({ organizationId: organization._id, conversationId: conversation._id, role: "customer", text: `Isolated test message for ${organization.name}` });
    await StaffAvailability.create({ organizationId: organization._id, staffId: owner._id, windows: [{ day: 1, startMinute: 540, endMinute: 1020 }] });
    const customer = await Customer.create({ organizationId: organization._id, conversationId: conversation._id,
      visitorId: conversation.visitorId, identityKey: `${conversation.id}:${conversation.visitorId}`,
      name: "Synthetic visitor", contact: "visitor@example.test", request: "Viewing",
      consent: { recorded: true, source: "synthetic_restore", at: new Date() }, leadStatus: "qualified" });
    const startAt = new Date("2027-02-01T10:00:00.000Z");
    const appointment = await Appointment.create({ organizationId: organization._id, staffId: owner._id,
      customerId: customer._id, conversationId: conversation._id, visitorId: conversation.visitorId,
      startAt, endAt: new Date("2027-02-01T10:30:00.000Z"), status: "booked", createdBy: "widget" });
    await AppointmentSlot.create({ organizationId: organization._id, staffId: owner._id, appointmentId: appointment._id, startAt });
    await AgentAction.create({ organizationId: organization._id, assistantId: assistant._id, conversationId: conversation._id,
      visitorId: conversation.visitorId, name: "create_appointment", arguments: { staffId: owner.id },
      result: { appointmentId: appointment.id }, status: "completed", idempotencyKey: `restore:${organization.id}` });
    await BusinessKnowledge.create({ organizationId: organization._id, profile: "Synthetic office",
      faqs: [{ question: "Opening?", answer: "Synthetic hours" }] });
    await Listing.create({ organizationId: organization._id, title: "Synthetic flat", description: "Restore test",
      location: "Istanbul", price: 100000, currency: "USD", propertyType: "apartment",
      rooms: 2, areaSqm: 90, availability: "available" });
  }
  const uri = replica.getUri("pilot_source");
  const volume = `${backupDir}:/backup`;
  const docker = (binary: string, args: string[]) => {
    try {
      return execFileSync("docker", ["run", "--rm", "--network", "host", "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, "-v", volume, "--entrypoint", binary, "mongo:8", ...args], { stdio: "pipe", timeout: 60_000 });
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
      throw new Error(`${binary} failed: ${stderr.slice(-3000)}`);
    }
  };
  docker("mongodump", ["--uri", uri, "--db", "pilot_source", "--archive=/backup/pilot.archive"]);
  const restoreUri = new URL(uri);
  restoreUri.pathname = "/";
  const collections = ["organizations", "users", "memberships", "assistants", "conversations", "messages",
    "staffavailabilities", "customers", "appointments", "appointmentslots", "agentactions", "businessknowledges", "listings"];
  docker("mongorestore", ["--uri", restoreUri.toString(), "--numParallelCollections=4", "--noIndexRestore",
    ...collections.map((name) => `--nsInclude=pilot_source.${name}`),
    "--archive=/backup/pilot.archive", "--nsFrom=pilot_source.*", "--nsTo=pilot_restored.*"]);
  const restored = await mongoose.createConnection(replica.getUri("pilot_restored")).asPromise();
  try {
    for (const model of [User, Membership, Assistant, Conversation, Message, StaffAvailability, Customer,
      Appointment, AppointmentSlot, AgentAction, BusinessKnowledge, Listing]) {
      const recovered = restored.model(model.modelName, model.schema);
      await recovered.init();
    }
    const organizations = await restored.db!.collection("organizations").countDocuments();
    assert.equal(organizations, 2);
    for (const organization of [first, second]) {
      assert.equal(await restored.db!.collection("assistants").countDocuments({ organizationId: organization._id }), 1);
      assert.equal(await restored.db!.collection("conversations").countDocuments({ organizationId: organization._id }), 1);
      assert.equal(await restored.db!.collection("messages").countDocuments({ organizationId: organization._id }), 1);
      for (const name of collections.filter((item) => !["organizations", "users"].includes(item)))
        assert.equal(await restored.db!.collection(name).countDocuments({ organizationId: organization._id }), 1, name);
    }
    const assistantIndexes = await restored.db!.collection("assistants").indexes();
    assert.ok(assistantIndexes.some(index => index.name === "publicKey_1"));
    const slotIndexes = await restored.db!.collection("appointmentslots").indexes();
    assert.ok(slotIndexes.some(index => index.unique && index.name === "organizationId_1_staffId_1_startAt_1"));
    const knowledgeIndexes = await restored.db!.collection("businessknowledges").indexes();
    assert.ok(knowledgeIndexes.some(index => index.unique && index.name === "organizationId_1"));
    console.log("Isolated mongodump/mongorestore rehearsal passed: two tenants, Phase 5/6 records and unique indexes restored.");
  } finally { await restored.close(); }
} finally {
  await mongoose.disconnect();
  await replica.stop();
  rmSync(backupDir, { recursive: true, force: true });
}
