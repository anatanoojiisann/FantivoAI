# Open Platform 接入手册

生产 Base URL：

```text
https://api.aurax.one/tgbot
```

除 `/healthz` 外，业务接口都必须使用当前 Bot 独有的 API Key：

```http
Authorization: Bearer $OPEN_PLATFORM_API_KEY
Content-Type: application/json
```

API Key 自动确定 Client、用户空间、钱包、任务、限额和允许画像集合。禁止调用 Aurax Backend、Provider、数据库或 Admin API；只能选择平台明确返回的画像，禁止伪造 Persona Header。

下面使用：

```bash
export OPEN_PLATFORM_BASE_URL='https://api.aurax.one/tgbot'
export OPEN_PLATFORM_API_KEY='平台负责人私下发放的 Key'
```

## 1. 健康检查

```bash
curl "$OPEN_PLATFORM_BASE_URL/healthz"
```

健康接口只表示 Open Platform 和 Provider 连接是否就绪，不返回 Provider 容量或凭证。

## 2. 获取 Persona Feed

先读取当前 Key 可用的画像：

```bash
curl -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/personas"
```

响应只包含允许画像与主画像，不包含 Aurax 全量画像或 Entry Code。然后选择其中一个：

```bash
curl -i \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/home?personaCode=a2&locale=zh-Hant&feedSessionId=telegram-123"
```

响应结构：

```json
{
  "schemaVersion": 2,
  "personaCode": "default",
  "feedSessionId": "telegram-123",
  "rankingVersion": "seeded-shuffle-v1",
  "banners": [],
  "categories": [],
  "sections": []
}
```

重要响应头：

- `X-Bot-Platform-Persona`：API Key 实际绑定的 Persona。
- `X-Aurax-Feed-Session`：实际 Feed Session。
- `X-Aurax-Ranking-Version`：排序版本。
- `Cache-Control: private, no-store`：不能把一个 Client 的 Feed 缓存给其他 Client。

`locale`、`feedSessionId` 和 `personaCode` 可选。省略 `personaCode` 使用主画像；传入代码必须属于 `/v1/personas` 返回的集合，否则返回 400。Persona Header 不能覆盖它。

## 3. 获取视频模型

```bash
curl \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/models"
```

提交任务时必须使用返回结果中 `enabled=true` 的公共 `id`，并遵守它支持的 `modes`、`durations`、`aspectRatios` 和 `qualities`。

## 4. 获取模板或 Asset 详情

从 `/v1/home` 取得条目的 `kind` 和 `id` 后：

```bash
curl \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/content/asset/ASSET_ID?personaCode=a2&locale=zh-Hant"
```

响应中的关键字段：

```json
{
  "content": {
    "id": "asset_123",
    "kind": "asset",
    "title": "Violet Orbit",
    "previewUrl": "https://.../orbit.webp",
    "prompt": "violet orbit, slow dolly",
    "defaultReferenceImageUrl": "https://.../orbit-reference.jpg",
    "defaultReferenceEnabled": true,
    "canCreate": true,
    "requiresImage": true,
    "requiredImageCount": 1,
    "durationSeconds": 5,
    "aspectRatio": "9:16"
  }
}
```

- `canCreate`：当前 Open Platform 能否忠实创建。
- `requiresImage`：创建前是否必须上传用户图片。
- `prompt`：可以展示给用户并让用户继续编辑的起始提示词；Template 与 Asset 都使用同一字段。
- `defaultReferenceImageUrl`：Asset 已启用且实际存在的服务器默认参考图。只有 `defaultReferenceEnabled=true` 且 URL 非空时才能把它标为默认参考图并用于预填；否则 `previewUrl` 只是作品预览。用户上传图片后必须让用户图片覆盖默认图。Template 的选择预览使用 `previewUrl`。
- 不可见内容返回 404；`personaCode` 必须属于 API Key 的允许画像。
- 接口不会返回 Provider 私有模型、账号、Cookie 或私有 recipe。

## 5. 创建或更新 Telegram 用户

每次收到私聊 Update 时都可以幂等调用：

```bash
curl -X POST "$OPEN_PLATFORM_BASE_URL/v1/users" \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{
    "externalUserId":"telegram_123456789",
    "displayName":"Demo User",
    "username":"demo_user",
    "languageCode":"zh-hant"
  }'
```

