#!/usr/bin/env bash
# Debian 一键卸载 dsh-custom
# One-click uninstall for dsh-custom
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/dsh-custom}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
SERVICE_NAME="dsh-custom"
LEGACY_SERVICE="dsh-vps"
NONINTERACTIVE="${NONINTERACTIVE:-0}"
PURGE_DATA="${PURGE_DATA:-0}"
PURGE_SHARE="${PURGE_SHARE:-0}"
PURGE_DSH_HOME="${PURGE_DSH_HOME:-0}"
YES=0

for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1; NONINTERACTIVE=1 ;;
    --non-interactive) NONINTERACTIVE=1 ;;
    --purge-data) PURGE_DATA=1 ;;
    --purge-share) PURGE_SHARE=1 ;;
    --purge-dsh-home) PURGE_DSH_HOME=1 ;;
    --help|-h)
      cat <<'USAGE'
Usage: uninstall-debian.sh [options]

  --yes / -y / NONINTERACTIVE=1   No confirmation prompts
  --purge-data / PURGE_DATA=1     Also wipe data inside INSTALL_DIR (default: remove whole INSTALL_DIR)
  --purge-share / PURGE_SHARE=1   Wipe /home/share (default: keep)
  --purge-dsh-home / PURGE_DSH_HOME=1  Wipe /var/lib/dsh if present (default: keep)
  INSTALL_DIR=/opt/dsh-custom
  HTTPS_PORT=8443                 Port for best-effort UFW rule removal
USAGE
      exit 0
      ;;
  esac
done

log()  { printf '\033[1;32m[uninstall]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[uninstall]\033[0m %s\n' "$*" >&2; }

need_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

# Try to read HTTPS_PORT from config if present
if [[ -f "$INSTALL_DIR/config.env" ]]; then
  # shellcheck disable=SC1090
  _hp="$(grep -E '^HTTPS_PORT=' "$INSTALL_DIR/config.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  [[ -n "$_hp" ]] && HTTPS_PORT="$_hp"
fi

echo "即将卸载 dsh-custom："
echo "  停止/禁用: ${SERVICE_NAME}.service (+ legacy ${LEGACY_SERVICE}.service)"
echo "  删除目录:  $INSTALL_DIR"
echo "  /home/share:     $([[ "$PURGE_SHARE" == "1" ]] && echo '将删除' || echo '保留')"
echo "  /var/lib/dsh:    $([[ "$PURGE_DSH_HOME" == "1" ]] && echo '将删除' || echo '保留')"
echo

if [[ "$NONINTERACTIVE" != "1" && "$YES" != "1" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "确认卸载？输入 yes 继续: " ans
    if [[ "$ans" != "yes" ]]; then
      echo "已取消。"
      exit 0
    fi
  else
    err_msg="非交互终端且未设置 --yes / NONINTERACTIVE=1，中止。"
    printf '\033[1;31m[uninstall]\033[0m %s\n' "$err_msg" >&2
    exit 1
  fi
fi

stop_disable() {
  local name="$1"
  if need_root systemctl list-unit-files "${name}.service" 2>/dev/null | grep -q "${name}.service"; then
    log "停止并禁用 ${name}.service ..."
    need_root systemctl stop "${name}.service" 2>/dev/null || true
    need_root systemctl disable "${name}.service" 2>/dev/null || true
  elif [[ -f "/etc/systemd/system/${name}.service" ]]; then
    need_root systemctl stop "${name}.service" 2>/dev/null || true
    need_root systemctl disable "${name}.service" 2>/dev/null || true
  fi
  if [[ -f "/etc/systemd/system/${name}.service" ]]; then
    need_root rm -f "/etc/systemd/system/${name}.service"
    log "已删除 /etc/systemd/system/${name}.service"
  fi
}

stop_disable "$SERVICE_NAME"
stop_disable "$LEGACY_SERVICE"
need_root systemctl daemon-reload 2>/dev/null || true

# UFW best-effort
if command -v ufw >/dev/null 2>&1; then
  if need_root ufw status 2>/dev/null | grep -qi 'Status: active'; then
    log "尝试删除 UFW ${HTTPS_PORT}/tcp 规则 ..."
    need_root ufw delete allow "${HTTPS_PORT}/tcp" 2>/dev/null || true
    # Also try deleting by rule number matching comment — best effort
  fi
fi

if [[ -d "$INSTALL_DIR" ]]; then
  log "删除 $INSTALL_DIR ..."
  need_root rm -rf "$INSTALL_DIR"
else
  warn "$INSTALL_DIR 不存在，跳过。"
fi

if [[ "$PURGE_SHARE" == "1" ]]; then
  if [[ -d /home/share ]]; then
    log "删除 /home/share (PURGE_SHARE=1) ..."
    need_root rm -rf /home/share
  fi
else
  log "保留 /home/share（如需删除: PURGE_SHARE=1）"
fi

if [[ "$PURGE_DSH_HOME" == "1" ]]; then
  if [[ -d /var/lib/dsh ]]; then
    log "删除 /var/lib/dsh (PURGE_DSH_HOME=1) ..."
    need_root rm -rf /var/lib/dsh
  fi
else
  if [[ -d /var/lib/dsh ]]; then
    log "保留 /var/lib/dsh（如需删除: PURGE_DSH_HOME=1）"
  fi
fi

log "卸载完成。"
