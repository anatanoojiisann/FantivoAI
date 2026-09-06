# ChatGPT 直接读取 PostHog

这项能力与管理后台里的“GPT 分析”按钮不同。Admin Worker 现在同时提供一个私有、只读的 MCP 端点；配置完成后，可以在普通 ChatGPT 对话里直接问：

- “过去 30 天的新用户分别从哪里来？”
- “按 campaign 比较本月拉新效果。”
- “telegram 来源从打开 Mini App 到付费的转化漏斗如何？”

ChatGPT 会调用 `https://<admin-worker>/mcp`，Admin Worker 再使用服务端保存的 PostHog Personal API Key 查询数据。PostHog Key 永远不会发给 ChatGPT。

## 提供的工具

| 工具 | 用途 |
|---|---|
| `get_posthog_overview` | 指定日期内的事件总量、来源和常用维度总览 |
| `get_posthog_acquisition_breakdown` | 按 source、campaign 或 content 读取首次来源用户数 |
| `get_posthog_conversion_funnel` | 读取打开、Feed、生成、账单和付费的去重用户漏斗，可按来源过滤 |

这是结构化时间序列分析，不是文档知识库，因此没有添加 `search`、`fetch` 或任意 HogQL/SQL 工具。所有工具只读，日期范围最多 93 天，只返回聚合值；不会返回 Telegram ID、用户名、Prompt、媒体或任何 Secret。

## 生产配置

私有 PostHog 数据必须使用 OAuth。ChatGPT 不能用自定义 API Key 连接 MCP，也不应直接持有 PostHog Key。使用 Auth0 等成熟 OAuth 2.1 身份提供商，不要自行实现授权服务器。

以 Auth0 为例：

1. 在 Auth0 创建 MCP/API 资源，将 API Identifier 设置为最终的 `https://<admin-worker>/mcp`，签名算法使用 RS256。
2. 创建 `analytics.read` 权限，并只授予实际需要读取运营数据的账号。
3. 启用 Auth0 的 MCP/CIMD 或 DCR 支持、Authorization Code + PKCE（S256）。发现文档必须公开 authorization endpoint、token endpoint 和受支持的注册方式。
4. 将 ChatGPT 插件管理页面显示的准确 Redirect URI 加入 Auth0 allowlist。不要猜 callback ID；若身份提供商满足 issuer identification 要求，可使用页面显示的稳定回调地址。
5. 确保访问令牌的 `iss`、`aud`、`exp`、`sub` 和 `scope` 正确，其中 `aud` 必须与下面的 `MCP_OAUTH_AUDIENCE` 完全一致，scope 必须包含 `analytics.read`。

把以下非敏感配置写入 `admin-service/wrangler.jsonc` 的 `vars`，或作为 Worker 环境变量配置：

```json
{
  "MCP_RESOURCE_URL": "https://<admin-worker>/mcp",
  "MCP_OAUTH_ISSUER": "https://<tenant>.auth0.com/",
  "MCP_OAUTH_AUDIENCE": "https://<admin-worker>/mcp",
  "MCP_OAUTH_JWKS_URL": "https://<tenant>.auth0.com/.well-known/jwks.json",
  "MCP_ALLOWED_SUBJECTS": "auth0|<owner-subject>"
}
```

`MCP_ALLOWED_SUBJECTS` 可选，多个 subject 用逗号分隔；私有运营连接建议明确配置。PostHog Personal API Key 仍只通过 Cloudflare Secret 保存：

```bash
npx wrangler secret put POSTHOG_PERSONAL_API_KEY --config admin-service/wrangler.jsonc
```

若四个 OAuth 必需变量缺少任意一个，MCP 会安全停用，OAuth 元数据端点返回 503，工具不会查询 PostHog。

## 部署和连接 ChatGPT

1. 运行测试和发布检查，再部署 Admin Worker：

```bash
npm test
npm --prefix admin-service run check:release
npm run deploy:admin
```

2. 检查 `https://<admin-worker>/.well-known/oauth-protected-resource`，确认 resource、issuer 和 `analytics.read` 正确。
3. 用 MCP Inspector 连接 `https://<admin-worker>/mcp`，确认 initialize、tools/list、OAuth 登录和三个工具调用正常。
4. 在 ChatGPT 打开 **Settings → Security and login → Developer mode**。
5. 打开 [ChatGPT Plugins](https://chatgpt.com/plugins)，点击加号，填写名称和说明，并在 Connection 中输入完整的 `https://<admin-worker>/mcp`。
6. 创建连接，检查只发现上述三个只读工具；第一次调用时完成 OAuth 登录。
7. 工具名称、Schema 或 OAuth 配置改变后，在插件连接页点击 **Refresh**，并用新对话重新测试。

Developer mode 是否可用取决于 ChatGPT 账号和工作区策略。生产端点必须使用稳定的公网 HTTPS；本地开发可使用安全 MCP tunnel 或临时 HTTPS tunnel，但不能把临时地址当作正式端点。

## 验收清单

- 未登录可以完成 MCP initialize 和 tools/list，但调用数据工具会出现 OAuth 登录。
- 错误 issuer、audience、scope、subject、过期令牌或错误签名均不能查询 PostHog。
- 有效账号只能看到聚合结果，返回中不包含 PostHog Key 或单个用户标识。
- 超过 93 天的查询在访问 PostHog 前被拒绝。
- 工具列表中不存在任意 HogQL/SQL 执行能力。

官方参考：[构建 MCP Server](https://developers.openai.com/apps-sdk/build/mcp-server/)、[OAuth 鉴权](https://developers.openai.com/plugins/build/auth)、[连接 ChatGPT Developer mode](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt/)。
