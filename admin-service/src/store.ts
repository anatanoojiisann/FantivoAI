import { HttpError, type Env, type IngestEvent, type PublicationRow } from "./types";
import { defaultReferralConfiguration, type CreditPackConfiguration, type NewUserGiftConfiguration, type ReferralConfiguration, type SubscriptionPlanConfiguration } from "./configuration";

type Row = Record<string, unknown>;

export async function bootstrap(db: D1Database, environment: "development" | "production" = "production") {
  const [users, jobs, payments, walletEntries, trendRows, configuration, serviceRows] = await Promise.all([
    db.prepare(`SELECT u.external_user_id AS externalUserId, u.telegram_id AS telegramId, u.display_name AS displayName,
      u.username, u.language_code AS languageCode, u.status, COALESCE(w.balance, 0) AS balance, COALESCE(w.version, 0) AS walletVersion,
      COALESCE((SELECT SUM(p.stars) FROM payments p WHERE p.external_user_id = u.external_user_id AND p.applied = 1), 0) AS paidStars,
      COALESCE((SELECT SUM(p.credits) FROM payments p WHERE p.external_user_id = u.external_user_id AND p.applied = 1), 0) AS purchasedCredits,
      COALESCE((SELECT SUM(-e.delta) FROM wallet_entries e WHERE e.external_user_id = u.external_user_id AND e.entry_type = 'generation' AND e.delta < 0), 0) AS consumedCredits,
      COALESCE((SELECT SUM(e.delta) FROM wallet_entries e WHERE e.external_user_id = u.external_user_id AND e.entry_type = 'refund' AND e.delta > 0), 0) AS refundedCredits,
      COALESCE((SELECT SUM(e.delta) FROM wallet_entries e WHERE e.external_user_id = u.external_user_id AND e.entry_type = 'manual_adjustment'), 0) AS manualCredits,
      (SELECT COUNT(*) FROM generation_jobs j WHERE j.external_user_id = u.external_user_id) AS jobs,
      COALESCE((SELECT ROUND(100.0 * SUM(CASE WHEN j.status = 'succeeded' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) FROM generation_jobs j WHERE j.external_user_id = u.external_user_id), 0) AS successRate,
      (SELECT COUNT(*) FROM generation_jobs j WHERE j.external_user_id = u.external_user_id AND j.channel = 'Mini App') AS miniAppJobs,
      (SELECT MAX(j.created_at) FROM generation_jobs j WHERE j.external_user_id = u.external_user_id AND j.channel = 'Mini App') AS lastMiniAppActivityAt,
      u.joined_at AS joinedAt, u.last_active_at AS lastActiveAt, u.first_channel AS firstChannel
      FROM users u LEFT JOIN wallets w ON w.external_user_id = u.external_user_id ORDER BY u.last_active_at DESC LIMIT 500`).all<Row>(),
    db.prepare(`SELECT j.id, j.external_user_id AS externalUserId, u.display_name AS userName, j.mode, j.prompt, j.model,
      j.status, j.progress, j.credit_cost AS creditCost, j.refunded_credits AS refundedCredits, j.channel,
      j.duration_seconds AS durationSeconds, j.aspect_ratio AS aspectRatio, j.quality, j.audio_enabled AS audioEnabled,
      j.image_url AS imageUrl, j.output_url AS outputUrl, j.failure_code AS failureCode, j.failure_message AS failureMessage,
      j.idempotency_key AS idempotencyKey,
      j.created_at AS createdAt, j.started_at AS startedAt, j.finished_at AS finishedAt,
      j.callback_attempts AS callbackAttempts, j.callback_status AS callbackStatus, j.bot_notification_status AS botNotificationStatus
      FROM generation_jobs j JOIN users u ON u.external_user_id = j.external_user_id
      ORDER BY j.created_at DESC LIMIT 500`).all<Row>(),
    db.prepare(`SELECT p.id, p.telegram_charge_id AS telegramChargeId, p.external_user_id AS externalUserId,
      u.display_name AS userName, p.product_id AS productId, p.product_title AS productTitle, p.stars, p.credits,
      p.status, p.applied, p.channel, p.funnel_entry AS funnelEntry, p.terms_version AS termsVersion, p.reconciliation, p.paid_at AS paidAt,
      p.credited_at AS creditedAt, p.wallet_entry_id AS walletEntryId, p.product_type AS productType, p.billing_cycle AS billingCycle,
      p.is_recurring AS isRecurring, p.is_first_recurring AS isFirstRecurring, p.subscription_expiration_date AS subscriptionExpirationDate
      FROM payments p JOIN users u ON u.external_user_id = p.external_user_id ORDER BY p.paid_at DESC LIMIT 500`).all<Row>(),
    db.prepare(`SELECT e.id, e.external_user_id AS externalUserId, u.display_name AS userName, e.entry_type AS type,
      e.delta, e.balance_before AS balanceBefore, e.balance_after AS balanceAfter, e.reference_id AS referenceId,
      e.reason, e.created_at AS createdAt FROM wallet_entries e JOIN users u ON u.external_user_id = e.external_user_id
      ORDER BY e.created_at DESC LIMIT 1000`).all<Row>(),
    db.prepare(`WITH RECURSIVE days(day, n) AS (
      SELECT date('now', '-6 days'), 0 UNION ALL SELECT date(day, '+1 day'), n + 1 FROM days WHERE n < 6
    ) SELECT strftime('%m/%d', day) AS label,
      (SELECT COUNT(*) FROM generation_jobs j WHERE date(j.created_at) = day) AS jobs,
      (SELECT COALESCE(SUM(p.stars), 0) FROM payments p WHERE date(p.paid_at) = day AND p.applied = 1) AS revenue,
      COALESCE((SELECT ROUND(100.0 * SUM(CASE WHEN j.status = 'succeeded' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN j.status IN ('succeeded','failed','cancelled') THEN 1 ELSE 0 END), 0), 1) FROM generation_jobs j WHERE date(j.created_at) = day), 0) AS successRate
      FROM days ORDER BY day`).all<Row>(),
    db.prepare("SELECT version, status, config_json, published_at FROM configuration_versions WHERE status = 'active' ORDER BY published_at DESC LIMIT 1").first<{ version: string; status: string; config_json: string; published_at: string }>(),
    db.prepare(`SELECT id, name, description, status, success_rate AS successRate, p95_ms AS p95,
      requests, last_success_at AS lastSuccessAt, last_failure_at AS lastFailureAt, last_error AS lastError
      FROM service_health ORDER BY id`).all<Row>(),
  ]);

  const userItems = users.results;
  const jobItems = jobs.results.map(booleanFields("audioEnabled"));
  const paymentItems = payments.results.map(booleanFields("applied", "isRecurring", "isFirstRecurring"));
  const trends = trendRows.results;
  const parsedConfiguration = parseConfiguration(configuration?.config_json);
  const creditPacks = parsedConfiguration.creditPacks;
  const subscriptionPlans = parsedConfiguration.subscriptionPlans;
  const now = new Date().toISOString();
  const services = serviceRows.results.length ? serviceRows.results : [{
    id: "admin-d1", name: "Admin API / D1", description: "管理后台接口和索引数据库", status: "healthy",
    successRate: 100, p95: 0, requests: 1, lastSuccessAt: now, lastFailureAt: null, lastError: null,
  }];

  return {
    mode: "remote" as const,
    environment,
    metrics: buildMetrics(userItems, jobItems, paymentItems),
    trends,
    users: userItems,
    jobs: jobItems,
    payments: paymentItems,
    walletEntries: walletEntries.results,
    creditPacks,
    subscriptionPlans,
    configuration: {
      version: configuration?.version || "unconfigured",
      status: configuration?.status || "draft",
      publishedAt: configuration?.published_at || null,
      generation: parsedConfiguration.generation,
      newUserGift: parsedConfiguration.newUserGift,
      referral: parsedConfiguration.referral,
    },
    services,
  };
}

