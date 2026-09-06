import type { AdminData } from "./types";

export const demoData: AdminData = {
  mode: "demo",
  environment: "demo",
  metrics: [
    { id: "active", label: "活跃创作者", value: "1,284", change: 12.6, hint: "近 7 天去重用户", tone: "success" },
    { id: "jobs", label: "任务提交", value: "4,862", change: 8.2, hint: "今日 736 个", tone: "default" },
    { id: "success", label: "生成成功率", value: "94.8%", change: 1.4, hint: "目标 ≥ 95%", tone: "success" },
    { id: "queue", label: "当前队列", value: "38", change: -18.0, hint: "最老等待 2m 14s", tone: "warning" },
    { id: "stars", label: "Stars 收入", value: "18,420", change: 15.7, hint: "近 7 天", tone: "default" },
  ],
  trends: [
    { label: "07/29", jobs: 542, revenue: 1820, successRate: 92.8 },
    { label: "07/30", jobs: 618, revenue: 2250, successRate: 94.1 },
    { label: "07/31", jobs: 590, revenue: 1980, successRate: 93.7 },
    { label: "08/01", jobs: 703, revenue: 2640, successRate: 95.2 },
    { label: "08/02", jobs: 654, revenue: 2390, successRate: 94.9 },
    { label: "08/03", jobs: 719, revenue: 2980, successRate: 95.6 },
    { label: "08/04", jobs: 736, revenue: 4360, successRate: 96.1 },
  ],
  users: [
    { externalUserId: "telegram_835104221", telegramId: 835104221, displayName: "Mila Chen", username: "milamakes", languageCode: "zh-CN", status: "active", balance: 1240, walletVersion: 18, paidStars: 600, purchasedCredits: 3500, consumedCredits: 2340, refundedCredits: 80, manualCredits: 0, jobs: 43, successRate: 95.3, joinedAt: "2026-07-11T09:24:00Z", lastActiveAt: "2026-08-04T08:42:00Z", firstChannel: "Mini App" },
    { externalUserId: "telegram_502734918", telegramId: 502734918, displayName: "Noah Park", username: "noahframes", languageCode: "en", status: "active", balance: 320, walletVersion: 31, paidStars: 1000, purchasedCredits: 7000, consumedCredits: 6860, refundedCredits: 180, manualCredits: 0, jobs: 117, successRate: 92.3, joinedAt: "2026-06-28T13:02:00Z", lastActiveAt: "2026-08-04T08:18:00Z", firstChannel: "Bot" },
    { externalUserId: "telegram_194820377", telegramId: 194820377, displayName: "林小满", username: "linxiaoman", languageCode: "zh-CN", status: "active", balance: 2760, walletVersion: 12, paidStars: 500, purchasedCredits: 3000, consumedCredits: 300, refundedCredits: 60, manualCredits: 0, jobs: 6, successRate: 83.3, joinedAt: "2026-08-01T04:12:00Z", lastActiveAt: "2026-08-04T07:56:00Z", firstChannel: "Mini App" },
    { externalUserId: "telegram_730164022", telegramId: 730164022, displayName: "Ari Stone", username: "aristone", languageCode: "en", status: "generation_restricted", balance: 40, walletVersion: 44, paidStars: 1300, purchasedCredits: 8800, consumedCredits: 8840, refundedCredits: 80, manualCredits: 0, jobs: 152, successRate: 88.8, joinedAt: "2026-05-22T10:35:00Z", lastActiveAt: "2026-08-03T23:11:00Z", firstChannel: "Bot" },
    { externalUserId: "telegram_992340116", telegramId: 992340116, displayName: "Sora", username: "sora_scene", languageCode: "ja", status: "active", balance: 6800, walletVersion: 7, paidStars: 1000, purchasedCredits: 7000, consumedCredits: 260, refundedCredits: 60, manualCredits: 0, jobs: 5, successRate: 100, joinedAt: "2026-08-02T14:01:00Z", lastActiveAt: "2026-08-04T06:49:00Z", firstChannel: "Mini App" },
    { externalUserId: "telegram_440182901", telegramId: 440182901, displayName: "Evan Wu", username: "evan_w", languageCode: "zh-CN", status: "disabled", balance: 0, walletVersion: 9, paidStars: 100, purchasedCredits: 500, consumedCredits: 500, refundedCredits: 0, manualCredits: 0, jobs: 9, successRate: 77.8, joinedAt: "2026-07-02T16:44:00Z", lastActiveAt: "2026-07-21T03:18:00Z", firstChannel: "Bot" },
  ],
  jobs: [
    { id: "job_8f2a1c7", externalUserId: "telegram_835104221", userName: "Mila Chen", mode: "image-to-video", prompt: "海边玻璃屋内，白色窗帘被风轻轻吹动，清晨自然光，镜头缓慢向前", model: "peach-max", status: "succeeded", progress: 100, creditCost: 60, refundedCredits: 0, channel: "Mini App", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", audioEnabled: true, outputUrl: "#", idempotencyKey: "telegram-mini-app-835104221-a8f124d9cb7e44a2", createdAt: "2026-08-04T08:31:00Z", startedAt: "2026-08-04T08:31:18Z", finishedAt: "2026-08-04T08:33:42Z", callbackAttempts: 1, callbackStatus: 200, botNotificationStatus: "sent" },
    { id: "job_219db46", externalUserId: "telegram_502734918", userName: "Noah Park", mode: "text-to-video", prompt: "A lone cyclist crossing a rain-soaked neon city at midnight, quiet cinematic pacing", model: "peach-max", status: "processing", progress: 68, creditCost: 60, refundedCredits: 0, channel: "Bot", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", audioEnabled: true, idempotencyKey: "telegram-update-1298412", createdAt: "2026-08-04T08:39:00Z", startedAt: "2026-08-04T08:39:21Z", callbackAttempts: 0, botNotificationStatus: "pending" },
    { id: "job_be8310f", externalUserId: "telegram_194820377", userName: "林小满", mode: "image-to-video", prompt: "让照片里的人自然回头微笑，头发轻轻飘动，背景保持稳定", model: "peach-max", status: "failed", progress: 42, creditCost: 60, refundedCredits: 60, channel: "Mini App", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", audioEnabled: true, failureCode: "provider_timeout", failureMessage: "Provider did not complete within the configured time limit", idempotencyKey: "telegram-mini-app-194820377-eaf1091b22784f19", createdAt: "2026-08-04T07:44:00Z", startedAt: "2026-08-04T07:44:11Z", finishedAt: "2026-08-04T07:49:11Z", callbackAttempts: 2, callbackStatus: 200, botNotificationStatus: "sent" },
    { id: "job_c381aa9", externalUserId: "telegram_992340116", userName: "Sora", mode: "text-to-video", prompt: "A quiet train moving through fields of lavender at dawn, soft film grain", model: "peach-max", status: "queued", progress: 4, creditCost: 60, refundedCredits: 0, channel: "Mini App", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", audioEnabled: true, idempotencyKey: "telegram-mini-app-992340116-c873af40cabd4a1e", createdAt: "2026-08-04T08:46:00Z", callbackAttempts: 0, botNotificationStatus: "pending" },
    { id: "job_40d5ae0", externalUserId: "telegram_730164022", userName: "Ari Stone", mode: "text-to-video", prompt: "Editorial fashion portrait, chrome reflections, slow orbital camera", model: "peach-max", status: "cancelled", progress: 12, creditCost: 60, refundedCredits: 60, channel: "Bot", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", audioEnabled: true, idempotencyKey: "telegram-update-1297944", createdAt: "2026-08-04T05:17:00Z", startedAt: "2026-08-04T05:17:36Z", finishedAt: "2026-08-04T05:18:09Z", callbackAttempts: 1, callbackStatus: 200, botNotificationStatus: "sent" },
  ],
  payments: [
    { id: "pay_7c21a9", telegramChargeId: "chg_xtr_8fA20kq1", externalUserId: "telegram_835104221", userName: "Mila Chen", productId: "creator", productTitle: "Creator Pack", stars: 300, credits: 1800, status: "credited", applied: true, termsVersion: "2026-08-04", reconciliation: "matched", paidAt: "2026-08-04T06:12:00Z", creditedAt: "2026-08-04T06:12:02Z", walletEntryId: "wal_90ca12" },
    { id: "pay_02f61c", telegramChargeId: "chg_xtr_B93ld0p2", externalUserId: "telegram_992340116", userName: "Sora", productId: "studio", productTitle: "Studio Pack", stars: 1000, credits: 7000, status: "credited", applied: true, termsVersion: "2026-08-04", reconciliation: "matched", paidAt: "2026-08-03T15:09:00Z", creditedAt: "2026-08-03T15:09:01Z", walletEntryId: "wal_76bb18" },
    { id: "pay_fd7812", telegramChargeId: "chg_xtr_C1v83dH9", externalUserId: "telegram_194820377", userName: "林小满", productId: "starter", productTitle: "Starter Pack", stars: 100, credits: 500, status: "exception", applied: false, termsVersion: "2026-08-04", reconciliation: "unmatched", paidAt: "2026-08-04T07:51:00Z" },
    { id: "pay_18ca33", telegramChargeId: "chg_xtr_M0k2sa11", externalUserId: "telegram_502734918", userName: "Noah Park", productId: "studio", productTitle: "Studio Pack", stars: 1000, credits: 7000, status: "refunding", applied: true, termsVersion: "2026-08-04", reconciliation: "matched", paidAt: "2026-08-02T11:20:00Z", creditedAt: "2026-08-02T11:20:02Z", walletEntryId: "wal_33dc10" },
  ],
  walletEntries: [
    { id: "wal_90ca12", externalUserId: "telegram_835104221", userName: "Mila Chen", type: "payment", delta: 1800, balanceBefore: 40, balanceAfter: 1840, referenceId: "pay_7c21a9", reason: "Telegram Stars 充值", createdAt: "2026-08-04T06:12:02Z" },
    { id: "wal_f024cc", externalUserId: "telegram_835104221", userName: "Mila Chen", type: "generation", delta: -60, balanceBefore: 1300, balanceAfter: 1240, referenceId: "job_8f2a1c7", reason: "视频生成扣费", createdAt: "2026-08-04T08:31:00Z" },
    { id: "wal_663f1e", externalUserId: "telegram_194820377", userName: "林小满", type: "refund", delta: 60, balanceBefore: 2700, balanceAfter: 2760, referenceId: "job_be8310f", reason: "任务失败自动退款", createdAt: "2026-08-04T07:49:12Z" },
    { id: "wal_76bb18", externalUserId: "telegram_992340116", userName: "Sora", type: "payment", delta: 7000, balanceBefore: 0, balanceAfter: 7000, referenceId: "pay_02f61c", reason: "Telegram Stars 充值", createdAt: "2026-08-03T15:09:01Z" },
  ],
  creditPacks: [
    { id: "starter", title: "Starter Pack", description: "500 credits", stars: 100, baseCredits: 500, bonusCredits: 0, status: "active", recommended: false, channels: ["Bot", "Mini App"], termsVersion: "2026-08-04" },
    { id: "creator", title: "Creator Pack", description: "1,800 credits", stars: 300, baseCredits: 1500, bonusCredits: 300, status: "active", recommended: true, channels: ["Bot", "Mini App"], termsVersion: "2026-08-04" },
    { id: "studio", title: "Studio Pack", description: "7,000 credits", stars: 1000, baseCredits: 6000, bonusCredits: 1000, status: "active", recommended: false, channels: ["Bot", "Mini App"], termsVersion: "2026-08-04" },
  ],
  subscriptionPlans: [
    { id: "standard", title: "Standard", description: "A steady monthly credit allowance", stars: 250, creditsPerCycle: 1_000, periodSeconds: 2_592_000, status: "active", recommended: false, channels: ["Mini App"], termsVersion: "2026-08-04" },
    { id: "pro", title: "Pro", description: "More credits for frequent creators", stars: 650, creditsPerCycle: 3_000, periodSeconds: 2_592_000, status: "active", recommended: true, channels: ["Mini App"], termsVersion: "2026-08-04" },
    { id: "ultimate", title: "Ultimate", description: "High-volume credits every 30 days", stars: 4_000, creditsPerCycle: 30_000, periodSeconds: 2_592_000, status: "draft", recommended: false, channels: ["Mini App"], termsVersion: "2026-08-04" },
  ],
  configuration: {
    version: "demo.2026.08.04",
    status: "active",
    publishedAt: "2026-08-04T08:00:00Z",
    generation: { model: "peach-max", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", maxPromptLength: 1000, maxImageBytes: 10485760, maxConcurrentJobs: 3, audioEnabled: true },
    newUserGift: { credits: 300, enabledAt: "2026-08-22T16:00:00.000Z" },
    referral: { enabled: true, rewardCredits: 100, weeklyLimit: 5 },
  },
  services: [
    { id: "worker", name: "Telegram Worker", description: "Webhook、Mini App API 与静态资源", status: "healthy", successRate: 99.98, p95: 184, requests: 28304, lastSuccessAt: "2026-08-04T08:48:31Z" },
    { id: "telegram", name: "Telegram Bot API", description: "消息、支付和文件接口", status: "healthy", successRate: 99.94, p95: 361, requests: 8912, lastSuccessAt: "2026-08-04T08:48:28Z", lastFailureAt: "2026-08-04T02:14:09Z", lastError: "429 retry_after=2" },
    { id: "platform", name: "Open Platform", description: "用户、钱包、支付和生成任务", status: "degraded", successRate: 98.72, p95: 1280, requests: 10481, lastSuccessAt: "2026-08-04T08:48:29Z", lastFailureAt: "2026-08-04T08:44:02Z", lastError: "provider_timeout" },
    { id: "callback", name: "任务回调", description: "完成事件与 Telegram 通知", status: "healthy", successRate: 99.61, p95: 242, requests: 4683, lastSuccessAt: "2026-08-04T08:47:50Z", lastFailureAt: "2026-08-04T07:49:11Z", lastError: "delivery retry succeeded" },
  ],
};
