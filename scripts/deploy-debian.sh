#!/usr/bin/env bash
# Debian 11 (bullseye) 一键部署 dsh-custom
# One-click deploy for dsh-custom on Debian 11
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/manatsu525/dsh-custom.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/dsh-custom}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
DSH_PORT="${DSH_PORT:-3080}"
SERVICE_NAME="dsh-custom"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --non-interactive|--yes|-y)
      NONINTERACTIVE=1
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: deploy-debian.sh [options]

Env / flags:
  PUBLIC_HOST=...          Public IP or domain (auto-detected if unset)
  INSTALL_DIR=/opt/dsh-custom
  HTTPS_PORT=8443
  DSH_PORT=3080
  SETUP_SWAP=0|1           Default 1 when MemTotal < 1G
  DEEPSEEK_API_KEY=...     Optional, written into config.env
  NONINTERACTIVE=1 / --non-interactive
USAGE
      exit 0
      ;;
  esac
done

log()  { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; }

# --- sudo helper: work as root or via sudo ---
need_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

# --- 1. Check Debian ---
check_debian() {
  if [[ ! -f /etc/os-release ]]; then
    err "无法读取 /etc/os-release — 本脚本面向 Debian 11"
    exit 1
  fi
  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "debian" ]]; then
    warn "检测到 ID=${ID:-unknown}（期望 debian）。将继续，但未充分测试。"
  fi
  local ver="${VERSION_ID:-}"
  if [[ "$ver" == "11" ]]; then
    log "Debian 11 (bullseye) — OK"
  elif [[ "$ver" == "12" || "$ver" == "10" ]]; then
    warn "Debian ${ver} — 接近目标版本，继续部署。"
  else
    warn "VERSION_ID=${ver:-?} — 非 Debian 11，尽量继续。"
  fi
}

