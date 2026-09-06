import { BOT_NAME, CREDIT_PACKS, PRIVACY_PATH, SUBSCRIPTION_PLANS, TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS, TERMS_PATH, TERMS_VERSION } from "./config";
import { LOCALE_NAMES, SUPPORTED_LOCALES, botText, isBotLocale, uiText, type Locale } from "./bot-i18n";
import { OpenPlatformClient, OpenPlatformError } from "./open-platform";
import { miniAppApi } from "./mini-app";
import { invoicePayload, parseInvoicePayload } from "./payment";
import { html, TelegramClient } from "./telegram";
import type { Env, OpenPlatformContent, OpenPlatformHome, OpenPlatformJob, TelegramMessage, TelegramUpdate, TelegramUser } from "./types";
import {
  markGenerationNotificationSent,
  saveUserLocale,
  saveUserSubscription,
  subscriptionIsActive,
  userLocale,
  userSubscription,
  wasGenerationNotificationSent,
} from "./user-preferences";
import { loadAdminCreditPacks, loadAdminPaymentOrder, loadAdminSubscriptionPlans, markAdminPaymentOrderPrecheckout, recordAdminReferralGeneration, sendAdminEvent } from "./admin-sync";
import { createTelegramStarsOrder, orderMatchesProduct } from "./payment-orders";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "fantivo-ai-bot" }, { headers: { "Cache-Control": "no-store", "Strict-Transport-Security": "max-age=31536000" } });
    }
    if (url.pathname.startsWith("/api/")) return miniAppApi(request, env);
    if (request.method === "POST" && url.pathname === "/telegram/webhook") return telegramWebhook(request, env);
    if (request.method === "POST" && url.pathname === "/platform/events") return platformEvent(request, env);
    if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) return secureAssetResponse(await env.ASSETS.fetch(request));
    return new Response("Not found", { status: 404 });
  },
};

async function telegramWebhook(request: Request, env: Env) {
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  const update = await request.json<TelegramUpdate>();
  try {
    await handleUpdate(update, env);
    return Response.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_update_failed", updateId: update.update_id, error: String(error) }));
    return Response.json({ ok: false }, { status: 500 });
  }
}

async function handleUpdate(update: TelegramUpdate, env: Env) {
  const telegram = new TelegramClient(env);
  const platform = new OpenPlatformClient(env);
  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    const locale = await userLocale(env, query.from.id);
    const parsed = parseInvoicePayload(query.invoice_payload);
    let valid = false;
    if (parsed?.orderId) {
      try {
        const order = await loadAdminPaymentOrder(env, parsed.orderId);
        const packs = await loadAdminCreditPacks(env, CREDIT_PACKS, order.channel, TERMS_VERSION);
        const pack = packs.find((item) => item.id === order.productId);
        valid = orderMatchesProduct(order, pack) && order.termsVersion === TERMS_VERSION
          && order.telegramUserId === query.from.id && order.externalUserId === platform.externalUserId(query.from)
          && ["PENDING", "PRECHECKOUT_APPROVED"].includes(order.status)
          && query.currency === "XTR" && query.total_amount === order.starsAmount;
        if (valid) await markAdminPaymentOrderPrecheckout(env, order.id);
      } catch (error) {
        console.error(JSON.stringify({ event: "telegram_precheckout_order_validation_failed", orderId: parsed.orderId, error: String(error) }));
        valid = false;
      }
    } else if (parsed?.productType === "subscription") {
      const plans = await loadAdminSubscriptionPlans(env, SUBSCRIPTION_PLANS, parsed.channel || "Mini App", TERMS_VERSION);
      const plan = plans.find((item) => item.id === parsed.productId);
      const current = await userSubscription(env, query.from.id);
      valid = Boolean(env.USER_PREFERENCES && plan && plan.periodSeconds === TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS
        && parsed.termsVersion === TERMS_VERSION && parsed.externalUserId === platform.externalUserId(query.from)
        && query.currency === "XTR" && query.total_amount === plan.stars
        && (!subscriptionIsActive(current) || (current?.planId === plan.id && !current.isCanceled)));
    } else if (parsed?.productType === "credit_pack") {
      const pack = (await botCreditPacks(env)).find((item) => item.id === parsed.productId);
      valid = !!pack && parsed.termsVersion === TERMS_VERSION && parsed.externalUserId === platform.externalUserId(query.from)
        && query.currency === "XTR" && query.total_amount === pack.stars;
    }
    await telegram.answerPreCheckout(query.id, valid, valid ? "" : botText(locale, "flowUpdated"));
    return;
  }
  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message?.chat.id;
    if (!chatId) return;
    const currentLocale = await userLocale(env, callback.from.id);
    if (callback.data?.startsWith("lang:")) {
      const selected = callback.data.slice(5);
      if (!isBotLocale(selected)) return telegram.answerCallback(callback.id);
      if (selected !== currentLocale) await saveUserLocale(env, callback.from.id, selected);
      const confirmation = botText(selected, "languageChanged", { language: LOCALE_NAMES[selected] });
      await telegram.answerCallback(callback.id, confirmation);
      return telegram.sendMessage(chatId, `<b>${html(confirmation)}</b>`, mainMenu(selected));
    }
    const locale = currentLocale;
    await telegram.answerCallback(callback.id);
    if (callback.data === "menu:language") {
      return telegram.sendMessage(chatId, botText(locale, "chooseLanguage"), languageMenu(locale));
    }
    if (callback.data === "menu:buy") {
      return telegram.sendMessage(chatId, purchaseConsentText(locale), purchaseConsentMenu(env, locale));
    }
    if (callback.data === "menu:jobs") {
      await platform.upsertUser(callback.from);
      const { jobs } = await platform.jobs(callback.from);
      return telegram.sendMessage(chatId, jobsText(jobs, locale), mainMenu(locale));
    }
    if (callback.data === `buy:accept:${TERMS_VERSION}`) {
      return telegram.sendMessage(chatId, `<b>${html(uiText(locale, "topUp"))} credits</b>\n${html(botText(locale, "chooseProduct"))}`, await buyMenu(env));
    }
    if (callback.data?.startsWith(`buy:${TERMS_VERSION}:`)) {
      const pack = (await botCreditPacks(env)).find((item) => item.id === callback.data!.slice(`buy:${TERMS_VERSION}:`.length));
      if (!pack) return telegram.sendMessage(chatId, botText(locale, "productUnavailable"));
      const { invoiceUrl } = await createTelegramStarsOrder(env, callback.from, pack, "Bot", "buy_command");
      await telegram.sendMessage(chatId, `<b>${html(pack.title)}</b>\n${pack.credits} credits · ${pack.stars} Stars`, [[{ text: botText(locale, "pay", { stars: pack.stars }), url: invoiceUrl }]]);
      return;
    }
    if (callback.data?.startsWith("buy:")) {
      return telegram.sendMessage(chatId, botText(locale, "flowUpdated"), mainMenu(locale));
    }
    return;
  }
  const message = update.message;
  if (!message?.from || message.chat.type !== "private") return;
  if (message.successful_payment) return successfulPayment(message, env);
  if (message.photo?.length) return photoGeneration(update.update_id, message, env);
  return textMessage(update.update_id, message, env);
}

