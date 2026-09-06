# AuraX Control 运营后台

运营后台由两部分组成：

- `admin/`：Vite 管理界面。
- `admin-service/`：Cloudflare Worker 管理服务，同域提供管理 API 和静态资源，D1 保存后台索引及既有公开作品的兼容数据。

当前范围包括运营看板、用户与 credits 差额调整、任务、Stars 支付与钱包、订阅计划与一次性 Credits 商品、生成参数、Open Platform 模型目录、PostHog Mini App 数据分析、用户首次来源和 GPT 聚合数据分析。首页内容配置由 Open Platform 负责，不在小程序后台管理。本次也不包含取消订阅、套餐切换、发布审核、客服工单、风控、管理员权限配置和独立审计日志页面。

## 数据边界

- Open Platform 仍是余额、支付入账和生成任务的业务来源。
- D1 是后台查询索引库，不替代 Open Platform 的业务账本。
- Bot Worker 在用户、钱包、支付和任务发生变化后，以 HMAC 签名事件同步 D1。
- 后台调账先使用同一个 `referenceId` 幂等写入 Open Platform，再把结果和流水写入 D1。
- 历史用户、任务和支付不会自动出现。上线后记录新事件；用户再次打开 Bot/Mini App、查看余额或任务时，会补同步一部分现有数据。完整历史数据需要 Open Platform 另行导出。

## 本地运行

首次运行先建立本地 D1：

```bash
cp admin-service/.dev.vars.example admin-service/.dev.vars
npm run build:admin
npm run migrate:admin:local
```

然后分别启动 API 和前端：

```bash
npm run dev:admin:api
npm run dev:admin
```

打开 `http://localhost:4174`。Vite 会把 `/api` 和 `/media` 代理到 `http://localhost:8788`，页面右上角应显示“实时数据”。新数据库显示 0 条记录是正常状态，不会再用 Mock 数据伪装历史数据。

只有需要界面演示时才显式启用 Mock：

```bash
VITE_ADMIN_DEMO_MODE=true npm run dev:admin
```

## API

| 功能 | 接口 | 保护方式 |
|---|---|---|
| 管理员登录 | `POST /api/auth/v1/login` | 用户名 + 密码，可选 TOTP，失败限速 |
| 当前会话 | `GET /api/auth/v1/session` | 签名 HttpOnly Cookie |
| 退出登录 | `POST /api/auth/v1/logout` | 签名 Cookie + CSRF |
| 后台初始化 | `GET /api/admin/v1/bootstrap` | 签名 Cookie |
| Open Platform 模型目录 | `GET /api/admin/v1/model-catalog` | 签名 Cookie |
| 重新同步模型目录 | `POST /api/admin/v1/model-catalog/sync` | 签名 Cookie + CSRF |
| Mini App 数据分析 | `GET /api/admin/v1/analytics/mini-app` | 签名 Cookie |
| GPT 分析 PostHog | `POST /api/admin/v1/analytics/mini-app/analyze` | 签名 Cookie + CSRF |
| 用户首次来源 | `GET /api/admin/v1/analytics/mini-app/users/{id}/acquisition` | 签名 Cookie |
| ChatGPT MCP | `POST /mcp` | OAuth 2.1 Bearer Token + `analytics.read` |
| MCP OAuth 元数据 | `GET /.well-known/oauth-protected-resource` | 公开发现文档，不含 Secret |
| credits 差额调整 | `POST /api/admin/v1/users/{id}/wallet-adjustments` | 签名 Cookie + CSRF |
| 发布套餐与生成配置版本 | `POST /api/admin/v1/configuration-versions` | 签名 Cookie + CSRF |
| Bot 事件同步 | `POST /api/ingest/v1/events` | 时间戳 + HMAC |
| 当前运行配置 | `GET /api/public/v1/configuration` | 公开，Bot 和 Mini App 最多缓存 60 秒 |
| 公开作品列表 | `GET /api/public/v1/publications` | 公开，只返回 `published` |
| 公开媒体 | `GET /media/{publicationId}/{video|cover}` | 公开，只代理 `published` 的白名单外部媒体 |

公开作品列表和媒体接口仅为兼容数据库中已有的 `published` 内容保留。运营后台不再展示作品，也不提供审核或状态变更 API。Telegram Worker 中现有的用户发布入口尚未删除，但新提交仍会写为 `pending_review`，因此不会进入公开列表；如不再需要用户发布能力，应在小程序和 Telegram Worker 中继续移除该入口与提交接口。

商品配置包含 `subscriptionPlans` 与 `creditPacks`。订阅计划可以为空；正常状态订阅最多 3 个、推荐计划最多 1 个，周期必须为 30 天。生产订阅价格没有代码回退值，管理员需要明确填写 Stars 售价与每周期 credits 并发布新配置版本，Mini App 才会展示和允许付款。

## Cloudflare 资源与部署

免费方案先使用 `aurax-admin-service.<account>.workers.dev`，无需域名、Zero Trust 或银行卡。若以后接入自有域名，可以再切换为 `admin.aurax.one`。

