import type { Env } from "./types";

type JsonRecord = Record<string, unknown>;

export type ParsedStarTransaction = {
  eventKey: string;
  contentHash: string;
  telegramTransactionId: string;
  amount: number;
  nanostarAmount: number;
  transactionDate: number;
  direction: "incoming" | "outgoing" | "unknown";
  transactionType: string | null;
  sourceUserId: string | null;
  invoicePayload: string | null;
  affiliateType: "user" | "chat" | null;
  affiliateUserId: string | null;
  affiliateChatId: string | null;
  affiliateName: string | null;
  affiliateCommissionPerMille: number | null;
  affiliateAmount: number | null;
  affiliateNanostarAmount: number | null;
  rawPayload: string;
  createdAt: string;
  syncedAt: string;
};

export type StarTransactionSyncResult = {
  fetched: number;
  inserted: number;
  pages: number;
  completedAt: string;
};

export async function parseStarTransaction(input: unknown, syncedAt = new Date().toISOString()): Promise<ParsedStarTransaction> {
  const transaction = record(input);
  const telegramTransactionId = requiredString(transaction.id, "StarTransaction.id");
  const amount = requiredInteger(transaction.amount, "StarTransaction.amount");
  const nanostarAmount = optionalInteger(transaction.nanostar_amount) ?? 0;
  const transactionDate = requiredInteger(transaction.date, "StarTransaction.date");
  const source = recordOrNull(transaction.source);
  const receiver = recordOrNull(transaction.receiver);
  const direction = source ? "incoming" : receiver ? "outgoing" : "unknown";
  const partner = source || receiver || {};
  const sourceUser = source ? recordOrNull(source.user) : null;
  const affiliate = recordOrNull(partner.affiliate);
  const affiliateUser = affiliate ? recordOrNull(affiliate.affiliate_user) : null;
  const affiliateChat = affiliate ? recordOrNull(affiliate.affiliate_chat) : null;
  const affiliateType = affiliateUser ? "user" : affiliateChat ? "chat" : null;
  const rawPayload = canonicalJson(transaction);
  const contentHash = await sha256(rawPayload);

  return {
    eventKey: `${telegramTransactionId}:${contentHash}`,
    contentHash,
    telegramTransactionId,
    amount,
    nanostarAmount,
    transactionDate,
    direction,
    transactionType: optionalString(partner.transaction_type),
    sourceUserId: identifier(sourceUser?.id),
    invoicePayload: optionalString(partner.invoice_payload),
    affiliateType,
    affiliateUserId: identifier(affiliateUser?.id),
    affiliateChatId: identifier(affiliateChat?.id),
    affiliateName: affiliateUser ? userSnapshot(affiliateUser) : affiliateChat ? chatSnapshot(affiliateChat) : null,
    affiliateCommissionPerMille: optionalInteger(affiliate?.commission_per_mille),
    affiliateAmount: optionalInteger(affiliate?.amount),
    affiliateNanostarAmount: optionalInteger(affiliate?.nanostar_amount),
    rawPayload,
    createdAt: new Date(transactionDate * 1_000).toISOString(),
    syncedAt,
  };
}

