import type { AdminData, AdminJob, AdminUser, AffiliateAnalytics, AnalyticsAiAnalysis, IntegrationState, MiniAppAnalytics, ModelCatalog, PageId, Payment, WalletEntry } from "./types";
import { badge, durationBetween, empty, escapeHtml, formatDate, formatNumber, icon, initials, labelFor, pageHeader } from "./ui";

export type ViewState = {
  page: PageId;
  query: string;
  paymentTab: "transactions" | "wallet" | "reconciliation";
  jobStatus?: "all" | AdminJob["status"] | "refunded";
  jobChannel?: "all" | AdminJob["channel"];
  modelCatalog?: IntegrationState<ModelCatalog>;
  miniAppAnalytics?: IntegrationState<MiniAppAnalytics>;
  analyticsAi?: IntegrationState<AnalyticsAiAnalysis>;
  analyticsQuestion?: string;
  affiliateAnalytics?: IntegrationState<AffiliateAnalytics>;
  affiliateFrom?: string;
  affiliateTo?: string;
};

export function renderPage(data: AdminData, state: ViewState) {
  if (state.page === "overview") return overviewView(data);
  if (state.page === "users") return usersView(data, state.query);
  if (state.page === "jobs") return jobsView(data, state);
  if (state.page === "payments") return paymentsView(data, state);
  if (state.page === "affiliates") return affiliateView(state);
  if (state.page === "configuration") return configurationView(data);
  if (state.page === "generation") return generationView(data, state);
  if (state.page === "analytics") return analyticsView(data, state);
  return monitoringView(data, state);
}

function overviewView(data: AdminData) {
  const maxJobs = Math.max(1, ...data.trends.map((point) => point.jobs));
  const exceptions = data.payments.filter((item) => item.status === "exception");
  const degraded = data.services.find((service) => service.status !== "healthy");
  return `${pageHeader("OPERATIONS / 运营概览", "今天，一切都在向前。", "聚焦生成交付、Stars 收入与服务状态。", dateButton(data))}
    <section class="metric-grid">
      ${data.metrics.map((metric) => `<article class="metric metric--${metric.tone || "default"}">
        <div class="metric__head"><span>${escapeHtml(metric.label)}</span><small class="metric__change ${metric.change >= 0 ? "is-up" : "is-down"}">${metric.change >= 0 ? "+" : ""}${metric.change}%</small></div>
        <strong>${escapeHtml(metric.value)}</strong><p>${escapeHtml(metric.hint)}</p>
      </article>`).join("")}
    </section>
    <section class="overview-grid">
      <article class="panel trend-panel">
        <header class="panel-header"><div><span class="eyebrow">7 DAY PULSE</span><h2>任务趋势</h2></div><div class="legend"><span><i class="legend-jobs"></i>任务</span><span><i class="legend-success"></i>成功率</span></div></header>
        <div class="bar-chart" aria-label="近七天任务趋势">
          ${data.trends.map((point) => `<div class="bar-chart__item"><div class="bar-chart__track"><i style="height:${Math.round(point.jobs / maxJobs * 100)}%"><b>${point.jobs}</b></i></div><span>${point.label.slice(3)}</span></div>`).join("")}
        </div>
        <footer class="chart-footer"><span>今日成功率 <strong>${data.trends.at(-1)?.successRate}%</strong></span><span>7 日任务 <strong>${formatNumber(data.trends.reduce((sum, item) => sum + item.jobs, 0))}</strong></span></footer>
      </article>
      <article class="panel queue-panel">
        <header class="panel-header"><div><span class="eyebrow">REQUIRES ATTENTION</span><h2>需要处理</h2></div><button class="icon-button" data-refresh type="button" aria-label="刷新">${icon("refresh")}</button></header>
        <button class="attention-row" data-nav="payments" type="button"><span class="attention-row__index">01</span><span><strong>${exceptions.length} 笔支付待对账</strong><small>${exceptions[0]?.telegramChargeId || "暂无异常"}</small></span>${icon("chevron")}</button>
        <button class="attention-row" data-nav="monitoring" type="button"><span class="attention-row__index">02</span><span><strong>${degraded ? escapeHtml(`${degraded.name} 状态异常`) : "服务状态正常"}</strong><small>${degraded ? `P95 ${degraded.p95} ms，成功率 ${degraded.successRate}%` : "当前没有已上报的服务异常"}</small></span>${icon("chevron")}</button>
      </article>
    </section>
    <section class="panel recent-panel">
      <header class="panel-header"><div><span class="eyebrow">LIVE OPERATIONS</span><h2>最近任务</h2></div><button class="text-button" data-nav="jobs" type="button">查看全部 ${icon("chevron")}</button></header>
      ${data.jobs.length ? jobsTable(data.jobs.slice(0, 5)) : empty("接入后的生成任务会显示在这里。")}
    </section>`;
}

function usersView(data: AdminData, query: string) {
  const filtered = data.users.filter((user) => includesQuery(query, user.displayName, user.username, user.externalUserId, user.telegramId, user.languageCode));
  return `${pageHeader("CUSTOMERS / 用户", "用户管理", "查询用户、查看余额与创作记录，并通过差额方式调整 credits。", `<button class="primary-button" data-open-adjust type="button">${icon("plus")}调整余额</button>`)}
    ${searchBar("搜索 Telegram ID、用户名或 External ID", query, `<select aria-label="用户状态"><option>全部状态</option><option>正常</option><option>限制生成</option><option>已停用</option></select>`)}
    <section class="panel table-panel"><div class="table-meta"><span>共 ${filtered.length} 位用户</span><small>余额、支付和任务数据来自 Open Platform</small></div>
      ${filtered.length ? usersTable(filtered) : empty("换一个关键词或清除筛选条件。")}
    </section>`;
}

