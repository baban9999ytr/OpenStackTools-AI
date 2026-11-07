#!/usr/bin/env bash
set -euo pipefail

root_password="$MONGO_INITDB_ROOT_PASSWORD"
app_password="$LOCAL_MONGO_APP_PASSWORD"

for attempt in $(seq 1 30); do
  if mongosh --quiet --host mongo --authenticationDatabase admin \
    --username "$MONGO_INITDB_ROOT_USERNAME" --password "$root_password" \
    --eval 'try { rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo:27017"}]}) } catch(e) { if (e.codeName !== "AlreadyInitialized") throw e }' >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then echo 'MongoDB replica set initialization failed' >&2; exit 1; fi
  sleep 1
done

for attempt in $(seq 1 30); do
  if mongosh --quiet --host mongo --authenticationDatabase admin \
    --username "$MONGO_INITDB_ROOT_USERNAME" --password "$root_password" \
    --eval 'if (rs.status().myState !== 1) quit(1)' >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then echo 'MongoDB primary not ready' >&2; exit 1; fi
  sleep 1
done

LOCAL_MONGO_APP_PASSWORD="$app_password" mongosh --quiet --host mongo \
  --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$root_password" --eval '
    const database = db.getSiblingDB("ost_ai_local");
    if (!database.getUser("local_app")) {
      database.createUser({
        user: "local_app",
        pwd: process.env.LOCAL_MONGO_APP_PASSWORD,
        roles: [{ role: "readWrite", db: "ost_ai_local" }]
      });
    }
    print("Local application database user ready");
  '