async function textMessage(updateId: number, message: TelegramMessage, env: Env) {
  const telegram = new TelegramClient(env);
  const platform = new OpenPlatformClient(env);
  const text = (message.text || "").trim();
  const chatId = message.chat.id;
  const locale = await userLocale(env, message.from!.id);
  if (text === "/start") {
    // Per-chat Web App URLs survive global menu changes in Telegram clients.
    // Reset legacy overrides so the stable global menu remains authoritative.
    await telegram.resetChatMenuButton(chatId);
    return telegram.sendMessage(chatId, startText(locale), mainMenu(locale));
  }
  if (text === "/help") return telegram.sendMessage(chatId, startText(locale), mainMenu(locale));
  if (text === "/language") return telegram.sendMessage(chatId, botText(locale, "chooseLanguage"), languageMenu(locale));
  if (text === "/app") {
    const appUrl = publicUrl(env, "/", locale);
    await telegram.resetChatMenuButton(chatId);
    return telegram.sendMessage(chatId, `<b>${html(botText(locale, "openStudio"))}</b>\n\n${html(botText(locale, "appDescription"))}`, [[{ text: botText(locale, "openStudio"), web_app: { url: appUrl } }]]);
  }
  if (text === "/paysupport" || text === "/support") return telegram.sendMessage(chatId, `<b>${html(botText(locale, "support"))}</b>\n\n${botText(locale, "supportHelp")}\n${botText(locale, "paySupportHelp")}\n\n${html(botText(locale, "userId"))}: <code>${message.from!.id}</code>\n${html(botText(locale, "safety"))}`);
  if (text.startsWith("/support ") || text.startsWith("/paysupport ")) return forwardSupportRequest(updateId, message, env, locale);
  if (text === "/id") return telegram.sendMessage(chatId, `<b>${html(botText(locale, "userId"))}</b>\n\n<code>${message.from!.id}</code>`);
  if (text === "/terms") return telegram.sendMessage(chatId, `<b>${html(uiText(locale, "terms"))}</b>\n\n${html(botText(locale, "termsBody", { version: TERMS_VERSION }))}`, [[{ text: botText(locale, "readFull", { document: uiText(locale, "terms") }), url: publicUrl(env, TERMS_PATH, locale) }]]);
  if (text === "/privacy") return telegram.sendMessage(chatId, `<b>${html(uiText(locale, "privacy"))}</b>\n\n${html(botText(locale, "privacyBody"))}`, [[{ text: botText(locale, "readFull", { document: uiText(locale, "privacy") }), url: publicUrl(env, PRIVACY_PATH, locale) }]]);
  if (text === "/balance") {
    await platform.upsertUser(message.from!);
    const { wallet } = await platform.wallet(message.from!);
    return telegram.sendMessage(chatId, `<b>${html(uiText(locale, "currentBalance"))}</b>\n\n${wallet.balance.toLocaleString(locale)} credits`, mainMenu(locale));
  }
  if (text === "/personas") {
    try {
      const result = await platform.personas();
      const lines = ["<b>可用画像</b>", ...result.personas.map((persona) => `\n${persona.primary ? "★" : "•"} <code>${html(persona.personaCode)}</code>${persona.title ? ` · ${html(persona.title)}` : ""}`), "\n用法：<code>/home 画像代码</code>；不填写则使用 ★ 主画像。"];
      return telegram.sendMessage(chatId, lines.join("\n"), mainMenu(locale));
    } catch {
      return telegram.sendMessage(chatId, uiText(locale, "genericError"), mainMenu(locale));
    }
  }
  const homeMatch = /^\/home(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_.:-]+))?$/.exec(text);
  if (homeMatch) {
    try {
      await platform.upsertUser(message.from!);
      const home = await platform.home(locale, `telegram-${message.from!.id}`, homeMatch[1] || "");
      return telegram.sendMessage(chatId, homeText(home, locale), mainMenu(locale));
    } catch (error) {
      if (error instanceof OpenPlatformError && error.code === "home_profile_not_configured") return telegram.sendMessage(chatId, uiText(locale, "serviceUnavailable"), mainMenu(locale));
      return telegram.sendMessage(chatId, uiText(locale, "genericError"), mainMenu(locale));
    }
  }
  if (text === "/buy") return telegram.sendMessage(chatId, purchaseConsentText(locale), purchaseConsentMenu(env, locale));
  if (text === "/jobs") {
    await platform.upsertUser(message.from!);
    const { jobs } = await platform.jobs(message.from!);
    return telegram.sendMessage(chatId, jobsText(jobs, locale), mainMenu(locale));
  }
  if (text.startsWith("/cancel ")) {
    await platform.upsertUser(message.from!);
    const jobId = text.slice(8).trim();
    try {
      const { job } = await platform.cancel(jobId, message.from!);
      return telegram.sendMessage(chatId, `${html(uiText(locale, "cancelJob"))} <code>${html(job.id)}</code>: ${html(jobStatus(locale, job.status))}`);
    } catch (error) {
      if (error instanceof OpenPlatformError && error.code === "not_found") return telegram.sendMessage(chatId, botText(locale, "cancelNotFound"), mainMenu(locale));
      return telegram.sendMessage(chatId, botText(locale, "cancelFailed"), mainMenu(locale));
    }
  }
  if (text.startsWith("/setbalance ") && isBotAdmin(message.from!, env)) {
    const [externalUserId, rawBalance] = text.slice(12).trim().split(/\s+/);
    const balance = Number.parseInt(rawBalance || "", 10);
    if (!externalUserId || !Number.isInteger(balance) || balance < 0) return telegram.sendMessage(chatId, "用法：<code>/setbalance telegram_123 1000</code>");
    const { wallet } = await platform.setBalance(externalUserId, balance, `telegram-admin-${updateId}`);
    return telegram.sendMessage(chatId, `已设置 <code>${html(externalUserId)}</code>：${wallet.balance} credits`);
  }
  if (text.startsWith("/generate ")) {
    const prompt = text.slice(10).trim();
    if (prompt.length < 3) return telegram.sendMessage(chatId, uiText(locale, "errorInvalidPrompt"));
    const generation = await platform.generationConfiguration();
    if (prompt.length > generation.maxPromptLength) return telegram.sendMessage(chatId, `Prompt must not exceed ${generation.maxPromptLength} characters.`);
    try {
      await platform.upsertUser(message.from!);
      const { job } = await platform.createJob({ user: message.from!, idempotencyKey: `telegram-update-${updateId}`, mode: "text-to-video", prompt });
      return telegram.sendMessage(chatId, submittedText(job, locale), mainMenu(locale));
    } catch (error) {
      return generationError(chatId, error, telegram, locale);
    }
  }
  const contentCommand = parseContentCommand(text);
  if (contentCommand?.kind === "follow") {
    try {
      await platform.upsertUser(message.from!);
      const { content } = await platform.content("asset", contentCommand.id, locale, contentCommand.personaCode);
      const instruction = `${botText(locale, "imageHelp")}\n<code>/follow ${html(content.id)}${contentCommand.personaCode ? ` --persona=${html(contentCommand.personaCode)}` : ""}${contentCommand.note ? ` ${html(contentCommand.note)}` : ""}</code>`;
      return sendContentPreview(telegram, chatId, content, instruction, locale);
    } catch (error) {
      return generationError(chatId, error, telegram, locale);
    }
  }
  if (contentCommand?.kind === "template") {
    try {
      await platform.upsertUser(message.from!);
      const { content } = await platform.content("template", contentCommand.id, locale, contentCommand.personaCode);
      if (content.requiresImage) {
        const instruction = `${botText(locale, "imageHelp")}\n<code>/template ${html(content.id)}${contentCommand.personaCode ? ` --persona=${html(contentCommand.personaCode)}` : ""}${contentCommand.note ? ` ${html(contentCommand.note)}` : ""}</code>`;
        return sendContentPreview(telegram, chatId, content, instruction, locale);
      }
      const { job } = await platform.createFromTemplate({ user: message.from!, idempotencyKey: `telegram-update-${updateId}`, templateId: content.id, personaCode: contentCommand.personaCode, userPrompt: contentCommand.note });
      return telegram.sendMessage(chatId, submittedText(job, locale), mainMenu(locale));
    } catch (error) {
      return generationError(chatId, error, telegram, locale);
    }
  }
  return telegram.sendMessage(chatId, `${botText(locale, "fallbackHint")}\n<code>/template TEMPLATE_ID optional prompt</code>\n<code>/follow ASSET_ID optional prompt</code>`, mainMenu(locale));
}

