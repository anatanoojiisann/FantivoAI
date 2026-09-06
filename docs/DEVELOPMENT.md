# Fantivo 开发与运维指南

Cloudflare Worker Telegram Bot、AuraX Video Mini App 与运营后台。每个 Bot 只通过独立的 Open Platform Client/API Key 访问平台，因此 Telegram 用户、credits、支付、任务和 Persona Feed 都与其他 Bot 隔离；Mini App 与 Bot 共用用户、余额、支付和任务。

Bot 只能访问：

```text
Telegram → 你的 Cloudflare Worker → https://api.aurax.one/tgbot
```

实习生不需要、也不应该取得 Aurax Backend、Provider、数据库或 Open Platform Admin 权限。

## 给实习生和 AI 的接手入口

第一次打开仓库时，先让 AI 完整阅读 [AGENTS.md](../AGENTS.md) 和本 README，再开始改代码。推荐直接把下面这段发给 AI：

```text
你正在维护 fantivo，这是独立的 Cloudflare Worker Telegram Bot。
请先完整阅读 AGENTS.md 和 README.md，再检查 git status、当前分支和现有测试。
只允许调用 OPEN_PLATFORM_BASE_URL 已公开的接口；不要访问或修改 Aurax Backend、Provider、数据库、Admin API，也不要索取或打印任何 Secret。
实现需求前请先追踪 src/index.ts、src/open-platform.ts、src/types.ts 和对应契约测试。
完成后必须运行 npm test 和 Wrangler dry-run，汇报修改文件、测试结果、未完成的真实端到端验证。
如果 wrangler.jsonc 仍包含 example.workers.dev、@replace_with_support_account，或 wrangler whoami 未登录，禁止执行真实部署，只能报告阻塞项。
```

AI 可以直接完成代码、测试、文档和 dry-run；涉及创建 Open Platform Client/API Key、修改 Persona 映射、设置 Cloudflare Secret、注册 Telegram Webhook、真实 Stars 支付或生产部署时，必须使用负责人提供的正确环境，并在执行前确认目标 Bot 和 Worker。

## 已有功能

- `/start`、`/help`、`/personas`、`/home [画像代码]`、`/app`、`/language`、`/balance`、`/buy`、`/support`、`/paysupport`、`/terms`、`/privacy`、`/jobs`、`/cancel`
- Bot `/home` 与 Mini App 首页共用 Aurax Home V2 Feed；可用画像集合与主画像均由 API Key 限定
- `/generate 提示词` 文生视频
- 发送图片并在 Caption 写提示词，完成图生视频
- `/template 模板ID 调整要求` 基于当前 Persona 的模板创建视频
- 发送图片并在 Caption 写 `/follow AssetID 调整要求`，复刻首页 Asset 的风格和运动
- 选择 Asset 后展示服务器默认参考图与可编辑起始提示词；用户上传图片时始终以用户图片为准
- 选择需要图片的 Template 后展示资源预览与可编辑起始提示词
- 12 种语言的 Bot 与 Mini App（含中文、俄语、乌克兰语和乌兹别克语），默认英语，用户语言保存在 Cloudflare KV
- Telegram Stars 一次性积分包与固定 30 天循环订阅、条款版本、pre-checkout 校验和 `successful_payment` 后幂等入账
- 生成任务预扣 credits，失败或取消自动退款
- HMAC 回调接收生成结果并把视频发送给 Telegram 用户
- 管理员 `/setbalance telegram_123 1000`
- Telegram Webhook secret、平台 API Key、回调签名校验
- Telegram Mini App 安全 `initData` 验证
- Mini App 文生视频、图生视频、任务列表、取消、Stars 订阅和一次性积分购买
- Worker 同域托管 Mini App，API Key 和 Bot Token 不进入浏览器
- Bot 内置支持工单，平台故障时条款和客服入口仍可使用
- 独立 AuraX Control 运营后台，覆盖用户、任务、支付、配置、数据分析和系统监控
- Telegram 深链首次来源归因、管理后台受控的 GPT/PostHog 聚合分析，以及 ChatGPT 通过私有 MCP 连接直接读取 PostHog 汇总数据

运营后台位于 `admin/`，真实 Cloudflare Worker 后端位于 `admin-service/`。本地先启动 D1/Worker，再启动 Vite：

```bash
npm run migrate:admin:local
npm run dev:admin:api
npm run dev:admin
```

