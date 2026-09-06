# Telegram Mini App

Mini App 位于 `web/`，生产构建由同一个 Cloudflare Worker 作为静态资源提供。浏览器只调用 `/api/*`；Bot Token、Open Platform API Key 和回调 Secret 始终保留在 Worker 环境变量中。

## 身份验证

Mini App 把 Telegram 提供的原始 `initData` 放入请求头：

```text
Authorization: tma <raw initData>
```

Worker 按 Telegram Web Apps 规则计算 HMAC-SHA256、恒定时间校验签名，并校验 `auth_date`。默认有效期为 24 小时，可通过 `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` 调整。业务接口只使用签名数据中的 Telegram 用户 ID，不接受浏览器提交的 `externalUserId`。

## 用户来源归因

投放链接使用 Telegram Mini App 的 `startapp` 参数，并采用统一格式：

```text
https://t.me/<bot_username>/<app_name>?startapp=acq--<source>--<campaign>--<content>
```

例如：

```text
https://t.me/fantivo_bot/app?startapp=acq--xhs--summer_2026--creator-01
```

`source`、`campaign` 和 `content` 只能使用字母、数字、点、下划线和连字符，每段最长 64 字符。没有 `acq--` 前缀的功能性 `start_param` 不会被误判为投放来源；未标记入口统一记为 `telegram_organic`。直接 URL 中存在 UTM 时可作为兼容回退。

Mini App 在 `mini_app_opened` 事件写入 `acquisition_source`、`acquisition_medium`、`acquisition_campaign`、`acquisition_content` 和经过格式过滤的 `telegram_start_param`，并通过 PostHog `$set_once` 保存 `first_touch_*` 用户属性。管理后台的“首次观察用户”按每个 PostHog 用户最早一次 `mini_app_opened` 去重，因此来源功能上线前的历史用户无法可靠回填，可能显示为 `unattributed`。

PostHog 禁止采集 URL hash，并屏蔽 `tgWebAppData` 与 `tgWebAppStartParam` 在 URL 属性中的值；归因只使用上述白名单字段，不上传完整 Telegram 启动 URL 或认证数据。

## API

| 功能 | 接口 |
|---|---|
| 初始化用户、钱包、任务、商品和允许 Persona | `GET /api/bootstrap` |
| 获取所选 Persona Feed | `GET /api/home?locale=...&feedSessionId=...&personaCode=...` |
| 获取模板或 Asset 详情 | `GET /api/content/{kind}/{id}?locale=...&personaCode=...` |
| 刷新任务 | `GET /api/jobs` |
| 文生视频 | `POST /api/generation-jobs/text` |
| 图生视频 | `POST /api/generation-jobs/image` |
| 按模板文本创建 | `POST /api/content/template/{id}/generation-jobs/text` |
| 按模板或 Asset 图片创建 | `POST /api/content/{kind}/{id}/generation-jobs/image` |
| 取消任务 | `POST /api/generation-jobs/{id}/cancel` |
| 创建一次性 Credits Stars 订单 | `POST /api/payments/telegram-stars/orders`，传服务端商品 `product_id` |
| 查询 Stars 订单 | `GET /api/payments/telegram-stars/orders/{order_id}` |
| 创建 Stars 订阅 invoice | `POST /api/payments/invoice`，传 `productType=subscription` |

图生视频请求直接携带 JPG、PNG 或 WebP 文件，Worker 校验类型和 10 MB 大小限制后转发到 Open Platform。浏览器生成的 `requestId` 在一次提交和重试之间保持不变，Worker 将它与签名 Telegram 用户绑定后作为平台幂等键。

首页推荐由 Worker 使用服务端 `OPEN_PLATFORM_API_KEY` 请求 Open Platform。`/api/bootstrap` 只下发该 Key 允许的 Persona 和主 Persona，浏览器只能从这个列表切换；Worker 校验代码格式，Open Platform 再校验其是否属于允许集合。切换 Persona 或主动刷新会生成新的 Feed Session，同一 Session 保持稳定排序。推荐接口失败不会阻塞余额、创作、任务或支付功能。