async function photoGeneration(updateId: number, message: TelegramMessage, env: Env) {
  const telegram = new TelegramClient(env);
  const platform = new OpenPlatformClient(env);
  const locale = await userLocale(env, message.from!.id);
  const caption = (message.caption || "").trim();
  const contentCommand = parseContentCommand(caption);
  if (!contentCommand && /^\/(template|follow)(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(caption)) {
    return telegram.sendMessage(message.chat.id, `${uiText(locale, "errorInvalidPrompt")}\n<code>/template TEMPLATE_ID optional prompt</code>\n<code>/follow ASSET_ID optional prompt</code>`, mainMenu(locale));
  }
  const prompt = (contentCommand ? contentCommand.note : (caption || "cinematic portrait, natural motion, high quality")).trim();
  const generation = await platform.generationConfiguration();
  if (prompt.length > generation.maxPromptLength) return telegram.sendMessage(message.chat.id, `Prompt must not exceed ${generation.maxPromptLength} characters.`);
  const photo = [...(message.photo || [])].sort((a, b) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height))[0];
  if (!photo) return;
  await telegram.sendMessage(message.chat.id, botText(locale, "photoReceived"));
  try {
    await platform.upsertUser(message.from!);
    const file = await telegram.getFile(photo.file_id);
    const downloaded = await telegram.downloadFile(file.file_path);
    const upload = await platform.upload(message.from!, file.file_path.split("/").pop() || "telegram.jpg", downloaded.headers.get("Content-Type") || "image/jpeg", downloaded.body!);
    const result = contentCommand?.kind === "follow"
      ? await platform.followAsset({ user: message.from!, idempotencyKey: `telegram-update-${updateId}`, assetId: contentCommand.id, personaCode: contentCommand.personaCode, userPrompt: contentCommand.note, imageUrl: upload.upload.url })
      : contentCommand?.kind === "template"
        ? await platform.createFromTemplate({ user: message.from!, idempotencyKey: `telegram-update-${updateId}`, templateId: contentCommand.id, personaCode: contentCommand.personaCode, userPrompt: contentCommand.note, imageUrl: upload.upload.url })
        : await platform.createJob({ user: message.from!, idempotencyKey: `telegram-update-${updateId}`, mode: "image-to-video", prompt, imageUrl: upload.upload.url });
    const { job } = result;
    await telegram.sendMessage(message.chat.id, submittedText(job, locale), mainMenu(locale));
  } catch (error) {
    await generationError(message.chat.id, error, telegram, locale);
  }
}

