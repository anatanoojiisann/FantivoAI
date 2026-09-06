# Fantivo

Fantivo AI 是一个通过 Telegram 创作 AI 视频的应用。本仓库包含 Telegram Bot、Mini App、运营后台前端及后台 Worker；使用 TypeScript、Vite、Cloudflare Workers、KV 和 D1。

视频生成、用户 credits 和支付入账通过 **Aurax Open Platform 公开 API** 完成。仓库不包含 Aurax 主站后端或模型 Provider，也不是下载后即可离线生成视频的项目。

## 功能与数据流

- **Bot**：命令入口、余额、文生视频、图片生成视频、模板创作、任务查询、取消任务、语言和客服支持。
- **Mini App**：个性化灵感 Feed、模板与 Asset 详情、创作、作品、credits 购买、30 天 Stars 订阅、邀请奖励和 12 种语言。
- **运营后台**：用户与任务查询、积分调整、商品和订阅配置、生成参数、Stars 对账、Affiliate 数据及 PostHog 分析。
- **可选集成**：GPT 聚合数据分析、带 OAuth 验证的 ChatGPT MCP 只读分析接口。

```text
Telegram Bot / Mini App
        ↓
Fantivo Worker ──公开 API──→ Aurax Open Platform
        │                     用户、credits、支付入账、生成任务
        └──签名事件──→ Admin Worker ──→ D1 后台查询索引
                           ↑
                       运营后台前端
```

Bot 和 Mini App 共用同一个 Open Platform Client 下的用户、余额与任务。D1 保存后台索引与配置；Open Platform 才是 credits 和生成任务的业务来源。Mini App 不持有平台 API Key 或 Bot Token。

## 1. 安装与快速验证

需要 **Node.js 22.12+**（推荐 Node 22 LTS，见 `.nvmrc`）、npm，以及私有仓库读取权限。

```bash
git clone https://github.com/AuraxTeam/fantivo.git
cd fantivo
npm run setup
npm test
npm run check:bundle
```

`npm run setup` 按三个 lockfile 安装根目录、`web/` 和 `admin/` 的依赖；`admin-service/` 使用根目录工具链，不需要单独安装。`npm test` 包含类型检查、两个前端构建和回归测试，不需要真实账号、付款或生产 secrets。`check:bundle` 只做两个 Worker 的 dry-run，不发布到 Cloudflare。

## 2. 只看界面：Demo 预览

安装依赖后，可以先运行界面预览：

```bash
npm run dev:web
```

打开 Vite 输出的地址，默认是 `http://localhost:5173`。在没有 Telegram `initData` 的普通浏览器中，Mini App 使用 Demo 数据；示例余额、订单和任务不代表真实业务结果，也不会产生真实视频。部分 Demo 视频依赖本地 QA 素材服务，未启动该服务时可以检查界面，但该视频无法播放。

后台 Demo 需显式开启：

```bash
VITE_ADMIN_DEMO_MODE=true npm run dev:admin
```

打开 `http://localhost:4174`。后台默认连接 API，API 失败时不会自动切换到 Demo 数据。不要把 Demo 模式用于生产验收。

## 3. 配置与真实接口联调

先复制示例文件；示例里的占位值需要替换为对应测试环境的值。

```bash
cp .dev.vars.example .dev.vars
cp admin-service/.dev.vars.example admin-service/.dev.vars
# 需要前端分析事件时再配置：
cp web/.env.example web/.env.local
```

### 环境变量放在哪里

| 位置 | 主要变量 | 用途 |
| --- | --- | --- |
| 根目录 `.dev.vars` | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_WEBHOOK_SECRET` | Bot API 与 Webhook 验证 |
| 根目录 `.dev.vars` | `OPEN_PLATFORM_API_KEY`、`OPEN_PLATFORM_CALLBACK_SECRET` | Fantivo 专属 Client 与回调签名 |
| 根目录 `.dev.vars` | `BOT_ADMIN_TELEGRAM_IDS` | Bot 管理员及客服接收人 |
| 根目录 `.dev.vars` | `ADMIN_SYNC_SECRET`、`ADMIN_SYNC_BASE_URL` | 后台签名通信；HTTP 本地地址通常为 `http://localhost:8788` |
| `admin-service/.dev.vars` | `ADMIN_INGEST_SECRET` | 必须与 Bot 的 `ADMIN_SYNC_SECRET` 相同 |
| `admin-service/.dev.vars` | `ADMIN_PASSWORD_HASH`、`ADMIN_SESSION_SECRET` | 后台密码哈希与会话签名；即使本地打开登录页也需有效配置 |
| `admin-service/.dev.vars` | `ADMIN_TOTP_SECRET` | 仅在启用 TOTP 时要求有效种子 |
| `admin-service/.dev.vars` | `OPEN_PLATFORM_API_KEY`、`TELEGRAM_BOT_TOKEN` | 平台业务接口与 Telegram Stars 同步 |
| `admin-service/.dev.vars` | `POSTHOG_PERSONAL_API_KEY`、`OPENAI_API_KEY` | 可选的后台分析与 GPT 分析 |
| `web/.env.local` | `VITE_POSTHOG_KEY`、`VITE_POSTHOG_HOST` | 可公开的前端项目采集配置，构建时生效 |
| `admin/.env.local`（按需创建） | `VITE_ADMIN_API_BASE_URL`、`VITE_ADMIN_DEMO_MODE` | 后台前端连接地址与显式 Demo 开关 |

