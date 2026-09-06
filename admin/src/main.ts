import "./style.css";
import { adjustWalletDialog, creditPackDialog, jobDetail, subscriptionPlanDialog, userDetail } from "./details";
import { createSubscriptionPlanId } from "./product-ids";
import { AuthenticationRequiredError, createAdminRepository } from "./repository";
import type { AdminData, AffiliateAnalytics, CreditPack, GenerationConfiguration, IntegrationState, MiniAppAnalytics, ModelCatalog, PageId, SubscriptionPlan } from "./types";
import { escapeHtml, icon } from "./ui";
import { renderPage, type ViewState } from "./views";

const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement;
if (!root) throw new Error("Admin app root was not found");

const repository = createAdminRepository();
const densityKey = "aurax-admin-density";
const density = localStorage.getItem(densityKey) || "balanced";
document.documentElement.dataset.density = density;

const state: ViewState = {
  page: "overview",
  query: "",
  paymentTab: "transactions",
  jobStatus: "all",
  jobChannel: "all",
  modelCatalog: { status: "idle" },
  miniAppAnalytics: { status: "idle" },
  analyticsAi: { status: "idle" },
  analyticsQuestion: "",
  affiliateAnalytics: { status: "idle" },
};

const navigation: Array<{ id: PageId; label: string; group: string; icon?: string }> = [
  { id: "overview", label: "运营看板", group: "工作台" },
  { id: "users", label: "用户管理", group: "业务" },
  { id: "jobs", label: "生成任务", group: "业务" },
  { id: "payments", label: "支付与钱包", group: "业务" },
  { id: "affiliates", label: "Telegram Affiliate", group: "业务", icon: "payments" },
  { id: "configuration", label: "Credits 商品", group: "管理", icon: "payments" },
  { id: "generation", label: "生成参数", group: "管理", icon: "configuration" },
  { id: "analytics", label: "数据分析", group: "管理" },
  { id: "monitoring", label: "系统监控", group: "管理" },
];

let data: AdminData | null = null;
let searchTimer = 0;
let loginTotpRequired = true;
let newUserGiftCreditsDraft: string | null = null;
let referralRewardCreditsDraft: string | null = null;
let referralWeeklyLimitDraft: string | null = null;
let referralEnabledDraft: boolean | null = null;

root.innerHTML = `<div class="admin-shell">
  <aside class="sidebar" id="sidebar">
    <a class="admin-brand" href="#overview" data-nav="overview"><span class="admin-brand__mark">A</span><span><strong>AuraX</strong><small>CONTROL</small></span></a>
    <nav class="sidebar-nav" aria-label="后台导航">${renderNavigation()}</nav>
    <div class="sidebar-footer"><div class="environment"><i></i><span><strong id="environment-name">连接中</strong><small>aurax-admin-service</small></span></div><button class="icon-button" type="button" aria-label="更多">${icon("more")}</button></div>
  </aside>
  <section class="main-shell">
    <header class="topbar">
      <div class="topbar-left"><button id="mobile-menu" class="icon-button mobile-menu" type="button" aria-label="打开菜单">${icon("menu")}</button><span id="breadcrumb">工作台 / 运营看板</span><span id="mode-badge" class="mode-badge">载入中</span></div>
      <div class="topbar-right"><div class="density-switch" aria-label="界面密度"><button data-density="compact" type="button">紧凑</button><button data-density="balanced" type="button">标准</button><button data-density="relaxed" type="button">舒展</button></div><button class="global-search" type="button">${icon("search")}<span>全局搜索</span><kbd>⌘ K</kbd></button><button class="operator-menu" data-logout type="button" title="退出后台"><span class="operator-avatar">AX</span><span>退出</span></button></div>
    </header>
    <main id="page-content" class="page-content"><div class="loading-state"><i></i><span>正在载入运营数据…</span></div></main>
  </section>
</div>
<div id="sidebar-backdrop" class="sidebar-backdrop"></div>
<aside id="detail-drawer" class="detail-drawer" aria-live="polite"></aside>
<dialog id="action-dialog" class="action-dialog"></dialog>
<div id="toast" class="toast" role="status" aria-live="polite"></div>`;

