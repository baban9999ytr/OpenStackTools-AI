#!/usr/bin/env bash
# Runs only inside the isolated local Compose MongoDB container.
set -euo pipefail
test -f /run/local-config/start-mongo.sh || { echo 'Not in the local HTTPS MongoDB container' >&2; exit 1; }
export MARKER="$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
[[ "$MARKER" =~ ^[0-9a-f]{16}$ ]] || exit 1
archive="/tmp/ost-ai-$MARKER.archive"
target="ost_ai_restore_$MARKER"
mongo=(mongosh --quiet --host mongo --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD")
dump=(mongodump --quiet --host mongo --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD")
restore=(mongorestore --quiet --host mongo --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD")
cleanup() {
  local cleanup_status=0
  "${mongo[@]}" --eval '
    const marker = process.env.MARKER;
    const source = db.getSiblingDB("ost_ai_local");
    for (const name of ["messages", "conversations", "assistants", "organizations", "users", "memberships",
      "staffavailabilities", "customers", "appointments", "appointmentslots", "agentactions", "businessknowledges", "listings"])
      source.getCollection(name).deleteMany({ localRestoreMarker: marker });
    db.getSiblingDB("ost_ai_restore_" + marker).dropDatabase();
  ' >/dev/null 2>&1 || cleanup_status=1
  rm -f "$archive"
  if [ "$cleanup_status" -ne 0 ]; then echo 'Synthetic restore cleanup failed' >&2; exit 1; fi
}
trap cleanup EXIT

"${mongo[@]}" --eval '
  const marker = process.env.MARKER;
  const source = db.getSiblingDB("ost_ai_local");
  for (const name of ["Restore A", "Restore B"]) {
    const org = source.organizations.insertOne({name, localRestoreMarker: marker, dailyBudgetMicros: 1000, monthlyBudgetMicros: 10000, retentionDays: 30});
    const owner = source.users.insertOne({email: "restore-" + marker + name.replace(" ", "") + "@example.test", name: "Synthetic owner", passwordHash: "test-only", localRestoreMarker: marker});
    source.memberships.insertOne({organizationId: org.insertedId, userId: owner.insertedId, role: "owner", localRestoreMarker: marker});
    const assistant = source.assistants.insertOne({organizationId: org.insertedId, localRestoreMarker: marker, name: name + " assistant", instructions: "Synthetic restore check", publicKey: "ost_restore_" + marker + name.replace(" ", ""), allowedOrigins: [], active: true});
    const conversation = source.conversations.insertOne({organizationId: org.insertedId, assistantId: assistant.insertedId, localRestoreMarker: marker, visitorId: "restore_" + marker, status: "bot"});
    source.messages.insertOne({organizationId: org.insertedId, conversationId: conversation.insertedId, localRestoreMarker: marker, role: "customer", text: "Synthetic restore check"});
    source.staffavailabilities.insertOne({organizationId: org.insertedId, staffId: owner.insertedId, windows: [], localRestoreMarker: marker});
    const customer = source.customers.insertOne({organizationId: org.insertedId, conversationId: conversation.insertedId, visitorId: "restore_" + marker,
      identityKey: conversation.insertedId.toString() + ":restore_" + marker, name: "Synthetic visitor", contact: "visitor@example.test",
      request: "Viewing", consent: {recorded: true}, localRestoreMarker: marker});
    const startAt = new Date("2027-02-01T10:00:00Z");
    const appointment = source.appointments.insertOne({organizationId: org.insertedId, staffId: owner.insertedId,
      customerId: customer.insertedId, conversationId: conversation.insertedId, visitorId: "restore_" + marker,
      startAt, endAt: new Date("2027-02-01T10:30:00Z"), status: "booked", createdBy: "widget", localRestoreMarker: marker});
    source.appointmentslots.insertOne({organizationId: org.insertedId, staffId: owner.insertedId,
      appointmentId: appointment.insertedId, startAt, localRestoreMarker: marker});
    source.agentactions.insertOne({organizationId: org.insertedId, assistantId: assistant.insertedId,
      conversationId: conversation.insertedId, visitorId: "restore_" + marker, name: "create_appointment",
      arguments: {staffId: owner.insertedId.toString()}, status: "completed", idempotencyKey: "restore:" + marker + name,
      result: {appointmentId: appointment.insertedId.toString()}, localRestoreMarker: marker});
    source.businessknowledges.insertOne({organizationId: org.insertedId, profile: "Synthetic office", localRestoreMarker: marker});
    source.listings.insertOne({organizationId: org.insertedId, title: "Synthetic flat", description: "Restore check",
      location: "Istanbul", price: 100000, currency: "USD", propertyType: "apartment", areaSqm: 90,
      availability: "available", localRestoreMarker: marker});
  }
' >/dev/null

"${dump[@]}" --db ost_ai_local --archive="$archive"
"${restore[@]}" --archive="$archive" --nsFrom='ost_ai_local.*' --nsTo="${target}.*" --numParallelCollections=2
"${mongo[@]}" --eval '
  const marker = process.env.MARKER;
  const restored = db.getSiblingDB("ost_ai_restore_" + marker);
  for (const name of ["organizations", "users", "memberships", "assistants", "conversations", "messages",
    "staffavailabilities", "customers", "appointments", "appointmentslots", "agentactions", "businessknowledges", "listings"])
    if (restored.getCollection(name).countDocuments({localRestoreMarker: marker}) !== 2) throw Error("Restored tenant count mismatch: " + name);
  for (const [name, index] of [["assistants", "publicKey_1"], ["appointmentslots", "organizationId_1_staffId_1_startAt_1"],
    ["businessknowledges", "organizationId_1"]])
    if (!restored.getCollection(name).getIndexes().some(item => item.name === index && item.unique)) throw Error("Unique index missing: " + name + "." + index);
  print("Authenticated local archive restored into an isolated database; two synthetic tenants, Phase 5/6 records and unique indexes verified.");
'
