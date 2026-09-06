import type { AdminJob, AdminUser, CreditPack, IntegrationState, SubscriptionPlan, UserAcquisition } from "./types";
import { badge, durationBetween, escapeHtml, formatDate, formatNumber, icon, initials, labelFor } from "./ui";

export function userDetail(user: AdminUser, acquisition: IntegrationState<UserAcquisition> = { status: "idle" }) {
  return `<div class="drawer-content">
    <header class="drawer-header"><div class="drawer-user"><span class="avatar avatar--large">${escapeHtml(initials(user.displayName))}</span><span><small>USER PROFILE</small><h2>${escapeHtml(user.displayName)}</h2><p>@${escapeHtml(user.username)}</p></span></div><button class="icon-button" data-close-drawer type="button" aria-label="关闭">${icon("close")}</button></header>
    <div class="drawer-status">${badge(user.status)}<span>最后活跃 ${formatDate(user.lastActiveAt)}</span></div>
    <section class="drawer-metrics"><div><span>当前余额</span><strong>${formatNumber(user.balance)}</strong><small>credits</small></div><div><span>累计 Stars</span><strong>${formatNumber(user.paidStars)}</strong><small>已支付</small></div><div><span>任务成功率</span><strong>${user.successRate}%</strong><small>${user.jobs} 个任务</small></div></section>
    <section class="detail-section"><h3>用户资料</h3><dl class="detail-list"><div><dt>Telegram ID</dt><dd class="mono">${escapeHtml(String(user.telegramId))}</dd></div><div><dt>External User ID</dt><dd class="mono">${escapeHtml(user.externalUserId)}</dd></div><div><dt>偏好语言</dt><dd>${escapeHtml(user.languageCode || "未设置")}</dd></div><div><dt>首次渠道</dt><dd>${user.firstChannel}</dd></div><div><dt>Mini App 任务</dt><dd>${user.miniAppJobs || 0} 个</dd></div><div><dt>Mini App 最近活动</dt><dd>${formatDate(user.lastMiniAppActivityAt)}</dd></div><div><dt>注册时间</dt><dd>${formatDate(user.joinedAt)}</dd></div><div><dt>钱包版本</dt><dd>v${user.walletVersion}</dd></div></dl></section>
    ${userAcquisitionSection(acquisition)}
    <section class="detail-section"><h3>Credits 构成</h3><div class="credit-breakdown"><div><span>累计购买</span><strong>+${formatNumber(user.purchasedCredits)}</strong></div><div><span>累计消耗</span><strong>−${formatNumber(user.consumedCredits)}</strong></div><div><span>任务退款</span><strong>+${formatNumber(user.refundedCredits)}</strong></div><div><span>人工调整</span><strong>${user.manualCredits >= 0 ? "+" : ""}${formatNumber(user.manualCredits)}</strong></div></div></section>
    <footer class="drawer-actions"><button class="secondary-button" data-nav="jobs" data-close-drawer type="button">查看任务</button><button class="primary-button" data-adjust-user="${escapeHtml(user.externalUserId)}" type="button">${icon("plus")}调整余额</button></footer>
  </div>`;
}

function userAcquisitionSection(state: IntegrationState<UserAcquisition>) {
  if ("source" in state) {
    if (!state.found) return `<section class="detail-section"><h3>首次来源</h3><p class="detail-hint">PostHog 暂未找到该用户的 Mini App 打开记录；来源功能上线前的用户可能无法回填。</p></section>`;
    return `<section class="detail-section"><h3>首次来源</h3><dl class="detail-list"><div><dt>来源</dt><dd>${escapeHtml(state.source)}</dd></div><div><dt>媒介</dt><dd>${escapeHtml(state.medium)}</dd></div><div><dt>Campaign</dt><dd>${escapeHtml(state.campaign)}</dd></div><div><dt>内容 / 素材</dt><dd>${escapeHtml(state.content)}</dd></div><div><dt>Start Param</dt><dd class="mono word-break">${escapeHtml(state.startParam)}</dd></div><div><dt>首次观察</dt><dd>${formatDate(state.firstSeenAt || undefined)}</dd></div></dl></section>`;
  }
  if (state.status === "error") return `<section class="detail-section"><h3>首次来源</h3><p class="detail-hint detail-hint--error">${escapeHtml(state.error)}</p></section>`;
  return `<section class="detail-section"><h3>首次来源</h3><p class="detail-hint">正在从 PostHog 读取首次来源…</p></section>`;
}

