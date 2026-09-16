import "./style.css";
import { acquisitionFromLaunch } from "./acquisition";
import { initAnalytics, track } from "./analytics";
import { initialLocale, isRtl, translate } from "./i18n";
import { miniAppLaunchMode, telegramContext } from "./telegram";

const { webApp, isTelegram } = telegramContext();
const launchMode = miniAppLaunchMode(import.meta.env.DEV, isTelegram);
const locale = initialLocale(webApp.initDataUnsafe.user?.language_code);
initAnalytics(launchMode !== "preview", acquisitionFromLaunch({ startParam: webApp.initDataUnsafe.start_param, url: location.href }));
track("mini_app_opened", { launch_mode: launchMode, language: locale, telegram_platform: webApp.platform });

if (launchMode === "blocked") {
  track("mini_app_launch_blocked", { reason: "missing_telegram_context" });
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
  const root = document.querySelector<HTMLDivElement>("#app")!;
  const panel = document.createElement("main");
  panel.className = "app-shell empty-state";
  const title = document.createElement("h1");
  title.textContent = "Fantivo AI";
  const message = document.createElement("p");
  message.textContent = translate(locale, "errorUnauthorized");
  const link = document.createElement("a");
  link.href = "https://t.me/fantivo_bot/app";
  link.className = "primary-button";
  link.textContent = translate(locale, "openTelegram");
  panel.append(title, message, link);
  root.replaceChildren(panel);
} else {
  void import("./main").catch(() => {
    track("mini_app_bootstrap_failed", { error_code: "app_load_failed", initial: true });
    const root = document.querySelector<HTMLDivElement>("#app")!;
    root.textContent = translate(locale, "errorRequest");
    const retry = document.createElement("button");
    retry.textContent = translate(locale, "retry");
    retry.onclick = () => location.reload();
    root.append(retry);
  });
}