function jobsView(data: AdminData, state: ViewState) {
  const status = state.jobStatus || "all";
  const channel = state.jobChannel || "all";
  const filtered = data.jobs.filter((job) => includesQuery(state.query, job.id, job.userName, job.externalUserId, job.prompt, job.status)
    && (status === "all" || (status === "refunded" ? job.refundedCredits > 0 : job.status === status))
    && (channel === "all" || job.channel === channel));
  const queued = data.jobs.filter((job) => job.status === "queued").length;
  const processing = data.jobs.filter((job) => job.status === "processing").length;
  return `${pageHeader("CREATION / 任务", "生成任务", "追踪从排队、生成到回调通知的完整交付状态。", dateButton(data))}
    ${searchBar("搜索任务 ID、用户或提示词", state.query, `<select id="job-status-filter" aria-label="任务状态"><option value="all">全部状态</option><option value="queued" ${status === "queued" ? "selected" : ""}>排队中</option><option value="processing" ${status === "processing" ? "selected" : ""}>生成中</option><option value="succeeded" ${status === "succeeded" ? "selected" : ""}>已完成</option><option value="failed" ${status === "failed" ? "selected" : ""}>失败</option><option value="cancelled" ${status === "cancelled" ? "selected" : ""}>已取消</option><option value="refunded" ${status === "refunded" ? "selected" : ""}>已退款</option></select><select id="job-channel-filter" aria-label="提交渠道"><option value="all">全部渠道</option><option value="Bot" ${channel === "Bot" ? "selected" : ""}>Bot</option><option value="Mini App" ${channel === "Mini App" ? "selected" : ""}>Mini App</option></select>`)}
    <section class="panel table-panel"><div class="table-meta"><span>${filtered.length} 个任务</span><small>当前 ${queued} 个排队，${processing} 个生成中</small></div>${filtered.length ? jobsTable(filtered) : empty("没有匹配的生成任务。")}</section>`;
}

function paymentsView(data: AdminData, state: ViewState) {
  const tabs = tabBar([
    ["transactions", "Stars 交易"], ["wallet", "钱包流水"], ["reconciliation", "退款与对账"],
  ], state.paymentTab, "payment-tab");
  let body = paymentsTable(data.payments.filter((item) => includesQuery(state.query, item.id, item.telegramChargeId, item.userName, item.externalUserId)));
  if (state.paymentTab === "wallet") body = walletTable(data.walletEntries.filter((item) => includesQuery(state.query, item.id, item.userName, item.referenceId)));
  if (state.paymentTab === "reconciliation") body = reconciliationView(data.payments);
  return `${pageHeader("REVENUE / 支付", "支付与钱包", "Stars 入账、credits 流水和退款对账保持一一对应。", `<button class="secondary-button" data-export type="button">导出 CSV</button>`)}
    ${tabs}${searchBar("搜索 Charge ID、用户或流水 ID", state.query)}
    <section class="panel table-panel">${body}</section>`;
}

function configurationView(data: AdminData) {
  return `${pageHeader("SETTINGS / 商品", "订阅与 Credits 商品", "维护 Telegram Stars 订阅和一次性积分包；历史交易始终保留原始快照。", `<button class="secondary-button" data-new-subscription type="button">${icon("plus")}新建订阅计划</button><button class="primary-button" data-publish-config data-config-scope="products" type="button">发布商品配置</button>`)}
    <section class="config-layout">
      <article class="panel config-main"><header class="panel-header"><div><span class="eyebrow">NEW USER GIFT</span><h2>新用户首次创作赠送</h2></div><span class="unsaved-indicator">0 表示关闭赠送</span></header>
        <form id="new-user-gift-form" class="gift-config"><label><span>赠送数量</span><div class="input-suffix"><input name="newUserGiftCredits" type="number" min="0" max="10000000" step="1" value="${data.configuration.newUserGift.credits}" /><small>credits</small></div><em>仅对启用后首次进入 Mini App 的新用户发放一次；固定领取标识防止重复到账。</em></label></form>
        <header class="panel-header panel-header--section"><div><span class="eyebrow">INVITE REWARDS</span><h2>邀请奖励</h2></div><span class="unsaved-indicator">好友完成首个视频后才发放</span></header>
        <form id="referral-config-form" class="gift-config"><label><span>邀请奖励</span><div class="input-suffix"><input name="referralRewardCredits" type="number" min="1" max="10000000" step="1" value="${data.configuration.referral.rewardCredits}" /><small>credits</small></div></label><label><span>每周奖励人数上限</span><div class="input-suffix"><input name="referralWeeklyLimit" type="number" min="1" max="100" step="1" value="${data.configuration.referral.weeklyLimit}" /><small>人</small></div><em>按滚动 7 天计算；超过上限的邀请不会累积到下一周。</em></label><label class="checkbox-row"><input name="referralEnabled" type="checkbox" ${data.configuration.referral.enabled ? "checked" : ""} /><span>启用邀请奖励</span></label></form>
        <header class="panel-header panel-header--section"><div><span class="eyebrow">SUBSCRIPTION PLANS</span><h2>30 天循环订阅</h2></div><span class="unsaved-indicator">编辑后随配置版本发布</span></header>
        <div class="pack-list">${data.subscriptionPlans.length ? data.subscriptionPlans.map((plan) => `<div class="pack-row"><div class="pack-row__mark ${plan.recommended ? "is-featured" : ""}">S</div><div><strong>${escapeHtml(plan.title)}</strong><small>${plan.channels.join(" / ")}</small></div><div><strong>${formatNumber(plan.creditsPerCycle)}</strong><small>credits / 30 天</small></div><div><strong>${plan.stars} Stars</strong><small>自动续费</small></div>${badge(plan.status === "active" ? "active" : plan.status)}<button class="icon-button" data-edit-subscription="${escapeHtml(plan.id)}" type="button" aria-label="编辑 ${escapeHtml(plan.title)}">${icon("more")}</button></div>`).join("") : `<div class="empty-state"><strong>尚未配置订阅计划</strong><p>线上不会展示订阅入口，直到发布至少一个正常状态计划。</p></div>`}</div>
        <header class="panel-header panel-header--section"><div><span class="eyebrow">CREDIT PACKS</span><h2>一次性 Credits 商品</h2></div></header>
        <div class="pack-list">${data.creditPacks.map((pack) => `<div class="pack-row"><div class="pack-row__mark ${pack.recommended ? "is-featured" : ""}">A</div><div><strong>${escapeHtml(pack.title)}</strong><small><code>${escapeHtml(pack.id)}</code> · ${pack.channels.join(" / ")}</small></div><div><strong>${formatNumber(pack.baseCredits + pack.bonusCredits)}</strong><small>credits${pack.bonusCredits ? `，含 ${pack.bonusCredits} 赠送` : ""}</small></div><div><strong>${pack.stars} Stars</strong><small>${((pack.baseCredits + pack.bonusCredits) / pack.stars).toFixed(1)} credits / Star</small></div>${badge(pack.status === "active" ? "active" : pack.status)}<button class="icon-button" data-edit-pack="${escapeHtml(pack.id)}" type="button" aria-label="编辑 ${escapeHtml(pack.title)}">${icon("more")}</button></div>`).join("")}</div>
      </article>
      ${productVersionCard(data)}
    </section>`;
}