export async function publishConfiguration(
  db: D1Database,
  generation: Record<string, unknown>,
  creditPacks?: CreditPackConfiguration[],
  subscriptionPlans?: SubscriptionPlanConfiguration[],
  newUserGiftCredits?: number,
  referral?: ReferralConfiguration,
) {
  const current = await db.prepare("SELECT config_json FROM configuration_versions WHERE status = 'active' ORDER BY published_at DESC LIMIT 1").first<{ config_json: string }>();
  const parsed = parseConfiguration(current?.config_json);
  const now = new Date().toISOString();
  const version = `${now.slice(0, 10).replaceAll("-", ".")}.${Date.now()}`;
  const nextCreditPacks = creditPacks ?? parsed.creditPacks;
  const nextSubscriptionPlans = subscriptionPlans ?? parsed.subscriptionPlans;
  const nextGiftCredits = newUserGiftCredits ?? parsed.newUserGift.credits;
  const nextReferral = referral ?? parsed.referral;
  const nextNewUserGift: NewUserGiftConfiguration = {
    credits: nextGiftCredits,
    enabledAt: nextGiftCredits > 0
      ? (parsed.newUserGift.credits > 0 && parsed.newUserGift.enabledAt ? parsed.newUserGift.enabledAt : now)
      : null,
  };
  const configJson = JSON.stringify({ creditPacks: nextCreditPacks, subscriptionPlans: nextSubscriptionPlans, generation, newUserGift: nextNewUserGift, referral: nextReferral });
  await db.batch([
    db.prepare("UPDATE configuration_versions SET status = 'archived' WHERE status = 'active'"),
    db.prepare(`INSERT INTO configuration_versions(version, status, config_json, created_at, published_at)
      VALUES (?, 'active', ?, ?, ?)`).bind(version, configJson, now, now),
  ]);
  return { version, status: "active", publishedAt: now, creditPacks: nextCreditPacks, subscriptionPlans: nextSubscriptionPlans, generation, newUserGift: nextNewUserGift, referral: nextReferral };
}