`wrangler.jsonc` 和 `admin-service/wrangler.jsonc` 保存 Worker 名称、公开地址、KV/D1/Service Binding 及公开配置。后台 `ADMIN_USERNAME`、`ADMIN_TOTP_REQUIRED`、PostHog 项目 ID 和 MCP OAuth 公开参数也在后台 Wrangler 配置中。

后台密码哈希格式是 `sha256$` 加 SHA-256 摘要的 **base64url**，不是十六进制；会话密钥至少 32 字符。具体登录与集成配置见 [后台指南](docs/ADMIN.md) 和 [MCP 指南](docs/CHATGPT_POSTHOG.md)。

`VITE_*` 会进入浏览器构建产物，只能放公开配置。`.dev.vars` / `.env.local` 均不提交；生产 secrets 通过 `wrangler secret put` 写入各自 Worker。

### 本地启动

后台先初始化本地 D1 和静态资源：

```bash
npm run build:admin
npm run migrate:admin:local
```

以下常驻进程分别在不同终端运行：

| 命令 | 默认地址 | 作用 |
| --- | --- | --- |
| `npm run dev:admin:api` | `http://localhost:8788` | 本地后台 Worker / D1 |
| `npm run dev` | `http://localhost:8787` | Bot 与 Mini App API Worker |
| `npm run dev:web` | `http://localhost:5173` | Mini App Vite 前端，代理 `/api` 到 8787 |
| `npm run dev:admin` | `http://localhost:4174` | 后台 Vite 前端，代理 `/api`、`/media` 到 8788 |

Bot 优先使用 `ADMIN_SERVICE` Service Binding；未提供该绑定时才走 `ADMIN_SYNC_BASE_URL`，两种方式都要求共享签名密钥一致。新建的本地 D1 没有历史用户、订单和任务，显示空数据是正常状态。

`dev:admin:api` 显式设置 `ENVIRONMENT=development`，其中部分后台 API 会跳过生产鉴权，只能用于本机开发；不要把这个开发服务直接暴露为生产后台。

普通浏览器预览不会验证 Telegram 登录链路。真实 Mini App 联调需要从测试 Bot 打开 HTTPS 页面，并由 Telegram 提供有效 `initData`；直接调用受保护的 `/api/*` 没有签名时返回 401 是预期行为。

## 4. 代码目录

| 路径 | 职责 / 修改入口 |
| --- | --- |
| `src/index.ts` | Worker 路由、Bot 命令、支付 Webhook、生成通知 |
| `src/mini-app.ts` | Mini App API、用户数据与创建流程 |
| `src/open-platform.ts` | Open Platform 公开接口客户端 |
| `src/config.ts` | 品牌、默认生成选项、积分包回退值与条款版本 |
| `src/payment*.ts`、`src/admin-sync.ts` | Stars 订单与支付、后台事件和配置通信 |
| `web/src/` | Mini App 页面、样式、语言、Telegram Bridge 与分析事件 |
| `web/public/` | 品牌素材、法律页面与公开静态文件 |
| `admin/src/` | 运营后台视图、数据访问和显式 Demo 数据 |
| `admin-service/src/` | 后台 API、认证、配置、邀请奖励、对账与 MCP |
| `admin-service/migrations/` | D1 数据库版本迁移，按文件顺序执行 |
| `shared/contracts.ts` | 跨端商品、订阅配置与支付订单类型 |
| `legacy-redirect/` | 旧 Mini App 域名兼容跳转 |
| `scripts/` | 发布检查、生产只读检查、Bot 品牌和 Webhook 设置 |
| `test/`、`admin-service/test/` | Bot/Mini App、脚本与后台回归测试 |
| `docs/` | 平台合同、开发运维与设计资料 |

运行中的商品、订阅、新用户赠送和生成参数由后台发布配置控制。修改代码里的积分包回退值不等于修改正在使用的后台配置。生产订阅默认没有回退计划，必须先在后台发布有效计划。

## 5. 验证与 CI

```bash
npm test
npm run check:bundle
npm run check:release
npm --prefix admin-service run check:release
git diff --check
```

