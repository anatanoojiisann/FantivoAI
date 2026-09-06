import {
  CREDIT_PACKS,
  DEFAULT_DURATION_OPTIONS,
  PRIVACY_PATH,
  SUBSCRIPTION_PLANS,
  TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS,
  TERMS_PATH,
  TERMS_VERSION,
} from "./config";
import { MiniAppAuthError, validateTelegramInitDataContext } from "./mini-app-auth";
import { OpenPlatformClient, OpenPlatformError } from "./open-platform";
import { TelegramClient } from "./telegram";
import { invoicePayload } from "./payment";
import { AdminSyncError, bootstrapAdminReferral, claimAdminNewUserGift, loadAdminCreditPacks, loadAdminPaymentOrder, loadAdminSubscriptionPlans, recordAdminReferralGeneration, sendAdminEvent, type ReferralOverview } from "./admin-sync";
import { createTelegramStarsOrder } from "./payment-orders";
import type { Env, OpenPlatformContent, OpenPlatformJob, TelegramUser } from "./types";
import { saveUserSubscription, subscriptionIsActive, userSubscription } from "./user-preferences";

const MAX_PROMPT_LENGTH = 1_000;
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const ASPECT_RATIO_PATTERN = /^\d{1,2}:\d{1,2}$/;

export async function miniAppApi(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: apiHeaders() });

  try {
    const authenticated = await authenticatedUser(request, env);
    const user = authenticated.user;
    const platform = new OpenPlatformClient(env);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const [userBootstrap, { jobs }, generationConfiguration, creditPacks, subscriptionPlans, subscription, modelCatalog, personaCatalog] = await Promise.all([
        bootstrapMiniAppUser(env, platform, user, authenticated.startParam),
        platform.jobs(user),
        platform.generationConfiguration(),
        loadAdminCreditPacks(env, CREDIT_PACKS, "Mini App", TERMS_VERSION),
        loadAdminSubscriptionPlans(env, SUBSCRIPTION_PLANS, "Mini App", TERMS_VERSION),
        userSubscription(env, user.id),
        platform.models().catch(() => null),
        platform.personas(),
      ]);
      const referralRewardApplied = await recordSuccessfulReferralJobs(env, platform.externalUserId(user), jobs);
      let wallet = userBootstrap.wallet;
      let referral = userBootstrap.referral;
      if (referralRewardApplied) {
        try {
          const [walletResult, refreshedReferral] = await Promise.all([
            platform.wallet(user),
            bootstrapAdminReferral(env, platform.externalUserId(user)),
          ]);
          wallet = walletResult.wallet;
          referral = refreshedReferral;
        } catch (error) {
          console.error(JSON.stringify({ event: "referral_reward_refresh_failed", externalUserId: platform.externalUserId(user), error: String(error) }));
        }
      }
      return json({
        user: publicUser(user),
        wallet,
        newUserGift: userBootstrap.newUserGift,
        referral: publicReferral(referral, env),
        jobs: jobs.map(publicJob),
        creditPacks,
        subscriptionPlans,
        subscription: subscriptionIsActive(subscription) ? publicSubscription(subscription!) : null,
        subscriptionAvailable: Boolean(env.USER_PREFERENCES),
        primaryPersonaCode: personaCatalog.primaryPersonaCode,
        personas: personaCatalog.personas.map((persona) => ({
          personaCode: persona.personaCode,
          title: persona.title || persona.personaCode,
          primary: persona.primary,
        })),
        legal: {
          termsVersion: TERMS_VERSION,
          termsUrl: TERMS_PATH,
          privacyUrl: PRIVACY_PATH,
        },
        generation: {
          model: generationConfiguration.model,
          durationSeconds: generationConfiguration.durationSeconds,
          durationOptions: supportedDurations(generationConfiguration, modelCatalog?.models, DEFAULT_DURATION_OPTIONS),
          aspectRatio: generationConfiguration.aspectRatio,
          aspectRatios: supportedAspectRatios(generationConfiguration, modelCatalog?.models),
          creditCost: configuredCreditCost(generationConfiguration, modelCatalog?.models),
          quality: generationConfiguration.quality,
          maxPromptLength: generationConfiguration.maxPromptLength,
          maxImageBytes: generationConfiguration.maxImageBytes,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/home") {
      const locale = validHomeLocale(url.searchParams.get("locale"));
      const feedSessionId = validFeedSessionId(url.searchParams.get("feedSessionId"));
      const personaCode = validOptionalPersonaCode(url.searchParams.get("personaCode"));
      return json(await platform.home(locale, feedSessionId, personaCode));
    }

    if (request.method === "GET" && url.pathname === "/api/creation-templates") {
      const locale = validHomeLocale(url.searchParams.get("locale"));
      const personaCode = validOptionalPersonaCode(url.searchParams.get("personaCode"));
      const { templates } = await platform.creationTemplates(locale, personaCode);
      return json({ templates: templates.map(publicContent) });
    }

    const contentMatch = /^\/api\/content\/(template|asset)\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && contentMatch) {
      const locale = validHomeLocale(url.searchParams.get("locale"));
      const personaCode = validOptionalPersonaCode(url.searchParams.get("personaCode"));
      const kind = contentMatch[1] as "template" | "asset";
      const contentId = validIdentifier(decodeURIComponent(contentMatch[2]), "内容 ID");
      const { content } = await platform.content(kind, contentId, locale, personaCode);
      return json({ content: publicContent(content) });
    }

    if (request.method === "GET" && url.pathname === "/api/jobs") {
      const { jobs } = await platform.jobs(user);
      await recordSuccessfulReferralJobs(env, platform.externalUserId(user), jobs);
      return json({ jobs: jobs.map(publicJob) });
    }

    if (request.method === "POST" && (url.pathname === "/api/subscription/cancel" || url.pathname === "/api/subscription/resume")) {
      if (!env.USER_PREFERENCES) return problem("subscription_unavailable", "订阅状态服务尚未配置。", 503);
      const current = await userSubscription(env, user.id);
      if (!subscriptionIsActive(current)) return problem("subscription_not_found", "当前没有有效订阅。", 404);
      const isCanceled = url.pathname.endsWith("/cancel");
      if (current!.isCanceled === isCanceled) return json({ subscription: publicSubscription(current!) });
      await new TelegramClient(env).editUserStarSubscription(user.id, current!.lastChargeId, isCanceled);
      const subscription = { ...current!, isCanceled };
      await saveUserSubscription(env, user.id, subscription);
      return json({ subscription: publicSubscription(subscription) });
    }

    if (request.method === "POST" && url.pathname === "/api/generation-jobs/text") {
      const input = await request.json<{ prompt?: unknown; durationSeconds?: unknown; aspectRatio?: unknown; requestId?: unknown }>();
      const generation = await platform.generationConfiguration();
      const prompt = validPrompt(input.prompt, generation.maxPromptLength);
      const durationSeconds = validDuration(input.durationSeconds, generation);
      const aspectRatio = await validAspectRatio(input.aspectRatio, generation, platform);
      const requestId = validRequestId(input.requestId);
      return json(publicJobResult(await platform.createJob({
        user,
        idempotencyKey: miniAppIdempotencyKey(user, requestId),
        mode: "text-to-video",
        prompt,
        durationSeconds,
        aspectRatio,
      })), 201);
    }

    if (request.method === "POST" && url.pathname === "/api/generation-jobs/image") {
      const generation = await platform.generationConfiguration();
      const contentType = (request.headers.get("Content-Type") || "").split(";", 1)[0].toLowerCase();
      if (!IMAGE_CONTENT_TYPES.has(contentType)) return problem("unsupported_image", "请上传 JPG、PNG 或 WebP 图片。", 415);

      const contentLength = Number.parseInt(request.headers.get("Content-Length") || "", 10);
      if (Number.isSafeInteger(contentLength) && contentLength > generation.maxImageBytes) {
        return problem("image_too_large", `图片必须小于 ${Math.floor(generation.maxImageBytes / 1024 / 1024)} MB。`, 413);
      }
      if (!request.body) return problem("missing_image", "请选择一张图片。", 400);

      const prompt = validPrompt(decodeHeader(request.headers.get("X-Prompt")), generation.maxPromptLength);
      const durationSeconds = validDuration(decodeHeader(request.headers.get("X-Duration-Seconds")), generation);
      const aspectRatio = await validAspectRatio(decodeHeader(request.headers.get("X-Aspect-Ratio")), generation, platform);
      const requestId = validRequestId(request.headers.get("X-Request-Id"));
      const fileName = safeFileName(decodeHeader(request.headers.get("X-File-Name")) || "telegram-upload.jpg");
      const image = await request.arrayBuffer();
      if (!image.byteLength) return problem("missing_image", "请选择一张图片。", 400);
      if (image.byteLength > generation.maxImageBytes) return problem("image_too_large", `图片必须小于 ${Math.floor(generation.maxImageBytes / 1024 / 1024)} MB。`, 413);
      const upload = await platform.upload(user, fileName, contentType, image);
      return json(publicJobResult(await platform.createJob({
        user,
        idempotencyKey: miniAppIdempotencyKey(user, requestId),
        mode: "image-to-video",
        prompt,
        imageUrl: upload.upload.url,
        durationSeconds,
        aspectRatio,
      })), 201);
    }

    const contentGenerationMatch = /^\/api\/content\/(template|asset)\/([^/]+)\/generation-jobs\/(text|image)$/.exec(url.pathname);
    if (request.method === "POST" && contentGenerationMatch) {
      const kind = contentGenerationMatch[1] as "template" | "asset";
      const contentId = validIdentifier(decodeURIComponent(contentGenerationMatch[2]), "内容 ID");
      const inputMode = contentGenerationMatch[3] as "text" | "image";
      const textInput = inputMode === "text"
        ? await request.json<{ prompt?: unknown; durationSeconds?: unknown; aspectRatio?: unknown; requestId?: unknown; personaCode?: unknown }>()
        : null;
      const personaCode = validOptionalPersonaCode(inputMode === "text" ? textInput?.personaCode : request.headers.get("X-Persona-Code"));
      const { content } = await platform.content(kind, contentId, user.language_code || "en", personaCode);
      if (!content.canCreate) return problem("content_not_supported", "当前模板暂不支持创建。", 422);
      if ((content.requiredImageCount || 0) > 1) return problem("content_not_supported", "当前小程序暂不支持多图模板。", 422);
      const generation = await platform.generationConfiguration();

      if (inputMode === "text") {
        if (kind === "asset" || content.requiresImage) return problem("content_requires_image", "这个内容需要上传图片。", 422);
        const prompt = validOptionalPrompt(textInput?.prompt, generation.maxPromptLength);
        const durationSeconds = validDuration(textInput?.durationSeconds, generation);
        const aspectRatio = await validAspectRatio(textInput?.aspectRatio, generation, platform);
        const requestId = validRequestId(textInput?.requestId);
        return json(publicJobResult(await platform.createFromTemplate({
          user,
          idempotencyKey: miniAppIdempotencyKey(user, requestId),
          templateId: contentId,
          personaCode,
          userPrompt: prompt,
          durationSeconds,
          aspectRatio,
        })), 201);
      }

      const contentType = (request.headers.get("Content-Type") || "").split(";", 1)[0].toLowerCase();
      if (!IMAGE_CONTENT_TYPES.has(contentType)) return problem("unsupported_image", "请上传 JPG、PNG 或 WebP 图片。", 415);
      const contentLength = Number.parseInt(request.headers.get("Content-Length") || "", 10);
      if (Number.isSafeInteger(contentLength) && contentLength > generation.maxImageBytes) {
        return problem("image_too_large", `图片必须小于 ${Math.floor(generation.maxImageBytes / 1024 / 1024)} MB。`, 413);
      }
      const prompt = validOptionalPrompt(decodeHeader(request.headers.get("X-Prompt")), generation.maxPromptLength);
      const durationSeconds = validDuration(decodeHeader(request.headers.get("X-Duration-Seconds")), generation);
      const aspectRatio = await validAspectRatio(decodeHeader(request.headers.get("X-Aspect-Ratio")), generation, platform);
      const requestId = validRequestId(request.headers.get("X-Request-Id"));
      const fileName = safeFileName(decodeHeader(request.headers.get("X-File-Name")) || "telegram-upload.jpg");
      const image = await request.arrayBuffer();
      if (!image.byteLength) return problem("missing_image", "请选择一张图片。", 400);
      if (image.byteLength > generation.maxImageBytes) return problem("image_too_large", `图片必须小于 ${Math.floor(generation.maxImageBytes / 1024 / 1024)} MB。`, 413);
      const upload = await platform.upload(user, fileName, contentType, image);
      const idempotencyKey = miniAppIdempotencyKey(user, requestId);
      const result = kind === "asset"
        ? await platform.followAsset({ user, idempotencyKey, assetId: contentId, personaCode, userPrompt: prompt, imageUrl: upload.upload.url, durationSeconds, aspectRatio })
        : await platform.createFromTemplate({ user, idempotencyKey, templateId: contentId, personaCode, userPrompt: prompt, imageUrl: upload.upload.url, durationSeconds, aspectRatio });
      return json(publicJobResult(result), 201);
    }

    const paymentOrderMatch = /^\/api\/payments\/telegram-stars\/orders\/(ord_[a-f0-9-]{32,48})$/i.exec(url.pathname);
    if (request.method === "GET" && paymentOrderMatch) {
      const order = await loadAdminPaymentOrder(env, paymentOrderMatch[1]);
      if (order.externalUserId !== platform.externalUserId(user)) return problem("payment_order_not_found", "没有找到这笔支付订单。", 404);
      return json({
        order_id: order.id,
        order_no: order.orderNo,
        status: order.status,
        stars_amount: order.starsAmount,
        credits_amount: order.creditsAmount,
        paid_at: order.paidAt,
      });
    }

    if (request.method === "POST" && (url.pathname === "/api/payments/invoice" || url.pathname === "/api/payments/telegram-stars/orders")) {
      const input = await request.json<{ productId?: unknown; product_id?: unknown; productType?: unknown; termsVersion?: unknown }>();
      const isOrderEndpoint = url.pathname === "/api/payments/telegram-stars/orders";
      if ((!isOrderEndpoint && input.termsVersion !== TERMS_VERSION)
        || (isOrderEndpoint && input.termsVersion !== undefined && input.termsVersion !== TERMS_VERSION)) {
        return problem("terms_not_accepted", "请先阅读并同意当前服务条款。", 422);
      }
      const telegram = new TelegramClient(env);
      const productId = input.productId ?? input.product_id;

      if (input.productType === "subscription") {
        if (!env.USER_PREFERENCES) return problem("subscription_unavailable", "订阅状态服务尚未配置。", 503);
        const plans = await loadAdminSubscriptionPlans(env, SUBSCRIPTION_PLANS, "Mini App", TERMS_VERSION);
        const plan = typeof productId === "string" ? plans.find((item) => item.id === productId) : undefined;
        if (!plan) return problem("product_not_found", "这个订阅计划已经下架。", 404);
        if (plan.periodSeconds !== TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS) return problem("subscription_unavailable", "订阅周期配置无效。", 503);
        const current = await userSubscription(env, user.id);
        if (subscriptionIsActive(current)) return problem("subscription_already_active", "当前已有有效订阅。", 409);
        const invoiceUrl = await telegram.createInvoice({
          title: plan.title,
          description: plan.description,
          payload: invoicePayload(plan.id, platform.externalUserId(user), TERMS_VERSION, "Mini App", "subscription", "subscription"),
          stars: plan.stars,
          subscriptionPeriodSeconds: plan.periodSeconds,
        });
        return json({ invoiceUrl });
      }

      if (input.productType !== undefined && input.productType !== "credit_pack") return problem("invalid_request", "商品类型无效。", 400);
      const packs = await loadAdminCreditPacks(env, CREDIT_PACKS, "Mini App", TERMS_VERSION);
      const pack = typeof productId === "string" ? packs.find((item) => item.id === productId) : undefined;
      if (!pack) return problem("product_not_found", "这个充值商品已经下架。", 404);
      const { order, invoiceUrl } = await createTelegramStarsOrder(env, user, pack, "Mini App", "wallet");
      return json({ order_id: order.id, invoice_url: invoiceUrl, orderId: order.id, invoiceUrl }, 201);
    }

    if (request.method === "POST" && url.pathname === "/api/publications") {
      const input = await request.json<{ jobId?: unknown; title?: unknown; description?: unknown; tags?: unknown; requestId?: unknown }>();
      const jobId = validIdentifier(input.jobId, "任务 ID");
      const title = validText(input.title, "标题", 2, 100);
      const description = validText(input.description, "内容说明", 0, 1_000);
      const requestId = validRequestId(input.requestId);
      const tags = validTags(input.tags);
      const { job } = await platform.job(jobId);
      if (job.externalUserId !== platform.externalUserId(user)) return problem("job_not_found", "没有找到这个任务。", 404);
      if (job.status !== "succeeded" || !job.outputUrl) return problem("job_not_publishable", "只有已成功生成的视频可以提交发布。", 409);
      const publication = {
        id: `pub_${job.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
        jobId: job.id,
        externalUserId: job.externalUserId,
        title,
        description,
        tags,
        coverUrl: "",
        videoUrl: job.outputUrl,
      };
      const result = await sendAdminEvent(env, {
        eventId: `publication:${user.id}:${requestId}`,
        type: "publication.submitted",
        occurredAt: new Date().toISOString(),
        data: { publication, job },
      }, true);
      const synchronized = result?.publication && typeof result.publication === "object" ? result.publication as { status?: unknown; version?: unknown } : {};
      return json({ publication: { ...publication, status: typeof synchronized.status === "string" ? synchronized.status : "pending_review", version: Number(synchronized.version) || 1 } }, 202);
    }

    const cancelMatch = /^\/api\/generation-jobs\/([^/]+)\/cancel$/.exec(url.pathname);
    if (request.method === "POST" && cancelMatch) {
      const { job } = await platform.cancel(decodeURIComponent(cancelMatch[1]), user, "Mini App");
      return json({ job: publicJob(job) });
    }

    return problem("not_found", "接口不存在。", 404);
  } catch (error) {
    return apiError(error);
  }
}

async function bootstrapMiniAppUser(env: Env, platform: OpenPlatformClient, user: TelegramUser, startParam: string) {
  const result = await platform.upsertUser(user, "Mini App");
  let referral = unavailableReferral();
  try {
    referral = await bootstrapAdminReferral(env, platform.externalUserId(user), startParam);
  } catch (error) {
    console.error(JSON.stringify({ event: "referral_bootstrap_failed", externalUserId: platform.externalUserId(user), error: String(error) }));
  }
  try {
    const gift = await claimAdminNewUserGift(env, platform.externalUserId(user));
    return {
      wallet: gift.wallet || result.wallet,
      newUserGift: {
        credits: gift.eligible ? gift.credits : 0,
        grantedNow: gift.applied,
      },
      referral,
    };
  } catch (error) {
    console.error(JSON.stringify({ event: "new_user_gift_claim_failed", externalUserId: platform.externalUserId(user), error: String(error) }));
    return { wallet: result.wallet, newUserGift: { credits: 0, grantedNow: false }, referral };
  }
}

async function authenticatedUser(request: Request, env: Env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("tma ")) throw new MiniAppAuthError();
  const configuredMaxAge = Number.parseInt(env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS || "", 10);
  const maxAgeSeconds = Number.isSafeInteger(configuredMaxAge) && configuredMaxAge > 0 ? configuredMaxAge : 86_400;
  return validateTelegramInitDataContext(authorization.slice(4), env.TELEGRAM_BOT_TOKEN, { maxAgeSeconds });
}

async function recordSuccessfulReferralJobs(env: Env, externalUserId: string, jobs: OpenPlatformJob[]) {
  const successful = jobs.filter((job) => job.status === "succeeded").slice(0, 10);
  const outcomes = await Promise.all(successful.map(async (job) => {
    try {
      return await recordAdminReferralGeneration(env, externalUserId, job.id, job.completedAt || job.finishedAt);
    } catch (error) {
      console.error(JSON.stringify({ event: "referral_generation_record_failed", jobId: job.id, error: String(error) }));
      return null;
    }
  }));
  return outcomes.some((outcome) => outcome?.applied === true);
}

function unavailableReferral(): ReferralOverview {
  return { enabled: false, code: "", rewardCredits: 0, weeklyLimit: 0, rewardedThisWeek: 0, remainingRewards: 0, records: [] };
}

function publicReferral(referral: ReferralOverview, env: Env) {
  const username = (env.PUBLIC_TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  const appName = (env.PUBLIC_TELEGRAM_APP_NAME || "app").trim();
  const shareUrl = referral.enabled && username && /^[a-zA-Z0-9_]{5,64}$/.test(username) && /^[a-zA-Z0-9_]{1,64}$/.test(appName)
    ? `https://t.me/${username}/${appName}?startapp=ref--${referral.code}`
    : "";
  return { ...referral, shareUrl };
}

function validPrompt(value: unknown, maxLength = MAX_PROMPT_LENGTH) {
  const prompt = typeof value === "string" ? value.trim() : "";
  if (prompt.length < 3 || prompt.length > maxLength) {
    throw new MiniAppInputError("invalid_prompt", `提示词长度需要在 3-${maxLength} 个字符之间。`);
  }
  return prompt;
}

function validOptionalPrompt(value: unknown, maxLength = MAX_PROMPT_LENGTH) {
  const prompt = typeof value === "string" ? value.trim() : "";
  if ((prompt.length > 0 && prompt.length < 3) || prompt.length > maxLength) {
    throw new MiniAppInputError("invalid_prompt", `提示词需要留空或填写 3-${maxLength} 个字符。`);
  }
  return prompt;
}

type GenerationSelection = { model: string; durationSeconds: number; aspectRatio: string };
type ModelGenerationConfiguration = Array<{ id: string; enabled: boolean; durations: number[]; aspectRatios: string[]; creditCost: number }>;

function supportedDurations(
  generation: GenerationSelection,
  models: ModelGenerationConfiguration = [],
  configuredDurations: readonly number[] = [],
) {
  const model = models.find((item) => item.id === generation.model && item.enabled);
  const selectableDurations = configuredDurations.length ? configuredDurations : model?.durations || [];
  const values = [generation.durationSeconds, ...selectableDurations]
    .filter((value) => Number.isSafeInteger(value) && value >= 1 && value <= 60);
  return [...new Set(values.length ? values : [generation.durationSeconds])];
}

function supportedAspectRatios(generation: GenerationSelection, models: ModelGenerationConfiguration = []) {
  const model = models.find((item) => item.id === generation.model && item.enabled);
  const values = [generation.aspectRatio, ...(model?.aspectRatios || [])]
    .map((value) => value.trim())
    .filter((value) => ASPECT_RATIO_PATTERN.test(value));
  return [...new Set(values.length ? values : [generation.aspectRatio])];
}

function configuredCreditCost(generation: Pick<GenerationSelection, "model">, models: ModelGenerationConfiguration = []) {
  const model = models.find((item) => item.id === generation.model && item.enabled);
  return model && Number.isFinite(model.creditCost) && model.creditCost >= 0 ? model.creditCost : null;
}

function validDuration(value: unknown, generation: GenerationSelection) {
  const requested = value === undefined || value === null || value === ""
    ? generation.durationSeconds
    : typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > 60) {
    throw new MiniAppInputError("unsupported_duration", "视频时长无效。", 422);
  }
  if (!supportedDurations(generation, [], DEFAULT_DURATION_OPTIONS).includes(requested)) {
    throw new MiniAppInputError("unsupported_duration", "当前模型不支持这个视频时长。", 422);
  }
  return requested;
}

async function validAspectRatio(value: unknown, generation: GenerationSelection, platform: OpenPlatformClient) {
  const requested = typeof value === "string" ? value.trim() : "";
  const aspectRatio = requested || generation.aspectRatio;
  if (!ASPECT_RATIO_PATTERN.test(aspectRatio)) {
    throw new MiniAppInputError("unsupported_aspect_ratio", "视频宽高比格式无效。", 422);
  }
  if (aspectRatio === generation.aspectRatio) return aspectRatio;

  let modelCatalog: Awaited<ReturnType<OpenPlatformClient["models"]>>;
  try {
    modelCatalog = await platform.models();
  } catch (error) {
    if (error instanceof OpenPlatformError) throw error;
    throw new OpenPlatformError("upstream_unavailable", "Model catalog is temporarily unavailable", 502);
  }
  if (!supportedAspectRatios(generation, modelCatalog.models).includes(aspectRatio)) {
    throw new MiniAppInputError("unsupported_aspect_ratio", "当前模型不支持这个视频宽高比。", 422);
  }
  return aspectRatio;
}

function validRequestId(value: unknown) {
  if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
    throw new MiniAppInputError("invalid_request_id", "请求标识无效，请重新提交。", 400);
  }
  return value;
}

function validHomeLocale(value: unknown) {
  const locale = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z]{2,3}(?:-[a-z]{2,8})?$/i.test(locale)) {
    throw new MiniAppInputError("invalid_locale", "显示语言无效。", 400);
  }
  return locale;
}