export async function activeConfiguration(db: D1Database) {
  const current = await db.prepare("SELECT version, status, config_json, published_at FROM configuration_versions WHERE status = 'active' ORDER BY published_at DESC LIMIT 1")
    .first<{ version: string; status: string; config_json: string; published_at: string }>();
  if (!current) throw new HttpError(404, "configuration_not_found", "当前没有生效的配置。");
  const parsed = parseConfiguration(current.config_json);
  return { version: current.version, status: current.status, publishedAt: current.published_at, ...parsed };
}

export async function ingestEvent(env: Env, input: unknown) {
  const event = validateEvent(input);
  const duplicate = await env.DB.prepare("SELECT event_id FROM ingestion_events WHERE event_id = ?").bind(event.eventId).first();
  if (duplicate) return { applied: false, duplicate: true };
  const statements = statementsForEvent(env.DB, event);
  statements.push(env.DB.prepare("INSERT INTO ingestion_events(event_id, event_type, occurred_at, received_at) VALUES (?, ?, ?, ?)")
    .bind(event.eventId, event.type, event.occurredAt, new Date().toISOString()));
  await env.DB.batch(statements);
  return { applied: true, duplicate: false };
}

export async function publicationById(db: D1Database, id: string) {
  const publication = await db.prepare("SELECT * FROM publications WHERE id = ?").bind(id).first<PublicationRow>();
  if (!publication) throw new HttpError(404, "publication_not_found", "没有找到这条发布内容。");
  return publication;
}

export async function publicPublications(db: D1Database, limit: number, cursor?: string) {
  const rows = await db.prepare(`SELECT p.id, p.title, p.description, p.tags_json AS tagsJson, p.external_user_id AS externalUserId,
    u.display_name AS userName, p.published_at AS publishedAt, p.version, p.is_featured AS isFeatured,
    CASE WHEN p.source_cover_url IS NOT NULL THEN 1 ELSE 0 END AS hasCover
    FROM publications p JOIN users u ON u.external_user_id = p.external_user_id
    WHERE p.status = 'published' AND (? IS NULL OR p.published_at < ?)
    ORDER BY p.published_at DESC LIMIT ?`).bind(cursor ?? null, cursor ?? null, limit + 1).all<Row>();
  const hasMore = rows.results.length > limit;
  const items = rows.results.slice(0, limit).map((row) => ({
    ...booleanFields("isFeatured")(row),
    tags: parseTags(String(row.tagsJson || "[]")),
    coverUrl: row.hasCover ? `/media/${encodeURIComponent(String(row.id))}/cover` : "",
    videoUrl: `/media/${encodeURIComponent(String(row.id))}/video`,
    tagsJson: undefined, hasCover: undefined,
  }));
  return { items, nextCursor: hasMore ? String(rows.results[Math.min(limit, rows.results.length) - 1]?.publishedAt || "") : null };
}

