# AuraX Mini App 组件与交互方案

这套方案基于现有 Mini App 的首页、创作、作品、任务详情、发布表单和钱包流程提炼。当前阶段只确定结构、排版、尺寸、状态与动效，不确定品牌色。视觉样板见 [`index.html`](./index.html)。

## 1. 设计方向

Mini App 属于高频任务型产品，采用 `Operate` 模式：

- 首页帮助用户发现灵感，但不替代创作主流程。
- 创作页在一个移动端首屏中完成输入、参数确认、成本确认和提交。
- 作品页首先表达状态，其次才是媒体预览与后续操作。
- 钱包页把余额、法律同意、订阅和一次性积分按决策顺序排列。
- 颜色不能是唯一状态信号；必须同时使用图标、文字、线型、进度或动效。

## 2. 基础规范

### 尺寸

| 项目 | 规范 |
|---|---|
| 支持视口 | 320–700 px |
| 页面水平边距 | 18 px |
| 最小触控目标 | 44 × 44 px |
| 控件高度 | 44 / 48 / 54 px |
| 卡片圆角 | 14 px |
| 输入框圆角 | 12 px |
| 小控件圆角 | 10 px |
| 药丸形态 | 只用于筛选、计数和状态标签 |

### 间距

使用 `4 / 8 / 12 / 16 / 24 / 32 / 48` 七档间距：

- 4–8：图标、标签、计数等紧密关系。
- 12–16：组件内部排布。
- 24–32：同一页面中的模块分组。
- 48：页面级段落或任务阶段分隔。

### 排版

| 样式 | 建议值 | 用途 |
|---|---|---|
| Display | 32/36，700 | 钱包余额、重要结果 |
| Page title | 24/28，700 | 页面主标题 |
| Section title | 18/24，700 | 模块标题 |
| Body | 14/20，400–500 | 正文、说明 |
| Label | 12/16，650–700 | 字段、按钮、卡片标题 |
| Meta | 11/16，500–650 | 时间、成本、参数、辅助说明 |

数字、金额、进度和任务编号使用等宽数字；核心按钮文案不可截断。

### 动效

| 类型 | 时长 | 使用场景 |
|---|---:|---|
| Press | 120 ms | 按压缩放至 0.985 |
| State | 180 ms | 选中、启用、筛选变化 |
| Overlay | 240 ms | 全屏详情进入与退出 |
| Page | 180 ms | 根页面切换，淡入并移动不超过 8 px |

默认缓动使用 exponential ease-out。`prefers-reduced-motion` 下取消位移和循环动画，但保留状态结果。

## 3. 第一批组件

只提取当前已出现三次以上、或跨多个页面具有相同意图的组件。

### 框架与导航

| 组件 | 变体 | 现有来源 |
|---|---|---|
| `AppShell` | root / overlay | 四个根页面、两个详情 dialog |
| `TopBar` | default / compact | 全局顶部栏、详情顶部栏 |
| `BottomNav` | 4 个固定目标 | 首页、创作、作品、钱包 |
| `PageHeader` | title / title + action | 首页与作品页标题、刷新动作 |

### 动作与选择

| 组件 | 变体 | 关键行为 |
|---|---|---|
| `Button` | primary / secondary / quiet / destructive | loading、disabled、错误解释、成本副文案 |
| `IconButton` | default / inverse | 44×44，必须有可访问名称 |
| `SegmentedControl` | 2–3 项 | 方向键、Home/End、选中项唯一可聚焦 |
| `FilterChip` | selected / idle + count | 只用于集合筛选，不承担主要动作 |
| `ActionGroup` | 2–4 项 | 根据任务状态逐步出现 |

### 输入

| 组件 | 变体 | 关键行为 |
|---|---|---|
| `PromptField` | empty / filled / error | 字数、错误与恢复建议内联显示 |
| `UploadField` | empty / preview / uploading / error | 支持类型与大小在选择前可见 |
| `ParameterControl` | select / read-only | 比例可选，时长与质量只读 |
| `ConsentGate` | unchecked / checked | 支付按钮由条款同意解锁，无布局位移 |

### 内容与任务

| 组件 | 变体 | 关键行为 |
|---|---|---|
| `ContentCard` | banner / compact | 只打开内容详情，不直接提交创作 |
| `JobCard` | queued / working / completed / failed / canceled | 图标 + 文案 + 进度表达状态 |
| `StatusLabel` | 所有任务状态 | 不只依赖颜色；保持统一术语 |
| `ProgressBar` | determinate / indeterminate | 生成任务使用线性进度，不使用进度环 |
| `KeyValueList` | compact / detailed | 任务参数、支付与订阅信息 |
| `PlanOption` | default / recommended / active | 推荐是标签，不改变信息顺序 |

