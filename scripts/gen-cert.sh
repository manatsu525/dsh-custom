#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/data"
CERT="$ROOT/data/cert.pem"
KEY="$ROOT/data/key.pem"
CN="${PUBLIC_HOST:-micro-dsh}"
if [[ -f "$CERT" && -f "$KEY" ]]; then
  echo "Already exists: $CERT"
  exit 0
fi
# SAN: localhost + optional IP/DNS from PUBLIC_HOST
SAN="DNS:localhost,IP:127.0.0.1"
if [[ -n "${PUBLIC_HOST:-}" && "$PUBLIC_HOST" != "YOUR_VPS_IP_OR_DOMAIN" ]]; then
  if [[ "$PUBLIC_HOST" =~ ^[0-9.]+$ ]]; then
    SAN="$SAN,IP:$PUBLIC_HOST"
  else
    SAN="$SAN,DNS:$PUBLIC_HOST"
  fi
fi
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$KEY" -out "$CERT" -days 825 \
  -subj "/CN=$CN/O=dsh-vps-selfsigned" \
  -addext "subjectAltName=$SAN"
chmod 600 "$KEY"
echo "Wrote $CERT ($SAN)"