function statementsForEvent(db: D1Database, event: IngestEvent) {
  const data = event.data;
  if (event.type === "user.upsert") return userStatements(db, record(data.user), record(data.wallet), event.occurredAt, string(data.channel, "Bot"));
  if (event.type === "wallet.snapshot") {
    const externalUserId = required(data.externalUserId, "externalUserId");
    return [placeholderUser(db, externalUserId, event.occurredAt), walletStatement(db, externalUserId, record(data.wallet), event.occurredAt)];
  }
  if (event.type === "payment.credited") return paymentStatements(db, data, event.occurredAt);
  if (event.type === "job.upsert") return jobStatements(db, data, event.occurredAt);
  if (event.type === "jobs.snapshot") {
    const jobs = Array.isArray(data.jobs) ? data.jobs.slice(0, 50) : [];
    return jobs.flatMap((job) => jobStatements(db, { job, channel: data.channel }, event.occurredAt));
  }
  if (event.type === "publication.submitted") return publicationStatements(db, data, event.occurredAt);
  if (event.type === "service.health") return serviceStatements(db, data, event.occurredAt);
  throw new HttpError(422, "unsupported_event", "不支持的同步事件类型。");
}

function userStatements(db: D1Database, user: Record<string, unknown>, wallet: Record<string, unknown>, occurredAt: string, channel: string) {
  const externalUserId = required(user.externalUserId, "externalUserId");
  const telegramId = integer(user.telegramId, telegramIdFromExternal(externalUserId));
  const statements = [db.prepare(`INSERT INTO users(external_user_id, telegram_id, display_name, username, language_code, status, first_channel, joined_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?) ON CONFLICT(external_user_id) DO UPDATE SET
    telegram_id = excluded.telegram_id, display_name = excluded.display_name, username = excluded.username,
    language_code = excluded.language_code, last_active_at = excluded.last_active_at`)
    .bind(externalUserId, telegramId, string(user.displayName, "Telegram User"), string(user.username), string(user.languageCode), channel === "Mini App" ? "Mini App" : "Bot", occurredAt, occurredAt)];
  if (Object.keys(wallet).length) statements.push(walletStatement(db, externalUserId, wallet, occurredAt));
  return statements;
}

