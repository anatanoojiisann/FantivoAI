# Telegram Affiliate 上线与对账

Fantivo AI 使用 Telegram 官方 Affiliate Program。Referral Link、首次归因、佣金计算和结算全部由 Telegram 负责；项目不会自行创建 Affiliate Cookie、邀请关系、佣金账户、提现或打款系统。

## 数据链路

1. 用户通过 Telegram 官方 Referral Link 首次打开 Fantivo。
2. Mini App 后端按 `product_id` 读取当前商品价格，创建唯一 `PENDING` 支付订单。
3. Telegram Stars invoice 使用 `XTR`；客户端不能指定最终 Stars 或 Credits 数量。
4. `pre_checkout_query` 校验订单、Telegram 用户、币种、金额、商品状态和条款版本。
5. 只有 Telegram `successful_payment` 才会把 `telegram_payment_charge_id` 发送给 Open Platform `/v1/payment-events`。
6. Open Platform 是 Credits 真账，并按 charge ID 幂等发放 Credits；Admin D1 保存订单状态和运营镜像。
7. Admin Worker 每 10 分钟调用 `getStarTransactions`。单次失败不会阻塞付款或 Credits 到账。
8. `invoice_payment` 的 Star Transaction 按 `StarTransaction.id ≈ telegram_payment_charge_id` 关联 Payment，并保存 Telegram 返回的 `AffiliateInfo`。

Star Transaction 原始 JSON 会保留。同步事件使用 `transaction id + content hash` 作为内部 `event_key`，不会假设退款或其他事件中的 Telegram transaction ID 永远是独立事件 ID。

## 人工配置 Affiliate Program

1. 确认 Bot 已配置 Main Mini App。
2. Bot Owner 在 Telegram 官方客户端打开 Bot Profile / Edit。
3. 打开 **Affiliate Program**。
4. 设置 Commission。
5. 设置 Duration。
6. 发布 Affiliate Program。
7. 使用测试 Affiliate 获取 Telegram 官方 Referral Link。
8. 用一个之前从未启动 Fantivo 的测试账号打开该 Referral Link。
9. 使用该账号完成一次 Telegram Stars Credits Purchase。
10. 在 Fantivo Admin 的 **Telegram Affiliate** 页面执行同步，并确认 Star Transaction 出现 AffiliateInfo、Payment 已关联 Affiliate。

Commission 和 Duration 属于 Telegram 运营配置，不应硬编码在代码中。Affiliate Program 创建后，这两个值可以提高，但不能直接降低；如需降低，必须结束旧 Program 后重新创建。上线前以 [Telegram referrals 官方文档](https://core.telegram.org/api/bots/referrals) 为准。

## 服务端配置

Bot Worker 与 Admin Worker 必须使用同一个 Bot 的 token，但 token 只通过各自的 secret 环境变量配置：

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

Admin Worker 还需要 `ADMIN_INGEST_SECRET`，Bot Worker 使用对应的 `ADMIN_SYNC_SECRET`。不要把 token、完整 initData、Webhook secret 或 Authorization token 写入日志。

定时同步由 `admin-service/wrangler.jsonc` 的 Cron Trigger 执行。管理员也可以在 **Telegram Affiliate** 页面手动同步；对应受保护接口为：

```http
POST /api/admin/v1/telegram-stars/sync
GET  /api/admin/v1/analytics/telegram-affiliate?from=YYYY-MM-DD&to=YYYY-MM-DD
```

## 指标口径

- **Total Stars Orders**：日期范围内已入账的 Stars 订单。
- **Affiliate Orders**：Star Transaction 明确返回 AffiliateInfo 的付款订单。
- **Affiliate Paid Users**：付款交易中可识别的 Affiliate 去重付费用户，不代表点击、打开或全部 Referral Users。
- **Affiliate Gross Stars Revenue**：关联订单原始 Stars 售价之和。
- **Affiliate Commission Stars**：Telegram AffiliateInfo 返回的 amount + nanostar_amount。
- **Telegram Credited Stars**：Telegram Star Transaction 返回的实际 amount + nanostar_amount。
- **Non-Affiliate Stars Revenue**：没有 AffiliateInfo 的已入账订单 Stars 售价。

佣金与实际入账以 Telegram 返回数据为财务真值；内部不会根据 Commission 比例重新计算并覆盖 Telegram 数据。

## 本期退款边界

当前版本不提供 Telegram Stars 退款操作、Admin 退款按钮或自动 Credits 冲正。若未来启用退款，必须先在 Open Platform 增加幂等退款事件和已消费 Credits 的 debt/freeze 策略，再接入 `refundStarPayment`。