export function jobDetail(job: AdminJob) {
  return `<div class="drawer-content">
    <header class="drawer-header"><div><small>GENERATION JOB</small><h2 class="mono">${escapeHtml(job.id)}</h2><p>${escapeHtml(job.userName)} · ${escapeHtml(job.externalUserId)}</p></div><button class="icon-button" data-close-drawer type="button" aria-label="关闭">${icon("close")}</button></header>
    <div class="drawer-status">${badge(job.status)}<span>${job.mode === "text-to-video" ? "文生视频" : "图生视频"} · ${job.model}</span></div>
    <section class="job-preview"><div class="media-placeholder media-placeholder--large"><span>视频输出</span><small>${job.outputUrl ? "演示环境未接入真实素材" : job.status === "processing" ? `正在生成 · ${job.progress}%` : "暂无可用输出"}</small></div>${job.status === "processing" ? `<div class="progress"><i style="width:${job.progress}%"></i></div>` : ""}</section>
    <section class="detail-section"><h3>生成参数</h3><dl class="detail-list"><div><dt>提示词</dt><dd class="prompt-copy">${escapeHtml(job.prompt)}</dd></div><div><dt>模型</dt><dd>${escapeHtml(job.model)}</dd></div><div><dt>时长 / 比例</dt><dd>${job.durationSeconds}s · ${job.aspectRatio}</dd></div><div><dt>质量 / 音频</dt><dd>${escapeHtml(job.quality)} · ${job.audioEnabled ? "启用" : "关闭"}</dd></div><div><dt>创建渠道</dt><dd>${job.channel}</dd></div><div><dt>Idempotency Key</dt><dd class="mono word-break">${escapeHtml(job.idempotencyKey)}</dd></div></dl></section>
    <section class="detail-section"><h3>交付时间线</h3><div class="timeline"><div class="is-done"><i></i><span><strong>任务创建</strong><small>${formatDate(job.createdAt)}</small></span></div><div class="${job.startedAt ? "is-done" : ""}"><i></i><span><strong>开始生成</strong><small>${formatDate(job.startedAt)}</small></span></div><div class="${job.finishedAt ? "is-done" : ""}"><i></i><span><strong>进入终态</strong><small>${formatDate(job.finishedAt)} · ${durationBetween(job.startedAt, job.finishedAt)}</small></span></div><div class="${job.botNotificationStatus === "sent" ? "is-done" : ""}"><i></i><span><strong>Telegram 通知</strong><small>${labelFor(job.botNotificationStatus)} · 回调 ${job.callbackAttempts} 次</small></span></div></div></section>
    ${job.failureCode ? `<section class="detail-section detail-section--danger"><h3>失败与退款</h3><dl class="detail-list"><div><dt>失败码</dt><dd class="mono">${escapeHtml(job.failureCode)}</dd></div><div><dt>失败信息</dt><dd>${escapeHtml(job.failureMessage || "—")}</dd></div><div><dt>已退款</dt><dd>${job.refundedCredits} credits</dd></div></dl></section>` : ""}
    <footer class="drawer-actions"><button class="secondary-button" type="button" ${!["queued", "processing"].includes(job.status) ? "disabled" : ""}>取消任务</button><button class="primary-button" type="button" ${job.status !== "failed" ? "disabled" : ""}>重新生成</button></footer>
  </div>`;
}

export function adjustWalletDialog(users: AdminUser[], selectedExternalUserId = "") {
  return `<form method="dialog" id="adjust-wallet-form" class="dialog-card">
    <header><div><span class="eyebrow">WALLET ADJUSTMENT</span><h2>调整 Credits</h2><p>只允许按差额增加或扣减，不直接覆盖最终余额。</p></div><button class="icon-button" data-close-dialog type="button" aria-label="关闭">${icon("close")}</button></header>
    <label><span>选择用户</span><select name="externalUserId" required>${users.map((user) => `<option value="${escapeHtml(user.externalUserId)}" ${selectedExternalUserId === user.externalUserId ? "selected" : ""}>${escapeHtml(user.displayName)} · ${user.telegramId} · ${formatNumber(user.balance)} credits</option>`).join("")}</select></label>
    <div class="form-row"><label><span>调整方式</span><select name="direction"><option value="add">增加</option><option value="subtract">扣减</option></select></label><label><span>Credits 数量</span><input name="amount" type="number" min="1" step="1" value="100" required /></label></div>
    <label><span>调整原因</span><select name="reasonType"><option>活动赠送</option><option>异常修正</option><option>运营补偿</option><option>其他</option></select></label>
    <label><span>原因说明</span><textarea name="reason" rows="3" minlength="4" maxlength="300" placeholder="说明本次调整的具体原因" required></textarea></label>
    <label><span>Reference ID</span><input name="referenceId" value="admin-${Date.now().toString(36)}" pattern="[a-zA-Z0-9_\\-]{8,80}" required /></label>
    <footer><button class="secondary-button" data-close-dialog type="button">取消</button><button class="primary-button" type="submit">确认调整</button></footer>
  </form>`;
}