| 命令 | 检查范围 |
| --- | --- |
| `npm test` | 两个 Worker 类型检查、两个前端构建、后台和 Bot/Mini App/脚本测试 |
| `npm run build` | 仅构建 Mini App 与后台前端 |
| `npm run check:bundle` | 两个 Worker 打包及资源读取，不部署 |
| `check:release` | 公开配置与静态文件，不能证明线上 secrets 或第三方服务可用 |
| `npm run check:production` | 请求配置中的线上首页、健康检查和 favicon；不会创建业务订单 |

`.github/workflows/ci.yml` 在 push 和 pull request 上执行安装、测试、打包、公开配置与工作区检查；没有自动部署步骤。依赖、构建产物、本地数据库、secrets 和临时报告由 `.gitignore` 排除。

本次整理的本地验证为 **157 项测试通过**（后台 47 项，Bot/Mini App 与脚本 110 项）。真实 Telegram `/start`、`/buy`、Stars 支付、文生视频、图生视频、失败退款与 `/jobs` 仍需在测试 Bot 单独验收。

## 6. 部署

仓库保留现有 Fantivo Worker 名称、公开入口和 Cloudflare 资源绑定。**推送 GitHub 不会部署或改变线上服务。** 维护现有 Fantivo 时不要因为仓库或品牌名称变化就修改 Worker 身份；新 Bot 必须使用独立 Client 和资源，详见 [开发与运维指南](docs/DEVELOPMENT.md)。

准备好目标 Cloudflare 账号、各 Worker secrets、D1/KV/Service Binding 和公开配置，并完成上述本地验证后，按以下顺序发布：

```bash
npx wrangler whoami
# 有新增迁移时，先核对目标数据库再应用全部待执行迁移
npx wrangler d1 migrations apply aurax-admin --remote --config admin-service/wrangler.jsonc
npm run deploy:admin
npm run deploy
```

`deploy:admin` 构建后台并发布后台 Worker；`deploy` 重新运行测试和 Bot 公开配置检查，发布 Bot Worker，再执行线上只读检查。完整配置步骤见 [后台部署说明](docs/ADMIN.md) 和 [开发与运维指南](docs/DEVELOPMENT.md)。

只有首次配置或需要更新对应设置时，才运行下列脚本：

```bash
npm run setup:webhook       # 注册 Webhook、命令与 Mini App 菜单
npm run setup:bot-brand     # 更新 Bot 名称与头像
```

平台回调 Host 未登记时，省略 `OPEN_PLATFORM_CALLBACK_URL`，通过作品列表轮询获取状态；登记后再启用回调推送。旧域名由 `legacy-redirect/` 保留兼容，确认不再被使用前不要删除。

## 7. 常见问题与业务约束

| 现象 | 排查方向 |
| --- | --- |
| 安装或构建失败 | 确认 Node 版本，再运行 `npm run setup`，不要只安装根目录依赖 |
| 普通浏览器有余额，后台却没有该用户 | 浏览器处于 Demo；需从 Telegram 打开真实入口 |
| 后台返回 `auth_not_configured` | 检查用户名、密码哈希格式、会话密钥和 TOTP 开关；示例值不可直接使用 |
| 邀请奖励、赠送或支付订单服务不可用 | 检查后台 Worker、D1 迁移、Service Binding 和共享签名密钥 |
| 订阅计划为空 | 后台尚未发布有效订阅，或频道/条款版本不匹配 |
| 生成完成但 Bot 没有主动通知 | 检查 Callback Host、回调 URL 与签名；先通过作品页查询状态 |
| PostHog/GPT 显示未连接 | 检查对应可选集成配置；不会回退到虚构统计 |

必须保留 Telegram Webhook secret、Mini App `initData` 和平台回调签名验证。Stars 仅在 `successful_payment` 后校验金额、用户和订单并幂等入账；`pre_checkout_query` 或前端 invoice 回调都不能直接加 credits。生成失败的 credits 退款与 Telegram Stars 退款是不同操作，当前没有 Stars 退款操作入口。

开发约束见 [AGENTS.md](AGENTS.md)。不得把 Token、API Key、密码或会话密钥提交到源码、日志和文档。

## 文档索引

- [开发与运维指南](docs/DEVELOPMENT.md)
- [Open Platform API 合同](docs/OPEN_PLATFORM.md)
- [Mini App 集成](docs/MINI_APP.md)
- [后台、认证与数据同步](docs/ADMIN.md)
- [ChatGPT / PostHog MCP](docs/CHATGPT_POSTHOG.md)
- [Telegram 官方 Affiliate](docs/telegram-affiliate.md)
- [语言策略](docs/LANGUAGE_STRATEGY.md)
- [产品说明](PRODUCT.md)、[设计规范](DESIGN.md)、[设计系统](docs/design-system/README.md)
- [代码整理范围与记录](docs/CLEANUP.md)
