# Fantivo 代码整理记录

整理日期：2026-09-06。

交付仓库：[anatanoojiisann/FantivoAI](https://github.com/anatanoojiisann/FantivoAI)。

## 来源与范围

新仓库取自本机 `TGBotFactory` 当时的完整工作文件，包含已暂存、未暂存及尚未被 Git 跟踪的业务实现；原目录、原远端与暂存状态保持不变。此次使用独立初始提交，旧提交历史保留在 `AuraxTeam/TGBotFactory`。

范围包含 Bot、Mini App、后台前后端、D1 迁移、法律页面、设计资料、回归测试与旧域名跳转。独立的 `fahtivo-home-demo`、`fahtivo-referral-service`、Telegram Bridge 测试项目及 Mage Face Swap 不属于此次生产代码迁移范围。

## 已精简

- 将跨 Bot、Mini App 和后台重复声明的商品、订阅配置与支付订单类型合并到 `shared/contracts.ts`，原导出名继续兼容。浏览器公开订单的精简字段映射保持原样。
- 合并品牌设置与 Webhook 设置脚本中的三个 Telegram 请求实现，统一处理 JSON、multipart、HTTP 失败及 Telegram API 失败。
- 删除未使用的商品查询函数和邀请模块导入，两个 Worker 开启未使用变量与参数检查。
- 上述业务及工具源码共净减少 90 行（不含新增回归测试和文档）。
- README 改为快速入口，详细合同与运维内容放入 `docs/DEVELOPMENT.md`，修正仓库地址、安装命令、章节编号和现有 Worker 身份说明。
- 新增统一 `setup`、前端 `build`、双 Worker `check:bundle` 命令，以及 Node 版本说明和 GitHub Actions 验证流程。
- 排除依赖、构建产物、Cloudflare 本地状态、环境凭据、临时截图、设计 QA 工作日志和历史生产测试报告；历史文件仍保留在原目录。

## 保留的有效实现

- Demo 数据仍被本地预览与后台视图测试使用。
- 旧域名跳转仍用于兼容已有 Telegram 入口。
- 现有媒体素材均被源码、页面或文档引用。
- 保留全部支付、鉴权、回调、退款、邀请奖励、多语言和公开平台边界逻辑。

## 本地验证

- 从空依赖目录运行 `npm run setup` 成功。
- `npm test`：后台 47 项、Bot/Mini App 与脚本 110 项，共 157 项全部通过；包含两个前端构建及 TypeScript 检查。
- 两个 Worker 的 Wrangler dry-run 打包通过。
- Bot 和后台公开配置发布检查通过。
- 导出文件未检测到常见 Token/私钥格式，仅保留环境变量示例文件。

本次交付为代码整理与 GitHub 仓库迁移，不包含线上部署、Webhook 注册或真实 Stars 支付、生成和退款验收。GitHub Actions 的执行结果以新仓库实际运行记录为准。
