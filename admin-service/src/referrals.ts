import { HttpError, type Env } from "./types";
import { activeConfiguration } from "./store";
import { platformRequest } from "./platform";
import type { ReferralConfiguration } from "./configuration";

type PlatformWallet = { balance: number; version: number };
type ReferralStatus = "registered" | "qualified" | "reward_pending" | "rewarded" | "cap_reached";

type ReferralRow = {
  id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  status: ReferralStatus;
  reward_credits: number;
  registered_at: string;
  qualified_at: string | null;
  rewarded_at: string | null;
};

type AdjustmentRow = {
  reference_id: string;
  external_user_id: string;
  delta: number;
  reason: string;
  balance_before: number;
  balance_after: number;
  status: "pending" | "completed" | "failed";
};

export type ReferralOverview = {
  enabled: boolean;
  code: string;
  rewardCredits: number;
  weeklyLimit: number;
  rewardedThisWeek: number;
  remainingRewards: number;
  records: Array<{
    status: ReferralStatus;
    registeredAt: string;
    qualifiedAt: string | null;
    rewardedAt: string | null;
    rewardCredits: number;
  }>;
};

const CODE_PATTERN = /^inv_[a-z0-9]{12}$/;
const EXTERNAL_USER_PATTERN = /^telegram_\d+$/;

export async function bootstrapReferral(env: Env, input: { externalUserId: string; startParam?: string }): Promise<ReferralOverview> {
  const externalUserId = validExternalUserId(input.externalUserId);
  await ensureIndexedUser(env.DB, externalUserId);
  const configuration = (await activeConfiguration(env.DB)).referral as ReferralConfiguration;
  const code = await referralCode(env.DB, externalUserId);
  const inviterCode = referralCodeFromStartParam(input.startParam);

  if (configuration.enabled && inviterCode) {
    await attributeReferral(env.DB, externalUserId, inviterCode, configuration.rewardCredits);
  }

  return referralOverview(env.DB, externalUserId, configuration, code);
}

export async function recordSuccessfulReferralGeneration(env: Env, input: { externalUserId: string; jobId: string; occurredAt?: string }) {
  const externalUserId = validExternalUserId(input.externalUserId);
  const jobId = validJobId(input.jobId);
  const occurredAt = validTimestamp(input.occurredAt);
  const referral = await env.DB.prepare("SELECT * FROM referrals WHERE invitee_user_id = ?").bind(externalUserId).first<ReferralRow>();
  if (!referral) return { applied: false, status: "not_referred" as const };

  await env.DB.prepare(`INSERT OR IGNORE INTO referral_generation_events(job_id, invitee_user_id, occurred_at, created_at)
    VALUES (?, ?, ?, ?)`)
    .bind(jobId, externalUserId, occurredAt, new Date().toISOString()).run();

  return fulfilReferralReward(env, referral.id, occurredAt);
}

export async function referralDashboard(db: D1Database) {
  const [counts, recent] = await Promise.all([
    db.prepare("SELECT status, COUNT(*) AS count FROM referrals GROUP BY status ORDER BY status").all<{ status: string; count: number }>(),
    db.prepare(`SELECT status, registered_at AS registeredAt, qualified_at AS qualifiedAt, rewarded_at AS rewardedAt,
      reward_credits AS rewardCredits, inviter_user_id AS inviterUserId, invitee_user_id AS inviteeUserId
      FROM referrals ORDER BY registered_at DESC LIMIT 100`).all<Record<string, unknown>>(),
  ]);
  return { statuses: counts.results.map((item) => ({ status: item.status, count: Number(item.count) })), referrals: recent.results };
}

async function attributeReferral(db: D1Database, inviteeUserId: string, code: string, rewardCredits: number) {
  const inviter = await db.prepare("SELECT external_user_id AS externalUserId FROM referral_codes WHERE code = ?").bind(code).first<{ externalUserId: string }>();
  if (!inviter || inviter.externalUserId === inviteeUserId) return;

  const existing = await db.prepare("SELECT id FROM referrals WHERE invitee_user_id = ?").bind(inviteeUserId).first();
  if (existing) return;

  const activity = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM generation_jobs WHERE external_user_id = ?) AS jobs,
    (SELECT COUNT(*) FROM payments WHERE external_user_id = ? AND applied = 1) AS payments`)
    .bind(inviteeUserId, inviteeUserId).first<{ jobs: number; payments: number }>();
  if (Number(activity?.jobs || 0) > 0 || Number(activity?.payments || 0) > 0) return;

  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO referrals(id, inviter_user_id, invitee_user_id, code, status, reward_credits, registered_at)
    VALUES (?, ?, ?, ?, 'registered', ?, ?)`)
    .bind(`ref_${crypto.randomUUID()}`, inviter.externalUserId, inviteeUserId, code, rewardCredits, now).run();
}