function validFeedSessionId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) {
    throw new MiniAppInputError("invalid_feed_session", "推荐会话无效，请刷新后重试。", 400);
  }
  return value;
}

function validOptionalPersonaCode(value: unknown) {
  const personaCode = typeof value === "string" ? value.trim() : "";
  if (personaCode && !/^[a-zA-Z0-9_.:-]{1,200}$/.test(personaCode)) {
    throw new MiniAppInputError("invalid_persona", "画像代码无效，请刷新推荐后重试。", 400);
  }
  return personaCode;
}

function validIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:-]{3,200}$/.test(value)) {
    throw new MiniAppInputError("invalid_identifier", `${label}格式无效。`, 400);
  }
  return value;
}

function validText(value: unknown, label: string, min: number, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) throw new MiniAppInputError("invalid_publication", `${label}长度需要在 ${min}-${max} 个字符之间。`);
  return text;
}

function validTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const tags = value.map((tag) => typeof tag === "string" ? tag.trim() : "").filter(Boolean);
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) throw new MiniAppInputError("invalid_publication", "标签最多 10 个，每个不超过 30 个字符。");
  return [...new Set(tags)];
}

function miniAppIdempotencyKey(user: TelegramUser, requestId: string) {
  return `telegram-mini-app-${user.id}-${requestId}`;
}

