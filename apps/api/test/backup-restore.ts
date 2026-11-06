// Isolated rehearsal against an ephemeral MongoDB replica set. Never point this
// script at an external database; the URI is created in this process.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Assistant, Conversation, Message, Organization } from "../src/models/index.js";

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.12" } });
const backupDir = mkdtempSync(join(tmpdir(), "ost-restore-test-"));
try {
  await mongoose.connect(replica.getUri("pilot_source"));
  await Promise.all(Object.values(mongoose.connection.models).map(model => model.init()));
  const first = await Organization.create({ name: "Restore A", dailyBudgetMicros: 1000, monthlyBudgetMicros: 10000 });
  const second = await Organization.create({ name: "Restore B", dailyBudgetMicros: 1000, monthlyBudgetMicros: 10000 });
  for (const organization of [first, second]) {
    const assistant = await Assistant.create({ organizationId: organization._id, name: "Restore assistant", instructions: "Test only", publicKey: `ost_restore_${organization.id}`, allowedOrigins: [] });
    const conversation = await Conversation.create({ organizationId: organization._id, assistantId: assistant._id, visitorId: `visitor_${organization.id}` });
    await Message.create({ organizationId: organization._id, conversationId: conversation._id, role: "customer", text: `Isolated test message for ${organization.name}` });
  }
  const uri = replica.getUri("pilot_source");
  const volume = `${backupDir}:/backup`;
  const docker = (binary: string, args: string[]) => execFileSync("docker", ["run", "--rm", "--network", "host", "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, "-v", volume, "--entrypoint", binary, "mongo:8", ...args], { stdio: "pipe", timeout: 120_000 });
  docker("mongodump", ["--uri", uri, "--db", "pilot_source", "--archive=/backup/pilot.archive"]);
  const restoreUri = new URL(uri);
  restoreUri.pathname = "/";
  docker("mongorestore", ["--uri", restoreUri.toString(), "--numParallelCollections=2", "--nsInclude=pilot_source.organizations", "--nsInclude=pilot_source.assistants", "--nsInclude=pilot_source.conversations", "--nsInclude=pilot_source.messages", "--archive=/backup/pilot.archive", "--nsFrom=pilot_source.*", "--nsTo=pilot_restored.*"]);
  const restored = await mongoose.createConnection(replica.getUri("pilot_restored")).asPromise();
  try {
    const organizations = await restored.db!.collection("organizations").countDocuments();
    assert.equal(organizations, 2);
    for (const organization of [first, second]) {
      assert.equal(await restored.db!.collection("assistants").countDocuments({ organizationId: organization._id }), 1);
      assert.equal(await restored.db!.collection("conversations").countDocuments({ organizationId: organization._id }), 1);
      assert.equal(await restored.db!.collection("messages").countDocuments({ organizationId: organization._id }), 1);
    }
    const assistantIndexes = await restored.db!.collection("assistants").indexes();
    assert.ok(assistantIndexes.some(index => index.name === "publicKey_1"));
    console.log("Isolated mongodump/mongorestore rehearsal passed: two tenants, messages, and assistant index restored.");
  } finally { await restored.close(); }
} finally {
  await mongoose.disconnect();
  await replica.stop();
  rmSync(backupDir, { recursive: true, force: true });
}