function paymentStatements(db: D1Database, data: Record<string, unknown>, occurredAt: string) {
  const payment = record(data.payment);
  const wallet = record(data.wallet);
  const user = record(data.user);
  const externalUserId = required(payment.externalUserId ?? user.externalUserId, "externalUserId");
  const transactionId = required(payment.transactionId, "transactionId");
  const credits = integer(payment.credits, 0);
  const applied = payment.confirmed === true || Boolean(payment.applied);
  const balanceAfter = integer(wallet.balance, 0);
  const balanceBefore = applied ? Math.max(0, balanceAfter - credits) : balanceAfter;
  const entryId = `wal_payment_${safeId(transactionId)}`;
  const statements = Object.keys(user).length ? userStatements(db, user, wallet, occurredAt, string(data.channel, "Bot")) : [placeholderUser(db, externalUserId, occurredAt), walletStatement(db, externalUserId, wallet, occurredAt)];
  if (applied) statements.push(db.prepare(`INSERT OR IGNORE INTO wallet_entries(id, external_user_id, entry_type, delta, balance_before, balance_after, reference_id, reason, created_at)
    VALUES (?, ?, 'payment', ?, ?, ?, ?, 'Telegram Stars 充值', ?)`)
    .bind(entryId, externalUserId, credits, balanceBefore, balanceAfter, transactionId, occurredAt));
  statements.push(db.prepare(`INSERT INTO payments(id, telegram_charge_id, external_user_id, product_id, product_title, stars, credits, status,
    applied, channel, funnel_entry, terms_version, reconciliation, paid_at, credited_at, wallet_entry_id, product_type, billing_cycle,
    is_recurring, is_first_recurring, subscription_expiration_date, order_id, invoice_payload) VALUES (?, ?, ?, ?, ?, ?, ?, 'credited', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_charge_id) DO UPDATE SET applied = MAX(payments.applied, excluded.applied), status = excluded.status,
    reconciliation = CASE WHEN excluded.applied = 1 THEN 'matched' ELSE payments.reconciliation END,
    channel = excluded.channel, funnel_entry = excluded.funnel_entry,
    product_type = excluded.product_type, billing_cycle = excluded.billing_cycle, is_recurring = excluded.is_recurring,
    is_first_recurring = excluded.is_first_recurring, subscription_expiration_date = COALESCE(excluded.subscription_expiration_date, payments.subscription_expiration_date),
    order_id = COALESCE(payments.order_id, excluded.order_id), invoice_payload = COALESCE(payments.invoice_payload, excluded.invoice_payload),
    credited_at = COALESCE(payments.credited_at, excluded.credited_at), wallet_entry_id = COALESCE(payments.wallet_entry_id, excluded.wallet_entry_id)`)
    .bind(`pay_${safeId(transactionId)}`, transactionId, externalUserId, required(payment.productId, "productId"), string(payment.productTitle, required(payment.productId, "productId")),
      integer(payment.stars, 0), credits, applied ? 1 : 0, channel(data.channel, ""), string(data.funnelEntry, channel(data.channel, "") === "Mini App" ? "wallet" : "buy_command"),
      string(payment.termsVersion, "unknown"), applied ? "matched" : "duplicated", occurredAt, occurredAt, applied ? entryId : null,
      payment.productType === "subscription" ? "subscription" : "credit_pack", payment.billingCycle === "subscription" ? "subscription" : "one_time",
      payment.isRecurring === true ? 1 : 0, payment.isFirstRecurring === true ? 1 : 0, nullableInteger(payment.subscriptionExpirationDate),
      nullable(payment.orderId), nullable(payment.invoicePayload)));
  const orderId = nullable(payment.orderId);
  if (orderId) {
    statements.push(db.prepare(`UPDATE telegram_payment_orders SET status = 'PAID', telegram_payment_charge_id = ?,
      paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ? AND status IN ('PENDING', 'PRECHECKOUT_APPROVED', 'PAID')
      AND (telegram_payment_charge_id IS NULL OR telegram_payment_charge_id = ?)`)
      .bind(transactionId, occurredAt, occurredAt, orderId, transactionId));
  }
  return statements;
}