点击首页内容时，Mini App 使用同一个 `personaCode` 读取公开内容详情，展示 `prompt`、默认参考图或普通预览。打开创作页时会把起始 Prompt 预填为可编辑文本，但不会把默认参考图当作用户输入。只有 `canCreate=true` 且最多需要一张图片的内容才开放创作入口；Asset 和 `requiresImage=true` 的模板仍必须上传用户图片，且用户图片始终覆盖任何默认参考图。浏览器只提交内容 kind/id、所选 Persona、可选调整要求和用户图片，实际 recipe、Persona 权限校验、扣费与任务来源归因都由 Open Platform 完成。

## 支付边界

Mini App 只负责创建并打开 Telegram Stars invoice。前端收到 `paid` 或 `pending` 状态只会轮询后端订单，不会直接增加 credits。只有 Bot Webhook 的 `successful_payment` 经 Open Platform 幂等入账、订单变为 `PAID` 后，前端才刷新余额。

充值页分为订阅计划和一次性积分购买。订阅计划完全来自后台已发布配置，固定 30 天自动续费；线上没有有效配置时不展示订阅计划。Worker 使用 `USER_PREFERENCES` KV 保存当前订阅的计划、起止时间、最后一次 charge 和自动续费状态，创建 invoice 前阻止已有未到期订阅的用户再开第二个计划。首次付款与自动续费都会分别调用 Open Platform `/v1/payment-events` 发放该周期 credits。用户可在当前订阅卡片中取消或恢复自动续费；Worker 使用最后一次 Telegram charge 调用 `editUserStarSubscription`，取消操作不改动平台钱包余额。

创建 invoice 前，用户必须勾选同意当前服务条款与隐私政策。客户端把服务端下发的条款版本原样提交；Worker 仅接受当前版本，并把版本写入 invoice payload。Bot 内的 `/buy` 也必须先经过“同意并继续充值”按钮。条款变更后，旧 invoice 会在 pre-checkout 阶段被拒绝。

## BotFather

部署完成后运行 `npm run setup:webhook`。脚本只把 `PUBLIC_WORKER_URL` 注册为全局 Web App 菜单；不要为用户长期保存独立的 Web App URL，因为 Telegram 客户端可能在 Worker 改名后继续使用旧地址。`/start` 和 `/app` 会清除历史按会话覆盖，重新继承全局菜单；`/app` 同时发送使用当前配置生成的直连按钮，作为缓存故障时的恢复入口。

正式 Worker 名称和公网入口由 `scripts/check-release.mjs` 锁定。品牌改名不得修改 Worker 名称。确需更换入口时，必须先部署新入口、保留旧入口跳转，再更新 Telegram；确认旧入口无流量后才能下线。

当前旧入口 `aurax-ai-bot.aurax-ai-telegram-bot.workers.dev` 由 `legacy-redirect/` 提供 308 跳转，兼容 Telegram 已缓存的历史菜单。不要在确认旧入口无流量前删除该 Worker；变更正式入口时必须同步更新并验证这个跳转目标。

## 上线检查

1. 从 Telegram 内打开，确认页面显示“Telegram 已连接”。
2. 验证首页只显示当前 API Key 允许的 Persona；切换 Persona 后 Feed、模板、详情和生成请求保持同一画像。
3. 验证 Asset 默认参考图与起始 Prompt 正确展示，进入创作页后 Prompt 可编辑，上传用户图片后不再使用默认图作为输入。
4. 验证余额和最近任务属于当前用户。
5. 分别完成文生视频和图生视频。
6. 重复同一请求，确认只创建一个任务并只扣费一次。
7. 使用测试或小额 Stars 商品验证一次性积分包的 pre-checkout、到账和余额刷新。
8. 发布一个测试订阅计划，验证 invoice 包含 30 天周期、首付到账、续费再次到账、已有订阅无法创建第二个计划。
9. 验证成功、失败、取消和退款状态。
10. 确认 Open Platform 回调 URL 公网可达，Telegram 能获取最终视频 URL。
11. 验证 `/terms`、`/privacy`、`/support`、`/paysupport` 和管理员工单转发。
12. 使用一条 `acq--source--campaign--content` 测试链接首次打开，确认 PostHog 和管理后台显示相同来源。
