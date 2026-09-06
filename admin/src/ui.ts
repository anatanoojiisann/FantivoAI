import type { JobStatus, PaymentStatus, UserStatus } from "./types";

const iconPaths: Record<string, string> = {
  overview: '<path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  jobs: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4V8Z"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h2"/>',
  configuration: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.35.7.6 1 .3.28.68.43 1.1.4H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
  analytics: '<path d="M3 3v18h18M7 16l4-5 4 3 5-7"/>',
  monitoring: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  arrowUp: '<path d="m18 15-6-6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

export function icon(name: string, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.more}</svg>`;
}

export function escapeHtml(value: string | number) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);
}

export function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

export function formatDate(value?: string, withTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(value));
}

export function durationBetween(start?: string, end?: string) {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const labels: Record<UserStatus | JobStatus | PaymentStatus | string, string> = {
  active: "正常",
  generation_restricted: "限制生成",
  disabled: "已停用",
  queued: "排队中",
  processing: "生成中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  credited: "已入账",
  refunding: "退款中",
  refunded: "已退款",
  exception: "异常",
  healthy: "正常",
  degraded: "性能下降",
  down: "不可用",
  matched: "一致",
  unmatched: "未匹配",
  duplicated: "重复",
  amount_mismatch: "金额异常",
  payment: "Stars 充值",
  generation: "生成扣费",
  refund: "任务退款",
  gift: "运营赠送",
  manual_adjustment: "人工调整",
};

export function labelFor(value: string) {
  return labels[value] || value;
}

export function badge(value: string) {
  const tone = ["succeeded", "credited", "active", "healthy", "matched"].includes(value)
    ? "success"
    : ["failed", "exception", "disabled", "down", "unmatched", "amount_mismatch"].includes(value)
      ? "danger"
      : ["queued", "processing", "refunding", "generation_restricted", "degraded"].includes(value)
        ? "warning"
        : "neutral";
  return `<span class="badge badge--${tone}"><i></i>${escapeHtml(labelFor(value))}</span>`;
}

export function pageHeader(eyebrow: string, title: string, description: string, actions = "") {
  return `<header class="page-header">
    <div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
    <div class="page-actions">${actions}</div>
  </header>`;
}

export function empty(message: string) {
  return `<div class="empty"><span>◇</span><strong>没有匹配结果</strong><p>${escapeHtml(message)}</p></div>`;
}