async function successfulPayment(message: TelegramMessage, env: Env) {
  const telegram = new TelegramClient(env);
  const platform = new OpenPlatformClient(env);
  const locale = await userLocale(env, message.from!.id);
  const payment = message.successful_payment!;
  const parsed = parseInvoicePayload(payment.invoice_payload);
  if (parsed?.orderId) {
    const order = await loadAdminPaymentOrder(env, parsed.orderId);
    if (order.status === "PAID") {
      if (order.telegramPaymentChargeId !== payment.telegram_payment_charge_id) throw new Error("successful_payment charge conflicts with paid order");
      return;
    }
    const packs = await loadAdminCreditPacks(env, CREDIT_PACKS, order.channel, TERMS_VERSION);
    const pack = packs.find((item) => item.id === order.productId);
    if (!orderMatchesProduct(order, pack) || order.termsVersion !== TERMS_VERSION
      || order.telegramUserId !== message.from!.id || order.externalUserId !== platform.externalUserId(message.from!)
      || !["PENDING", "PRECHECKOUT_APPROVED"].includes(order.status)
      || payment.currency !== "XTR" || payment.total_amount !== order.starsAmount) {
      throw new Error("successful_order_payment validation failed");
    }
    await platform.upsertUser(message.from!);
    const result = await platform.recordStarsPayment({
      user: message.from!,
      transactionId: payment.telegram_payment_charge_id,
      productId: order.productId,
      productTitle: order.productTitle,
      stars: order.starsAmount,
      credits: order.creditsAmount,
      channel: order.channel,
      funnelEntry: order.funnelEntry,
      orderId: order.id,
      invoicePayload: order.invoicePayload,
      adminSyncRequired: true,
    });
    if (!result.adminApplied) {
      console.log(JSON.stringify({ event: "telegram_stars_payment_duplicate", orderId: order.id, telegramPaymentChargeId: payment.telegram_payment_charge_id }));
      return;
    }
    console.log(JSON.stringify({
      event: "telegram_stars_payment_confirmed",
      orderId: order.id,
      orderNo: order.orderNo,
      telegramUserId: order.telegramUserId,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      paymentStatus: "PAID",
      starsAmount: order.starsAmount,
      creditsAmount: order.creditsAmount,
    }));
    return telegram.sendMessage(message.chat.id, `<b>${html(botText(locale, "paymentCompleted"))}</b>\n\n${html(botText(locale, "credited"))}: ${order.creditsAmount.toLocaleString(locale)} credits\n${html(uiText(locale, "currentBalance"))}: ${result.wallet.balance.toLocaleString(locale)} credits`, mainMenu(locale));
  }
  if (parsed?.productType === "subscription") {
    const plans = await loadAdminSubscriptionPlans(env, SUBSCRIPTION_PLANS, parsed.channel || "Mini App", TERMS_VERSION);
    const plan = plans.find((item) => item.id === parsed.productId);
    const expiration = payment.subscription_expiration_date;
    if (!env.USER_PREFERENCES || !plan || plan.periodSeconds !== TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS
      || parsed.termsVersion !== TERMS_VERSION || parsed.externalUserId !== platform.externalUserId(message.from!)
      || payment.currency !== "XTR" || payment.total_amount !== plan.stars || payment.is_recurring !== true
      || !Number.isSafeInteger(expiration) || expiration! <= Math.floor(Date.now() / 1_000)) throw new Error("successful_subscription_payment validation failed");
    await platform.upsertUser(message.from!);
    const result = await platform.recordStarsPayment({
      user: message.from!, transactionId: payment.telegram_payment_charge_id, productId: plan.id, productTitle: plan.title,
      stars: plan.stars, credits: plan.creditsPerCycle, channel: parsed.channel || "Mini App", funnelEntry: parsed.funnelEntry || "subscription",
      productType: "subscription", isRecurring: true, isFirstRecurring: payment.is_first_recurring === true,
      subscriptionExpirationDate: expiration,
    });
    const previous = await userSubscription(env, message.from!.id);
    if (previous?.lastChargeId !== payment.telegram_payment_charge_id && (!previous || expiration! >= previous.expiresAt)) {
      const now = new Date().toISOString();
      await saveUserSubscription(env, message.from!.id, {
        planId: plan.id,
        status: "active",
        startedAt: previous?.planId === plan.id ? previous.startedAt : now,
        renewedAt: now,
        expiresAt: expiration!,
        lastChargeId: payment.telegram_payment_charge_id,
        isCanceled: false,
      });
    }
    return telegram.sendMessage(message.chat.id, `<b>${html(botText(locale, "paymentCompleted"))}</b>\n\n${html(botText(locale, "credited"))}: ${plan.creditsPerCycle.toLocaleString(locale)} credits\n${html(uiText(locale, "currentBalance"))}: ${result.wallet.balance.toLocaleString(locale)} credits`, mainMenu(locale));
  }
  const pack = parsed?.productType === "credit_pack" && (await botCreditPacks(env)).find((item) => item.id === parsed.productId);
  if (!pack || !parsed || parsed.termsVersion !== TERMS_VERSION || parsed.externalUserId !== platform.externalUserId(message.from!) || payment.currency !== "XTR" || payment.total_amount !== pack.stars) throw new Error("successful_payment validation failed");
  await platform.upsertUser(message.from!);
  const result = await platform.recordStarsPayment({
    user: message.from!,
    transactionId: payment.telegram_payment_charge_id,
    productId: pack.id,
    productTitle: pack.title,
    stars: pack.stars,
    credits: pack.credits,
    channel: parsed.channel || "Bot",
    funnelEntry: parsed.funnelEntry || "buy_command",
  });
  return telegram.sendMessage(message.chat.id, `<b>${html(botText(locale, "paymentCompleted"))}</b>\n\n${html(botText(locale, "credited"))}: ${pack.credits.toLocaleString(locale)} credits\n${html(uiText(locale, "currentBalance"))}: ${result.wallet.balance.toLocaleString(locale)} credits`, mainMenu(locale));
}

