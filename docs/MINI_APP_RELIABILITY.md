# Mini App 生成链路修复（2026-09-16）

## 已确认的代码问题

- 缺少 initData 时，生产构建也会使用 mockData 并创建本地演示任务。现在只有 Vite 开发模式允许演示；生产入口显示 Telegram 打开链接，不载入创作模块，不请求生成。`platform=unknown` 不再丢弃已有 initData，仍由服务端验签。
- HTTP 请求没有覆盖响应正文读取的截止时间；HTTP 200 的无效 JSON 曾被当成成功响应。现均可返回明确错误，结束加载状态。客户端读取 20 秒、初始化 35 秒、提交 60 秒；平台 GET 每次 8 秒、JSON 写入 15 秒、图片上传 30 秒。只有原先允许的 GET 或带幂等键请求可重试一次。
- 初始化冷启动时多处读取同一配置，现共享进行中的配置请求。用户创建完成后才读取其任务；邀请关系和新用户赠送在用户入库后并行执行。保留赠送、邀请、余额的业务逻辑。平台请求和初始化依赖均记录耗时，但不记录请求正文、initData 或密钥。
- 刷新任务原先静默忽略错误。现保留已有作品，提示刷新失败，单请求刷新并逐步退避到 60 秒；手动刷新或回到前台可立即重试。后台余额刷新不再覆盖更新的任务状态。
- 原生禁用的生成按钮无法观测输入未完成时的点击。现只在提交中禁用；其余点击先记录原因，再显示对应的校验提示。有效请求超时后，在当前页面输入未改变的情况下重试沿用 request_id。
- 401 现在在服务端区分缺少数据、签名不符、日期异常、会话过期等原因；会话过期返回 session_expired，客户端停止轮询并提示重新从 Telegram 打开。验签、时效和支付校验保持生效。

4.42 秒是历史单次观测，不足以证明是哪一个上游慢。上述代码问题与该历史延迟的具体因果关系需要上线后的依赖耗时验证。8/28 的线上 401 日志已不可查，不能追溯确定原因。

## 埋点口径 v2

所有新客户端事件有 `funnel_version=2` 和每次页面加载的 `app_session_id`。

| 阶段 | 事件 | 口径 |
| --- | --- | --- |
| 打开 | mini_app_opened | 初始化之前；包含未获得 Telegram 上下文的生产访问 |
| 入口阻断 | mini_app_launch_blocked | 缺少 Telegram 上下文 |
| 初始化 | mini_app_bootstrap_started / mini_app_initialized / mini_app_bootstrap_failed | initial 区分首次初始化与后台刷新，duration_ms 为客户端等待耗时 |
| 进入创作 | creation_viewed | 切换到创作页；可能早于初始化完成，data_ready 标记当时状态 |
| 点击生成 | generate_clicked | 含校验是否通过及原因；通过时带 request_id |
| 发出生成请求 | generation_submitted | request_id，重试沿用 |
| 收到创建结果 | generation_created | request_id、job_id、replayed；不等同于视频已完成 |
| 观测到成功 | generation_succeeded | 客户端观测到 succeeded 且有 outputUrl；同一浏览器标签页按用户和任务去重 |
| 观测到失败/取消 | generation_completion_failed | 与提交失败 generation_failed 分开 |
| 查看结果 | generation_result_viewed | 打开带输出的结果详情；不代表已播放完视频 |
| 播放失败 | job_video_playback_failed | 浏览器媒体错误码，不记录视频 URL |
| 刷新失败/恢复 | jobs_refresh_failed / jobs_refresh_recovered | 次数、错误码和刷新耗时 |

服务端 `mini_app_request_completed` 带 app_session_id、请求头中的 request_id、状态和耗时；`mini_app_generation_created` 使用已验证的 request_id 和真实 job_id。签名验证通过的生成回调记录 `generation_completion_received`，可用 job_id 关联创建日志；回调重发应按 job_id 去重。

客户端关闭后不能上报完成事件；首次加载时的历史已完成作品只作为基线，不计新完成。分析权威完成量应结合签名回调及真实任务状态。PostHog 的 DNT、拦截和网络失败也可能导致缺失。

旧版 mini_app_opened 实际在初始化成功后触发。比较新旧版本须使用 funnel_version 分段。后台工具目前返回各事件的独立去重用户数（ordered=false），不是同一批用户按顺序完成的漏斗。严格分析应按 app_session_id、request_id、job_id 关联，允许用户先进入创作再完成初始化。

## 验证与上线

本地自动化覆盖缺少登录上下文、unknown 平台、初始用户创建顺序、配置请求合并、无效响应、请求/正文超时、相同请求 ID 重试、完成事件去重、过期与篡改鉴权。交付检查为 npm test、npm run check:bundle、git diff --check 和 .dev.vars 未被跟踪。

执行结果：主项目 124 项、后台 48 项全部通过；前端/后台构建、两项 Worker 打包检查、发布公开配置检查及差异格式检查通过，.dev.vars 未被跟踪。本地 Edge 的隔离会话验证了生产入口引导、初始化失败后恢复、空输入提示、生成超时后可重试并进入作品页、刷新失败时保留作品及恢复后清除提示、登录过期后显示 Telegram 入口。浏览器接口全部模拟，外部 HTTPS 请求均被拦截，没有写入线上 PostHog 或创建真实任务；完成去重由单元测试与浏览器本地状态共同验证。

合并前清理了主模块重复的样式和埋点初始化、重复请求 ID 赋值及鉴权失败重复渲染；生成请求统一使用当前提交的固定 request_id。后台 MCP 的返回声明与独立用户计数口径一致，并有端到端协议测试覆盖。

本次不包含生产部署、真实付费生成或 Telegram 支付验收。上线后需单独完成测试 Bot 的 /start、/buy、支付、文生/图生、失败退款及 /jobs 验收，再用新数据确认实际影响与耗时改善。