export async function fetchStarTransactionPages(
  botToken: string,
  fetcher: typeof fetch = fetch,
  options: { limit?: number; maxPages?: number } = {},
) {
  if (!botToken) throw new Error("Telegram Bot token is not configured");
  const limit = Math.max(1, Math.min(100, options.limit ?? 100));
  const maxPages = Math.max(1, Math.min(100, options.maxPages ?? 10));
  const transactions: unknown[] = [];
  let pages = 0;

  for (let offset = 0; pages < maxPages; offset += limit) {
    const response = await fetcher(`https://api.telegram.org/bot${botToken}/getStarTransactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, limit }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { transactions?: unknown[] }; description?: string } | null;
    if (!response.ok || payload?.ok !== true || !Array.isArray(payload.result?.transactions)) {
      throw new Error(payload?.description || `Telegram getStarTransactions failed (${response.status})`);
    }
    const page = payload.result.transactions;
    pages += 1;
    transactions.push(...page);
    if (page.length < limit) break;
  }
  return { transactions, pages };
}

export async function syncStarTransactions(
  env: Env,
  options: { fetcher?: typeof fetch; limit?: number; maxPages?: number } = {},
): Promise<StarTransactionSyncResult> {
  const startedAt = new Date().toISOString();
  await env.DB.prepare(`UPDATE telegram_star_sync_state SET last_started_at = ?, last_error = NULL, updated_at = ? WHERE id = 'default'`)
    .bind(startedAt, startedAt).run();

  try {
    const fetched = await fetchStarTransactionPages(env.TELEGRAM_BOT_TOKEN, options.fetcher, options);
    const syncedAt = new Date().toISOString();
    const parsed = await Promise.all(fetched.transactions.map((transaction) => parseStarTransaction(transaction, syncedAt)));
    let inserted = 0;

    for (let start = 0; start < parsed.length; start += 50) {
      const chunk = parsed.slice(start, start + 50);
      const results = await env.DB.batch(chunk.map((event) => env.DB.prepare(`INSERT OR IGNORE INTO telegram_star_transaction_events(
        event_key, content_hash, telegram_transaction_id, amount, nanostar_amount, transaction_date, direction, transaction_type,
        source_user_id, invoice_payload, affiliate_type, affiliate_user_id, affiliate_chat_id, affiliate_name,
        affiliate_commission_per_mille, affiliate_amount, affiliate_nanostar_amount, raw_payload, created_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(event.eventKey, event.contentHash, event.telegramTransactionId, event.amount, event.nanostarAmount, event.transactionDate,
          event.direction, event.transactionType, event.sourceUserId, event.invoicePayload, event.affiliateType, event.affiliateUserId,
          event.affiliateChatId, event.affiliateName, event.affiliateCommissionPerMille, event.affiliateAmount,
          event.affiliateNanostarAmount, event.rawPayload, event.createdAt, event.syncedAt)));
      inserted += results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
    }

    const invoicePayments = parsed.filter((event) => event.direction === "incoming" && event.transactionType === "invoice_payment");
    for (let start = 0; start < invoicePayments.length; start += 50) {
      const chunk = invoicePayments.slice(start, start + 50);
      await env.DB.batch(chunk.map((event) => env.DB.prepare(`UPDATE payments SET
        telegram_credited_amount = ?, telegram_credited_nanostar_amount = ?, has_affiliate = ?, affiliate_type = ?,
        affiliate_peer_id = ?, affiliate_name = ?, affiliate_commission_per_mille = ?, affiliate_amount = ?,
        affiliate_nanostar_amount = ?, invoice_payload = COALESCE(invoice_payload, ?)
        WHERE telegram_charge_id = ?`)
        .bind(event.amount, event.nanostarAmount, event.affiliateType ? 1 : 0, event.affiliateType,
          event.affiliateUserId || event.affiliateChatId, event.affiliateName, event.affiliateCommissionPerMille,
          event.affiliateAmount, event.affiliateNanostarAmount, event.invoicePayload, event.telegramTransactionId)));
    }

    const completedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE telegram_star_sync_state SET last_completed_at = ?, last_error = NULL, last_inserted = ?, updated_at = ? WHERE id = 'default'`)
      .bind(completedAt, inserted, completedAt).run();
    console.log(JSON.stringify({
      event: "telegram_star_transactions_synced",
      fetched: parsed.length,
      inserted,
      pages: fetched.pages,
      affiliateDetected: parsed.filter((event) => event.affiliateType !== null).length,
    }));
    return { fetched: parsed.length, inserted, pages: fetched.pages, completedAt };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE telegram_star_sync_state SET last_error = ?, updated_at = ? WHERE id = 'default'`)
      .bind(error instanceof Error ? error.message.slice(0, 500) : "unknown error", failedAt).run();
    throw error;
  }
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Telegram StarTransaction payload");
  return value as JsonRecord;
}

function recordOrNull(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value) throw new Error(`${name} is missing`);
  return value;
}

function requiredInteger(value: unknown, name: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} is invalid`);
  return Number(value);
}

function optionalInteger(value: unknown) {
  return Number.isSafeInteger(value) ? Number(value) : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function identifier(value: unknown) {
  return (typeof value === "string" && value) || Number.isSafeInteger(value) ? String(value) : null;
}

function userSnapshot(user: JsonRecord) {
  if (typeof user.username === "string" && user.username) return `@${user.username}`;
  return [user.first_name, user.last_name].filter((value): value is string => typeof value === "string" && Boolean(value)).join(" ") || null;
}

function chatSnapshot(chat: JsonRecord) {
  if (typeof chat.username === "string" && chat.username) return `@${chat.username}`;
  return typeof chat.title === "string" && chat.title ? chat.title : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