function jobStatements(db: D1Database, data: Record<string, unknown>, occurredAt: string) {
  const job = record(data.job);
  const wallet = record(data.wallet);
  const externalUserId = required(job.externalUserId, "externalUserId");
  const id = required(job.id, "job.id");
  const cost = integer(job.creditCost, 0);
  const refunded = integer(job.refundedCredits, Boolean(job.creditsRefunded) ? cost : 0);
  const balanceAfter = integer(wallet.balance, 0);
  const statements: D1PreparedStatement[] = [placeholderUser(db, externalUserId, occurredAt)];
  if (Object.keys(wallet).length) statements.push(walletStatement(db, externalUserId, wallet, occurredAt));
  statements.push(db.prepare(`INSERT INTO generation_jobs(id, external_user_id, mode, prompt, model, status, progress, credit_cost,
    refunded_credits, channel, duration_seconds, aspect_ratio, quality, audio_enabled, image_url, output_url, failure_code,
    failure_message, idempotency_key, created_at, started_at, finished_at, callback_attempts, callback_status, bot_notification_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, progress = excluded.progress, output_url = COALESCE(excluded.output_url, generation_jobs.output_url),
    failure_code = COALESCE(excluded.failure_code, generation_jobs.failure_code), failure_message = COALESCE(excluded.failure_message, generation_jobs.failure_message),
    refunded_credits = MAX(generation_jobs.refunded_credits, excluded.refunded_credits), started_at = COALESCE(generation_jobs.started_at, excluded.started_at),
    finished_at = COALESCE(excluded.finished_at, generation_jobs.finished_at), callback_attempts = MAX(generation_jobs.callback_attempts, excluded.callback_attempts),
    callback_status = COALESCE(excluded.callback_status, generation_jobs.callback_status), bot_notification_status = excluded.bot_notification_status`)
    .bind(id, externalUserId, mode(job.mode), string(job.prompt), string(job.model), jobStatus(job.status), clamp(integer(job.progress, 0), 0, 100), cost,
      refunded, channel(data.channel, job.idempotencyKey), integer(job.durationSeconds, 5), string(job.aspectRatio, "9:16"), string(job.quality, "standard"),
      job.audioEnabled === false ? 0 : 1, nullable(job.imageUrl), nullable(job.outputUrl), nullable(job.failureCode), nullable(job.failureMessage),
      string(job.idempotencyKey), iso(job.createdAt, occurredAt), nullable(job.startedAt), nullable(job.finishedAt), integer(job.callbackAttempts, 0),
      nullableInteger(job.callbackStatus), notificationStatus(job.botNotificationStatus)));
  if (Boolean(data.applied) && Object.keys(wallet).length && cost > 0) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO wallet_entries(id, external_user_id, entry_type, delta, balance_before, balance_after, reference_id, reason, created_at)
      VALUES (?, ?, 'generation', ?, ?, ?, ?, '视频生成扣费', ?)`)
      .bind(`wal_generation_${safeId(id)}`, externalUserId, -cost, balanceAfter + cost, balanceAfter, id, iso(job.createdAt, occurredAt)));
  }
  if (refunded > 0 && Object.keys(wallet).length) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO wallet_entries(id, external_user_id, entry_type, delta, balance_before, balance_after, reference_id, reason, created_at)
      VALUES (?, ?, 'refund', ?, ?, ?, ?, '任务失败或取消自动退款', ?)`)
      .bind(`wal_refund_${safeId(id)}`, externalUserId, refunded, Math.max(0, balanceAfter - refunded), balanceAfter, `refund:${id}`, iso(job.finishedAt, occurredAt)));
  }
  return statements;
}

function publicationStatements(db: D1Database, data: Record<string, unknown>, occurredAt: string) {
  const publication = record(data.publication);
  const job = record(data.job);
  const id = required(publication.id, "publication.id");
  const jobId = required(publication.jobId ?? job.id, "publication.jobId");
  const externalUserId = required(publication.externalUserId ?? job.externalUserId, "publication.externalUserId");
  const tags = Array.isArray(publication.tags) ? publication.tags.filter((value): value is string => typeof value === "string").slice(0, 10) : [];
  const statements = Object.keys(job).length ? jobStatements(db, { job, channel: data.channel }, occurredAt) : [placeholderUser(db, externalUserId, occurredAt)];
  statements.push(db.prepare(`INSERT INTO publications(id, job_id, external_user_id, title, description, tags_json, source_cover_url, source_video_url, status, version, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', 1, ?)
      ON CONFLICT(job_id) DO UPDATE SET title = excluded.title, description = excluded.description, tags_json = excluded.tags_json,
      source_cover_url = excluded.source_cover_url, source_video_url = excluded.source_video_url, status = 'pending_review',
      version = publications.version + CASE WHEN publications.status = 'rejected' THEN 1 ELSE 0 END,
      media_status = 'unchecked', media_checked_at = NULL,
      source_video_content_type = NULL, source_video_content_length = NULL, source_video_etag = NULL,
      source_cover_content_type = NULL, source_cover_content_length = NULL, source_cover_etag = NULL,
      cover_key = NULL, video_key = NULL, reject_reason_code = NULL, reject_reason_text = NULL,
      reviewed_at = NULL, published_at = NULL, submitted_at = excluded.submitted_at
      WHERE publications.status IN ('pending_review', 'rejected')`)
      .bind(id, jobId, externalUserId, required(publication.title, "publication.title"), string(publication.description), JSON.stringify(tags),
        nullable(publication.coverUrl), required(publication.videoUrl ?? job.outputUrl, "publication.videoUrl"), occurredAt));
  return statements;
}

