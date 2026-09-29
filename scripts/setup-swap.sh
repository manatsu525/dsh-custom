#!/usr/bin/env bash
# Optional 1G swap — strongly recommended on 512MB RAM VPS
set -euo pipefail
if swapon --show | grep -q .; then
  echo "Swap already active:"
  swapon --show
  exit 0
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi
fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo "1G swap enabled"
