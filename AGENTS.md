# Fantivo 开发规则

这个仓库是独立 Telegram Bot，不是 Aurax 主站代码。

## 可以修改

- `src/config.ts` 中品牌名、商品、Stars 售价与 credits。
- Bot 命令、提示词模板、消息文案、菜单和生成交互。
- 在 Open Platform 已公开 API 范围内增加 Bot 功能。

## 不可以做

- 不把任何 Token、API Key 或 Secret 写进源码、测试、提交记录或日志。
- 不跳过 Telegram `successful_payment` 就入账。
- 不用可猜的交易号或随机重试生成；Telegram update ID 必须作为生成幂等键。
- 不调用或试探 Aurax Backend、数据库、Admin API 或 Provider；只能调用 `OPEN_PLATFORM_BASE_URL`。
- 不删除支付金额校验、Webhook secret 校验或平台回调签名校验。

## 每次交付前

运行 `npm test`，确认 `.dev.vars` 没有进入 Git，并在测试 Bot 完整走一遍 `/start`、`/buy`、支付、文生视频、图生视频、失败退款和 `/jobs`。

## 目录与验证

- `src/` 是 Bot/Mini App Worker，`web/` 是 Mini App，`admin/` 与 `admin-service/` 是运营后台。
- 跨端商品与订单合同集中在 `shared/contracts.ts`，不要复制同一类型到各模块。
- 新环境运行 `npm run setup`；代码交付运行 `npm test`、`npm run check:bundle` 和 `git diff --check`。
- 新仓库来自 TGBotFactory 当前工作文件的独立快照，原目录及其 Git 暂存状态不属于本仓库。
- 仅代码整理和 GitHub 推送不包含生产部署或真实付费操作；真实 Bot 验收须单独报告，不能用单元测试替代。