async function fulfilReferralReward(env: Env, referralId: string, occurredAt: string) {
  const referral = await env.DB.prepare("SELECT * FROM referrals WHERE id = ?").bind(referralId).first<ReferralRow>();
  if (!referral) throw new HttpError(404, "referral_not_found", "邀请记录不存在。");
  if (referral.status === "rewarded" || referral.status === "cap_reached") return { applied: false, status: referral.status };

  const configuration = (await activeConfiguration(env.DB)).referral as ReferralConfiguration;
  if (!configuration.enabled) return { applied: false, status: "disabled" as const };
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE referrals SET status = CASE WHEN status = 'registered' THEN 'qualified' ELSE status END,
    qualified_at = COALESCE(qualified_at, ?) WHERE id = ?`).bind(occurredAt, referralId).run();

  const slot = await env.DB.prepare("SELECT referral_id FROM referral_reward_slots WHERE referral_id = ?").bind(referralId).first();
  if (!slot) {
    const reservation = await env.DB.prepare(`INSERT INTO referral_reward_slots(id, referral_id, inviter_user_id, reserved_at)
      SELECT ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM referral_reward_slots WHERE inviter_user_id = ? AND reserved_at >= ?) < ?`)
      .bind(`rslot_${crypto.randomUUID()}`, referralId, referral.inviter_user_id, now, referral.inviter_user_id, rollingWeekStart(), configuration.weeklyLimit)
      .run();
    if (Number(reservation.meta.changes || 0) === 0) {
      await env.DB.prepare("UPDATE referrals SET status = 'cap_reached' WHERE id = ? AND status != 'rewarded'").bind(referralId).run();
      return { applied: false, status: "cap_reached" as const };
    }
  }

  await env.DB.prepare("UPDATE referrals SET status = 'reward_pending' WHERE id = ? AND status != 'rewarded'").bind(referralId).run();
  const result = await creditReferralReward(env, referral);
  return { applied: result.applied, status: "rewarded" as const, wallet: result.wallet, rewardCredits: referral.reward_credits };
}

async function creditReferralReward(env: Env, referral: ReferralRow): Promise<{ applied: boolean; wallet: PlatformWallet }> {
  const referenceId = `referral-reward-${referral.id}`;
  let operation = await env.DB.prepare(`SELECT reference_id, external_user_id, delta, reason, balance_before, balance_after, status
    FROM wallet_adjustments WHERE reference_id = ?`).bind(referenceId).first<AdjustmentRow>();

  if (!operation) {
    const current = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(referral.inviter_user_id)}/wallet`);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO wallet_adjustments(reference_id, external_user_id, delta, reason, balance_before, balance_after, status, created_at, updated_at)
      VALUES (?, ?, ?, 'referral_reward', ?, ?, 'pending', ?, ?)`)
      .bind(referenceId, referral.inviter_user_id, referral.reward_credits, current.wallet.balance, current.wallet.balance + referral.reward_credits, now, now).run();
    operation = await env.DB.prepare(`SELECT reference_id, external_user_id, delta, reason, balance_before, balance_after, status
      FROM wallet_adjustments WHERE reference_id = ?`).bind(referenceId).first<AdjustmentRow>();
  }
  if (!operation || operation.external_user_id !== referral.inviter_user_id || operation.delta !== referral.reward_credits || operation.reason !== "referral_reward") {
    throw new HttpError(409, "referral_reward_conflict", "邀请奖励记录冲突，请稍后重试。");
  }

  const latest = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(referral.inviter_user_id)}/wallet`);
  if (operation.status === "completed" || latest.wallet.balance === operation.balance_after) {
    await finalizeReferralReward(env.DB, referral, operation, latest.wallet);
    return { applied: false, wallet: latest.wallet };
  }
  if (latest.wallet.balance !== operation.balance_before) {
    operation = { ...operation, balance_before: latest.wallet.balance, balance_after: latest.wallet.balance + operation.delta, status: "pending" };
    await env.DB.prepare("UPDATE wallet_adjustments SET balance_before = ?, balance_after = ?, status = 'pending', error_message = NULL, updated_at = ? WHERE reference_id = ?")
      .bind(operation.balance_before, operation.balance_after, new Date().toISOString(), referenceId).run();
  }

  try {
    const result = await platformRequest<{ wallet: PlatformWallet }>(env, `/v1/users/${encodeURIComponent(referral.inviter_user_id)}/wallet/balance`, {
      method: "PUT",
      body: JSON.stringify({ balance: operation.balance_after, reason: "referral_reward", referenceId }),
    });
    await finalizeReferralReward(env.DB, referral, operation, result.wallet);
    return { applied: true, wallet: result.wallet };
  } catch (error) {
    await env.DB.prepare("UPDATE wallet_adjustments SET status = 'failed', error_message = ?, updated_at = ? WHERE reference_id = ?")
      .bind(error instanceof Error ? error.message.slice(0, 500) : "unknown error", new Date().toISOString(), referenceId).run();
    throw error;
  }
}