const pageContent = requiredElement<HTMLElement>("page-content");
const drawer = requiredElement<HTMLElement>("detail-drawer");
const dialog = requiredElement<HTMLDialogElement>("action-dialog");

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} was not found`);
  return element as T;
}

function renderNavigation() {
  const groups = [...new Set(navigation.map((item) => item.group))];
  return groups.map((group) => `<section><span>${group}</span>${navigation.filter((item) => item.group === group).map((item) => `<button data-nav="${item.id}" type="button">${icon(item.icon || item.id)}<span>${item.label}</span></button>`).join("")}</section>`).join("");
}

function render() {
  if (!data) return;
  pageContent.innerHTML = renderPage(data, state);
  document.querySelectorAll<HTMLElement>("[data-nav]").forEach((element) => element.classList.toggle("is-active", element.dataset.nav === state.page));
  const active = navigation.find((item) => item.id === state.page)!;
  requiredElement("breadcrumb").textContent = `${active.group} / ${active.label}`;
  requiredElement("mode-badge").textContent = data.mode === "demo" ? "演示数据" : "实时数据";
  requiredElement("mode-badge").className = `mode-badge mode-badge--${data.mode}`;
  requiredElement("environment-name").textContent = data.environment === "production" ? "Production" : data.environment === "development" ? "Local D1" : "Demo";
  document.querySelectorAll<HTMLButtonElement>("[data-density]").forEach((button) => button.classList.toggle("is-active", button.dataset.density === document.documentElement.dataset.density));
}

function navigate(page: PageId) {
  state.page = page;
  state.query = "";
  if (page !== "configuration") {
    newUserGiftCreditsDraft = null;
    referralRewardCreditsDraft = null;
    referralWeeklyLimitDraft = null;
    referralEnabledDraft = null;
  }
  if (dialog.open) dialog.close();
  drawer.classList.remove("is-open");
  document.body.classList.remove("sidebar-open");
  history.replaceState(null, "", `#${page}`);
  render();
  pageContent.scrollTop = 0;
  void hydratePage(page);
}

function openDrawer(content: string, userId = "") {
  drawer.innerHTML = content;
  drawer.dataset.userId = userId;
  drawer.classList.add("is-open");
}

function closeDrawer() {
  drawer.classList.remove("is-open");
  delete drawer.dataset.userId;
}

function showDialog(content: string) {
  dialog.innerHTML = content;
  dialog.showModal();
}

let toastTimer = 0;
function toast(message: string, kind: "success" | "error" = "success") {
  const element = requiredElement("toast");
  element.textContent = message;
  element.className = `toast toast--${kind} is-visible`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element.className = "toast"; }, 3200);
}

