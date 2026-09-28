#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
./scripts/install-node22.sh
export PATH="$ROOT/.node/bin:$PATH"
node -v
npm -v
npm install --omit=dev --no-audit --no-fund
mkdir -p /home/share 2>/dev/null || sudo mkdir -p /home/share
sudo chown "$(id -un):$(id -gn)" /home/share 2>/dev/null || true
[[ -f config.env ]] || cp config.env.example config.env
echo "Edit config.env (PUBLIC_HOST + DEEPSEEK_API_KEY), then: ./scripts/run.sh"