function generationView(data: AdminData, state: ViewState) {
  const generation = data.configuration.generation;
  const catalogState = state.modelCatalog || { status: "idle" as const };
  const catalog = catalogState.status === "ready" ? catalogState : undefined;
  const model = catalog?.models.find((item) => item.id === generation.model);
  const models = catalog?.models || [];
  const durations = model?.durations.length ? model.durations : [generation.durationSeconds];
  const ratios = model?.aspectRatios.length ? model.aspectRatios : [generation.aspectRatio];
  const qualities = model?.qualities.length ? model.qualities : [generation.quality];
  const modelOptions = models.length
    ? models.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === generation.model ? "selected" : ""} ${item.enabled ? "" : "disabled"}>${escapeHtml(item.name)} · ${item.creditCost} credits${item.enabled ? "" : " · 已停用"}</option>`).join("")
    : `<option value="${escapeHtml(generation.model)}">${escapeHtml(generation.model)}</option>`;
  return `${pageHeader("SETTINGS / 生成", "生成参数", "参数选项来自 Open Platform 模型目录；发布前会再次校验模型能力。", `<button class="secondary-button" data-sync-models type="button">${icon("refresh")}同步模型</button><button class="primary-button" data-publish-config data-config-scope="generation" type="button">发布生成参数</button>`)}
    <section class="config-layout">
      <article class="panel form-panel"><header class="panel-header"><div><span class="eyebrow">GENERATION DEFAULTS</span><h2>任务默认参数</h2></div><span class="unsaved-indicator">所有更改会形成新版本</span></header>
        <form class="config-form" id="config-form">
        <label><span>默认模型</span><select name="model" id="generation-model">${modelOptions}</select></label>
        <label><span>默认时长</span><select name="durationSeconds">${durations.map((value) => `<option value="${value}" ${generation.durationSeconds === value ? "selected" : ""}>${value} 秒</option>`).join("")}</select></label>
        <label><span>默认宽高比</span><select name="aspectRatio">${ratios.map((value) => `<option value="${escapeHtml(value)}" ${generation.aspectRatio === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
        <label><span>默认质量</span><select name="quality">${qualities.map((value) => `<option value="${escapeHtml(value)}" ${generation.quality === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
        <label><span>提示词最大长度</span><input name="maxPromptLength" type="number" min="100" max="10000" value="${generation.maxPromptLength}" /></label>
        <label><span>图片最大尺寸</span><div class="input-suffix"><input name="maxImageMegabytes" type="number" min="1" max="100" value="${Math.round(generation.maxImageBytes / 1048576)}" /><small>MB</small></div></label>
        <label><span>单用户并发任务</span><input name="maxConcurrentJobs" type="number" min="1" max="20" value="${generation.maxConcurrentJobs}" /></label>
        <label class="switch-field"><span><b>生成音频</b><small>${model && !model.supportsAudio ? "当前模型不支持音频" : "新任务默认启用音频"}</small></span><input name="audioEnabled" type="checkbox" ${generation.audioEnabled && model?.supportsAudio !== false ? "checked" : ""} ${model && !model.supportsAudio ? "disabled" : ""} /></label>
        </form>
      </article>
      ${generationVersionCard(data)}
    </section>
    ${modelCatalogPanel(catalogState)}`;
}

function productVersionCard(data: AdminData) {
  return `<aside class="panel version-card"><span class="eyebrow">CURRENT CONFIG</span><strong>${escapeHtml(data.configuration.version)}</strong><p>${data.subscriptionPlans.length} 个订阅 · ${data.creditPacks.length} 个积分包</p><dl><div><dt>新用户赠送</dt><dd>${formatNumber(data.configuration.newUserGift.credits)} credits</dd></div><div><dt>邀请奖励</dt><dd>${data.configuration.referral.enabled ? `${formatNumber(data.configuration.referral.rewardCredits)} credits / ${data.configuration.referral.weeklyLimit} 人` : "已关闭"}</dd></div><div><dt>条款版本</dt><dd>${escapeHtml(data.subscriptionPlans[0]?.termsVersion || data.creditPacks[0]?.termsVersion || "—")}</dd></div><div><dt>发布时间</dt><dd>${formatDate(data.configuration.publishedAt || undefined)}</dd></div><div><dt>配置状态</dt><dd>${badge(data.configuration.status === "active" ? "active" : data.configuration.status)}</dd></div></dl></aside>`;
}

function generationVersionCard(data: AdminData) {
  const generation = data.configuration.generation;
  return `<aside class="panel version-card"><span class="eyebrow">CURRENT CONFIG</span><strong>${escapeHtml(data.configuration.version)}</strong><p>${escapeHtml(generation.model)} · ${generation.durationSeconds} 秒 · ${escapeHtml(generation.aspectRatio)}</p><dl><div><dt>默认质量</dt><dd>${escapeHtml(generation.quality)}</dd></div><div><dt>发布时间</dt><dd>${formatDate(data.configuration.publishedAt || undefined)}</dd></div><div><dt>配置状态</dt><dd>${badge(data.configuration.status === "active" ? "active" : data.configuration.status)}</dd></div></dl></aside>`;
}

function analyticsView(data: AdminData, state: ViewState) {
  const maxRevenue = Math.max(1, ...data.trends.map((item) => item.revenue));
  const totalRevenue = data.trends.reduce((sum, item) => sum + item.revenue, 0);
  const terminal = data.jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status));
  const successRate = terminal.length ? terminal.filter((job) => job.status === "succeeded").length / terminal.length * 100 : 0;
  const durations = terminal.map((job) => job.startedAt && job.finishedAt ? Math.max(0, Date.parse(job.finishedAt) - Date.parse(job.startedAt)) : 0).filter(Boolean).sort((a, b) => a - b);
  const averageDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const p95Duration = durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] : 0;
  const refundRate = terminal.length ? terminal.filter((job) => job.refundedCredits > 0).length / terminal.length * 100 : 0;
  const paidUsers = new Set(data.payments.filter((payment) => payment.applied).map((payment) => payment.externalUserId)).size;
  const funnel = [["已同步用户", data.users.length], ["已提交任务", data.jobs.length], ["已完成任务", terminal.length], ["Stars 付费用户", paidUsers]] as const;
  const funnelBase = Math.max(1, ...funnel.map(([, value]) => value));
  return `${pageHeader("INSIGHTS / 数据", "数据分析", "结合 D1 业务数据与 PostHog Mini App 事件，查看推荐、生成和支付漏斗。", `<button class="secondary-button" data-refresh-analytics type="button">${icon("refresh")}刷新分析</button>`)}
    ${miniAppAnalyticsPanel(state.miniAppAnalytics || { status: "idle" })}
    ${analyticsAiPanel(state.analyticsAi || { status: "idle" }, state.analyticsQuestion || "")}
    <section class="analytics-grid">
      <article class="panel revenue-chart"><header class="panel-header"><div><span class="eyebrow">STARS REVENUE</span><h2>收入趋势</h2></div><strong>${formatNumber(totalRevenue)} <small>Stars</small></strong></header><div class="line-bars">${data.trends.map((item) => `<div><i style="height:${Math.round(item.revenue / maxRevenue * 100)}%"></i><span>${item.label.slice(3)}</span></div>`).join("")}</div></article>
      <article class="panel model-performance"><header class="panel-header"><div><span class="eyebrow">MODEL QUALITY</span><h2>模型表现</h2></div></header><div class="score"><span style="--score:${successRate}"><b>${successRate.toFixed(1)}%</b><small>成功率</small></span></div><dl><div><dt>平均生成</dt><dd>${formatDurationMs(averageDuration)}</dd></div><div><dt>P95</dt><dd>${formatDurationMs(p95Duration)}</dd></div><div><dt>退款率</dt><dd>${refundRate.toFixed(1)}%</dd></div></dl></article>
    </section>
    <section class="panel funnel-panel"><header class="panel-header"><div><span class="eyebrow">SYNCED BUSINESS VOLUME</span><h2>已接入业务量</h2></div><small>从接入后台同步开始统计</small></header><div class="funnel">${funnel.map(([label, value], index) => `<div class="funnel-row"><span>${String(index + 1).padStart(2, "0")}</span><strong>${label}</strong><div><i style="width:${value / funnelBase * 100}%"></i></div><b>${formatNumber(value)}</b><small>${Math.round(value / funnelBase * 100)}%</small></div>`).join("")}</div></section>`;
}

function affiliateView(state: ViewState) {
  const analyticsState = state.affiliateAnalytics || { status: "idle" as const };
  const from = state.affiliateFrom || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const to = state.affiliateTo || new Date().toISOString().slice(0, 10);
  const actions = `<div class="filter-actions"><label>开始日期<input id="affiliate-from" type="date" value="${escapeHtml(from)}"></label><label>结束日期<input id="affiliate-to" type="date" value="${escapeHtml(to)}"></label><button class="secondary-button" data-refresh-affiliates type="button">${icon("refresh")}刷新</button><button class="primary-button" data-sync-stars type="button">同步 Star Transactions</button></div>`;
  if (!("metrics" in analyticsState)) {
    const message = analyticsState.status === "error" ? escapeHtml(analyticsState.error) : "正在读取 Telegram Affiliate 数据…";
    return `${pageHeader("REVENUE / AFFILIATE", "Telegram Affiliate", "只统计 Star Transactions 中可识别的 Affiliate 付费用户、订单和实际 Stars 数据。", actions)}<section class="panel"><div class="loading-state loading-state--panel"><i></i><span>${message}</span></div></section>`;
  }
  const analytics = analyticsState as AffiliateAnalytics;
  const metrics = analytics.metrics;
  return `${pageHeader("REVENUE / AFFILIATE", "Telegram Affiliate", "归因与佣金由 Telegram 官方完成；此处以 Star Transactions 返回数据为财务真值。", actions)}
    <section class="metric-grid">
      ${affiliateMetric("Stars 订单", metrics.totalStarsOrders, "区间内已支付订单")}
      ${affiliateMetric("Affiliate 订单", metrics.affiliateOrders, `${metrics.affiliatePaidUsers} 位可识别付费用户`)}
      ${affiliateMetric("Affiliate Gross", formatStars(metrics.affiliateGrossStarsRevenue), "Gross Stars")}
      ${affiliateMetric("Affiliate Commission", formatStars(metrics.affiliateCommissionStars), "Telegram 返回佣金")}
      ${affiliateMetric("Telegram 实际入账", formatStars(metrics.telegramCreditedStars), "含 nanostar 精度")}
      ${affiliateMetric("Non-Affiliate", formatStars(metrics.nonAffiliateStarsRevenue), "非 Affiliate Gross Stars")}
    </section>
    <section class="panel table-panel"><header class="panel-header"><div><span class="eyebrow">AFFILIATE BREAKDOWN</span><h2>Affiliate 聚合</h2></div><small>${escapeHtml(analytics.from)} – ${escapeHtml(analytics.to)}</small></header>
      ${analytics.affiliates.length ? `<div class="table-wrap"><table><thead><tr><th>Affiliate</th><th>类型</th><th>付费用户</th><th>订单</th><th>Gross Stars</th><th>Commission</th><th>Telegram 入账</th></tr></thead><tbody>${analytics.affiliates.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small class="mono">${escapeHtml(item.peerId)}</small></td><td>${item.type === "chat" ? "Chat / Channel" : "User"}</td><td>${formatNumber(item.paidUsers)}</td><td>${formatNumber(item.paidOrders)}</td><td>${formatStars(item.grossStars)}</td><td>${formatStars(item.commissionStars)}</td><td>${formatStars(item.telegramCreditedStars)}</td></tr>`).join("")}</tbody></table></div>` : empty("当前日期范围内没有识别到 Affiliate 付款交易。")}
    </section>
    <section class="panel"><header class="panel-header"><div><span class="eyebrow">RECONCILIATION</span><h2>同步状态</h2></div></header><div class="monitor-list"><div><span>最近完成</span><b>${analytics.sync.lastCompletedAt ? formatDate(analytics.sync.lastCompletedAt) : "尚未同步"}</b><small>最近新增 ${formatNumber(analytics.sync.lastInserted)} 个事件</small></div><div><span>最近错误</span><b>${analytics.sync.lastError ? "需要关注" : "正常"}</b><small>${escapeHtml(analytics.sync.lastError || "没有同步错误")}</small></div></div></section>`;
}

function affiliateMetric(label: string, value: string | number, hint: string) {
  return `<article class="metric"><div class="metric__head"><span>${escapeHtml(label)}</span></div><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong><p>${escapeHtml(hint)}</p></article>`;
}

function formatStars(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 9 }).format(value);
}