async function finalizeReferralReward(db: D1Database, referral: ReferralRow, operation: AdjustmentRow, wallet: PlatformWallet) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO wallet_entries(id, external_user_id, entry_type, delta, balance_before, balance_after, reference_id, reason, created_at)
      VALUES (?, ?, 'referral_reward', ?, ?, ?, ?, '邀请好友完成首个视频奖励', ?)`)
      .bind(`wal_referral_${referral.id}`, referral.inviter_user_id, operation.delta, operation.balance_before, wallet.balance, operation.reference_id, now),
    db.prepare(`INSERT INTO wallets(external_user_id, balance, version, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(external_user_id) DO UPDATE SET balance = excluded.balance, version = MAX(wallets.version, excluded.version), updated_at = excluded.updated_at`)
      .bind(referral.inviter_user_id, wallet.balance, wallet.version, now),
    db.prepare("UPDATE referrals SET status = 'rewarded', rewarded_at = COALESCE(rewarded_at, ?) WHERE id = ?").bind(now, referral.id),
    db.prepare("UPDATE wallet_adjustments SET status = 'completed', error_message = NULL, updated_at = ? WHERE reference_id = ?").bind(now, operation.reference_id),
  ]);
}

async function referralOverview(db: D1Database, externalUserId: string, configuration: ReferralConfiguration, code: string): Promise<ReferralOverview> {
  const [count, records] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM referrals WHERE inviter_user_id = ? AND status = 'rewarded' AND rewarded_at >= ?")
      .bind(externalUserId, rollingWeekStart()).first<{ count: number }>(),
    db.prepare(`SELECT status, registered_at AS registeredAt, qualified_at AS qualifiedAt, rewarded_at AS rewardedAt, reward_credits AS rewardCredits
      FROM referrals WHERE inviter_user_id = ? ORDER BY registered_at DESC LIMIT 5`).bind(externalUserId).all<{
      status: ReferralStatus; registeredAt: string; qualifiedAt: string | null; rewardedAt: string | null; rewardCredits: number;
    }>(),
  ]);
  const rewardedThisWeek = Number(count?.count || 0);
  return {
    enabled: configuration.enabled,
    code,
    rewardCredits: configuration.rewardCredits,
    weeklyLimit: configuration.weeklyLimit,
    rewardedThisWeek,
    remainingRewards: Math.max(0, configuration.weeklyLimit - rewardedThisWeek),
    records: records.results,
  };
}

async function referralCode(db: D1Database, externalUserId: string) {
  const current = await db.prepare("SELECT code FROM referral_codes WHERE external_user_id = ?").bind(externalUserId).first<{ code: string }>();
  if (current) return current.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `inv_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const insert = await db.prepare("INSERT OR IGNORE INTO referral_codes(code, external_user_id, created_at) VALUES (?, ?, ?)")
      .bind(code, externalUserId, new Date().toISOString()).run();
    if (Number(insert.meta.changes || 0) === 1) return code;
    const retry = await db.prepare("SELECT code FROM referral_codes WHERE external_user_id = ?").bind(externalUserId).first<{ code: string }>();
    if (retry) return retry.code;
  }
  throw new HttpError(503, "referral_code_unavailable", "邀请码暂时无法创建，请稍后重试。");
}

async function ensureIndexedUser(db: D1Database, externalUserId: string) {
  const user = await db.prepare("SELECT external_user_id FROM users WHERE external_user_id = ?").bind(externalUserId).first();
  if (!user) throw new HttpError(404, "user_not_found", "用户资料尚未同步，请稍后重试。");
}

function referralCodeFromStartParam(value: string | undefined) {
  const match = /^ref--(inv_[a-z0-9]{12})$/.exec((value || "").trim());
  return match && CODE_PATTERN.test(match[1]) ? match[1] : "";
}

function validExternalUserId(value: string) {
  if (!EXTERNAL_USER_PATTERN.test(value)) throw new HttpError(422, "invalid_user", "用户标识无效。");
  return value;
}

function validJobId(value: string) {
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(value)) throw new HttpError(422, "invalid_job", "任务标识无效。");
  return value;
}

function validTimestamp(value: string | undefined) {
  if (!value) return new Date().toISOString();
  if (!Number.isFinite(Date.parse(value))) throw new HttpError(422, "invalid_timestamp", "任务完成时间无效。");
  return new Date(value).toISOString();
}

function rollingWeekStart() {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}
