import { HttpError, type Env } from "./types";
import { activeConfiguration } from "./store";

type PlatformWallet = { balance: number; version: number };
type AdjustmentRow = {
  reference_id: string;
  external_user_id: string;
  delta: number;
  reason: string;
  balance_before: number;
  balance_after: number;
  status: "pending" | "completed" | "failed";
};

type GiftEntryRow = {
  delta: number;
};

export type NewUserGiftResult = {
  eligible: boolean;
  applied: boolean;
  credits: number;
  wallet?: PlatformWallet;
};

export async function grantNewUserGift(env: Env, externalUserId: string): Promise<NewUserGiftResult> {
  const configuration = await activeConfiguration(env.DB);
  const gift = configuration.newUserGift;
  if (!gift || gift.credits <= 0 || !gift.enabledAt) return { eligible: false, applied: false, credits: 0 };

  const user = await env.DB.prepare("SELECT joined_at AS joinedAt FROM users WHERE external_user_id = ?")
    .bind(externalUserId).first<{ joinedAt: string }>();
  if (!user) throw new HttpError(404, "user_not_found", "后台索引中没有找到这个用户，请稍后重试。");
  if (Date.parse(user.joinedAt) < Date.parse(gift.enabledAt)) return { eligible: false, applied: false, credits: 0 };

  const referenceId = `new-user-gift-${externalUserId}`;
  const existingGift = await env.DB.prepare("SELECT delta FROM wallet_entries WHERE reference_id = ? AND entry_type = 'gift'")
    .bind(referenceId).first<GiftEntryRow>();
  if (existingGift) {
    const { wallet } = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(externalUserId)}/wallet`);
    return { eligible: true, applied: false, credits: existingGift.delta, wallet };
  }

  let operation = await env.DB.prepare("SELECT reference_id, external_user_id, delta, reason, balance_before, balance_after, status FROM wallet_adjustments WHERE reference_id = ?")
    .bind(referenceId).first<AdjustmentRow>();
  if (!operation) {
    const current = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(externalUserId)}/wallet`);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO wallet_adjustments(reference_id, external_user_id, delta, reason, balance_before, balance_after, status, created_at, updated_at)
      VALUES (?, ?, ?, 'new_user_gift', ?, ?, 'pending', ?, ?)`).bind(
        referenceId,
        externalUserId,
        gift.credits,
        current.wallet.balance,
        current.wallet.balance + gift.credits,
        now,
        now,
      ).run();
    operation = await env.DB.prepare("SELECT reference_id, external_user_id, delta, reason, balance_before, balance_after, status FROM wallet_adjustments WHERE reference_id = ?")
      .bind(referenceId).first<AdjustmentRow>();
  }
  if (!operation || operation.external_user_id !== externalUserId || operation.reason !== "new_user_gift") {
    throw new HttpError(409, "reference_conflict", "新用户赠送记录冲突，请稍后重试。");
  }

  const latest = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(externalUserId)}/wallet`);
  if (operation.status === "completed") {
    return { eligible: true, applied: false, credits: operation.delta, wallet: latest.wallet };
  }
  if (latest.wallet.balance === operation.balance_after) {
    await finalizeNewUserGift(env.DB, externalUserId, operation, latest.wallet);
    return { eligible: true, applied: false, credits: operation.delta, wallet: latest.wallet };
  }
  if (latest.wallet.balance !== operation.balance_before) {
    operation.balance_before = latest.wallet.balance;
    operation.balance_after = latest.wallet.balance + operation.delta;
    await env.DB.prepare("UPDATE wallet_adjustments SET balance_before = ?, balance_after = ?, status = 'pending', error_message = NULL, updated_at = ? WHERE reference_id = ?")
      .bind(operation.balance_before, operation.balance_after, new Date().toISOString(), referenceId).run();
  }

  try {
    const result = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(externalUserId)}/wallet/balance`, {
      method: "PUT",
      body: JSON.stringify({ balance: operation.balance_after, reason: "new_user_gift", referenceId }),
    });
    await finalizeNewUserGift(env.DB, externalUserId, operation, result.wallet);
    return { eligible: true, applied: true, credits: operation.delta, wallet: result.wallet };
  } catch (error) {
    await env.DB.prepare("UPDATE wallet_adjustments SET status = 'failed', error_message = ?, updated_at = ? WHERE reference_id = ?")
      .bind(error instanceof Error ? error.message.slice(0, 500) : "unknown error", new Date().toISOString(), referenceId).run();
    throw error;
  }
}

async function finalizeNewUserGift(db: D1Database, externalUserId: string, operation: AdjustmentRow, wallet: PlatformWallet) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO wallet_entries(id, external_user_id, entry_type, delta, balance_before, balance_after, reference_id, reason, created_at)
      VALUES (?, ?, 'gift', ?, ?, ?, ?, '新用户首次创作赠送', ?)`).bind(
        `wal_gift_${externalUserId}`,
        externalUserId,
        operation.delta,
        operation.balance_before,
        wallet.balance,
        operation.reference_id,
        now,
      ),
    db.prepare(`INSERT INTO wallets(external_user_id, balance, version, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(external_user_id) DO UPDATE SET balance = excluded.balance, version = MAX(wallets.version, excluded.version), updated_at = excluded.updated_at`)
      .bind(externalUserId, wallet.balance, wallet.version, now),
    db.prepare("UPDATE wallet_adjustments SET status = 'completed', error_message = NULL, updated_at = ? WHERE reference_id = ?")
      .bind(now, operation.reference_id),
  ]);
}