`externalUserId` 建议固定为 `telegram_<数字用户ID>`。相同 External ID 在不同 Client 下仍是不同用户。

## 6. 查询余额和账本

```bash
curl \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/users/telegram_123456789/wallet"

curl \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/users/telegram_123456789/wallet/ledger?limit=20"
```

钱包的 `version` 用于需要乐观并发控制的管理场景。Bot 不应根据本地缓存自行计算余额，以平台返回值为准。

## 7. Telegram Stars 到账

只允许在 Telegram 已发送并校验 `successful_payment` 后调用：

```bash
curl -X POST "$OPEN_PLATFORM_BASE_URL/v1/payment-events" \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{
    "externalUserId":"telegram_123456789",
    "provider":"telegram_stars",
    "transactionId":"TELEGRAM_PAYMENT_CHARGE_ID",
    "productId":"starter",
    "amount":100,
    "currency":"XTR",
    "credits":500
  }'
```

`transactionId` 必须使用 Telegram 的 `telegram_payment_charge_id`。相同 Client、Provider 和 Transaction ID 重放时不会重复入账。

## 8. 上传图片

图生视频先把 Telegram 图片流式上传：

```bash
curl -X POST \
  "$OPEN_PLATFORM_BASE_URL/v1/uploads?externalUserId=telegram_123456789&fileName=input.jpg" \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  -H 'Content-Type: image/jpeg' \
  --data-binary '@input.jpg'
```

响应中的 `upload.url` 作为生成请求的 `imageUrl`。不要把 Telegram Bot Token 或临时下载地址当作长期素材 URL 写进业务数据。

## 9. 创建视频

### 文生视频

```bash
curl -X POST "$OPEN_PLATFORM_BASE_URL/v1/generation-jobs" \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: telegram-update-10001' \
  --data '{
    "externalUserId":"telegram_123456789",
    "idempotencyKey":"telegram-update-10001",
    "mode":"text-to-video",
    "prompt":"cinematic city at night, rain and neon reflections",
    "imageUrl":"",
    "model":"peach-max",
    "durationSeconds":5,
    "aspectRatio":"9:16",
    "quality":"standard",
    "audioEnabled":true,
    "callbackUrl":"https://YOUR-WORKER.workers.dev/platform/events"
  }'
```

### 图生视频

请求结构相同，但：

```json
{
  "mode": "image-to-video",
  "imageUrl": "上传接口返回的 upload.url"
}
```

安全要求：

- `idempotencyKey` 使用 `telegram-update-<update_id>`，Webhook 重试必须返回原任务。
- `callbackUrl` 必须是 HTTPS，并与 Client 登记的回调 Host 一致。
- 创建时平台原子预扣模型所需 credits。
- Provider 提交失败、任务失败或成功取消时，平台幂等退款。
- Bot 只能使用公共模型 ID，不能传 Provider 私有账号、Cookie 或凭证。

### 基于模板创建

不需要图片的模板：

```bash
curl -X POST "$OPEN_PLATFORM_BASE_URL/v1/templates/TEMPLATE_ID/generation-jobs" \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: telegram-update-10002' \
  --data '{
    "personaCode":"a2",
    "externalUserId":"telegram_123456789",
    "idempotencyKey":"telegram-update-10002",
    "userPrompt":"add warm sunset lighting",
    "imageUrl":"",
    "model":"peach-max",
    "durationSeconds":5,
    "aspectRatio":"9:16",
    "quality":"standard",
    "audioEnabled":true,
    "callbackUrl":"https://YOUR-WORKER.workers.dev/platform/events"
  }'
```

如果内容详情显示 `requiresImage=true`，先上传图片，再把 `upload.url` 放入 `imageUrl`。Demo 的 Telegram 用法：

```text
/template TEMPLATE_ID --persona=a2 add warm sunset lighting
```

需要图片时，发送照片并把相同命令写在 Caption。`personaCode` 必须与取得该模板的首页画像一致。需要第三方原生 Effect/Template 能力、缺少公开安全 Prompt，或要求两张及以上输入图片的模板返回 422 `content_not_supported`；平台不会用近似提示词冒充该模板。

### Asset Follow Create

Asset 必须使用用户自己的上传图片：