root.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const analyticsButton = target.closest<HTMLButtonElement>("[data-analyze-analytics]");
  if (analyticsButton) {
    event.preventDefault();
    const analyticsForm = analyticsButton.closest<HTMLFormElement>("#analytics-ai-form");
    if (analyticsForm) await submitAnalyticsQuestion(analyticsForm);
    return;
  }
  const nav = target.closest<HTMLElement>("[data-nav]");
  if (nav?.dataset.nav) {
    navigate(nav.dataset.nav as PageId);
    return;
  }
  if (target.closest("[data-close-drawer]")) closeDrawer();
  if (target.closest("[data-close-dialog]")) dialog.close();

  const densityButton = target.closest<HTMLButtonElement>("[data-density]");
  if (densityButton?.dataset.density) {
    document.documentElement.dataset.density = densityButton.dataset.density;
    localStorage.setItem(densityKey, densityButton.dataset.density);
    render();
  }

  const userRow = target.closest<HTMLElement>("[data-open-user]");
  if (userRow?.dataset.openUser && data) {
    const user = data.users.find((item) => item.externalUserId === userRow.dataset.openUser);
    if (user) {
      openDrawer(userDetail(user, { status: "loading" }), user.externalUserId);
      try {
        const acquisition = await repository.loadUserAcquisition(user.externalUserId);
        if (drawer.dataset.userId === user.externalUserId) openDrawer(userDetail(user, acquisition), user.externalUserId);
      } catch (error) {
        if (drawer.dataset.userId === user.externalUserId) openDrawer(userDetail(user, { status: "error", error: messageOf(error) }), user.externalUserId);
      }
    }
  }

  const jobRow = target.closest<HTMLElement>("[data-open-job]");
  if (jobRow?.dataset.openJob && data) {
    const job = data.jobs.find((item) => item.id === jobRow.dataset.openJob);
    if (job) openDrawer(jobDetail(job));
  }

  const adjustButton = target.closest<HTMLElement>("[data-adjust-user]");
  if ((adjustButton || target.closest("[data-open-adjust]")) && data) {
    showDialog(adjustWalletDialog(data.users, adjustButton?.dataset.adjustUser));
  }

  const editPackButton = target.closest<HTMLElement>("[data-edit-pack]");
  if (editPackButton?.dataset.editPack && data) {
    const pack = data.creditPacks.find((item) => item.id === editPackButton.dataset.editPack);
    if (pack) showDialog(creditPackDialog(pack));
  }

  const editSubscriptionButton = target.closest<HTMLElement>("[data-edit-subscription]");
  if (editSubscriptionButton?.dataset.editSubscription && data) {
    const plan = data.subscriptionPlans.find((item) => item.id === editSubscriptionButton.dataset.editSubscription);
    if (plan) showDialog(subscriptionPlanDialog(plan));
  }
  if (target.closest("[data-new-subscription]")) showDialog(subscriptionPlanDialog());

  if (target.closest("[data-publish-config]")) {
    const publishButton = target.closest<HTMLElement>("[data-publish-config]");
    const currentData = data;
    const form = document.querySelector<HTMLFormElement>("#config-form");
    const giftInput = document.querySelector<HTMLInputElement>('#new-user-gift-form input[name="newUserGiftCredits"]');
    const referralRewardInput = document.querySelector<HTMLInputElement>('#referral-config-form input[name="referralRewardCredits"]');
    const referralLimitInput = document.querySelector<HTMLInputElement>('#referral-config-form input[name="referralWeeklyLimit"]');
    const referralEnabledInput = document.querySelector<HTMLInputElement>('#referral-config-form input[name="referralEnabled"]');
    if (currentData) {
      const generation = form ? generationFromForm(form) : currentData.configuration.generation;
      const newUserGiftCredits = giftInput
        ? Number(newUserGiftCreditsDraft ?? giftInput.value)
        : currentData.configuration.newUserGift.credits;
      if (!Number.isSafeInteger(newUserGiftCredits) || newUserGiftCredits < 0 || newUserGiftCredits > 10_000_000) {
        toast("新用户赠送数量必须是 0 到 10,000,000 之间的整数。", "error");
        return;
      }
      const referral = {
        rewardCredits: Number(referralRewardCreditsDraft ?? referralRewardInput?.value ?? currentData.configuration.referral.rewardCredits),
        weeklyLimit: Number(referralWeeklyLimitDraft ?? referralLimitInput?.value ?? currentData.configuration.referral.weeklyLimit),
        enabled: referralEnabledDraft ?? referralEnabledInput?.checked ?? currentData.configuration.referral.enabled,
      };
      if (!Number.isSafeInteger(referral.rewardCredits) || referral.rewardCredits < 1 || referral.rewardCredits > 10_000_000
        || !Number.isSafeInteger(referral.weeklyLimit) || referral.weeklyLimit < 1 || referral.weeklyLimit > 100) {
        toast("邀请奖励需要是 1 到 10,000,000 credits，每周上限需要是 1 到 100 的整数。", "error");
        return;
      }
      try {
        await repository.publishConfiguration(generation, currentData.creditPacks, currentData.subscriptionPlans, newUserGiftCredits, referral);
        data = await repository.load();
        newUserGiftCreditsDraft = null;
        referralRewardCreditsDraft = null;
        referralWeeklyLimitDraft = null;
        referralEnabledDraft = null;
        render();
        toast(`${publishButton?.dataset.configScope === "generation" ? "生成参数" : "商品配置"}已发布为 ${data.configuration.version}。`);
      } catch (error) { toast(messageOf(error), "error"); }
    }
  }
  if (target.closest("[data-sync-models]")) void loadModelCatalog(true);
  if (target.closest("[data-refresh-analytics]")) void loadMiniAppAnalytics(true);
  if (target.closest("[data-refresh-affiliates]")) void loadAffiliateAnalytics(true);
  if (target.closest("[data-sync-stars]")) {
    try {
      const result = await repository.syncTelegramStars();
      await loadAffiliateAnalytics(true);
      toast(`同步完成：读取 ${result.fetched} 条，新增 ${result.inserted} 条。`);
    } catch (error) { toast(messageOf(error), "error"); }
  }
  if (target.closest("[data-export]")) exportPaymentsCsv(data);
  if (target.closest("[data-refresh]")) {
    try { data = await repository.load(); render(); await hydratePage(state.page, true); toast("数据已刷新。"); }
    catch (error) { toast(messageOf(error), "error"); }
  }
  if (target.closest("[data-logout]")) {
    try { await repository.logout(); }
    catch (error) { if (!(error instanceof AuthenticationRequiredError)) toast(messageOf(error), "error"); }
    renderLogin("", loginTotpRequired);
    return;
  }
  if (target.closest("#mobile-menu")) document.body.classList.toggle("sidebar-open");
  if (target.closest("#sidebar-backdrop")) document.body.classList.remove("sidebar-open");
});