后台默认请求同源 `/api`，不会再自动显示 Mock 数据。当前免费部署使用 D1 保存索引，并为既有公开作品代理白名单外部媒体，不启用 R2；管理员当前使用用户名和密码登录，动态验证码已按运营要求关闭。Bot 事件同步说明见 [docs/ADMIN.md](ADMIN.md)，ChatGPT 直连配置见 [docs/CHATGPT_POSTHOG.md](CHATGPT_POSTHOG.md)。

## 1. 五分钟启动

需要 Node.js 22.12+、npm、Cloudflare 账户，以及通过 BotFather 创建的 Telegram Bot。

```bash
git clone git@github.com:AuraxTeam/fantivo.git
cd fantivo
npm run setup
cp .dev.vars.example .dev.vars
npm test
```

当前生产 Open Platform 地址已经写入 `wrangler.jsonc`：

```text
https://api.aurax.one/tgbot
```

平台负责人会单独给每个 Bot 发放以下两个值：

- `OPEN_PLATFORM_API_KEY`：只属于当前 Bot；决定用户空间、余额空间和允许画像集合。
- `OPEN_PLATFORM_CALLBACK_SECRET`：验证生成结果回调。

不要在代码或文档中假设某个 Client 一定使用 `default` Persona。允许画像和主画像由平台负责人配置，并可能随 Bot 调整；`GET /v1/personas` 是唯一运行时来源。API Key 是密码，必须私下交接，不能提交到 Git。

编辑本地 `.dev.vars`：

```dotenv
TELEGRAM_BOT_TOKEN="BotFather 发放的 Token"
TELEGRAM_WEBHOOK_SECRET="自己生成的随机字符串"
OPEN_PLATFORM_API_KEY="平台负责人发放的 tgbp_live_..."
OPEN_PLATFORM_CALLBACK_SECRET="平台负责人发放的回调密钥"
BOT_ADMIN_TELEGRAM_IDS="管理员 Telegram 数字 ID，多个用逗号分隔"
```

`.dev.vars` 已被 `.gitignore` 排除。不要把任何 Token、Key 或 Secret 写进源码、README、测试、Issue 或聊天截图。

## 2. 修改自己的 Bot

必须修改：

1. `wrangler.jsonc`：维护 Fantivo 时保留现有 Worker `name` 和 `PUBLIC_WORKER_URL`；新 Bot 应使用独立资源并另行配置发布门禁。
2. `src/config.ts`：修改 Bot 名称及一次性积分包回退值；运行中的 Stars 商品、credits 数量和售价在 AuraX Control 发布配置。订阅计划默认不回退，只有后台发布正常状态计划后才会上线。
3. `SUPPORT_CONTACT`：改成负责处理付款问题的 Telegram 账号。

建议先保留 `DEFAULT_MODEL=peach-max`、`DEFAULT_DURATION_OPTIONS=[5, 10]`、`9:16` 和 `standard`；可用模型能力以 `GET /v1/models` 返回为准，用户可选时长白名单在 `src/config.ts` 中维护。

## 3. 本地开发

```bash
npm run dev
```

本地 Worker 启动后可以检查：

```bash
curl http://127.0.0.1:8787/health
```

Open Platform 的所有业务请求必须带：

```http
Authorization: Bearer $OPEN_PLATFORM_API_KEY
```

快速验证 Key 与 Feed：

```bash
curl -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "https://api.aurax.one/tgbot/v1/personas"

PERSONA_CODE='填写上一步返回的 personaCode'
curl -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "https://api.aurax.one/tgbot/v1/home?personaCode=$PERSONA_CODE&locale=zh-Hant&feedSessionId=local-test"
```

只能传 `/v1/personas` 返回的 `personaCode`，也不要伪造 Persona Header。省略 `personaCode` 时平台使用管理员指定的主画像。

## 4. 部署 Cloudflare Worker

### 部署前置检查

当前仓库保留 Fantivo 现有 Worker 与资源标识。代码迁移不代表重新部署；只要下面任一项仍成立，就禁止 AI 运行真实 `wrangler deploy`：

- `PUBLIC_WORKER_URL` 仍包含 `example.workers.dev`；
- `SUPPORT_CONTACT` 仍是 `@replace_with_support_account`；
- Worker `name` 还没有确认属于目标 Bot；
- `npx wrangler whoami` 显示未登录或登录了错误 Cloudflare 账号；
- 正式 Worker 的五个 Secret 尚未设置；
- Open Platform Client 的 Callback Host 尚未登记为该 Worker 域名。