function serviceStatements(db: D1Database, data: Record<string, unknown>, occurredAt: string) {
  return [db.prepare(`INSERT INTO service_health(id, name, description, status, success_rate, p95_ms, requests, last_success_at, last_failure_at, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
    status = excluded.status, success_rate = excluded.success_rate, p95_ms = excluded.p95_ms, requests = excluded.requests,
    last_success_at = excluded.last_success_at, last_failure_at = excluded.last_failure_at, last_error = excluded.last_error`)
    .bind(required(data.id, "service.id"), required(data.name, "service.name"), string(data.description), serviceStatus(data.status),
      Number(data.successRate) || 0, integer(data.p95, 0), integer(data.requests, 0), iso(data.lastSuccessAt, occurredAt), nullable(data.lastFailureAt), nullable(data.lastError))];
}

function walletStatement(db: D1Database, externalUserId: string, wallet: Record<string, unknown>, occurredAt: string) {
  return db.prepare(`INSERT INTO wallets(external_user_id, balance, version, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(external_user_id) DO UPDATE SET balance = excluded.balance, version = MAX(wallets.version, excluded.version), updated_at = excluded.updated_at`)
    .bind(externalUserId, integer(wallet.balance, 0), integer(wallet.version, 0), occurredAt);
}

function placeholderUser(db: D1Database, externalUserId: string, occurredAt: string) {
  return db.prepare(`INSERT OR IGNORE INTO users(external_user_id, telegram_id, display_name, joined_at, last_active_at)
    VALUES (?, ?, ?, ?, ?)`).bind(externalUserId, telegramIdFromExternal(externalUserId), externalUserId, occurredAt, occurredAt);
}

function validateEvent(input: unknown): IngestEvent {
  const event = record(input);
  const eventId = required(event.eventId, "eventId");
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(eventId)) throw new HttpError(422, "invalid_event", "eventId 格式无效。");
  const types = new Set(["user.upsert", "wallet.snapshot", "payment.credited", "job.upsert", "jobs.snapshot", "publication.submitted", "service.health"]);
  if (typeof event.type !== "string" || !types.has(event.type)) throw new HttpError(422, "invalid_event", "事件类型无效。");
  return { eventId, type: event.type as IngestEvent["type"], occurredAt: iso(event.occurredAt, ""), data: record(event.data) };
}

function buildMetrics(users: Row[], jobs: Row[], payments: Row[]) {
  const activeSince = Date.now() - 7 * 24 * 60 * 60 * 1_000;
  const active = users.filter((user) => Date.parse(String(user.lastActiveAt)) >= activeSince).length;
  const terminal = jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(String(job.status)));
  const succeeded = terminal.filter((job) => job.status === "succeeded").length;
  const successRate = terminal.length ? succeeded / terminal.length * 100 : 0;
  const queue = jobs.filter((job) => ["queued", "processing"].includes(String(job.status))).length;
  const stars = payments.filter((payment) => Number(payment.applied) === 1 && Date.parse(String(payment.paidAt)) >= activeSince).reduce((sum, payment) => sum + Number(payment.stars), 0);
  return [
    { id: "active", label: "活跃创作者", value: active.toLocaleString("zh-CN"), change: 0, hint: "近 7 天去重用户", tone: "success" },
    { id: "jobs", label: "任务提交", value: jobs.length.toLocaleString("zh-CN"), change: 0, hint: "当前索引范围", tone: "default" },
    { id: "success", label: "生成成功率", value: `${successRate.toFixed(1)}%`, change: 0, hint: "终态任务", tone: successRate >= 95 ? "success" : "warning" },
    { id: "queue", label: "当前队列", value: queue.toLocaleString("zh-CN"), change: 0, hint: "排队与生成中", tone: queue ? "warning" : "default" },
    { id: "stars", label: "Stars 收入", value: stars.toLocaleString("zh-CN"), change: 0, hint: "近 7 天", tone: "default" },
  ];
}

function booleanFields(...fields: string[]) {
  return (row: Row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? Boolean(value) : value])) as Row;
}

