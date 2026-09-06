export type AffiliateAnalytics = {
  status: "ready";
  from: string;
  to: string;
  generatedAt: string;
  metrics: {
    totalStarsOrders: number;
    affiliateOrders: number;
    affiliatePaidUsers: number;
    affiliateGrossStarsRevenue: number;
    affiliateCommissionStars: number;
    telegramCreditedStars: number;
    nonAffiliateStarsRevenue: number;
  };
  affiliates: Array<{
    type: "user" | "chat";
    peerId: string;
    name: string;
    paidUsers: number;
    paidOrders: number;
    grossStars: number;
    commissionStars: number;
    telegramCreditedStars: number;
  }>;
  sync: {
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
    lastInserted: number;
  };
};

type MetricRow = Record<string, number | null>;
type AffiliateRow = Record<string, string | number | null>;

export async function telegramAffiliateAnalytics(db: D1Database, from: string, to: string): Promise<AffiliateAnalytics> {
  const fromInclusive = `${from}T00:00:00.000Z`;
  const toExclusive = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString();
  const paidFilter = "p.applied = 1 AND p.status = 'credited' AND p.paid_at >= ? AND p.paid_at < ?";
  const [metrics, affiliates, sync] = await Promise.all([
    db.prepare(`SELECT
      COUNT(*) AS totalStarsOrders,
      SUM(CASE WHEN p.has_affiliate = 1 THEN 1 ELSE 0 END) AS affiliateOrders,
      COUNT(DISTINCT CASE WHEN p.has_affiliate = 1 THEN p.external_user_id END) AS affiliatePaidUsers,
      COALESCE(SUM(CASE WHEN p.has_affiliate = 1 THEN p.stars ELSE 0 END), 0) AS affiliateGrossStarsRevenue,
      COALESCE(SUM(CASE WHEN p.has_affiliate = 1 THEN COALESCE(p.affiliate_amount, 0) + COALESCE(p.affiliate_nanostar_amount, 0) / 1000000000.0 ELSE 0 END), 0) AS affiliateCommissionStars,
      COALESCE(SUM(COALESCE(p.telegram_credited_amount, 0) + COALESCE(p.telegram_credited_nanostar_amount, 0) / 1000000000.0), 0) AS telegramCreditedStars,
      COALESCE(SUM(CASE WHEN COALESCE(p.has_affiliate, 0) = 0 THEN p.stars ELSE 0 END), 0) AS nonAffiliateStarsRevenue
      FROM payments p WHERE ${paidFilter}`).bind(fromInclusive, toExclusive).first<MetricRow>(),
    db.prepare(`SELECT p.affiliate_type AS type, p.affiliate_peer_id AS peerId,
      COALESCE(MAX(NULLIF(p.affiliate_name, '')), p.affiliate_peer_id) AS name,
      COUNT(DISTINCT p.external_user_id) AS paidUsers, COUNT(*) AS paidOrders,
      COALESCE(SUM(p.stars), 0) AS grossStars,
      COALESCE(SUM(COALESCE(p.affiliate_amount, 0) + COALESCE(p.affiliate_nanostar_amount, 0) / 1000000000.0), 0) AS commissionStars,
      COALESCE(SUM(COALESCE(p.telegram_credited_amount, 0) + COALESCE(p.telegram_credited_nanostar_amount, 0) / 1000000000.0), 0) AS telegramCreditedStars
      FROM payments p WHERE ${paidFilter} AND p.has_affiliate = 1 AND p.affiliate_type IS NOT NULL AND p.affiliate_peer_id IS NOT NULL
      GROUP BY p.affiliate_type, p.affiliate_peer_id ORDER BY grossStars DESC, paidOrders DESC`)
      .bind(fromInclusive, toExclusive).all<AffiliateRow>(),
    db.prepare(`SELECT last_started_at AS lastStartedAt, last_completed_at AS lastCompletedAt,
      last_error AS lastError, last_inserted AS lastInserted FROM telegram_star_sync_state WHERE id = 'default'`)
      .first<Record<string, string | number | null>>(),
  ]);

  return {
    status: "ready",
    from,
    to,
    generatedAt: new Date().toISOString(),
    metrics: {
      totalStarsOrders: Number(metrics?.totalStarsOrders || 0),
      affiliateOrders: Number(metrics?.affiliateOrders || 0),
      affiliatePaidUsers: Number(metrics?.affiliatePaidUsers || 0),
      affiliateGrossStarsRevenue: Number(metrics?.affiliateGrossStarsRevenue || 0),
      affiliateCommissionStars: Number(metrics?.affiliateCommissionStars || 0),
      telegramCreditedStars: Number(metrics?.telegramCreditedStars || 0),
      nonAffiliateStarsRevenue: Number(metrics?.nonAffiliateStarsRevenue || 0),
    },
    affiliates: affiliates.results.map((row) => ({
      type: row.type === "chat" ? "chat" : "user",
      peerId: String(row.peerId || ""),
      name: String(row.name || row.peerId || ""),
      paidUsers: Number(row.paidUsers || 0),
      paidOrders: Number(row.paidOrders || 0),
      grossStars: Number(row.grossStars || 0),
      commissionStars: Number(row.commissionStars || 0),
      telegramCreditedStars: Number(row.telegramCreditedStars || 0),
    })),
    sync: {
      lastStartedAt: typeof sync?.lastStartedAt === "string" ? sync.lastStartedAt : null,
      lastCompletedAt: typeof sync?.lastCompletedAt === "string" ? sync.lastCompletedAt : null,
      lastError: typeof sync?.lastError === "string" ? sync.lastError : null,
      lastInserted: Number(sync?.lastInserted || 0),
    },
  };
}