function publicUser(user: TelegramUser) {
  return {
    id: user.id,
    firstName: user.first_name || "Telegram User",
    lastName: user.last_name || "",
    username: user.username || "",
    languageCode: user.language_code || "",
  };
}

function publicSubscription(subscription: { planId: string; status: "active"; startedAt: string; renewedAt: string; expiresAt: number }) {
  return {
    planId: subscription.planId,
    status: subscription.status,
    startedAt: subscription.startedAt,
    renewedAt: subscription.renewedAt,
    expiresAt: subscription.expiresAt,
    isCanceled: "isCanceled" in subscription && subscription.isCanceled === true,
  };
}

function publicContent(content: OpenPlatformContent) {
  return {
    ...content,
    previewUrl: publicMediaUrl(content.previewUrl),
    videoUrl: publicMediaUrl(content.videoUrl),
    referenceImageUrl: publicMediaUrl(content.referenceImageUrl),
    defaultReferenceImageUrl: publicMediaUrl(content.defaultReferenceImageUrl),
  };
}

function publicJob(job: OpenPlatformJob) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    model: job.model,
    creditCost: job.creditCost,
    mode: job.mode,
    prompt: job.prompt,
    durationSeconds: job.durationSeconds,
    aspectRatio: job.aspectRatio,
    quality: job.quality,
    audioEnabled: job.audioEnabled,
    providerModel: job.providerModel,
    seed: typeof job.seed === "string" || typeof job.seed === "number" ? job.seed : undefined,
    imageUrl: publicMediaUrl(job.imageUrl),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    completedAt: job.completedAt,
    coverUrl: publicMediaUrl(job.coverUrl),
    thumbnailUrl: publicMediaUrl(job.thumbnailUrl),
    outputUrl: publicMediaUrl(job.outputUrl),
    failureCode: job.failureCode,
    creditsRefunded: job.creditsRefunded,
    refundedCredits: job.refundedCredits,
    sourceContentKind: job.sourceContentKind,
    sourceContentId: job.sourceContentId,
  };
}