function parseConfiguration(value?: string) {
  try {
    const parsed = JSON.parse(value || "{}") as {
      creditPacks?: unknown[];
      subscriptionPlans?: unknown[];
      generation?: Record<string, unknown>;
      newUserGift?: Partial<NewUserGiftConfiguration>;
      referral?: Partial<ReferralConfiguration>;
    };
    return {
      creditPacks: Array.isArray(parsed.creditPacks) ? parsed.creditPacks : [],
      subscriptionPlans: Array.isArray(parsed.subscriptionPlans) ? parsed.subscriptionPlans : [],
      generation: parsed.generation || defaultGeneration(),
      newUserGift: normalizedNewUserGift(parsed.newUserGift),
      referral: normalizedReferralConfiguration(parsed.referral),
    };
  } catch {
    return { creditPacks: [], subscriptionPlans: [], generation: defaultGeneration(), newUserGift: normalizedNewUserGift(), referral: normalizedReferralConfiguration() };
  }
}

function normalizedNewUserGift(value?: Partial<NewUserGiftConfiguration>): NewUserGiftConfiguration {
  if (!value) return { credits: 300, enabledAt: "2026-08-22T16:00:00.000Z" };
  const credits = Number.isSafeInteger(value?.credits) && Number(value?.credits) >= 0 && Number(value?.credits) <= 10_000_000
    ? Number(value?.credits)
    : 0;
  const enabledAt = credits > 0 && typeof value?.enabledAt === "string" && Number.isFinite(Date.parse(value.enabledAt))
    ? new Date(value.enabledAt).toISOString()
    : null;
  return { credits, enabledAt };
}

function normalizedReferralConfiguration(value?: Partial<ReferralConfiguration>): ReferralConfiguration {
  const fallback = defaultReferralConfiguration();
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
    rewardCredits: Number.isSafeInteger(value?.rewardCredits) && Number(value?.rewardCredits) > 0 && Number(value?.rewardCredits) <= 10_000_000
      ? Number(value?.rewardCredits)
      : fallback.rewardCredits,
    weeklyLimit: Number.isSafeInteger(value?.weeklyLimit) && Number(value?.weeklyLimit) > 0 && Number(value?.weeklyLimit) <= 100
      ? Number(value?.weeklyLimit)
      : fallback.weeklyLimit,
  };
}

function defaultGeneration() {
  return { model: "peach-max", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", maxPromptLength: 1_000, maxImageBytes: 10_485_760, maxConcurrentJobs: 3, audioEnabled: true };
}

function parseTags(value: string) {
  try {
    const tags = JSON.parse(value);
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function required(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(422, "invalid_event", `${name} 缺失。`);
  return value.trim().slice(0, 2_000);
}
function string(value: unknown, fallback = "") { return typeof value === "string" ? value.slice(0, 2_000) : fallback; }
function integer(value: unknown, fallback: number) { return Number.isSafeInteger(value) ? Number(value) : fallback; }
function nullable(value: unknown) { return typeof value === "string" && value ? value.slice(0, 4_000) : null; }
function nullableInteger(value: unknown) { return Number.isSafeInteger(value) ? Number(value) : null; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function safeId(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140); }
function telegramIdFromExternal(value: string) { const match = /^telegram_(\d+)$/.exec(value); return match ? Number(match[1]) : 0; }
function iso(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value : fallback;
  if (!text || !Number.isFinite(Date.parse(text))) throw new HttpError(422, "invalid_event", "事件时间格式无效。");
  return new Date(text).toISOString();
}
function mode(value: unknown) { return value === "image-to-video" ? "image-to-video" : "text-to-video"; }
function channel(value: unknown, key: unknown) { return value === "Mini App" || String(key).startsWith("telegram-mini-app-") ? "Mini App" : "Bot"; }
function jobStatus(value: unknown) { return ["queued", "processing", "succeeded", "failed", "cancelled"].includes(String(value)) ? String(value) : "queued"; }
function notificationStatus(value: unknown) { return ["pending", "sent", "failed"].includes(String(value)) ? String(value) : "pending"; }
function serviceStatus(value: unknown) { return ["healthy", "degraded", "down"].includes(String(value)) ? String(value) : "degraded"; }