安全的 AI 发布顺序：

```bash
git status --short
npm test
npm run check:bundle
npx wrangler whoami
```

确认 Worker 名称、公开 URL、客服账号、Cloudflare 账号和 Callback Host 全部正确后，AI 才可以继续下面的真实部署。不要使用 Wrangler temporary account 代替正式账号。

第一次部署前，把 secrets 加到 Cloudflare。Wrangler 会交互式读取值，不会把值写进仓库：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put OPEN_PLATFORM_API_KEY
npx wrangler secret put OPEN_PLATFORM_CALLBACK_SECRET
npx wrangler secret put BOT_ADMIN_TELEGRAM_IDS
npm run deploy
```

修改 `wrangler.jsonc` 的公开变量：Open Platform URL、Worker 公网 URL 和默认模型。`BOT_ADMIN_TELEGRAM_IDS` 用于接收 Bot 内支持工单；管理员必须先打开 Bot 并发送 `/start`。Mini App 的 Telegram 签名由 Worker 使用 Bot Token 校验，前端不会接触 Token。

从部署输出取得 `https://xxx.workers.dev` 地址并更新 `PUBLIC_WORKER_URL`。`OPEN_PLATFORM_CALLBACK_URL` 只应在平台负责人已经为当前 Client 登记相同 Callback Host 后启用；Host 未登记时应省略该变量，让生成任务通过“作品”页轮询更新。登记完成后可将 `https://fantivo-ai-bot.aurax-ai-telegram-bot.workers.dev/platform/events` 配置为回调地址，用于向用户主动发送成功、失败、取消和退款通知。

```bash
npm run check:release
npm run deploy
npm run setup:bot-brand
npm run setup:webhook
curl https://xxx.workers.dev/health
```

Webhook 脚本从本地 `.dev.vars` 读取 Telegram secrets，从 `wrangler.jsonc` 读取 Worker 公网地址，同时注册命令和“打开创作台”菜单按钮。健康检查应返回 `{"ok":true,"service":"fantivo-ai-bot"}`。

## 5. Feed 流程

用户发送 `/home` 后：

1. Worker 先用当前 Bot 的 API Key 请求 `GET /v1/personas`，或直接使用主画像。
2. 用户使用 `/home [画像代码]`，Worker 请求 `GET /v1/home?personaCode=...`。
3. Open Platform 根据 API Key 找到 Client，并拒绝不在允许集合内的画像。
4. 返回该 Persona 的 `banners`、`categories` 和 `sections`。
5. 同一个 `feedSessionId` 保持稳定排序，不同 Session 可以得到不同排序。

平台负责人可以在 Admin 页面给同一个 Bot 添加多个画像并指定主画像。Bot 只能在获准画像间选择，不能读取未授权画像或其他 Client 的 Feed。

## 6. 创建视频流程

文生视频：

```text
POST /v1/users
  → POST /v1/generation-jobs
  → 平台预扣 credits
  → Provider 生成
  → POST Worker /platform/events
  → Worker 把视频发给 Telegram 用户
```

图生视频会在创建任务前增加一步 `POST /v1/uploads`。Demo 已使用 Telegram `update_id` 作为生成幂等键，Webhook 重试不会重复创建任务。

基于首页内容创建：

```text
/home [画像代码] 取得 template/asset 的 kind 与 id
  ├─ template：/template TEMPLATE_ID 可选调整要求
  │    └─ 如果模板要求图片，发送图片并把上述命令放在 Caption
  └─ asset：发送图片，Caption 写 /follow ASSET_ID 可选调整要求
```

示例：

```text
/template cinematic-city --persona=a2 add a red taxi
```

或发送自己的照片，Caption 写：

```text
/follow asset_123 --persona=a2 warmer lighting and slower camera
```

Demo 从首页生成命令时会自动附带 `--persona=<实际画像>`。模板和 Asset 都按当前 Bot API Key 的允许画像校验。它们只借用公开内容 recipe，用户、余额、扣费、任务、退款和作品仍属于这个 Bot 的独立空间。需要第三方原生 Effect 的模板当前会明确提示不支持，不会用普通提示词伪装成原模板结果。

### Asset/Template 选择后的预览合同

`GET /v1/content/{kind}/{id}` 的公开字段包括：