async function platformEvent(request: Request, env: Env) {
  const body = await request.arrayBuffer();
  const valid = await verifySignature(env.OPEN_PLATFORM_CALLBACK_SECRET, body, request.headers.get("X-Bot-Platform-Signature") || "");
  if (!valid) return new Response("Unauthorized", { status: 401 });
  const payload = JSON.parse(new TextDecoder().decode(body)) as { type: string; job: OpenPlatformJob };
  if (payload.type !== "generation.completed") return Response.json({ ignored: true });
  const telegramId = telegramIdFromExternal(payload.job.externalUserId);
  if (!telegramId) return Response.json({ ignored: true });
  if (payload.job.status === "succeeded") {
    try {
      await recordAdminReferralGeneration(env, payload.job.externalUserId, payload.job.id, payload.job.completedAt || payload.job.finishedAt);
    } catch (error) {
      console.error(JSON.stringify({ event: "referral_generation_record_failed", jobId: payload.job.id, error: String(error) }));
    }
  }
  if (await wasGenerationNotificationSent(env, payload.job.id)) return Response.json({ ok: true, duplicate: true });
  const telegram = new TelegramClient(env);
  const locale = await userLocale(env, telegramId);
  const channel = generationChannel(payload.job);
  try {
    if (payload.job.status === "succeeded") await sendSuccessfulGenerationNotification(telegram, telegramId, payload.job, env, locale);
    else await telegram.sendMessage(telegramId, incompleteGenerationText(payload.job, locale), notificationMenu(env, locale));
  } catch (error) {
    await sendAdminEvent(env, {
      eventId: `job:${payload.job.id}:callback:${payload.job.status}:notification-failed`,
      type: "job.upsert",
      occurredAt: new Date().toISOString(),
      data: { job: { ...payload.job, botNotificationStatus: "failed" }, channel },
    });
    throw error;
  }
  await markGenerationNotificationSent(env, payload.job.id);
  let wallet: unknown;
  if (payload.job.creditsRefunded) {
    try { wallet = (await new OpenPlatformClient(env).wallet(telegramId)).wallet; } catch { wallet = undefined; }
  }
  await sendAdminEvent(env, {
    eventId: `job:${payload.job.id}:callback:${payload.job.status}:notification-sent`,
    type: "job.upsert",
    occurredAt: new Date().toISOString(),
    data: { job: { ...payload.job, botNotificationStatus: "sent" }, channel, wallet },
  });
  return Response.json({ ok: true });
}