### 反馈与覆盖层

| 组件 | 变体 | 使用原则 |
|---|---|---|
| `InlineBanner` | info / success / error | 区域级失败与重试 |
| `Toast` | success / error | 动作结果，3.5 秒，`aria-live` |
| `EmptyState` | first-use / filtered / error | 解释原因并提供唯一主动作 |
| `Skeleton` | feed / list / detail | 形状必须接近真实内容，避免布局跳动 |
| `FullScreenDetail` | template / job | 保留根页面位置，统一返回与 Esc 行为 |
| `ConfirmDialog` | destructive / legal | 只用于需要保护焦点或确认后果的动作 |

## 4. 四条交互范式

### 创作

`选择模式 → 完成输入 → 确认参数与成本 → 提交 → 进入作品查看进度`

- 文本模式只要求 Prompt；图片模式要求图片，并允许 Prompt 为空或按服务规则校验。
- 输入有效前主按钮禁用，禁用原因放在按钮附近。
- 提交保持同一个 `requestId`，失败重试不重复扣费。
- 提交成功后使用 Toast 确认，并把用户带到可恢复的任务状态。

### 内容发现

`浏览 Feed → 打开详情 → 能力检查 → 带入创作 / 解释不可用`

- 内容卡不直接触发生成。
- 详情层先展示媒体，再展示标题、Prompt、所需素材和可用性。
- 不可用时保留预览价值，但禁用主操作并解释原因。
- 可用时将来源、Prompt、比例和所需模式带入创作页。

### 任务

`筛选 → 扫描状态 → 打开详情 → 执行动作 → 返回原位置`

- 进行中：显示进度、取消。
- 已完成：显示下载、发布、分享、再次创作。
- 失败：显示原因、退款状态、重新创作。
- 返回列表时保留筛选条件、滚动位置和刚查看的任务。

### 钱包

`查看余额 → 同意条款 → 选择商品 → Telegram invoice → 服务端确认 → 刷新余额`

- 条款未同意时购买动作禁用，但商品信息仍可浏览。
- 订阅与一次性积分分区，不混用价格和周期表述。
- 客户端收到 `paid` 不直接加 credits；只有服务端 `successful_payment` 确认后刷新。
- 已有有效订阅时不允许创建第二个订阅，改为显示当前计划与续订管理。

## 5. 无颜色状态编码

| 状态 | 图标 | 边框 / 形状 | 文案 | 动效 |
|---|---|---|---|---|
| 排队 | Clock | 实线 | “排队中” | 低频脉冲 |
| 生成中 | Clock / spinner | 实线 + 进度条 | 百分比 + 当前阶段 | 线性进度 |
| 完成 | Check | 实线 | “已完成” | 一次确认动效 |
| 失败 | Alert | 虚线 | 原因 + 恢复动作 | 无循环动画 |
| 取消 | Close | 细实线 | “已取消” | 无 |
| 禁用 | 无 | 低对比填充 | 解释禁用原因 | 无 |

未来接入颜色时，颜色只增强这些信号，不替代图标和文字。

## 6. 推荐代码结构

现有项目是原生 TypeScript + CSS，建议先做轻量组件化，不引入框架：

```text
web/src/ui/
├── tokens.css
├── primitives/
│   ├── button.ts
│   ├── icon-button.ts
│   ├── status-label.ts
│   └── progress.ts
├── composites/
│   ├── top-bar.ts
│   ├── bottom-nav.ts
│   ├── prompt-field.ts
│   ├── content-card.ts
│   ├── job-card.ts
│   ├── plan-option.ts
│   └── feedback.ts
└── patterns/
    ├── full-screen-detail.ts
    ├── async-action.ts
    └── consent-gate.ts
```

每个组件返回受约束的 HTML 字符串或 DOM 节点，业务状态仍由现有 `main.ts` 管理。等组件边界稳定后，再判断是否需要迁移到 Lit、Preact 或其他框架。

## 7. 迁移顺序

1. 建立 `tokens.css`，只迁移间距、字号、圆角、边框、层级、动效；颜色保留现有 Telegram 变量。
2. 提取 `Button`、`IconButton`、`StatusLabel`、`ProgressBar` 四个原子组件。
3. 提取 `BottomNav`、`PageHeader`、`PromptField`、`JobCard`、`InlineBanner`。
4. 统一模板详情与任务详情的 `FullScreenDetail` 行为。
5. 迁移钱包的 `ConsentGate` 与 `PlanOption`。
6. 补齐组件状态测试、键盘测试、RTL 与 320 px 截图验证。

第一阶段不重写业务逻辑，不改变支付、安全、幂等、退款或 API 边界。