```json
{
  "id": "asset_123",
  "kind": "asset",
  "title": "Violet Orbit",
  "previewUrl": "https://.../work-preview.webp",
  "prompt": "violet orbit, slow dolly",
  "defaultReferenceImageUrl": "https://.../source-reference.jpg",
  "defaultReferenceEnabled": true,
  "requiresImage": true
}
```

交互优先级必须固定为：

```text
用户上传图片 > Asset 默认参考图预览 > 普通资源预览 > 无图占位
```

- `prompt` 是允许展示并让用户编辑的起始提示词。
- 只有 `kind=asset`、`defaultReferenceEnabled=true` 且 `defaultReferenceImageUrl` 非空时，才可标记为“默认参考图”。
- `previewUrl` 是作品或 Template 的资源预览，不得冒充生成输入图。
- 用户上传图片后必须覆盖默认参考图；不能静默把默认图放在用户图前面。
- 当前 Demo 的 `/follow` 仍要求用户发送自己的图片；默认参考图用于帮助用户理解 Asset 的默认主体，不改变上传、创建、扣费或退款合同。
- Template 使用 `previewUrl + prompt` 说明效果；只有 Open Platform 返回的 `requiresImage/requiredImageCount` 才决定是否要求素材。
- 图片发送到 Telegram 失败时必须降级为文字消息，不能让命令流程失效。

实现位置：

| 文件 | 责任 |
|---|---|
| `src/types.ts` | Open Platform 公开类型 |
| `src/open-platform.ts` | API 请求、上传、创建与错误边界 |
| `src/index.ts` | Telegram 命令、内容预览和生成交互 |
| `src/telegram.ts` | `sendMessage`、`sendPhoto`、`sendVideo` 等 Telegram 调用 |
| `test/contracts.test.mjs` | 支付、幂等、内容预览与平台边界回归测试 |

常用接口：

| 功能 | 方法与路径 |
|---|---|
| 允许画像 | `GET /v1/personas` |
| Feed | `GET /v1/home` |
| 内容详情 | `GET /v1/content/{kind}/{id}` |
| 模型列表 | `GET /v1/models` |
| 创建/更新用户 | `POST /v1/users` |
| 查询余额 | `GET /v1/users/{externalUserId}/wallet` |
| 上传图片 | `POST /v1/uploads` |
| 创建视频 | `POST /v1/generation-jobs` |
| 按模板创建 | `POST /v1/templates/{templateId}/generation-jobs` |
| Asset Follow Create | `POST /v1/assets/{assetId}/generation-jobs` |
| 查询任务 | `GET /v1/generation-jobs/{jobId}` |
| 最近作品 | `GET /v1/generation-jobs?externalUserId=...` |
| 取消任务 | `POST /v1/generation-jobs/{jobId}/cancel` |
| Stars 入账 | `POST /v1/payment-events` |

完整请求 Body、响应和错误处理见 [docs/OPEN_PLATFORM.md](OPEN_PLATFORM.md)。

## 7. Stars 充值安全规则

1. 用户阅读并明确同意当前服务条款。
2. Bot 创建包含条款版本的 XTR invoice。
3. Telegram 发 `pre_checkout_query`，Bot 校验条款版本、商品、用户、币种和金额。
4. 只有收到 `successful_payment` 才调用 `/v1/payment-events`。
5. 使用 `telegram_payment_charge_id` 作为全链路幂等交易号。

Mini App 一次性 Credits 购买使用 `POST /api/payments/telegram-stars/orders` 创建持久化订单，只接受 `product_id` 和当前条款版本；Stars 与 Credits 数量始终由服务端商品配置决定。返回的 `order_id` 用于查询 `GET /api/payments/telegram-stars/orders/{order_id}`。前端 `openInvoice` 回调只触发状态轮询，只有订单由 Webhook 更新为 `PAID` 后才刷新余额和展示到账成功。

Admin Worker 每 10 分钟同步 Telegram `getStarTransactions`，保存原始交易事件并异步补充 AffiliateInfo。Affiliate 手工配置、数据口径和上线验收见 [docs/telegram-affiliate.md](telegram-affiliate.md)。当前版本不提供 Telegram Stars 退款操作。

循环订阅使用 Telegram 规定的 `2,592,000` 秒（30 天）周期。每个用户只能有一个未到期订阅；首付和后续自动续费都必须经过同样的金额、用户、条款与商品校验，每次成功付款分别发放本周期 credits。Mini App 可以通过 Telegram `editUserStarSubscription` 关闭或恢复后续自动续费；取消不会扣回已到账 credits，当前周期结束前也不能另开第二个计划。当前版本不提供升级、降级或套餐切换入口。