async function sendSuccessfulGenerationNotification(telegram: TelegramClient, telegramId: number, job: OpenPlatformJob, env: Env, locale: Locale) {
  const caption = `<b>${html(botText(locale, "completionTitle"))}</b>\n${html(botText(locale, "task"))}: <code>${html(job.id)}</code>`;
  const buttons = notificationMenu(env, locale);
  const outputUrl = safeHttpsUrl(job.outputUrl);
  if (!outputUrl) return telegram.sendMessage(telegramId, `${caption}\n\n${html(botText(locale, "openStudio"))}`, buttons);
  try {
    return await telegram.sendVideo(telegramId, outputUrl, caption, buttons);
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_result_video_delivery_failed", jobId: job.id, error: String(error) }));
    return telegram.sendMessage(telegramId, `${caption}\n\n<a href="${html(outputUrl)}">${html(uiText(locale, "viewVideo"))}</a>`, buttons);
  }
}

function incompleteGenerationText(job: OpenPlatformJob, locale: Locale) {
  const normalized = job.status.toLowerCase();
  const lines = [
    `<b>${html(botText(locale, "incompleteTitle"))}</b>`,
    `${html(botText(locale, "task"))}: <code>${html(job.id)}</code>`,
    `${html(botText(locale, "status"))}: ${html(jobStatus(locale, job.status))}`,
  ];
  const needsSupport = !["cancelled", "canceled"].includes(normalized);
  if (needsSupport) lines.push(html(uiText(locale, job.failureCode === "provider_timeout" ? "errorJobProviderTimeout" : "errorJobFailed")));
  if (job.creditsRefunded) lines.push(html(botText(locale, "refunded")));
  if (needsSupport) lines.push("", html(uiText(locale, "supportHint")));
  return lines.join("\n");
}

function generationChannel(job: OpenPlatformJob) {
  return job.idempotencyKey?.startsWith("telegram-mini-app-") ? "Mini App" : "Bot";
}

function notificationMenu(env: Env, locale: Locale) {
  return [
    [{ text: botText(locale, "openStudio"), web_app: { url: publicUrl(env, "/", locale) } }],
    ...mainMenu(locale),
  ];
}

function safeHttpsUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function startText(locale: Locale) {
  return `<b>${html(BOT_NAME)}</b>\n\n${botText(locale, "textHelp")}\n${botText(locale, "imageHelp")}\nTemplate: <code>/template TEMPLATE_ID optional prompt</code>\nAsset Follow: <code>/follow ASSET_ID optional prompt</code>\n\n<code>/app</code> ${html(botText(locale, "openStudio"))}\n<code>/home</code> ${html(uiText(locale, "brandHome"))}\n<code>/balance</code> ${html(uiText(locale, "currentBalance"))}\n<code>/buy</code> ${html(uiText(locale, "topUp"))}\n<code>/support</code> ${html(botText(locale, "support"))}\n<code>/terms</code> ${html(uiText(locale, "terms"))}\n<code>/privacy</code> ${html(uiText(locale, "privacy"))}\n<code>/jobs</code> ${html(botText(locale, "recentJobs"))}\n<code>/cancel job_xxx</code> ${html(uiText(locale, "cancelJob"))}\n<code>/language</code> ${html(uiText(locale, "language"))}: <b>${html(LOCALE_NAMES[locale])}</b>`;
}