export async function adjustWallet(env: Env, externalUserId: string, delta: number, reason: string, referenceId: string) {
  let operation = await env.DB.prepare("SELECT reference_id, external_user_id, delta, reason, balance_before, balance_after, status FROM wallet_adjustments WHERE reference_id = ?")
    .bind(referenceId).first<AdjustmentRow>();
  if (operation && (operation.external_user_id !== externalUserId || operation.delta !== delta || operation.reason !== reason)) {
    throw new HttpError(409, "reference_conflict", "这个 Reference ID 已用于另一笔调整。");
  }
  if (operation?.status === "completed") return loadAdminUser(env.DB, externalUserId);

  if (!operation) {
    const current = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(externalUserId)}/wallet`);
    const target = current.wallet.balance + delta;
    if (target < 0) throw new HttpError(422, "insufficient_balance", "调整后的余额不能小于 0。");
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO wallet_adjustments(reference_id, external_user_id, delta, reason, balance_before, balance_after, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(referenceId, externalUserId, delta, reason, current.wallet.balance, target, now, now).run();
    operation = { reference_id: referenceId, external_user_id: externalUserId, delta, reason, balance_before: current.wallet.balance, balance_after: target, status: "pending" };
  }

  try {
    const latest = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(externalUserId)}/wallet`);
    if (latest.wallet.balance !== operation.balance_before && latest.wallet.balance !== operation.balance_after) {
      throw new HttpError(409, "wallet_changed", "用户余额在调整期间发生变化，请使用新的 Reference ID 重新提交。");
    }
    const result = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(externalUserId)}/wallet/balance`, {
      method: "PUT",
      body: JSON.stringify({ balance: operation.balance_after, reason: `admin_adjustment:${reason}`, referenceId }),
    });
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO wallet_entries(id, external_user_id, entry_type, delta, balance_before, balance_after, reference_id, reason, created_at)
        VALUES (?, ?, 'manual_adjustment', ?, ?, ?, ?, ?, ?)`).bind(`wal_manual_${referenceId}`, externalUserId, delta, operation.balance_before, result.wallet.balance, referenceId, reason, now),
      env.DB.prepare(`INSERT INTO wallets(external_user_id, balance, version, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(external_user_id) DO UPDATE SET balance = excluded.balance, version = excluded.version, updated_at = excluded.updated_at`)
        .bind(externalUserId, result.wallet.balance, result.wallet.version, now),
      env.DB.prepare("UPDATE wallet_adjustments SET status = 'completed', error_message = NULL, updated_at = ? WHERE reference_id = ?").bind(now, referenceId),
    ]);
    return loadAdminUser(env.DB, externalUserId);
  } catch (error) {
    await env.DB.prepare("UPDATE wallet_adjustments SET status = 'failed', error_message = ?, updated_at = ? WHERE reference_id = ?")
      .bind(error instanceof Error ? error.message.slice(0, 500) : "unknown error", new Date().toISOString(), referenceId).run();
    throw error;
  }
}

export async function platformRequest<T>(env: Env, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${env.OPEN_PLATFORM_API_KEY}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${env.OPEN_PLATFORM_BASE_URL.replace(/\/$/, "")}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText })) as { code?: string; message?: string };
    if (response.status === 404) throw new HttpError(404, "user_not_found", "Open Platform 中没有找到这个用户。");
    throw new HttpError(response.status >= 500 ? 502 : 422, body.code || "platform_request_failed", body.message || "Open Platform 请求失败。");
  }
  return response.json<T>();
}

async function loadAdminUser(db: D1Database, externalUserId: string) {
  const row = await db.prepare(`SELECT u.external_user_id AS externalUserId, u.telegram_id AS telegramId, u.display_name AS displayName,
    u.username, u.language_code AS languageCode, u.status, COALESCE(w.balance, 0) AS balance, COALESCE(w.version, 0) AS walletVersion,
    u.joined_at AS joinedAt, u.last_active_at AS lastActiveAt, u.first_channel AS firstChannel
    FROM users u LEFT JOIN wallets w ON w.external_user_id = u.external_user_id WHERE u.external_user_id = ?`).bind(externalUserId).first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "user_not_found", "后台索引中没有找到这个用户，请先让用户打开 Bot 或 Mini App 完成同步。");
  const aggregates = await db.prepare(`SELECT
    COALESCE((SELECT SUM(stars) FROM payments WHERE external_user_id = ? AND applied = 1), 0) AS paidStars,
    COALESCE((SELECT SUM(credits) FROM payments WHERE external_user_id = ? AND applied = 1), 0) AS purchasedCredits,
    COALESCE((SELECT SUM(-delta) FROM wallet_entries WHERE external_user_id = ? AND entry_type = 'generation' AND delta < 0), 0) AS consumedCredits,
    COALESCE((SELECT SUM(delta) FROM wallet_entries WHERE external_user_id = ? AND entry_type = 'refund' AND delta > 0), 0) AS refundedCredits,
    COALESCE((SELECT SUM(delta) FROM wallet_entries WHERE external_user_id = ? AND entry_type = 'manual_adjustment'), 0) AS manualCredits,
    (SELECT COUNT(*) FROM generation_jobs WHERE external_user_id = ?) AS jobs,
    COALESCE((SELECT ROUND(100.0 * SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) FROM generation_jobs WHERE external_user_id = ?), 0) AS successRate`)
    .bind(...Array(7).fill(externalUserId)).first<Record<string, unknown>>();
  return { ...row, ...aggregates };
}
