#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
database="sql:$HOME/.pki/nssdb"
label='OpenStackTools AI Local Test CA'
test -f "$here/.secrets/root-ca.crt" || { echo 'Run setup.sh first.' >&2; exit 1; }
mkdir -p "$HOME/.pki/nssdb"
if ! certutil -L -d "$database" >/dev/null 2>&1; then certutil -N -d "$database" --empty-password; fi
if certutil -L -d "$database" -n "$label" >/dev/null 2>&1; then
  echo 'CA label already exists in the browser trust store; remove it before trusting a replacement.' >&2
  exit 1
fi
certutil -A -d "$database" -n "$label" -t 'C,,' -i "$here/.secrets/root-ca.crt"
echo 'Trusted local test CA for Chromium in this user profile.'