# --- Detect public host ---
detect_public_host() {
  local ip=""
  if [[ -n "${PUBLIC_HOST:-}" && "$PUBLIC_HOST" != "YOUR_VPS_IP_OR_DOMAIN" ]]; then
    echo "$PUBLIC_HOST"
    return 0
  fi
  for url in "https://ifconfig.me" "https://icanhazip.com" "https://api.ipify.org"; do
    ip="$(curl -4 -fsS --connect-timeout 5 --max-time 10 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "$ip"
      return 0
    fi
  done
  # hostname -I: first non-private-looking, else first
  if command -v hostname >/dev/null 2>&1; then
    for cand in $(hostname -I 2>/dev/null || true); do
      if [[ "$cand" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        # Prefer non-RFC1918
        if [[ ! "$cand" =~ ^10\. ]] && [[ ! "$cand" =~ ^192\.168\. ]] && [[ ! "$cand" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]]; then
          echo "$cand"
          return 0
        fi
        ip="${ip:-$cand}"
      fi
    done
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  fi
  echo ""
}

# --- Source tree: copy from checkout or clone ---
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# If this script lives in .../scripts/, repo root is parent
maybe_repo_root="$(cd "$script_dir/.." && pwd)"

is_checkout() {
  local root="$1"
  [[ -f "$root/package.json" && -f "$root/scripts/run.sh" && -f "$root/config.env.example" ]]
}

sync_or_clone() {
  need_root mkdir -p "$(dirname "$INSTALL_DIR")"
  if is_checkout "$maybe_repo_root" && [[ "$maybe_repo_root" != "$INSTALL_DIR" ]]; then
    log "从本地检出同步到 $INSTALL_DIR ..."
    need_root mkdir -p "$INSTALL_DIR"
    # Preserve existing config.env / data / dsh-home / .node / node_modules on reinstall
    need_root rsync -a --delete \
      --exclude 'node_modules/' \
      --exclude '.node/' \
      --exclude 'data/' \
      --exclude 'dsh-home/' \
      --exclude 'config.env' \
      --exclude '.git/' \
      --exclude '*.pem' \
      --exclude '*.key' \
      --exclude '*.log' \
      --exclude '*.pid' \
      "$maybe_repo_root/" "$INSTALL_DIR/"
  elif is_checkout "$maybe_repo_root" && [[ "$maybe_repo_root" == "$INSTALL_DIR" ]]; then
    log "已在安装目录 $INSTALL_DIR 内运行，跳过同步。"
  elif [[ -d "$INSTALL_DIR/.git" ]]; then
    log "更新已有 git 仓库 $INSTALL_DIR ..."
    need_root git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH"
    need_root git -C "$INSTALL_DIR" checkout "$REPO_BRANCH"
    need_root git -C "$INSTALL_DIR" pull --ff-only origin "$REPO_BRANCH" || \
      warn "git pull 失败，继续使用现有代码。"
  else
    log "克隆 $REPO_URL ($REPO_BRANCH) → $INSTALL_DIR ..."
    if [[ -d "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]]; then
      warn "$INSTALL_DIR 非空且非 git 仓库，将覆盖同步克隆内容（保留 config.env/data）。"
      local tmp
      tmp="$(mktemp -d)"
      git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$tmp/repo"
      need_root mkdir -p "$INSTALL_DIR"
      need_root rsync -a \
        --exclude 'config.env' \
        --exclude 'data/' \
        --exclude 'dsh-home/' \
        --exclude 'node_modules/' \
        --exclude '.node/' \
        "$tmp/repo/" "$INSTALL_DIR/"
      rm -rf "$tmp"
    else
      need_root git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
    fi
  fi
  # Ensure scripts are executable
  need_root chmod +x "$INSTALL_DIR"/scripts/*.sh "$INSTALL_DIR"/deploy.sh "$INSTALL_DIR"/uninstall.sh 2>/dev/null || true
}

ensure_config() {
  local cfg="$INSTALL_DIR/config.env"
  local example="$INSTALL_DIR/config.env.example"
  if [[ ! -f "$cfg" ]]; then
    log "创建 config.env ..."
    need_root cp "$example" "$cfg"
    need_root chmod 600 "$cfg"
  fi

  local host
  host="$(detect_public_host)"
  if [[ -n "$host" ]]; then
    log "PUBLIC_HOST=$host"
    # Update PUBLIC_HOST line in place
    if need_root grep -q '^PUBLIC_HOST=' "$cfg"; then
      need_root sed -i "s|^PUBLIC_HOST=.*|PUBLIC_HOST=${host}|" "$cfg"
    else
      echo "PUBLIC_HOST=${host}" | need_root tee -a "$cfg" >/dev/null
    fi
    PUBLIC_HOST="$host"
  else
    warn "未能自动检测公网 IP。请编辑 $cfg 设置 PUBLIC_HOST=你的IP或域名"
    PUBLIC_HOST="$(need_root grep -E '^PUBLIC_HOST=' "$cfg" | head -1 | cut -d= -f2- || true)"
  fi

  # HTTPS_PORT / DSH_PORT
  if need_root grep -q '^HTTPS_PORT=' "$cfg"; then
    need_root sed -i "s|^HTTPS_PORT=.*|HTTPS_PORT=${HTTPS_PORT}|" "$cfg"
  else
    echo "HTTPS_PORT=${HTTPS_PORT}" | need_root tee -a "$cfg" >/dev/null
  fi
  if need_root grep -q '^DSH_PORT=' "$cfg"; then
    need_root sed -i "s|^DSH_PORT=.*|DSH_PORT=${DSH_PORT}|" "$cfg"
  else
    echo "DSH_PORT=${DSH_PORT}" | need_root tee -a "$cfg" >/dev/null
  fi

  # Prefer install-local DSH_HOME under INSTALL_DIR for self-contained uninstall
  if need_root grep -q '^export DSH_HOME=' "$cfg"; then
    need_root sed -i "s|^export DSH_HOME=.*|export DSH_HOME=${INSTALL_DIR}/dsh-home|" "$cfg"
  fi

  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    if need_root grep -q '^export DEEPSEEK_API_KEY=' "$cfg"; then
      need_root sed -i "s|^export DEEPSEEK_API_KEY=.*|export DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}|" "$cfg"
    else
      echo "export DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}" | need_root tee -a "$cfg" >/dev/null
    fi
  fi
}

mem_total_kb() {
  awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0
}

maybe_swap() {
  local decide="${SETUP_SWAP:-}"
  if [[ -z "$decide" ]]; then
    local kb
    kb="$(mem_total_kb)"
    if [[ "$kb" -gt 0 && "$kb" -lt 1048576 ]]; then
      decide=1
    else
      decide=0
    fi
  fi
  if [[ "$decide" == "1" ]]; then
    log "配置 swap（SETUP_SWAP=1）..."
    need_root bash "$INSTALL_DIR/scripts/setup-swap.sh" || warn "setup-swap.sh 失败，继续。"
  else
    log "跳过 swap（SETUP_SWAP=0）"
  fi
}

install_unit() {
  log "安装 systemd 单元 ${SERVICE_NAME}.service ..."
  local unit_src="$INSTALL_DIR/systemd/dsh-custom.service"
  if [[ ! -f "$unit_src" ]]; then
    # Generate from template inline
    need_root tee "$UNIT_PATH" >/dev/null <<UNIT
[Unit]
Description=dsh-custom (official DeepSeek Harness behind HTTPS proxy)
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/config.env
ExecStart=${INSTALL_DIR}/scripts/run.sh
Restart=on-failure
MemoryMax=450M

[Install]
WantedBy=multi-user.target
UNIT
  else
    # Rewrite paths in case INSTALL_DIR differs from default
    need_root sed \
      -e "s|/opt/dsh-custom|${INSTALL_DIR}|g" \
      -e "s|/opt/dsh-official-vps|${INSTALL_DIR}|g" \
      "$unit_src" | need_root tee "$UNIT_PATH" >/dev/null
  fi
  need_root systemctl daemon-reload
  need_root systemctl enable --now "$SERVICE_NAME"
}

maybe_ufw() {
  if command -v ufw >/dev/null 2>&1; then
    if need_root ufw status 2>/dev/null | grep -qi 'Status: active'; then
      log "UFW 已启用，放行 ${HTTPS_PORT}/tcp ..."
      need_root ufw allow "${HTTPS_PORT}/tcp" comment 'dsh-custom' || \
        need_root ufw allow "${HTTPS_PORT}/tcp" || true
    fi
  fi
}

# ========== main ==========
check_debian

log "apt-get update + 安装依赖 ..."
export DEBIAN_FRONTEND=noninteractive
need_root apt-get update -y
need_root apt-get install -y --no-install-recommends \
  curl ca-certificates git build-essential python3 xz-utils rsync openssl

sync_or_clone

log "安装 Node 22 + npm 依赖 ..."
# install-node22 / npm as root into INSTALL_DIR is fine for /opt
need_root bash "$INSTALL_DIR/scripts/install-node22.sh"
need_root env PATH="$INSTALL_DIR/.node/bin:$PATH" \
  bash -c "cd '$INSTALL_DIR' && npm install --omit=dev --no-audit --no-fund"

log "确保 /home/share 可写 ..."
need_root mkdir -p /home/share
need_root chmod 755 /home/share
# Keep writable by root service; also allow others to write for shared workspace
need_root chmod 1777 /home/share 2>/dev/null || need_root chmod 755 /home/share

ensure_config
maybe_swap

log "生成 TLS 证书（如缺失）..."
need_root env PUBLIC_HOST="${PUBLIC_HOST:-}" bash "$INSTALL_DIR/scripts/gen-cert.sh"

if [[ -d "$INSTALL_DIR/proxy/_parts" && -f "$INSTALL_DIR/proxy/assemble-proxy.mjs" ]]; then
  log "组装 https-proxy.mjs ..."
  need_root env PATH="$INSTALL_DIR/.node/bin:$PATH" \
    bash -c "cd '$INSTALL_DIR' && node proxy/assemble-proxy.mjs" || warn "assemble-proxy 失败，若已有 https-proxy.mjs 可忽略。"
fi

install_unit
maybe_ufw

# Re-read PUBLIC_HOST for summary
if [[ -z "${PUBLIC_HOST:-}" || "$PUBLIC_HOST" == "YOUR_VPS_IP_OR_DOMAIN" ]]; then
  PUBLIC_HOST="$(need_root grep -E '^PUBLIC_HOST=' "$INSTALL_DIR/config.env" | head -1 | cut -d= -f2- || true)"
fi
HTTPS_PORT="$(need_root grep -E '^HTTPS_PORT=' "$INSTALL_DIR/config.env" | head -1 | cut -d= -f2- || echo "$HTTPS_PORT")"

echo
log "========== 部署完成 / Deployed =========="
echo "  安装目录: $INSTALL_DIR"
echo "  服务:     systemctl status $SERVICE_NAME"
echo "  访问:     https://${PUBLIC_HOST:-YOUR_HOST}:${HTTPS_PORT}/"
echo "  首次设置: https://${PUBLIC_HOST:-YOUR_HOST}:${HTTPS_PORT}/auth/setup"
echo "  登录:     https://${PUBLIC_HOST:-YOUR_HOST}:${HTTPS_PORT}/auth/login"
echo
echo "  若 PUBLIC_HOST 不对，请编辑: $INSTALL_DIR/config.env"
echo "  然后: sudo systemctl restart $SERVICE_NAME"
echo
echo "  卸载: curl -fsSL https://raw.githubusercontent.com/manatsu525/dsh-custom/main/scripts/uninstall-debian.sh | sudo bash"
echo "  或:   sudo $INSTALL_DIR/scripts/uninstall-debian.sh"
echo "========================================"