function publicJobResult(result: { job: OpenPlatformJob; replayed: boolean }) {
  return { job: publicJob(result.job), replayed: result.replayed };
}

function publicMediaUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "telegram-upload.jpg";
}

function decodeHeader(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    throw new MiniAppInputError("invalid_header", "请求参数格式无效。", 400);
  }
}

function apiError(error: unknown) {
  if (error instanceof MiniAppAuthError) return problem("unauthorized", error.message, 401);
  if (error instanceof MiniAppInputError) return problem(error.code, error.message, error.status);
  if (error instanceof OpenPlatformError) {
    if (error.code === "home_profile_not_configured") return problem(error.code, "个性化推荐暂时不可用。", 503);
    if (error.code === "insufficient_credits") return problem(error.code, "credits 不足，请先充值。", 402);
    if (error.code === "limit_exceeded") return problem(error.code, "当前任务较多，请稍后再试。", 429);
    if (error.code === "not_found") return problem(error.code, "没有找到这个任务。", 404);
    if (error.code === "content_not_supported") return problem(error.code, "当前内容暂不支持创建。", 422);
    if (error.code === "content_model_unavailable") return problem(error.code, "当前模型不能创建这个内容。", 400);
    if (error.code === "invalid_request") return problem(error.code, "生成参数不受支持，请刷新小程序后重试。", 400);
    if (error.code === "conflict") return problem(error.code, "请求状态已变化，请刷新后重试。", 409);
    if (["invalid_callback_url", "callback_url_not_allowed", "callback_host_not_allowed"].includes(error.code)) {
      return problem("callback_not_configured", "生成回调地址尚未配置。", 503);
    }
    if (error.code === "upstream_unavailable") return problem(error.code, "上游生成服务暂时不可用，请稍后重试。", 502);
    return problem("platform_unavailable", "创作服务暂时不可用，请稍后重试。", error.status >= 500 ? 502 : 400);
  }
  if (error instanceof AdminSyncError) return problem("publication_service_unavailable", error.message, 503);
  if (error instanceof SyntaxError) return problem("invalid_json", "请求格式无效。", 400);
  console.error(JSON.stringify({ event: "mini_app_api_failed", error: String(error) }));
  return problem("internal_error", "服务暂时不可用，请稍后重试。", 500);
}

class MiniAppInputError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
  }
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: apiHeaders() });
}

function problem(code: string, message: string, status: number) {
  return json({ code, message }, status);
}

function apiHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
  };
}