root.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.name === "newUserGiftCredits") {
    newUserGiftCreditsDraft = input.value;
    return;
  }
  if (input.name === "referralRewardCredits") {
    referralRewardCreditsDraft = input.value;
    return;
  }
  if (input.name === "referralWeeklyLimit") {
    referralWeeklyLimitDraft = input.value;
    return;
  }
  if (input.id !== "page-search") return;
  state.query = input.value;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    render();
    const next = document.getElementById("page-search") as HTMLInputElement | null;
    next?.focus();
    next?.setSelectionRange(next.value.length, next.value.length);
  }, 120);
});

root.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.name === "referralEnabled") referralEnabledDraft = input.checked;
});

document.addEventListener("submit", async (event) => {
  const form = event.target as HTMLFormElement;
  if (form.id !== "analytics-ai-form") return;
  event.preventDefault();
  await submitAnalyticsQuestion(form);
}, { capture: true });

async function submitAnalyticsQuestion(form: HTMLFormElement) {
  const question = String(new FormData(form).get("question") || "").trim();
  if (question.length < 3) return;
  const analytics = state.miniAppAnalytics;
  const today = new Date().toISOString().slice(0, 10);
  const from = analytics && "from" in analytics ? analytics.from : new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const to = analytics && "to" in analytics ? analytics.to : today;
  state.analyticsQuestion = question;
  state.analyticsAi = { status: "loading" };
  render();
  try { state.analyticsAi = await repository.analyzeMiniAppAnalytics(question, from, to); }
  catch (error) { state.analyticsAi = { status: "error", error: messageOf(error) }; }
  render();
}

root.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === "job-status-filter") { state.jobStatus = target.value as ViewState["jobStatus"]; render(); }
  if (target.id === "job-channel-filter") { state.jobChannel = target.value as ViewState["jobChannel"]; render(); }
  if (target.id === "generation-model") applyModelCapabilities(target.value);
  if (target.id === "affiliate-from") { state.affiliateFrom = target.value; void loadAffiliateAnalytics(true); }
  if (target.id === "affiliate-to") { state.affiliateTo = target.value; void loadAffiliateAnalytics(true); }
});

root.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (event.key === "Enter" && target.matches("tr[data-open-user], tr[data-open-job]")) target.click();
  if (event.key === "Escape") closeDrawer();
});

root.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const paymentTab = target.closest<HTMLElement>("[data-payment-tab]");
  if (paymentTab?.dataset.paymentTab) { state.paymentTab = paymentTab.dataset.paymentTab as ViewState["paymentTab"]; state.query = ""; render(); }
});