async function forwardSupportRequest(updateId: number, message: TelegramMessage, env: Env, locale: Locale) {
  const telegram = new TelegramClient(env);
  const raw = (message.text || "").replace(/^\/(?:pay)?support\s+/i, "").trim();
  if (raw.length < 4) return telegram.sendMessage(message.chat.id, botText(locale, "supportTooShort"));
  const admins = botAdminIds(env);
  if (!admins.length) return telegram.sendMessage(message.chat.id, botText(locale, "supportUnavailable"));
  const caseId = `support_${updateId}`;
  const delivered = await Promise.allSettled(admins.map(async (adminId) => {
    const adminLocale = await userLocale(env, adminId);
    const username = message.from?.username ? `@${message.from.username}` : botText(adminLocale, "usernameUnset");
    const requestType = (message.text || "").startsWith("/paysupport ") ? botText(adminLocale, "paymentType") : botText(adminLocale, "generalType");
    const supportText = `<b>${html(botText(adminLocale, "newSupportTicket"))}</b>\n\n${html(botText(adminLocale, "ticket"))}: <code>${caseId}</code>\n${html(botText(adminLocale, "userId"))}: <code>${message.from!.id}</code>\n${html(botText(adminLocale, "username"))}: ${html(username)}\n${html(botText(adminLocale, "type"))}: ${html(requestType)}\n\n${html(raw.slice(0, 2800))}`;
    return telegram.sendMessage(adminId, supportText);
  }));
  if (!delivered.some((result) => result.status === "fulfilled")) throw new Error("support delivery failed");
  return telegram.sendMessage(message.chat.id, `<b>${html(botText(locale, "supportSubmitted"))}</b>\n\n${html(botText(locale, "ticket"))}: <code>${caseId}</code>\n${html(botText(locale, "supportContact"))}`);
}

function mainMenu(locale: Locale) {
  return [
    [{ text: uiText(locale, "topUp"), callback_data: "menu:buy" }, { text: botText(locale, "recentJobs"), callback_data: "menu:jobs" }],
    [{ text: `🌐 ${LOCALE_NAMES[locale]}`, callback_data: "menu:language" }],
  ];
}

function languageMenu(locale: Locale) {
  const buttons = SUPPORTED_LOCALES.map((value) => ({
    text: `${value === locale ? "✓ " : ""}${LOCALE_NAMES[value]}`,
    callback_data: `lang:${value}`,
  }));
  return Array.from({ length: Math.ceil(buttons.length / 2) }, (_, row) => buttons.slice(row * 2, row * 2 + 2));
}

async function buyMenu(env: Env) {
  return (await botCreditPacks(env)).map((pack) => [{ text: `${pack.credits} credits · ${pack.stars} ⭐️`, callback_data: `buy:${TERMS_VERSION}:${pack.id}` }]);
}

function botCreditPacks(env: Env) {
  return loadAdminCreditPacks(env, CREDIT_PACKS, "Bot", TERMS_VERSION);
}

function purchaseConsentText(locale: Locale) {
  return `<b>${html(uiText(locale, "topUp"))} credits</b>\n\n${html(botText(locale, "buyConsent", { version: TERMS_VERSION }))}`;
}

function purchaseConsentMenu(env: Env, locale: Locale) {
  return [
    [{ text: uiText(locale, "terms"), url: publicUrl(env, TERMS_PATH, locale) }, { text: uiText(locale, "privacy"), url: publicUrl(env, PRIVACY_PATH, locale) }],
    [{ text: botText(locale, "agreeContinue"), callback_data: `buy:accept:${TERMS_VERSION}` }],
  ];
}

function homeText(home: OpenPlatformHome, locale: Locale) {
  const lines = [`<b>${html(uiText(locale, "featured"))}</b>`, `<code>Persona: ${html(home.personaCode)}</code>`];
  for (const section of home.sections.slice(0, 5)) {
    lines.push(`\n<b>${html(section.title)}</b>`);
    for (const item of section.items.slice(0, 3)) {
      const command = item.kind === "asset" ? (item.canMakeSimilar ? `/follow ${item.id} --persona=${home.personaCode}` : "") : `/template ${item.id} --persona=${home.personaCode}`;
      lines.push(`• ${html(item.title)} <code>${html(item.kind)}:${html(item.id)}</code>${command ? `\n  <code>${html(command)}</code>` : ""}`);
    }
  }
  if (lines.length === 2) lines.push(`\n${html(uiText(locale, "emptyDescription"))}`);
  return lines.join("\n");
}

