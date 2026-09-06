# Fantivo

Fantivo AI 的 Telegram Bot、视频创作 Mini App 与运营后台，使用 TypeScript、Vite 和 Cloudflare Workers。Bot 与 Mini App 共用用户、credits、Stars 支付和视频任务；业务生成仅通过 Aurax Open Platform 公开 API 完成。

## 开始开发

需要 Node.js 22.12+（推荐 Node 22 LTS）、npm。

```bash
git clone https://github.com/AuraxTeam/fantivo.git
cd fantivo
npm run setup
cp .dev.vars.example .dev.vars
npm test
```

`setup` 按各自 lockfile 安装根目录、Mini App 和后台前端依赖；后台 Worker 使用根目录工具链。根据所需功能私下配置本地 secrets，详见 [开发与运维指南](docs/DEVELOPMENT.md) 和 [后台配置](docs/ADMIN.md)。测试使用本地模拟，不需要生产凭据。

```bash
npm run dev             # Bot / Mini App API，端口 8787
npm run dev:web         # Mini App 前端，在另一个终端运行
```

后台本地开发：

```bash
npm run migrate:admin:local
npm run dev:admin:api   # 后台 API，端口 8788
npm run dev:admin       # 后台前端，另一个终端，端口 4174
```

## 代码结构

| 路径 | 职责 |
| --- | --- |
| `src/` | Bot 命令、Mini App API、支付、平台回调与后台事件同步 |
| `web/` | Mini App、12 种语言、Telegram Bridge、分析事件和静态法律页面 |
| `admin/` | 运营后台前端，默认连接真实后台；显式配置可启用 Demo |
| `admin-service/` | 后台 Worker、D1 迁移、配置、邀请奖励、Stars 对账和 MCP |
| `shared/contracts.ts` | 跨端商品与支付订单类型，无运行时逻辑或环境凭据 |
| `legacy-redirect/` | 旧 Mini App 域名兼容跳转 |
| `scripts/` | 配置检查、Bot 设置和 Webhook 工具 |
| `test/`、`admin-service/test/` | 自动化回归测试 |
| `docs/` | 平台合同、开发运维和设计说明 |

## 验证

```bash
npm test                # 类型检查、两个前端构建、后台和 Bot/Mini App 测试
npm run check:bundle    # 两个 Worker 的 Wrangler dry-run，不部署
npm run check:release  # Bot 公开配置检查
npm --prefix admin-service run check:release
git diff --check
```

`npm run build` 单独构建两个前端。构建产物、依赖、本地数据库、secrets 和临时报告不进入 Git。GitHub Actions 在 push 和 pull request 上执行测试、打包与公开配置检查。

自动化测试不能替代测试 Bot 的真实 `/start`、`/buy`、Stars 支付、文生视频、图生视频、失败退款与 `/jobs` 验收。

## 部署与边界

本仓库保留现有 Fantivo Worker 名称、公开地址和资源绑定，迁移 GitHub 仓库不会改变线上服务。部署步骤见 [开发与运维指南](docs/DEVELOPMENT.md)；运行部署或 Bot 设置脚本会修改对应外部环境，代码整理无需执行这些操作。

必须保留 Telegram Webhook secret、Mini App 签名和回调签名验证；Stars 仅在 `successful_payment` 后幂等入账。不得把 `.dev.vars`、API Key 或 Bot Token 提交到仓库。开发约束见 [AGENTS.md](AGENTS.md)。

## 相关文档

- [Open Platform API 合同](docs/OPEN_PLATFORM.md)
- [Mini App 集成](docs/MINI_APP.md)
- [后台与数据同步](docs/ADMIN.md)
- [ChatGPT / PostHog MCP](docs/CHATGPT_POSTHOG.md)
- [Telegram 官方 Affiliate](docs/telegram-affiliate.md)
- [语言策略](docs/LANGUAGE_STRATEGY.md)
- [产品说明](PRODUCT.md)、[设计规范](DESIGN.md)、[设计系统](docs/design-system/README.md)
- [本次代码整理记录](docs/CLEANUP.md)