不能收到 `pre_checkout_query` 就加余额，不能自行构造成功支付，也不能用 `/setbalance` 模拟真实付款。改价或条款版本后旧 invoice 会被拒绝。`/paysupport` 必须保留，并把工单转发给 `BOT_ADMIN_TELEGRAM_IDS`。当前版本不提供 Telegram Stars 退款操作；不要通过人工余额调整冒充 Telegram 退款。

## 8. 正式发布门禁

`npm run check:release` 会阻止带占位地址、Demo Worker 名称、缺少条款页面或隐私页面的配置进入正式部署。Cloudflare 线上必须存在全部 secret，Open Platform 必须提供真实 URL、Client API Key 与回调签名 secret，完成这些配置前不得注册正式 Webhook 或接受 Stars 付款。

## 9. 免费部署的边界

截至 2026-08，Cloudflare 官方列出的 Workers Free 限制包括每天 100,000 请求、每次请求 10 ms CPU 和 50 个外部子请求；网络等待不计 CPU。这个服务适合早期免费试跑，但图片流转仍应观察 CPU。限制可能调整，发布前以 [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) 为准。视频文件不存到 Worker，Worker 只把 Telegram 图片流式传给 Open Platform，再把 Provider 的视频 URL 发回 Telegram。

## 10. 复制出新 Bot

每个新 Bot 都要：

1. 新建 BotFather Bot。
2. 请平台负责人新建独立 Client、API Key，配置允许画像并指定主画像。
3. 使用不同的 Worker 名称和公网 URL，并让平台负责人登记 Callback Host。
4. 修改品牌、商品和客服信息。
5. 分别设置 Cloudflare secrets、部署并注册 Webhook。

即使两个 Bot 面对同一个 Telegram ID，它们也有完全独立的用户、余额、支付和任务。平台负责人可以单独撤销某个 Key 或暂停某个 Client，而不影响 Aurax 主站和其他 Bot。

## 11. 交付检查

代码提交前：

```bash
npm test
npm run check:bundle
git status --short
```

上线前必须在测试 Bot 真实走通：

- `/start` 与 `/home`
- `/buy`、Stars 支付与 `/paysupport`
- 文生视频与图生视频
- `/template` 文本模板、需要图片的模板，以及图片 Caption `/follow`
- `/jobs`、`/cancel`
- 生成成功回调
- 失败/取消后的 credits 退款

`npm test` 只验证类型和关键安全契约，不能替代 Telegram、Cloudflare 与 Provider 的端到端验证。

## 12. AI 标准工作流

每次让 AI 接着开发时，按下面顺序执行：

1. 阅读 `AGENTS.md`、本 README 和相关 `docs/OPEN_PLATFORM.md` 章节。
2. 执行 `git status --short --branch`，不要覆盖实习生或其他人的未提交修改。
3. 从 Telegram 命令追踪到 `OpenPlatformClient`、公开 API 字段和测试，先确认现有合同。
4. 只修改当前 Bot 仓库；若缺少平台字段，记录需要平台负责人提供的公开合同，不要越权修改或调用 Backend。
5. 为新行为补契约测试，至少覆盖成功、缺字段、媒体发送失败降级和用户图片优先级。
6. 运行：

   ```bash
   npm test
   npm run check:bundle
   git diff --check
   ```

7. 如果只是代码交付，提交到功能分支并交给负责人审查；如果明确要求合入 main，先同步最新 main，再提交和推送。
8. 只有正式 Worker 配置、Cloudflare 登录态、Secrets 和 Callback Host 都确认后，才能真实部署并注册 Webhook。
9. 交付报告必须区分：代码测试通过、dry-run 通过、Worker 已部署、Webhook 已注册、Telegram 端到端已验证。这五项不能互相替代。

适合直接交给 AI 的任务格式：

```text
目标：在 fantivo 实现【具体功能】。
范围：只修改 fantivo，不访问 Aurax Backend、Provider、数据库或 Admin。
必须保持：支付金额校验、successful_payment 后入账、update_id 幂等、Webhook secret、回调签名、用户图片优先。
验收：补契约测试，运行 npm test、Wrangler dry-run 和 git diff --check。
发布：先只完成代码；除非正式 Worker 配置与 Cloudflare 登录均确认，否则不要真实部署。
```

开发约束见 [AGENTS.md](../AGENTS.md)。