function monitoringView(data: AdminData, state: ViewState) {
  const completedCallbacks = data.jobs.filter((job) => job.callbackAttempts > 0).length;
  const failedNotifications = data.jobs.filter((job) => job.botNotificationStatus === "failed").length;
  const queued = data.jobs.filter((job) => job.status === "queued");
  const processing = data.jobs.filter((job) => job.status === "processing").length;
  const oldestQueueMs = queued.length ? Date.now() - Math.min(...queued.map((job) => Date.parse(job.createdAt))) : 0;
  const services = [...data.services, ...integrationServices(state)];
  return `${pageHeader("SYSTEM / 运行状态", "系统监控", "关注 webhook、模型目录、数据分析和任务交付链路。", `<button class="secondary-button" data-refresh type="button">${icon("refresh")}刷新状态</button>`)}
    <section class="health-grid">${services.map(healthCard).join("")}</section>
    <section class="monitoring-grid">
      <article class="panel"><header class="panel-header"><div><span class="eyebrow">CALLBACK DELIVERY</span><h2>任务交付</h2></div></header><div class="monitor-list"><div><span>已索引任务</span><b>${formatNumber(data.jobs.length)}</b><small>从接入同步开始</small></div><div><span>进入终态</span><b>${formatNumber(data.jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status)).length)}</b><small>D1 当前记录</small></div><div><span>收到平台回调</span><b>${formatNumber(completedCallbacks)}</b><small>callbackAttempts &gt; 0</small></div><div><span>Bot 通知失败</span><b>${formatNumber(failedNotifications)}</b><small>${failedNotifications ? "需要检查或重试" : "当前无失败记录"}</small></div></div></article>
      <article class="panel"><header class="panel-header"><div><span class="eyebrow">QUEUE</span><h2>生成队列</h2></div></header><div class="capacity"><div><span>当前生成中</span><strong>${processing}</strong><i><b style="width:${Math.min(100, processing * 10)}%"></b></i></div><div><span>当前排队任务</span><strong>${queued.length}</strong><i><b style="width:${Math.min(100, queued.length * 10)}%"></b></i></div><div><span>最老排队等待</span><strong>${formatDurationMs(oldestQueueMs)}</strong><i><b style="width:${Math.min(100, oldestQueueMs / 60_000)}%"></b></i></div></div></article>
    </section>`;
}

