# dsh-official-vps

**核心就是官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）**，不做自研 agent 循环。

本仓库只提供 VPS 胶水：

1. 安装官方 `dsh` + Node 22  
2. `dsh web` 仍绑 `127.0.0.1:3080`（官方拒绝 `0.0.0.0`）  
3. 自签证书 HTTPS 反代到公网（默认 `:8443`），并传入 `--trusted-host`  
4. 工作区按你的要求落在 **`/home/share`**（UI 选目录，或 Documents 覆盖）  
5. `NODE_OPTIONS=--max-old-space-size=256`、关遥测、可选 1G swap，方便 **512MB RAM**

实测本机空闲 RSS 约 **140MB**（官方 web）；512MB 机器**强烈建议**先开 swap，并避免同机再跑别的重进程。

## 快速开始

```bash
sudo mkdir -p /opt && sudo tar xzf dsh-official-vps.tar.gz -C /opt
cd /opt/dsh-official-vps
./scripts/install.sh
# 编辑 PUBLIC_HOST=你的公网IP 与 DEEPSEEK_API_KEY
nano config.env
sudo ./scripts/setup-swap.sh   # 512MB 建议
./scripts/run.sh
```

浏览器打开日志里的 token 链接，把主机改成：

`https://你的IP:8443/?token=...`

（自签证书 → 高级 → 继续访问。）首次在网页里 **打开工作区目录 `/home/share`**，再在 Settings 配模型（或依赖 `DEEPSEEK_API_KEY`）。

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

也可直接改 patch / 插件 config 里的 `endpoint`，或在 UI 保存后写入 settings。

冒烟：`node plugins/web-search-anon-mcp/scripts/smoke-search.mjs "DeepSeek Harness"`

不修改 `node_modules/@deepseek-ai/*` 源码。

## 和之前错误方案的区别

| | 自写 Micro Harness | 本方案 |
|---|---|---|
| Agent / 工具 / Session | 自研 | **官方 Cordis 插件树** |
| 前端 | 自写 HTML | **官方 `dsh web`** |
| 本仓库代码 | 整套 runtime | 仅 install / HTTPS 反代 / 小 patch |

## 内存说明

- 磁盘：`node_modules` 约 400MB（正常）  
- 运行：heap 上限默认 256MB；总 RSS 会话中会升高  
- `patches/vps.cordis.patch.yml` 关掉 schedule / otel 等，可按需改回  
- Agent 预设可在网页里选 **minimal**，比 standard 工具更少  

## License

胶水脚本 MIT。DeepSeek Harness 本身遵循其上游 MIT / 第三方声明。
