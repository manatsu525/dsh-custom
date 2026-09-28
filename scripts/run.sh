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
mkdir -p "$DSH_HOME" "$ROOT/data" "$ROOT/data/auth"
chmod 700 "$ROOT/data/auth" 2>/dev/null || true
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

AUTH_DIR="${AUTH_DIR:-$ROOT/data/auth}"
DSH_TOKEN_FILE="${DSH_TOKEN_FILE:-$ROOT/data/dsh-launch.token}"
SESSION_SECRET_FILE="${SESSION_SECRET_FILE:-$AUTH_DIR/session.secret}"
mkdir -p "$AUTH_DIR"
chmod 700 "$AUTH_DIR" 2>/dev/null || true

# Generate session HMAC secret once (mode 600)
if [[ ! -f "$SESSION_SECRET_FILE" ]]; then
  umask 077
  # 48 random bytes, base64
  head -c 48 /dev/urandom | base64 -w0 > "$SESSION_SECRET_FILE" 2>/dev/null \
    || head -c 48 /dev/urandom | base64 > "$SESSION_SECRET_FILE"
  chmod 600 "$SESSION_SECRET_FILE"
fi

cleanup() {
  [[ -n "${PROXY_PID:-}" ]] && kill "$PROXY_PID" 2>/dev/null || true
  [[ -n "${DSH_PID:-}" ]] && kill "$DSH_PID" 2>/dev/null || true
  [[ -n "${TOKEN_WATCH_PID:-}" ]] && kill "$TOKEN_WATCH_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Capture dsh stdout → log + extract launch token whenever "dsh web: ...?token=" appears
DSH_LOG="$ROOT/data/run.log"
: > "$DSH_LOG"

token_watch() {
  # Read from FIFO / process substitution lines and write token file (600)
  local line token
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line" >> "$DSH_LOG"
    printf '%s\n' "$line"
    if [[ "$line" =~ dsh\ web:.*\?token=([A-Za-z0-9_-]+) ]]; then
      token="${BASH_REMATCH[1]}"
      umask 077
      printf '%s\n' "$token" > "$DSH_TOKEN_FILE"
      chmod 600 "$DSH_TOKEN_FILE" 2>/dev/null || true
      echo "[run.sh] wrote launch token to $DSH_TOKEN_FILE" >> "$DSH_LOG"
    fi
  done
}

# Start official dsh web on 127.0.0.1 only; pipe stdout/stderr through token watcher
"$DSH_BIN" web --no-open --port "$DSH_PORT" "${TRUST_ARGS[@]}" > >(token_watch) 2> >(token_watch >&2) &
DSH_PID=$!

# Brief wait so first token line can appear before proxy starts exchanging
sleep 1

# Export gateway env for https-proxy.mjs
export AUTH_DIR DSH_TOKEN_FILE SESSION_SECRET_FILE HTTPS_PORT DSH_PORT
export TLS_CERT="$ROOT/data/cert.pem"
export TLS_KEY="$ROOT/data/key.pem"

# Assemble https-proxy.mjs from parts if present (split for GitHub push size)
if [[ -d "$ROOT/proxy/_parts" && -f "$ROOT/proxy/assemble-proxy.mjs" ]]; then
  node "$ROOT/proxy/assemble-proxy.mjs" || true
fi

node "$ROOT/proxy/https-proxy.mjs" &
PROXY_PID=$!

echo "Official dsh web on 127.0.0.1:${DSH_PORT}"
echo "HTTPS front: https://${PUBLIC_HOST}:${HTTPS_PORT}/"
echo "First open → /auth/setup (create admin). Later → /auth/login. Admin → /auth/admin"
echo "Workspace (shared): /home/share — open in UI folder picker."
echo "Users never need the raw ?token= URL; gateway exchanges it after login."
wait "$DSH_PID"