dialog.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  if (form.id === "edit-credit-pack-form" && data) {
    const id = String(formData.get("packId") || "");
    const pack = data.creditPacks.find((item) => item.id === id);
    const channels = formData.getAll("channels").filter((value): value is "Bot" | "Mini App" => value === "Bot" || value === "Mini App");
    if (!pack) { toast("没有找到这个套餐。", "error"); return; }
    if (!channels.length) { toast("至少选择一个发布渠道。", "error"); return; }
    const updated: CreditPack = {
      ...pack,
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      stars: Number(formData.get("stars")),
      baseCredits: Number(formData.get("baseCredits")),
      bonusCredits: Number(formData.get("bonusCredits")),
      status: String(formData.get("status")) as CreditPack["status"],
      recommended: formData.has("recommended"),
      channels,
      termsVersion: String(formData.get("termsVersion") || ""),
    };
    if (updated.recommended) data.creditPacks.forEach((item) => { item.recommended = item.id === id; });
    Object.assign(pack, updated);
    dialog.close(); render(); toast("套餐修改已保存，发布配置后生效。");
    return;
  }
  if (form.id === "edit-subscription-plan-form" && data) {
    const editingId = String(formData.get("planId") || "").trim();
    const existing = editingId ? data.subscriptionPlans.find((item) => item.id === editingId) : undefined;
    const channels = formData.getAll("channels").filter((value): value is "Bot" | "Mini App" => value === "Bot" || value === "Mini App");
    if (!channels.length) { toast("至少选择一个发布渠道。", "error"); return; }
    if (editingId && !existing) { toast("没有找到这个订阅计划，请刷新后重试。", "error"); return; }
    const id = existing?.id || createSubscriptionPlanId(data.subscriptionPlans.map((item) => item.id));
    const updated: SubscriptionPlan = {
      id,
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      stars: Number(formData.get("stars")),
      creditsPerCycle: Number(formData.get("creditsPerCycle")),
      periodSeconds: 2_592_000,
      status: String(formData.get("status")) as SubscriptionPlan["status"],
      recommended: formData.has("recommended"),
      channels,
      termsVersion: String(formData.get("termsVersion") || ""),
    };
    if (updated.recommended) data.subscriptionPlans.forEach((item) => { item.recommended = item.id === id; });
    if (existing) Object.assign(existing, updated);
    else data.subscriptionPlans.push(updated);
    dialog.close(); render(); toast("订阅计划已保存，发布配置后生效。");
    return;
  }
  if (form.id === "adjust-wallet-form" && data) {
    const externalUserId = String(formData.get("externalUserId") || "");
    const amount = Number(formData.get("amount"));
    const direction = formData.get("direction") === "subtract" ? -1 : 1;
    const reason = `${formData.get("reasonType")}：${formData.get("reason")}`;
    const referenceId = String(formData.get("referenceId") || "");
    try {
      await repository.adjustWallet(externalUserId, amount * direction, reason, referenceId);
      data = await repository.load();
      dialog.close(); closeDrawer(); render(); toast("Credits 余额已调整，钱包流水已生成。");
    } catch (error) { toast(messageOf(error), "error"); }
  }
});

dialog.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("[data-close-dialog]")) dialog.close();
});

