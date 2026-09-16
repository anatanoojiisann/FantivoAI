export type InvoiceStatus = "paid" | "cancelled" | "failed" | "pending";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; auth_date?: number; hash?: string; start_param?: string };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  viewportHeight: number;
  viewportStableHeight: number;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm?(message: string, callback: (confirmed: boolean) => void): void;
  openTelegramLink?(url: string): void;
  openInvoice(url: string, callback?: (status: InvoiceStatus) => void): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export type TelegramContext = { webApp: TelegramWebApp; isTelegram: boolean };

function browserFallback(): TelegramWebApp {
  return {
    initData: "",
    initDataUnsafe: {},
    version: "browser",
    platform: "browser",
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,
    ready: () => undefined,
    expand: () => undefined,
    disableVerticalSwipes: () => undefined,
    setHeaderColor: () => undefined,
    setBackgroundColor: () => undefined,
    showAlert: (message, callback) => { window.alert(message); callback?.(); },
    showConfirm: (message, callback) => callback(window.confirm(message)),
    openTelegramLink: (url) => { window.location.assign(url); },
    openInvoice: (_url, callback) => {
      window.alert("充值需要在 Telegram 内打开应用后完成。");
      callback?.("cancelled");
    },
    HapticFeedback: {
      impactOccurred: () => navigator.vibrate?.(25),
      notificationOccurred: () => navigator.vibrate?.([25, 35, 25]),
      selectionChanged: () => navigator.vibrate?.(12),
    },
  };
}

export function telegramContext(): TelegramContext {
  const webApp = window.Telegram?.WebApp;
  // Platform is descriptive metadata. Only the server can validate initData.
  if (webApp?.initData) return { webApp, isTelegram: true };
  return { webApp: browserFallback(), isTelegram: false };
}

export function miniAppLaunchMode(isDevelopment: boolean, hasInitData: boolean) {
  return hasInitData ? "telegram" : isDevelopment ? "preview" : "blocked";
}