```bash
curl -X POST "$OPEN_PLATFORM_BASE_URL/v1/assets/ASSET_ID/generation-jobs" \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: telegram-update-10003' \
  --data '{
    "personaCode":"a2",
    "externalUserId":"telegram_123456789",
    "idempotencyKey":"telegram-update-10003",
    "userPrompt":"warmer lighting and slower camera",
    "imageUrl":"UPLOAD_URL",
    "model":"peach-max",
    "durationSeconds":5,
    "aspectRatio":"9:16",
    "quality":"standard",
    "audioEnabled":true,
    "callbackUrl":"https://YOUR-WORKER.workers.dev/platform/events"
  }'
```

Telegram 中发送照片，Caption 写：

```text
/follow ASSET_ID --persona=a2 warmer lighting and slower camera
```

平台验证 Asset 对 API Key 允许的所选画像可见且允许 Make Similar，再用安全 recipe 组合 Prompt。不可见或不可复刻返回 404。创建后的 `job.sourceContentKind` 和 `job.sourceContentId` 可用于区分模板/Asset 转化；扣费、限额、失败退款与普通生成完全相同。

也可以使用统一入口：

```text
POST /v1/content/template/{templateId}/generation-jobs
POST /v1/content/asset/{assetId}/generation-jobs
```

## 10. 查询、列出和取消任务

```bash
curl \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/generation-jobs/JOB_ID"

curl \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  "$OPEN_PLATFORM_BASE_URL/v1/generation-jobs?externalUserId=telegram_123456789&limit=10"

curl -X POST \
  -H "Authorization: Bearer $OPEN_PLATFORM_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{}' \
  "$OPEN_PLATFORM_BASE_URL/v1/generation-jobs/JOB_ID/cancel"
```

Bot 在取消前应先确认任务的 `externalUserId` 属于当前 Telegram 用户。Demo 已实现这层校验。

常见状态：

- `submitting` / `queued` / `running`：处理中。
- `succeeded`：成功，读取 `outputUrl`。
- `failed` / `canceled`：终态；查看 `creditsRefunded`。

## 11. 生成结果回调

平台调用：

```http
POST https://YOUR-WORKER.workers.dev/platform/events
X-Bot-Platform-Signature: sha256=<hex>
Content-Type: application/json
```

Body：

```json
{
  "type": "generation.completed",
  "job": {
    "id": "job_xxx",
    "externalUserId": "telegram_123456789",
    "status": "succeeded",
    "outputUrl": "https://...",
    "creditsRefunded": false
  }
}
```

签名算法：

```text
HMAC-SHA256(OPEN_PLATFORM_CALLBACK_SECRET, raw_request_body)
```

必须用原始 Body 验签后再 JSON 解析。验签失败返回 401。Demo 已在 `src/index.ts` 中实现。

## 12. 错误结构

```json
{
  "code": "insufficient_credits",
  "message": "not enough credits"
}
```

常见错误：

| HTTP | code | 处理方式 |
|---|---|---|
| 400 | `invalid_request` | 检查 Body、模型参数或 Query |
| 401 | `invalid_api_key` | Key 缺失、被撤销或 Client 已暂停 |
| 404 | `not_found` | 用户、任务或资源不存在于当前 Client |
| 400 | `content_model_unavailable` | 改用 `/v1/models` 中 enabled 的模型 |
| 422 | `content_not_supported` | 当前 Provider 无法忠实创建该模板 |
| 409 | `conflict` | 任务状态或钱包版本冲突 |
| 409 | `home_profile_not_configured` | 请平台负责人给 Client 配 Persona |
| 402 | `insufficient_credits` | 引导用户使用 `/buy` 充值 |
| 429 | `limit_exceeded` | 稍后重试，不要无限立即重放 |
| 502 | `upstream_unavailable` | 平台或上游暂不可用，退避后重试 |

日志中只记录 `code`、HTTP 状态、任务 ID 和 Telegram update ID，不记录 API Key、Bot Token、Webhook Secret、Callback Secret 或完整付款凭证。

## 13. Admin 边界

实习生可调用的只有本手册中的 `/v1/*` 接口。以下操作由平台负责人完成：

- 创建、暂停 Client。
- 创建、撤销 API Key。
- 配置 Persona 和 Feed 限流。
- 登记允许的 Callback Host。

不要从 Bot 调用 `/admin/*`，也不要尝试读取 Aurax 主站接口。