1. 创建 D1：`npx wrangler d1 create aurax-admin`，把返回的 ID 写入 `admin-service/wrangler.jsonc`。
2. 在 `admin-service/wrangler.jsonc` 设置非敏感的 `ADMIN_USERNAME`，并将 Open Platform 视频/CDN 主机名写入 `MEDIA_SOURCE_HOSTS`。
3. 生成高熵密码和至少 32 字符的会话签名密钥；密码只保存单向 SHA-256 结果。如果需要恢复动态验证码，再生成 Base32 TOTP 种子。将敏感值设置为 Admin Worker secrets：

```bash
npx wrangler secret put ADMIN_INGEST_SECRET --config admin-service/wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD_HASH --config admin-service/wrangler.jsonc
npx wrangler secret put ADMIN_TOTP_SECRET --config admin-service/wrangler.jsonc
npx wrangler secret put ADMIN_SESSION_SECRET --config admin-service/wrangler.jsonc
npx wrangler secret put OPEN_PLATFORM_API_KEY --config admin-service/wrangler.jsonc
npx wrangler secret put POSTHOG_PERSONAL_API_KEY --config admin-service/wrangler.jsonc
npx wrangler secret put OPENAI_API_KEY --config admin-service/wrangler.jsonc
```

4. 当前正式环境将 `ADMIN_TOTP_REQUIRED` 设为 `"false"`，登录页不显示动态验证码。若未来恢复，先用验证器扫描对应的 `otpauth://` 二维码并离线保存种子，再改为 `"true"`。
5. 在 `admin-service/wrangler.jsonc` 配置 PostHog 项目 ID、API Host 和 `OPENAI_MODEL`；PostHog Personal API Key 与 OpenAI API Key 只使用 Worker Secret，不能放入前端。
6. 应用远程迁移（包括 `0005_subscription_payments.sql`）并部署：

```bash
npm run build:admin
npx wrangler d1 migrations apply aurax-admin --remote --config admin-service/wrangler.jsonc
npm run deploy:admin
```

7. 如有自有域名，可将 `admin.aurax.one` 配为该 Worker 的 Custom Domain；不是免费部署的前置条件。

Bot Worker 与 Admin Worker 在同一个 Cloudflare 账户时，生产环境优先使用 Service Binding：绑定名为 `ADMIN_SERVICE`，服务名为 `aurax-admin-service`。同时在 Bot Worker 设置与 Admin Worker 相同值的 `ADMIN_SYNC_SECRET`。本地开发没有 Service Binding 时使用 `ADMIN_SYNC_BASE_URL=http://localhost:8788`。

不要把 Bot Token、Open Platform Key、共享 HMAC secret、密码哈希、TOTP 种子或会话签名密钥放进 `VITE_*`、源码或 `wrangler.jsonc`。

## GPT 数据分析边界

- 管理后台里的 GPT 按钮使用 OpenAI Responses API；ChatGPT 直连使用同一 Admin Worker 的私有 MCP 接口。两者都只能调用总览、首次来源拆分和去重转化漏斗三个只读工具。
- 模型不能提交或执行任意 HogQL；查询日期最长 93 天，单次分析最多执行 6 个工具调用。
- 发送给 GPT 的是事件总量、去重用户数和来源聚合，不包含 Telegram ID、用户名、生成 Prompt 或媒体内容。
- Responses 请求设置 `store=false`，服务端会把每轮返回的加密推理项原样带入下一轮工具调用。
- PostHog 或 OpenAI Secret 缺失时，后台显示“尚未连接”，不会回退到伪造数据。
- 来源归因从客户端功能上线后开始积累，历史事件缺少来源字段时显示 `unattributed`，不能由 GPT 猜测补全。

ChatGPT MCP 不需要也不会取得 `POSTHOG_PERSONAL_API_KEY`。ChatGPT 先通过 OAuth 登录，Admin Worker 校验 RS256 签名、issuer、audience、有效期、`analytics.read` scope，以及可选的用户 subject 白名单，校验通过后才由 Worker 在服务端查询 PostHog。完整配置和验证步骤见 [CHATGPT_POSTHOG.md](CHATGPT_POSTHOG.md)。

## 历史公开媒体兼容

- 公开接口只读取已有的 `published` 内容；其他状态不会返回。
- 后台不提供作品审核、通过、拒绝或上下架操作。
- 公开读取先查 D1 的 `published` 状态，再由 Worker 代理白名单源地址；重定向后的每个主机也必须位于白名单。
- 外部媒体代理使用短缓存且不暴露源地址，但源地址过期、被替换或上游故障时，已发布媒体仍可能失效。这是纯免费方案的已知限制。
- 当前免费方案不配置 R2，也不接受 Cloudflare R2 的按量计费订阅。
- 管理 API 在生产环境验证签名会话 Cookie；会话有效期 8 小时，写请求同时验证同源与 CSRF Token。
- 登录连续失败 5 次会锁定 15 分钟。若启用 TOTP，则接受当前前后一个 30 秒时间窗，已成功使用的计数器不能重放。
- `ADMIN_TOTP_REQUIRED` 默认视为 `true`。当前按运营要求在 Wrangler 中显式设为 `"false"`，登录页和服务端同时停用动态验证码；底层能力保留，改回 `"true"` 即可恢复。
