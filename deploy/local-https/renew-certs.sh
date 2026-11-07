#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
secret_dir="$here/.secrets"
test -f "$secret_dir/root-ca.key" || { echo 'Run setup.sh first.' >&2; exit 1; }
umask 077
for host in ai.localhost mailpit; do
  openssl req -newkey rsa:2048 -nodes -sha256 \
    -keyout "$secret_dir/$host.key" -out "$secret_dir/$host.csr" \
    -subj "/CN=$host" >/dev/null 2>&1
  printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$host" > "$secret_dir/$host.ext"
  openssl x509 -req -sha256 -days 30 \
    -in "$secret_dir/$host.csr" \
    -CA "$secret_dir/root-ca.crt" -CAkey "$secret_dir/root-ca.key" \
    -CAcreateserial -out "$secret_dir/$host.crt" \
    -extfile "$secret_dir/$host.ext" >/dev/null 2>&1
  rm "$secret_dir/$host.csr" "$secret_dir/$host.ext"
done
echo 'Renewed local HTTPS and Mailpit leaf certificates under the existing local CA.'