function generationFromForm(form: HTMLFormElement): GenerationConfiguration {
  const values = new FormData(form);
  return {
    model: String(values.get("model") || ""),
    durationSeconds: Number(values.get("durationSeconds")),
    aspectRatio: String(values.get("aspectRatio") || ""),
    quality: String(values.get("quality") || ""),
    maxPromptLength: Number(values.get("maxPromptLength")),
    maxImageBytes: Number(values.get("maxImageMegabytes")) * 1024 * 1024,
    maxConcurrentJobs: Number(values.get("maxConcurrentJobs")),
    audioEnabled: values.has("audioEnabled"),
  };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function exportPaymentsCsv(current: AdminData | null) {
  if (!current) return;
  const rows = [["id", "telegramChargeId", "externalUserId", "productId", "productType", "billingCycle", "isFirstRecurring", "subscriptionExpirationDate", "stars", "credits", "status", "paidAt"],
    ...current.payments.map((payment) => [payment.id, payment.telegramChargeId, payment.externalUserId, payment.productId, payment.productType || "credit_pack", payment.billingCycle || "one_time", payment.isFirstRecurring || false, payment.subscriptionExpirationDate || "", payment.stars, payment.credits, payment.status, payment.paidAt])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = `aurax-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("支付 CSV 已导出。");
}

window.addEventListener("hashchange", () => {
  const page = location.hash.slice(1) as PageId;
  if (navigation.some((item) => item.id === page)) navigate(page);
});

async function start() {
  try {
    const session = await repository.session();
    loginTotpRequired = session.totpRequired;
    if (!session.authenticated) {
      renderLogin("", loginTotpRequired);
      return;
    }
    data = await repository.load();
    const initialPage = location.hash.slice(1) as PageId;
    if (navigation.some((item) => item.id === initialPage)) state.page = initialPage;
    render();
    await hydratePage(state.page);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      renderLogin("", loginTotpRequired);
      return;
    }
    pageContent.innerHTML = `<div class="fatal-state"><span>连接未完成</span><h1>暂时无法载入后台</h1><p>${escapeHtml(messageOf(error))}</p><button class="primary-button" onclick="location.reload()">重新连接</button></div>`;
  }
}

void start();

function renderLogin(message = "", requireTotp = true) {
  document.body.classList.remove("sidebar-open");
  root.innerHTML = `<main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <div class="login-brand"><span class="admin-brand__mark">A</span><span><strong>AuraX</strong><small>CONTROL</small></span></div>
      <div class="login-heading"><span>安全登录</span><h1 id="login-title">进入运营后台</h1><p>${requireTotp ? "请输入管理员账号、密码及验证器中的 6 位动态验证码。" : "请输入管理员账号和密码。"}</p></div>
      <form id="admin-login-form" class="login-form">
        <label>用户名<input name="username" type="text" autocomplete="username" maxlength="120" required></label>
        <label>密码<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
        ${requireTotp ? '<label>动态验证码<input name="totp" type="text" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required></label>' : ""}
        <p id="login-error" class="login-error" role="alert"${message ? "" : " hidden"}>${escapeHtml(message)}</p>
        <button class="primary-button login-submit" type="submit">登录后台</button>
      </form>
      <p class="login-note">${requireTotp ? "验证码每 30 秒更新。" : "当前为内测登录模式。"}连续 5 次失败将暂停登录 15 分钟。</p>
    </section>
  </main>`;
  const form = document.querySelector<HTMLFormElement>("#admin-login-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    const error = form.querySelector<HTMLElement>("#login-error");
    if (button) { button.disabled = true; button.textContent = "正在验证…"; }
    if (error) error.hidden = true;
    try {
      await repository.login(String(values.get("username") || ""), String(values.get("password") || ""), String(values.get("totp") || ""));
      location.reload();
    } catch (loginError) {
      if (error) { error.textContent = messageOf(loginError); error.hidden = false; }
      if (button) { button.disabled = false; button.textContent = "登录后台"; }
    }
  });
  form?.querySelector<HTMLInputElement>("input[name=username]")?.focus();
}

async function hydratePage(page: PageId, force = false) {
  if (page === "generation") await loadModelCatalog(force);
  if (page === "analytics") await loadMiniAppAnalytics(force);
  if (page === "affiliates") await loadAffiliateAnalytics(force);
  if (page === "monitoring") await Promise.all([loadModelCatalog(force), loadMiniAppAnalytics(force)]);
}

async function loadModelCatalog(force = false) {
  const current = state.modelCatalog as IntegrationState<ModelCatalog> | undefined;
  if (!force && current?.status === "ready") return;
  state.modelCatalog = { status: "loading" };
  render();
  try { state.modelCatalog = await repository.loadModelCatalog(force); }
  catch (error) { state.modelCatalog = { status: "error", error: messageOf(error) }; }
  render();
}

async function loadMiniAppAnalytics(force = false) {
  const current = state.miniAppAnalytics as IntegrationState<MiniAppAnalytics> | undefined;
  if (!force && current && !["idle", "loading"].includes(current.status)) return;
  state.miniAppAnalytics = { status: "loading" };
  render();
  try { state.miniAppAnalytics = await repository.loadMiniAppAnalytics(); }
  catch (error) { state.miniAppAnalytics = { status: "error", error: messageOf(error) }; }
  render();
}

async function loadAffiliateAnalytics(force = false) {
  const current = state.affiliateAnalytics as IntegrationState<AffiliateAnalytics> | undefined;
  if (!force && current?.status === "ready") return;
  state.affiliateAnalytics = { status: "loading" };
  render();
  try {
    const analytics = await repository.loadAffiliateAnalytics(state.affiliateFrom, state.affiliateTo);
    state.affiliateAnalytics = analytics;
    state.affiliateFrom = analytics.from;
    state.affiliateTo = analytics.to;
  } catch (error) {
    state.affiliateAnalytics = { status: "error", error: messageOf(error) };
  }
  render();
}

function applyModelCapabilities(modelId: string) {
  const catalog = state.modelCatalog;
  if (!catalog || catalog.status !== "ready") return;
  const model = catalog.models.find((item) => item.id === modelId);
  const form = document.querySelector<HTMLFormElement>("#config-form");
  if (!model || !form) return;
  replaceOptions(form.elements.namedItem("durationSeconds") as HTMLSelectElement, model.durations.map((value) => [String(value), `${value} 秒`]));
  replaceOptions(form.elements.namedItem("aspectRatio") as HTMLSelectElement, model.aspectRatios.map((value) => [value, value]));
  replaceOptions(form.elements.namedItem("quality") as HTMLSelectElement, model.qualities.map((value) => [value, value]));
  const audio = form.elements.namedItem("audioEnabled") as HTMLInputElement;
  audio.disabled = !model.supportsAudio;
  if (!model.supportsAudio) audio.checked = false;
}

function replaceOptions(select: HTMLSelectElement, values: Array<[string, string]>) {
  const previous = select.value;
  select.innerHTML = values.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  if (values.some(([value]) => value === previous)) select.value = previous;
}