function usersTable(users: AdminUser[]) {
  return `<div class="table-wrap"><table><thead><tr><th>用户</th><th>Telegram ID</th><th>状态 / 语言</th><th>余额</th><th>累计支付</th><th>任务 / 成功率</th><th>Mini App 活跃</th><th>最后活跃</th><th></th></tr></thead><tbody>${users.map((user) => `<tr data-open-user="${escapeHtml(user.externalUserId)}" tabindex="0"><td><div class="user-cell"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><span><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></span></div></td><td class="telegram-id-cell"><code class="telegram-id-value mono">${escapeHtml(String(user.telegramId))}</code></td><td>${badge(user.status)}<small>${escapeHtml(user.languageCode || "未设置")}</small></td><td><strong class="number">${formatNumber(user.balance)}</strong><small> credits</small></td><td>${formatNumber(user.paidStars)} Stars</td><td>${user.jobs} <small>/ ${user.successRate}%</small></td><td>${formatNumber(user.miniAppJobs || 0)} 个任务<small>${user.lastMiniAppActivityAt ? formatDate(user.lastMiniAppActivityAt) : "暂无活动"}</small></td><td>${formatDate(user.lastActiveAt)}</td><td><button class="icon-button" type="button" aria-label="查看详情">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>`;
}

function jobsTable(jobs: AdminJob[]) {
  return `<div class="table-wrap"><table><thead><tr><th>任务</th><th>用户</th><th>模式 / 模型</th><th>渠道</th><th>状态</th><th>退款</th><th>创建时间</th><th>耗时</th><th></th></tr></thead><tbody>${jobs.map((job) => `<tr data-open-job="${escapeHtml(job.id)}" tabindex="0"><td><strong class="mono">${escapeHtml(job.id)}</strong><small class="truncate">${escapeHtml(job.prompt)}</small></td><td>${escapeHtml(job.userName)}</td><td>${job.mode === "text-to-video" ? "文生视频" : "图生视频"}<small>${escapeHtml(job.model)}</small></td><td>${escapeHtml(job.channel)}</td><td>${badge(job.status)}${job.status === "processing" ? `<small>${job.progress}%</small>` : ""}</td><td>${job.refundedCredits ? `<strong class="delta is-positive">${job.refundedCredits}</strong><small>credits 已退</small>` : `<span class="muted-value">—</span>`}</td><td>${formatDate(job.createdAt)}</td><td>${durationBetween(job.startedAt, job.finishedAt)}</td><td><button class="icon-button" type="button" aria-label="查看详情">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>`;
}

function paymentsTable(payments: Payment[]) {
  if (!payments.length) return empty("没有匹配的 Stars 交易。");
  return `<div class="table-wrap"><table><thead><tr><th>交易</th><th>用户</th><th>商品</th><th>来源 / 入口</th><th>Stars</th><th>Credits</th><th>状态</th><th>对账</th><th>支付时间</th></tr></thead><tbody>${payments.map((payment) => `<tr><td><strong class="mono">${escapeHtml(payment.id)}</strong><small class="mono">${escapeHtml(payment.telegramChargeId)}</small></td><td>${escapeHtml(payment.userName)}<small>${escapeHtml(payment.externalUserId)}</small></td><td>${escapeHtml(payment.productTitle)}<small>${escapeHtml(payment.productId)} · ${payment.productType === "subscription" ? payment.isFirstRecurring ? "订阅首付" : "自动续费" : "一次性购买"}</small></td><td>${escapeHtml(payment.channel || "Bot")}<small>${escapeHtml(payment.funnelEntry || "buy_command")}</small></td><td>${formatNumber(payment.stars)}</td><td>${formatNumber(payment.credits)}</td><td>${badge(payment.status)}</td><td>${badge(payment.reconciliation)}</td><td>${formatDate(payment.paidAt)}</td></tr>`).join("")}</tbody></table></div>`;
}

function walletTable(entries: WalletEntry[]) {
  if (!entries.length) return empty("没有匹配的钱包流水。");
  return `<div class="table-wrap"><table><thead><tr><th>流水</th><th>用户</th><th>类型</th><th>变动</th><th>变动前</th><th>变动后</th><th>关联记录</th><th>时间</th></tr></thead><tbody>${entries.map((entry) => `<tr><td><strong class="mono">${escapeHtml(entry.id)}</strong><small>${escapeHtml(entry.reason)}</small></td><td>${escapeHtml(entry.userName)}</td><td>${labelFor(entry.type)}</td><td><strong class="delta ${entry.delta >= 0 ? "is-positive" : "is-negative"}">${entry.delta >= 0 ? "+" : ""}${entry.delta}</strong></td><td>${formatNumber(entry.balanceBefore)}</td><td>${formatNumber(entry.balanceAfter)}</td><td class="mono">${escapeHtml(entry.referenceId)}</td><td>${formatDate(entry.createdAt)}</td></tr>`).join("")}</tbody></table></div>`;
}

function reconciliationView(payments: Payment[]) {
  const exceptions = payments.filter((item) => item.reconciliation !== "matched" || item.status === "refunding");
  return `<div class="reconciliation-head"><div><strong>${exceptions.length}</strong><span>待处理记录</span></div><p>退款执行前需要确认原交易、当前 credits 余额与计划追回数量。</p></div>${paymentsTable(exceptions)}`;
}

function miniAppAnalyticsPanel(state: IntegrationState<MiniAppAnalytics>) {
  if (!("configured" in state)) {
    if (state.status === "error") {
      return `<section class="panel mini-analytics"><div class="integration-state integration-state--error"><b>!</b><strong>数据分析载入失败</strong><p>${escapeHtml(state.error)}</p></div></section>`;
    }
    return `<section class="panel mini-analytics"><div class="loading-state loading-state--panel"><i></i><span>正在读取 Mini App 分析…</span></div></section>`;
  }
  if (state.status === "not_configured") {
    return `<section class="panel mini-analytics"><div class="integration-state"><b>◇</b><strong>PostHog 尚未连接</strong><p>在 Admin Worker 配置 POSTHOG_PERSONAL_API_KEY、POSTHOG_PROJECT_ID 和 POSTHOG_HOST 后即可显示真实 Mini App 指标。</p></div></section>`;
  }
  if (state.status === "error") {
    return `<section class="panel mini-analytics"><div class="integration-state integration-state--error"><b>!</b><strong>PostHog 查询失败</strong><p>${escapeHtml(state.error || "请检查项目 ID、查询权限和 API Host。")}</p></div></section>`;
  }

  const analytics = state as MiniAppAnalytics;
  const total = (event: string) => Number(analytics.totals[event] || 0);
  const impressions = total("home_item_impression");
  const clicks = total("home_item_clicked");
  const created = total("generation_created");
  const submitted = total("generation_submitted");
  const newUsers = analytics.distributions.acquisitionSources.reduce((sum, item) => sum + item.count, 0);
  const funnel = [["打开钱包", total("wallet_opened")], ["选择套餐", total("credit_pack_selected")], ["打开发票", total("invoice_opened")], ["支付成功", total("payment_paid")]] as const;
  const funnelBase = Math.max(1, ...funnel.map((item) => item[1]));
  return `<section class="panel mini-analytics">
    <header class="panel-header"><div><span class="eyebrow">MINI APP · POSTHOG</span><h2>小程序行为</h2></div><small>${escapeHtml(analytics.from)} – ${escapeHtml(analytics.to)} · ${analytics.responseTimeMs} ms</small></header>
    <div class="mini-metric-grid">
      ${miniMetric("小程序打开", total("mini_app_opened"), "mini_app_opened")}
      ${miniMetric("首次观察用户", newUsers, "按用户首次打开去重")}
      ${miniMetric("Feed 成功载入", total("personalized_feed_loaded"), `${total("personalized_feed_failed")} 次失败`)}
      ${miniMetric("推荐点击率", impressions ? `${(clicks / impressions * 100).toFixed(1)}%` : "0.0%", `${formatNumber(clicks)} / ${formatNumber(impressions)}`)}
      ${miniMetric("任务创建率", submitted ? `${(created / submitted * 100).toFixed(1)}%` : "0.0%", `${created} 创建 · ${total("generation_failed")} 失败`)}
      ${miniMetric("取消率", created ? `${(total("job_cancelled") / created * 100).toFixed(1)}%` : "0.0%", `${total("job_cancelled")} 个任务`)}
    </div>
    <div class="mini-analytics-layout"><div><h3>钱包支付漏斗</h3><div class="compact-funnel">${funnel.map(([label, value]) => `<div><span>${label}</span><i><b style="width:${value / funnelBase * 100}%"></b></i><strong>${formatNumber(value)}</strong></div>`).join("")}</div></div><div><h3>首次来源分布</h3><div class="distribution-grid">${distribution("来源", analytics.distributions.acquisitionSources)}${distribution("Campaign", analytics.distributions.acquisitionCampaigns)}${distribution("内容 / 素材", analytics.distributions.acquisitionContent)}${distribution("语言", analytics.distributions.locales)}${distribution("Persona", analytics.distributions.personas)}${distribution("生成模式", analytics.distributions.modes)}</div></div></div>
  </section>`;
}

function analyticsAiPanel(state: IntegrationState<AnalyticsAiAnalysis>, question: string) {
  const loading = state.status === "loading";
  let result = `<div class="ai-empty"><strong>可以问什么？</strong><p>例如：过去 30 天哪个来源带来的新用户最多？小红书渠道从打开到支付的转化如何？</p></div>`;
  if (loading) result = `<div class="ai-loading"><i></i><span>GPT 正在调用受控的 PostHog 查询工具并分析数据…</span></div>`;
  if ("configured" in state && state.status === "not_configured") result = `<div class="ai-empty ai-empty--warning"><strong>GPT 分析尚未连接</strong><p>缺少 ${escapeHtml((state.missing || []).join("、") || "服务端配置")} 配置。API Key 只需保存在 Admin Worker Secret。</p></div>`;
  if ("configured" in state && state.status === "ready") {
    const tools = (state.toolsUsed || []).map((item) => item.name).join(" · ");
    result = `<article class="ai-result"><header><span>GPT 分析结论</span><small>${escapeHtml(state.model || "GPT")} · ${formatDate(state.generatedAt)}${tools ? ` · ${escapeHtml(tools)}` : ""}</small></header><div>${escapeHtml(state.answer || "暂无结论").replaceAll("\n", "<br>")}</div></article>`;
  }
  if (state.status === "error") result = `<div class="ai-empty ai-empty--error"><strong>分析失败</strong><p>${escapeHtml(state.error)}</p></div>`;
  return `<section class="panel analytics-ai">
    <header class="panel-header"><div><span class="eyebrow">GPT · CONTROLLED POSTHOG TOOLS</span><h2>AI 数据分析</h2></div><small>只读取聚合数据，不开放任意 HogQL</small></header>
    <form id="analytics-ai-form" class="analytics-ai-form"><label for="analytics-ai-question">向 GPT 提问</label><textarea id="analytics-ai-question" name="question" rows="3" minlength="3" maxlength="600" placeholder="例如：分析最近一个月新用户来源和生成、支付转化，并给出三条建议。" required>${escapeHtml(question)}</textarea><button class="primary-button" type="button" data-analyze-analytics ${loading ? "disabled" : ""}>${loading ? "分析中…" : "开始分析"}</button></form>
    ${result}
  </section>`;
}

function modelCatalogPanel(state: IntegrationState<ModelCatalog>) {
  if (!("models" in state)) {
    if (state.status === "error") return `<section class="panel model-catalog-panel"><div class="integration-state integration-state--error"><b>!</b><strong>模型目录不可用</strong><p>${escapeHtml(state.error)}</p></div></section>`;
    return `<section class="panel model-catalog-panel"><div class="loading-state loading-state--panel"><i></i><span>正在同步 Open Platform 模型目录…</span></div></section>`;
  }
  const catalog = state as ModelCatalog;
  return `<section class="panel model-catalog-panel"><header class="panel-header"><div><span class="eyebrow">OPEN PLATFORM MODELS</span><h2>模型能力目录</h2></div><small>${escapeHtml(catalog.version)} · ${formatDate(catalog.syncedAt)} · ${catalog.responseTimeMs} ms</small></header><div class="model-card-grid">${catalog.models.map((model) => `<article class="model-card ${model.enabled ? "" : "is-disabled"}"><header><div><strong>${escapeHtml(model.name)}</strong><code>${escapeHtml(model.id)}</code></div>${badge(model.enabled ? "active" : "disabled")}</header><dl><div><dt>费用</dt><dd>${model.creditCost} credits</dd></div><div><dt>模式</dt><dd>${model.modes.map((value) => value === "text-to-video" ? "文生视频" : "图生视频").join(" / ")}</dd></div><div><dt>时长</dt><dd>${model.durations.map((value) => `${value}s`).join(" / ")}</dd></div><div><dt>比例</dt><dd>${model.aspectRatios.join(" / ")}</dd></div><div><dt>质量</dt><dd>${model.qualities.join(" / ")}</dd></div><div><dt>音频</dt><dd>${model.supportsAudio ? "支持" : "不支持"}</dd></div></dl></article>`).join("")}</div></section>`;
}

function integrationServices(state: ViewState) {
  return [
    integrationService("model-catalog", "模型目录", "生成模型与能力约束", state.modelCatalog),
    integrationService("posthog", "PostHog 分析", "Mini App 手动事件与支付漏斗", state.miniAppAnalytics),
  ];
}

function integrationService(id: string, name: string, description: string, state?: { status: string; responseTimeMs?: number; fetchedAt?: string; syncedAt?: string; error?: string; configured?: boolean }) {
  if (!state || state.status === "idle" || state.status === "loading") return { id, name, description, status: "degraded" as const, successRate: 0, p95: 0, requests: 0, lastSuccessAt: "", lastError: "等待检查" };
  if (state.status === "error") return { id, name, description, status: "down" as const, successRate: 0, p95: state.responseTimeMs || 0, requests: 1, lastSuccessAt: "", lastFailureAt: new Date().toISOString(), lastError: state.error || "请求失败" };
  if (state.status === "not_configured") return { id, name, description, status: "degraded" as const, successRate: 0, p95: 0, requests: 0, lastSuccessAt: "", lastError: "尚未配置" };
  return { id, name, description, status: "healthy" as const, successRate: 100, p95: state.responseTimeMs || 0, requests: 1, lastSuccessAt: state.fetchedAt || state.syncedAt || new Date().toISOString() };
}

function healthCard(service: { name: string; description: string; status: string; successRate: number; p95: number; requests: number; lastSuccessAt: string; lastFailureAt?: string | null; lastError?: string | null }) {
  return `<article class="health-card health-card--${service.status}"><header><span class="health-dot"></span>${badge(service.status)}</header><h2>${escapeHtml(service.name)}</h2><p>${escapeHtml(service.description)}</p><dl><div><dt>成功率</dt><dd>${service.successRate}%</dd></div><div><dt>P95</dt><dd>${service.p95} ms</dd></div><div><dt>请求</dt><dd>${formatNumber(service.requests)}</dd></div></dl><footer>${service.lastSuccessAt ? `最近成功 ${formatDate(service.lastSuccessAt)}` : escapeHtml(service.lastError || "等待检查")}${service.lastFailureAt ? `<br>最近失败 ${formatDate(service.lastFailureAt)}` : ""}</footer></article>`;
}

function miniMetric(label: string, value: string | number, hint: string) {
  return `<div><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>`;
}

function distribution(label: string, items: Array<{ value: string; count: number }>) {
  return `<section><span>${escapeHtml(label)}</span>${items.slice(0, 4).map((item) => `<div><b>${escapeHtml(item.value)}</b><small>${formatNumber(item.count)}</small></div>`).join("") || `<small>暂无数据</small>`}</section>`;
}

function searchBar(placeholder: string, query: string, filters = "") {
  return `<div class="filter-bar"><label class="search-field">${icon("search")}<input id="page-search" type="search" value="${escapeHtml(query)}" placeholder="${escapeHtml(placeholder)}" /></label><div class="filter-actions">${filters}</div></div>`;
}

function tabBar(items: ReadonlyArray<readonly [string, string]>, active: string, attribute: string) {
  return `<div class="tabs">${items.map(([value, label]) => `<button class="${active === value ? "is-active" : ""}" data-${attribute}="${value}" type="button">${escapeHtml(label)}</button>`).join("")}</div>`;
}

function dateButton(data: AdminData) {
  const first = data.trends.at(0)?.label || "—";
  const last = data.trends.at(-1)?.label || "—";
  return `<button class="secondary-button date-button" type="button">${icon("calendar")}近 7 天<span>${escapeHtml(first)} – ${escapeHtml(last)}</span></button>`;
}

function formatDurationMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0s";
  const seconds = Math.round(value / 1_000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function includesQuery(query: string, ...values: Array<string | number>) {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || values.some((value) => String(value).toLocaleLowerCase().includes(normalized));
}
