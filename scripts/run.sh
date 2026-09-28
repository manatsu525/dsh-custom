#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/config.env"

if [[ -z "${PUBLIC_HOST:-}" || "$PUBLIC_HOST" == "YOUR_VPS_IP_OR_DOMAIN" ]]; then
  echo "Set PUBLIC_HOST in config.env to your VPS IP or domain."
  exit 1
fi

export PATH="$ROOT/.node/bin:$PATH"
command -v node >/dev/null || { echo "Run ./scripts/install.sh first"; exit 1; }
DSH_BIN="$ROOT/node_modules/.bin/dsh"
[[ -x "$DSH_BIN" ]] || { echo "Missing $DSH_BIN — run ./scripts/install.sh"; exit 1; }

export DSH_HOME="${DSH_HOME:-$ROOT/dsh-home}"
mkdir -p "$DSH_HOME" "$ROOT/data"
if [[ ! -d /home/share ]]; then
  mkdir -p /home/share 2>/dev/null || sudo mkdir -p /home/share
  sudo chown "$(id -un):$(id -gn)" /home/share 2>/dev/null || true
fi
export DSH_TELEMETRY_DISABLED="${DSH_TELEMETRY_DISABLED:-1}"
export NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE:-256}"

PATCH="$ROOT/patches/vps.cordis.patch.yml"
if [[ -n "${DOCUMENTS_DIRECTORY:-}" ]]; then
  sed -i "s|documentsDirectory:.*|documentsDirectory: ${DOCUMENTS_DIRECTORY}|" "$PATCH"
fi
# Official overlay: home-level cordis.patch.yml (applied after profile bundles)
cp "$PATCH" "$DSH_HOME/cordis.patch.yml"

[[ -f "$ROOT/data/cert.pem" ]] || PUBLIC_HOST="$PUBLIC_HOST" "$ROOT/scripts/gen-cert.sh"

DSH_PORT="${DSH_PORT:-3080}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
TRUST_ARGS=(--trusted-host "$PUBLIC_HOST" --trusted-host "${PUBLIC_HOST}:${HTTPS_PORT}")

cleanup() {
  [[ -n "${PROXY_PID:-}" ]] && kill "$PROXY_PID" 2>/dev/null || true
  [[ -n "${DSH_PID:-}" ]] && kill "$DSH_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

HTTPS_PORT="$HTTPS_PORT" DSH_PORT="$DSH_PORT" \
  TLS_CERT="$ROOT/data/cert.pem" TLS_KEY="$ROOT/data/key.pem" \
  node "$ROOT/proxy/https-proxy.mjs" &
PROXY_PID=$!

# Core = official DeepSeek Harness web profile
"$DSH_BIN" web --no-open --port "$DSH_PORT" "${TRUST_ARGS[@]}" &
DSH_PID=$!

echo "Official dsh web on 127.0.0.1:${DSH_PORT}"
echo "HTTPS front: https://${PUBLIC_HOST}:${HTTPS_PORT}/"
echo "Open the printed token URL; replace http://127.0.0.1:${DSH_PORT} with https://${PUBLIC_HOST}:${HTTPS_PORT}."
echo "In the UI, open workspace folder: /home/share"
wait "$DSH_PID"
