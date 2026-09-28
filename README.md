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

登录后网关会用内部进程 launch token 与官方 dsh 交换浏览器 cookie，**你不必再粘贴 `?token=`**，也看不到原始 process token。

**登录态保留约 1 年**：网关会话 cookie（`dsh-gw-session`）`Max-Age` / `Expires` 默认 **365 天（31536000 秒）**，可用环境变量 `SESSION_MAX_AGE_SEC` 覆盖。官方 `dsh-auth-*` cookie 通过 `patches/vps.cordis.patch.yml` 将 `connection.cookieMaxAgeDays` 设为 **365**（不改 `@deepseek-ai` 源码）。若 cookie 仍缺失/过期而网关会话有效，反代会**静默重新交换** launch token，无需再次输入用户名密码。

### 共享工作区说明

- 账号门禁只控制「谁能打开公网入口」  
- **聊天 / Settings / 会话** 仍跑在**同一个**官方 `dsh web` 进程上  
- 工作区默认请在 UI 中打开 **`/home/share`**（多用户共享该目录）


## 删除对话（硬删除）

官方侧栏只有「归档会话」（软隐藏）。本仓库插件 `@local/dsh-vps-delete-session` 在会话 ⋯ 菜单增加 **「删除对话」**（order 500，危险样式）：

1. 强确认对话框（明确列出会删 / 不会删的内容）
2. `POST /api/vps.deleteSession`（走官方 connection 鉴权）硬删除该会话

**会删除（仅该 session id）：**

- `$DSH_HOME/sessions/<escaped-cwd>/session-<uuid>/` 整目录
- `$DSH_HOME/storages/session_projcache/sessions/session-<uuid>.json`
- 可识别的 spill 临时目录 `spillStore.root/session-<sha256前12位>/`
- 工作区 registry 中的 sessionIds / 置顶 / 归档登记

**不会删除：**

- 共享工作区目录本身（如 `/home/share`）——多用户文件保留
- 内容寻址附件库（可能被其他会话引用）

官方「删除工作区」只是注销文件夹登记、保留会话；本功能相反：删会话数据、不动共享 cwd。

### 本地机密（勿提交）

- `config.env` — API key、PUBLIC_HOST 等  
- `data/cert.pem` / `data/key.pem` — TLS  
- `data/auth/users.json` — 用户与 scrypt 哈希  
- `data/auth/session.secret` — 会话 HMAC 密钥  
- `data/dsh-launch.token` — 进程 launch token（mode 600）  
- `dsh-home/` — 官方 harness 状态  

`run.sh` 会在缺失时生成 `session.secret`，并从 dsh 日志行 `dsh web: ...?token=` 写入 `dsh-launch.token`。

## 联网搜索（匿名 MCP）

官方 DeepSeek `web_search` 已在 `patches/vps.cordis.patch.yml` 中禁用，改用本地插件：

- Host: `@local/dsh-web-search-anon-mcp`（provider id: `anon-mcp`）
- Settings UI: `@local/dsh-client-ui-settings-web-search-anon`

**Endpoint 三选一**（Settings → Plugins → 联网搜索 / Web search）：

| 值 | 后端 |
|---|---|
| `parallel`（默认） | Parallel Search MCP — `https://search.parallel.ai/mcp` |
| `keenable` | Keenable MCP — `https://api.keenable.ai/mcp`（失败时 REST fallback） |
| `youcom` | You.com Free MCP — `https://api.you.com/mcp?profile=free` |

冒烟：`node plugins/web-search-anon-mcp/scripts/smoke-search.mjs "DeepSeek Harness"`

## 认证冒烟（不启 dsh）

```bash
node --test proxy/auth/__tests__/auth-smoke.test.mjs
```

## 和之前错误方案的区别

| | 自写 Micro Harness | 本方案 |
|---|---|---|
| Agent / 工具 / Session | 自研 | **官方 Cordis 插件树** |
| 前端 | 自写 HTML | **官方 `dsh web`** |
| 本仓库代码 | 整套 runtime | install / HTTPS 反代 + 认证门禁 / 小 patch |

## 内存说明

- 磁盘：`node_modules` 约 400MB（正常）  
- 运行：heap 上限默认 256MB；总 RSS 会话中会升高  
- `patches/vps.cordis.patch.yml` 关掉 schedule / otel 等，可按需改回  
- Agent 预设可在网页里选 **minimal**，比 standard 工具更少  

## License

胶水脚本 MIT。DeepSeek Harness 本身遵循其上游 MIT / 第三方声明。
