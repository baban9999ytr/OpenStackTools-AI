#!/usr/bin/env bash
set -euo pipefail
database="sql:$HOME/.pki/nssdb"
label='OpenStackTools AI Local Test CA'
if certutil -L -d "$database" -n "$label" >/dev/null 2>&1; then
  certutil -D -d "$database" -n "$label"
  echo 'Removed local test CA from the browser trust store.'
else
  echo 'Local test CA is not present in the browser trust store.'
fi
