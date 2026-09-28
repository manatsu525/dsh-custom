# dsh-custom / dsh-official-vps

**核心就是官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）**，不做自研 agent 循环。

本仓库只提供 VPS 胶水：

1. 安装官方 `dsh` + Node 22  
2. `dsh web` 仍绑 `127.0.0.1:3080`（官方拒绝 `0.0.0.0`）  
3. 自签证书 HTTPS 反代到公网（默认 `:8443`），并传入 `--trusted-host`  
4. **用户名/密码网关门禁**（反代层）：首次创建管理员 → 之后登录；管理员可管用户  
5. 工作区按你的要求落在 **`/home/share`**（所有登录用户共享同一官方 dsh 进程与工作区）  
6. `NODE_OPTIONS=--max-old-space-size=256`、关遥测、可选 1G swap，方便 **512MB RAM**

不修改 `node_modules/@deepseek-ai/*` 源码。`config.env`、证书、`data/auth/*` 密钥与用户库请留在本机，勿提交。

**Remote Models / settings:** 本仓库的 `@local/dsh-vps-owns-host` 会在页面 head 注入 `__DSH_TRANSPORT__.ownsHost=true`，使公网 IP 访问时 Models/供应商设置走 host persistence（配合网关用户名密码鉴权）。官方默认在非 loopback 下只用 memory，会报 `settings are unavailable in this browser`；无此 overlay 时仍是官方行为。


## Debian 11 一键部署 / 卸载

面向 **Debian 11 (bullseye)**。可用 root 或带 sudo 的普通用户执行。无需 Docker。

### 一键安装

```bash
# 推荐：从 GitHub 拉取并执行
curl -fsSL https://raw.githubusercontent.com/manatsu525/dsh-custom/main/scripts/deploy-debian.sh | sudo bash

# 或指定公网 IP / API Key
PUBLIC_HOST=203.0.113.10 DEEPSEEK_API_KEY=sk-xxx \
  curl -fsSL https://raw.githubusercontent.com/manatsu525/dsh-custom/main/scripts/deploy-debian.sh | sudo bash

# 已克隆仓库时
git clone https://github.com/manatsu525/dsh-custom.git
cd dsh-custom
sudo ./deploy.sh
# 等价: sudo ./scripts/deploy-debian.sh
```

安装完成后：

- 目录：`/opt/dsh-custom`（可用 `INSTALL_DIR` 覆盖）
- 服务：`dsh-custom.service`（`systemctl status dsh-custom`）
- 访问：`https://$PUBLIC_HOST:8443/` → 首次 **`/auth/setup`**

常用环境变量 / 参数：

| 变量 / 标志 | 说明 |
|---|---|
| `PUBLIC_HOST` | 公网 IP 或域名（未设时尝试 ifconfig.me / icanhazip / hostname -I） |
| `INSTALL_DIR` | 默认 `/opt/dsh-custom` |
| `HTTPS_PORT` | 默认 `8443` |
| `SETUP_SWAP` | `0`/`1`；内存 < 1G 时默认 `1` |
| `DEEPSEEK_API_KEY` | 可选，写入 `config.env` |
| `--non-interactive` / `NONINTERACTIVE=1` | 无提示 |

### 一键卸载

```bash
curl -fsSL https://raw.githubusercontent.com/manatsu525/dsh-custom/main/scripts/uninstall-debian.sh | sudo bash -s -- --yes

# 或本地
sudo ./uninstall.sh --yes
# 等价: sudo ./scripts/uninstall-debian.sh --yes
```

默认会停止并删除服务与 `/opt/dsh-custom`，**保留** `/home/share` 与 `/var/lib/dsh`：

| 标志 | 作用 |
|---|---|
| `--yes` / `NONINTERACTIVE=1` | 跳过确认 |
| `PURGE_SHARE=1` / `--purge-share` | 同时删除 `/home/share` |
| `PURGE_DSH_HOME=1` / `--purge-dsh-home` | 同时删除 `/var/lib/dsh` |

### 手动步骤（同上，拆开跑）

## 快速开始（手动）

```bash
sudo mkdir -p /opt && sudo tar xzf dsh-custom.tar.gz -C /opt
cd /opt/dsh-custom   # 或 dsh-official-vps
./scripts/install.sh
# 编辑 PUBLIC_HOST=你的公网IP 与 DEEPSEEK_API_KEY
nano config.env
sudo ./scripts/setup-swap.sh   # 512MB 建议
./scripts/run.sh
```

浏览器打开：

`https://你的IP:8443/`

（自签证书 → 高级 → 继续访问。）

### 首次设置 / 登录 / 管理

| 场景 | 路径 |
|---|---|
| **首次打开**（尚无用户） | 自动跳转 **`/auth/setup`**，创建管理员（密码 ≥ 8 位） |
| 之后访问 | **`/auth/login`** |
| 用户管理（仅管理员） | **`/auth/admin`** — 列表 / 创建 / 禁用启用 / 重置密码 / 删除（不可删唯一管理员） |
| 退出 | 管理页或 `POST /auth/logout`（清除网关会话，并尽量清除 `dsh-auth-*` cookie） |

网关会话 cookie：`dsh_gw_session`（HttpOnly；HTTPS 下 Secure）。
官方 `dsh-auth-*` cookie 仍由 harness 签发；登录成功后网关用 launch token 换会话，用户不必碰 `?token=`。

## 配置

复制 `config.env.example` → `config.env`：

| 变量 | 含义 |
|---|---|
| `PUBLIC_HOST` | 公网 IP 或域名（必填，进 `--trusted-host` 与证书 CN/SAN） |
| `HTTPS_PORT` | 默认 `8443` |
| `DSH_PORT` | 官方 web 本地端口，默认 `3080` |
| `DOCUMENTS_DIRECTORY` | 写入 cordis patch，默认 `/home/share` |
| `NODE_MAX_OLD_SPACE_SIZE` | 默认 `256` |
| `DEEPSEEK_API_KEY` | 可选；写入 `dsh-home/agnes.env` |
| `AUTH_DIR` | 网关用户库与 session secret，默认 `./data/auth` |

## systemd（可选）

```bash
sudo cp systemd/dsh-vps.service /etc/systemd/system/dsh-custom.service
# 按实际 Install 路径改 WorkingDirectory / ExecStart
sudo systemctl daemon-reload
sudo systemctl enable --now dsh-custom
```

## 与「自研 runtime」的区别

| | 本仓库 | 旧自研包 |
|---|---|---|
| Agent | 官方 `@deepseek-ai/dsh` | 自写循环 |
| UI | 官方 web client | 自研 |
| 公网 | HTTPS 反代 + 网关账号 | 视实现 |
| 工作区 | `/home/share`（共享） | 各异 |

## License

胶水脚本以仓库为准；DeepSeek Harness 遵循其上游许可证。
