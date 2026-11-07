#!/usr/bin/env bash
set -euo pipefail
cp /run/local-secrets/mongo-keyfile /tmp/mongo-keyfile
chown mongodb:mongodb /tmp/mongo-keyfile
chmod 400 /tmp/mongo-keyfile
exec docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --auth --keyFile /tmp/mongo-keyfile