async function sendContentPreview(telegram: TelegramClient, chatId: number, content: OpenPlatformContent, instruction: string, locale: Locale) {
  const prompt = (content.prompt || content.promptDisplay || "").trim();
  const hasDefaultReference = content.kind === "asset" && content.defaultReferenceEnabled && !!content.defaultReferenceImageUrl;
  const label = uiText(locale, hasDefaultReference ? "inputImage" : content.kind === "asset" ? "assetDetail" : "templateDetail");
  const promptText = prompt ? `\n\n<b>${html(uiText(locale, "promptTitle"))}</b>\n${html(truncate(prompt, 650))}` : "";
  const caption = `<b>${html(content.title)}</b>\n${label}${promptText}\n\n${instruction}`;
  const imageURL = hasDefaultReference ? content.defaultReferenceImageUrl : content.previewUrl;
  if (imageURL) {
    try {
      return await telegram.sendPhoto(chatId, imageURL, caption);
    } catch (error) {
      console.error(JSON.stringify({ event: "content_preview_photo_failed", kind: content.kind, id: content.id, error: String(error) }));
    }
  }
  return telegram.sendMessage(chatId, caption, mainMenu(locale));
}

function truncate(value: string, max: number) {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join("")}…`;
}

function publicUrl(env: Env, path: string, locale?: Locale) {
  const url = new URL(`${env.PUBLIC_WORKER_URL.replace(/\/$/, "")}${path}`);
  if (locale) url.searchParams.set("lang", locale);
  return url.toString();
}

function submittedText(job: OpenPlatformJob, locale: Locale) {
  return `<b>${html(botText(locale, "submittedTitle"))}</b>\n\nID: <code>${html(job.id)}</code>\n${html(botText(locale, "cost"))}: ${job.creditCost.toLocaleString(locale)} credits\n${html(botText(locale, "status"))}: ${html(jobStatus(locale, job.status))}`;
}

function jobsText(jobs: OpenPlatformJob[], locale: Locale) {
  if (!jobs.length) return botText(locale, "noJobs");
  return [`<b>${html(botText(locale, "recentJobs"))}</b>`, ...jobs.map((job) => `\n<code>${html(job.id)}</code> · ${html(jobStatus(locale, job.status))} · ${job.creditCost.toLocaleString(locale)} credits`)].join("\n");
}

async function generationError(chatId: number, error: unknown, telegram: TelegramClient, locale: Locale) {
  if (error instanceof OpenPlatformError && error.code === "insufficient_credits") return telegram.sendMessage(chatId, uiText(locale, "errorInsufficient"), mainMenu(locale));
  if (error instanceof OpenPlatformError && error.code === "limit_exceeded") return telegram.sendMessage(chatId, uiText(locale, "errorLimit"), mainMenu(locale));
  if (error instanceof OpenPlatformError && error.code === "not_found") return telegram.sendMessage(chatId, uiText(locale, "errorNotFound"), mainMenu(locale));
  if (error instanceof OpenPlatformError && ["content_not_supported", "content_model_unavailable"].includes(error.code)) return telegram.sendMessage(chatId, uiText(locale, "serviceUnavailable"), mainMenu(locale));
  if (error instanceof OpenPlatformError && error.code === "invalid_request") return telegram.sendMessage(chatId, uiText(locale, "errorInvalidPrompt"), mainMenu(locale));
  console.error(error);
  return telegram.sendMessage(chatId, uiText(locale, "genericError"), mainMenu(locale));
}

export function parseContentCommand(value: string) {
  const match = /^\/(template|follow)(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_.:-]+)(?:\s+([\s\S]*))?$/.exec(value.trim());
  if (!match) return null;
  const rest = (match[3] || "").trim();
  const persona = /(?:^|\s)--persona=([A-Za-z0-9_.:-]+)(?=\s|$)/.exec(rest);
  const note = rest.replace(/(?:^|\s)--persona=[A-Za-z0-9_.:-]+(?=\s|$)/, " ").trim();
  return { kind: match[1] as "template" | "follow", id: match[2], personaCode: persona?.[1] || "", note };
}

function jobStatus(locale: Locale, status: string) {
  const normalized = status.toLowerCase().replaceAll("-", "_");
  if (["succeeded", "completed", "complete"].includes(normalized)) return uiText(locale, "statusSucceeded");
  if (["queued", "pending"].includes(normalized)) return uiText(locale, "statusQueued");
  if (["processing", "running", "in_progress", "generating"].includes(normalized)) return uiText(locale, "statusProcessing");
  if (["cancelled", "canceled"].includes(normalized)) return uiText(locale, "statusCancelled");
  if (["failed", "error"].includes(normalized)) return uiText(locale, "statusFailed");
  return status;
}

export { invoicePayload, parseInvoicePayload };

export function telegramIdFromExternal(value: string) {
  const match = /^telegram_(\d+)$/.exec(value);
  return match ? Number(match[1]) : null;
}

function isBotAdmin(user: TelegramUser, env: Env) {
  return botAdminIds(env).includes(user.id);
}

function botAdminIds(env: Env) {
  return (env.BOT_ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

export async function verifySignature(secret: string, body: ArrayBuffer, provided: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const expected = provided.startsWith("sha256=") ? provided.slice(7) : "";
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  const signature = Uint8Array.from(expected.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, signature, body);
}

function secureAssetResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https:; connect-src 'self' https://us.i.posthog.com; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; object-src 'none'; base-uri 'none'; form-action 'none'");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
