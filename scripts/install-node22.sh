#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="${NODE_VERSION:-22.19.0}"
PREFIX="${NODE_PREFIX:-$ROOT/.node}"
if [[ -x "$PREFIX/bin/node" ]] && "$PREFIX/bin/node" -e "const m=process.versions.node.split('.').map(Number); if(!(m[0]>22||(m[0]===22&&m[1]>=19))) process.exit(1)"; then
  echo "Node OK: $($PREFIX/bin/node -v)"
  exit 0
fi
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo "unsupported arch: $arch"; exit 1 ;;
esac
url="https://nodejs.org/dist/v${VER}/node-v${VER}-${os}-${arch}.tar.gz"
tmp="$(mktemp -d)"
echo "Downloading $url"
curl -fsSL "$url" -o "$tmp/node.tar.gz"
mkdir -p "$PREFIX"
tar -xzf "$tmp/node.tar.gz" -C "$PREFIX" --strip-components=1
rm -rf "$tmp"
echo "Installed $($PREFIX/bin/node -v) -> $PREFIX"
