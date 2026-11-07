#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
secret_dir="$here/.secrets"
if [ -e "$secret_dir" ]; then
  for required in root-ca.crt root-ca.key ai.localhost.crt ai.localhost.key mailpit.crt mailpit.key mongo-keyfile mongo.env api.env; do
    test -f "$secret_dir/$required" || { echo "Local staging secrets are incomplete: missing $required" >&2; exit 1; }
  done
  echo 'Local staging secrets already exist; preserving them.'
  exit 0
fi
umask 077
mkdir -m 700 "$secret_dir"
openssl rand -hex 64 > "$secret_dir/mongo-keyfile"
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 365 \
  -keyout "$secret_dir/root-ca.key" -out "$secret_dir/root-ca.crt" \
  -subj '/CN=OpenStackTools AI Local Test CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' >/dev/null 2>&1

"$here/renew-certs.sh"

root_password="$(openssl rand -hex 32)"
app_password="$(openssl rand -hex 32)"
session_secret="$(openssl rand -hex 32)"
printf 'MONGO_INITDB_ROOT_USERNAME=local_root\nMONGO_INITDB_ROOT_PASSWORD=%s\nLOCAL_MONGO_APP_PASSWORD=%s\n' \
  "$root_password" "$app_password" > "$secret_dir/mongo.env"
cat > "$secret_dir/api.env" <<EOF
NODE_ENV=production
PORT=5000
MONGODB_URL=mongodb://local_app:$app_password@mongo:27017/ost_ai_local?replicaSet=rs0&authSource=ost_ai_local
DASHBOARD_ORIGIN=https://ai.localhost
SESSION_SECRET=$session_secret
OPENAI_API_KEY=local-unconfigured-key
OPENAI_MODEL=local-unconfigured-model
OPENAI_MAX_COMPLETION_TOKENS=64
COOKIE_SECURE=true
TRUST_PROXY=1
DEFAULT_DAILY_BUDGET_USD=0.05
DEFAULT_MONTHLY_BUDGET_USD=0.50
OPENAI_INPUT_USD_PER_MILLION_TOKENS=1
OPENAI_OUTPUT_USD_PER_MILLION_TOKENS=1
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_REQUIRE_TLS=true
SMTP_FROM=OpenStackTools AI Local <no-reply@example.test>
EOF
echo 'Generated ignored local staging certificates and synthetic credentials.'
echo 'OpenAI key/model and token prices are placeholders. Do not run a live provider request until replaced and authorized.'