export function creditPackDialog(pack: CreditPack) {
  return `<form method="dialog" id="edit-credit-pack-form" class="dialog-card">
    <header><div><span class="eyebrow">CREDIT PACK</span><h2>编辑 Credits 套餐</h2><p>修改会先保存在当前页面，点击“发布配置”后才会生效。</p></div><button class="icon-button" data-close-dialog type="button" aria-label="关闭">${icon("close")}</button></header>
    <label><span>套餐 ID（不可修改）</span><input class="mono" name="packId" value="${escapeHtml(pack.id)}" readonly /></label>
    <div class="form-row"><label><span>套餐名称</span><input name="title" minlength="2" maxlength="80" value="${escapeHtml(pack.title)}" required /></label><label><span>状态</span><select name="status"><option value="active" ${pack.status === "active" ? "selected" : ""}>正常</option><option value="draft" ${pack.status === "draft" ? "selected" : ""}>草稿</option><option value="inactive" ${pack.status === "inactive" ? "selected" : ""}>已下架</option></select></label></div>
    <label><span>套餐说明</span><textarea name="description" rows="2" maxlength="160" placeholder="展示给用户的套餐说明">${escapeHtml(pack.description)}</textarea></label>
    <div class="form-row"><label><span>Stars 售价</span><input name="stars" type="number" min="1" max="1000000" step="1" value="${pack.stars}" required /></label><label><span>基础 Credits</span><input name="baseCredits" type="number" min="1" max="10000000" step="1" value="${pack.baseCredits}" required /></label></div>
    <div class="form-row"><label><span>赠送 Credits</span><input name="bonusCredits" type="number" min="0" max="10000000" step="1" value="${pack.bonusCredits}" required /></label><label><span>条款版本</span><input name="termsVersion" value="${escapeHtml(pack.termsVersion)}" readonly /></label></div>
    <fieldset class="dialog-fieldset"><legend>发布渠道</legend><div class="check-grid"><label class="check-field"><input type="checkbox" name="channels" value="Bot" ${pack.channels.includes("Bot") ? "checked" : ""} /><span>Bot</span></label><label class="check-field"><input type="checkbox" name="channels" value="Mini App" ${pack.channels.includes("Mini App") ? "checked" : ""} /><span>Mini App</span></label></div></fieldset>
    <label class="check-field check-field--wide"><input type="checkbox" name="recommended" ${pack.recommended ? "checked" : ""} /><span><b>设为推荐套餐</b><small>同一时间最多展示一个推荐套餐</small></span></label>
    <footer><button class="secondary-button" data-close-dialog type="button">取消</button><button class="primary-button" type="submit">保存套餐修改</button></footer>
  </form>`;
}

export function subscriptionPlanDialog(plan?: SubscriptionPlan) {
  const editing = Boolean(plan);
  const value: SubscriptionPlan = plan || {
    id: "", title: "", description: "", stars: 1, creditsPerCycle: 100, periodSeconds: 2_592_000,
    status: "draft", recommended: false, channels: ["Mini App"], termsVersion: "2026-08-04",
  };
  return `<form method="dialog" id="edit-subscription-plan-form" class="dialog-card">
    <header><div><span class="eyebrow">STARS SUBSCRIPTION</span><h2>${editing ? "编辑" : "新建"}订阅计划</h2><p>Telegram Stars 订阅固定每 30 天自动续费，每次成功付款都会发放周期 credits。</p></div><button class="icon-button" data-close-dialog type="button" aria-label="关闭">${icon("close")}</button></header>
    ${editing ? `<input type="hidden" name="planId" value="${escapeHtml(value.id)}" />` : ""}
    <div class="form-row"><label><span>计划名称</span><input name="title" minlength="2" maxlength="80" value="${escapeHtml(value.title)}" required /></label><label><span>状态</span><select name="status"><option value="active" ${value.status === "active" ? "selected" : ""}>正常</option><option value="draft" ${value.status === "draft" ? "selected" : ""}>草稿</option><option value="inactive" ${value.status === "inactive" ? "selected" : ""}>已下架</option></select></label></div>
    <label><span>计划说明</span><textarea name="description" rows="2" maxlength="160" placeholder="展示给用户的简短说明">${escapeHtml(value.description)}</textarea></label>
    <div class="form-row"><label><span>每 30 天 Stars 售价</span><input name="stars" type="number" min="1" max="1000000" step="1" value="${value.stars}" required /></label><label><span>每周期 Credits</span><input name="creditsPerCycle" type="number" min="1" max="10000000" step="1" value="${value.creditsPerCycle}" required /></label></div>
    <div class="form-row"><label><span>订阅周期</span><input value="30 天" readonly /></label><label><span>条款版本</span><input name="termsVersion" value="${escapeHtml(value.termsVersion)}" pattern="\\d{4}-\\d{2}-\\d{2}" required /></label></div>
    <fieldset class="dialog-fieldset"><legend>发布渠道</legend><div class="check-grid"><label class="check-field"><input type="checkbox" name="channels" value="Bot" ${value.channels.includes("Bot") ? "checked" : ""} /><span>Bot</span></label><label class="check-field"><input type="checkbox" name="channels" value="Mini App" ${value.channels.includes("Mini App") ? "checked" : ""} /><span>Mini App</span></label></div></fieldset>
    <label class="check-field check-field--wide"><input type="checkbox" name="recommended" ${value.recommended ? "checked" : ""} /><span><b>设为推荐计划</b><small>同一时间最多展示一个推荐订阅计划</small></span></label>
    <footer><button class="secondary-button" data-close-dialog type="button">取消</button><button class="primary-button" type="submit">保存计划</button></footer>
  </form>`;
}
