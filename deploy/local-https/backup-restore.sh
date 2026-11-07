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
  "${mongo[@]}" --eval '
    const marker = process.env.MARKER;
    const source = db.getSiblingDB("ost_ai_local");
    for (const name of ["messages", "conversations", "assistants", "organizations"])
      source.getCollection(name).deleteMany({ localRestoreMarker: marker });
    db.getSiblingDB("ost_ai_restore_" + marker).dropDatabase();
  ' >/dev/null 2>&1 || true
  rm -f "$archive"
}
trap cleanup EXIT

"${mongo[@]}" --eval '
  const marker = process.env.MARKER;
  const source = db.getSiblingDB("ost_ai_local");
  for (const name of ["Restore A", "Restore B"]) {
    const org = source.organizations.insertOne({name, localRestoreMarker: marker, dailyBudgetMicros: 1000, monthlyBudgetMicros: 10000, retentionDays: 30});
    const assistant = source.assistants.insertOne({organizationId: org.insertedId, localRestoreMarker: marker, name: name + " assistant", instructions: "Synthetic restore check", publicKey: "ost_restore_" + marker + name.replace(" ", ""), allowedOrigins: [], active: true});
    const conversation = source.conversations.insertOne({organizationId: org.insertedId, assistantId: assistant.insertedId, localRestoreMarker: marker, visitorId: "restore_" + marker, status: "bot"});
    source.messages.insertOne({organizationId: org.insertedId, conversationId: conversation.insertedId, localRestoreMarker: marker, role: "customer", text: "Synthetic restore check"});
  }
' >/dev/null

"${dump[@]}" --db ost_ai_local --archive="$archive"
"${restore[@]}" --archive="$archive" --nsFrom='ost_ai_local.*' --nsTo="${target}.*" --numParallelCollections=2
"${mongo[@]}" --eval '
  const marker = process.env.MARKER;
  const restored = db.getSiblingDB("ost_ai_restore_" + marker);
  for (const name of ["organizations", "assistants", "conversations", "messages"])
    if (restored.getCollection(name).countDocuments({localRestoreMarker: marker}) !== 2) throw Error("Restored tenant count mismatch: " + name);
  const indexes = restored.assistants.getIndexes();
  if (!indexes.some(item => item.name === "publicKey_1")) throw Error("Assistant unique index missing");
  print("Authenticated full local archive restored into an isolated database; two synthetic tenants and index verified.");
'
