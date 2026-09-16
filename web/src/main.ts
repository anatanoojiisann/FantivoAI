import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/fill";
import { acquisitionFromLaunch } from "./acquisition";
import { analyticsConfigured, appSessionId, flushAnalytics, identifyUser, track } from "./analytics";
import { ApiError, MiniAppApi, type Bootstrap, type Content, type HomeFeed, type HomeItem, type Job } from "./api";
import { apiErrorPresentation, jobFailurePresentation } from "./error-copy";
import { initialLocale, isRtl, LOCALE_NAMES, saveLocale, SUPPORTED_LOCALES, translate, type Locale } from "./i18n";
import { IDLE_SUBSCRIPTION_PURCHASE, reduceSubscriptionPurchase, type SubscriptionPurchaseEvent } from "./subscription-purchase";
import { telegramContext } from "./telegram";
import { JobLifecycle } from "./job-lifecycle";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root element was not found");

const { webApp, isTelegram } = telegramContext();
const acquisition = acquisitionFromLaunch({
  startParam: webApp.initDataUnsafe.start_param,
  url: window.location.href,
});
let locale: Locale = initialLocale(webApp.initDataUnsafe.user?.language_code);
const t = (key: Parameters<typeof translate>[1], variables?: Record<string, string | number>) => translate(locale, key, variables);
document.documentElement.lang = locale;
document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
document.documentElement.dataset.locale = locale;
try {
  webApp.ready();
  webApp.expand();
  webApp.disableVerticalSwipes?.();
  webApp.setHeaderColor?.("#08080d");
  webApp.setBackgroundColor?.("#08080d");
} catch { /* Optional Telegram presentation APIs must not block bootstrap. */ }

const api = isTelegram ? new MiniAppApi(webApp.initData, appSessionId) : null;
const demoAllowed = import.meta.env.DEV && !isTelegram;
let data: Bootstrap | null = null;
let mode: "text" | "image" = "text";
let selectedAspectRatio = "9:16";
let selectedDurationSeconds = 5;
let selectedFile: File | null = null;
let previewUrl = "";
let pendingRequestId = "";
let submitting = false;
let subscriptionPurchase = IDLE_SUBSCRIPTION_PURCHASE;
type WalletProductMode = "subscriptions" | "credits";
let walletProductMode: WalletProductMode = "subscriptions";
let bootstrapLoading = false;
let bootstrapError: unknown = null;
let authenticationFailed = false;
let jobLifecycle: JobLifecycle | null = null;
let jobsRefreshing = false;
let jobsRefreshFailures = 0;
let nextJobsRefreshAt = 0;
let homeFeed: HomeFeed | null = null;
let homeLoading = true;
let homeFailed = false;
let homeRequestVersion = 0;
let activeHomeCategoryId = "";
let welcomeChecked = false;
let detailContent: Content | null = null;
let selectedContent: Content | null = null;
let selectedPersonaCode = "";
let selectedContentPersonaCode = "";
let activeJobVideo: Job | null = null;
type JobFilter = "all" | "completed" | "inProgress" | "failed";
let activeJobFilter: JobFilter = "all";
let detailRequestVersion = 0;
let detailOpenedAt = 0;
let detailCloseReason: "back" | "creator" | "escape" | "programmatic" = "programmatic";
let jobDetailOpenedAt = 0;
let jobDetailCloseReason: "back" | "escape" | "programmatic" = "programmatic";
let pendingPublicationRequestId = "";
let publicationSubmitting = false;
const submittedPublicationJobs = new Set<string>();
let feedObserver: IntersectionObserver | null = null;
const trackedFeedItems = new Set<string>();
const trackedFeedSections = new Set<string>();
const trackedEmptyFeedSessions = new Set<string>();
const trackedAppSections = new Set<string>();
const APP_PAGES = ["home", "create", "jobs", "wallet"] as const;
const CREATION_TEMPLATES_CATEGORY_ID = "ready-to-create";
type AppPage = typeof APP_PAGES[number];
let activePage: AppPage = pageFromLocation();
let feedSessionId = savedFeedSessionId();
const languageOptions = SUPPORTED_LOCALES.map((value) => `
  <button
    class="language-menu__item${value === locale ? " is-selected" : ""}"
    type="button"
    role="menuitemradio"
    aria-checked="${value === locale}"
    data-locale="${value}"
    tabindex="-1"
  >
    <span lang="${value}">${LOCALE_NAMES[value]}</span>
    <i class="ph ph-check" aria-hidden="true"></i>
  </button>
`).join("");

root.innerHTML = `
  <div class="ambient ambient--one" aria-hidden="true"></div>
  <div class="ambient ambient--two" aria-hidden="true"></div>
  <main class="app-shell">
    <header class="topbar">
      <button class="brand" type="button" data-page-target="home" data-navigation-source="brand" aria-label="${t("brandHome")}">
        <img class="brand__mark" src="/assets/fantivo-mark.png" alt="" aria-hidden="true" />
        <strong>Fantivo AI</strong>
      </button>
      <div class="topbar__actions">
        <div class="language-control">
          <button
            id="language-trigger"
            class="language-picker"
            type="button"
            aria-label="${t("language")}: ${LOCALE_NAMES[locale]}"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-controls="language-menu"
          >
            <i class="ph ph-globe-simple" aria-hidden="true"></i>
          </button>
          <div id="language-menu" class="language-menu" role="menu" aria-label="${t("language")}" hidden>
            ${languageOptions}
          </div>
        </div>
        <button id="wallet-open" class="balance-pill" type="button" data-page-target="wallet" data-navigation-source="balance" data-wallet-entry="balance" aria-label="${t("walletAria")}">
          <i class="ph-fill ph-star balance-pill__spark" aria-hidden="true"></i>
          <span id="balance-value">—</span>
          <small id="balance-caption">${t("credits")}</small>
        </button>
      </div>
    </header>

    <section id="home" class="app-page feed-section" data-app-page="home" aria-labelledby="explore-title">
      <section class="explore-intro">
        <div>
          <p class="explore-intro__eyebrow">${t("exploreEyebrow")}</p>
          <h1 id="explore-title">${t("exploreTitle")}</h1>
        </div>
        <button class="explore-intro__create" type="button" data-page-target="create" data-navigation-source="home_explore_cta">
          <i class="ph ph-plus" aria-hidden="true"></i><span>${t("create")}</span>
        </button>
      </section>
      <div id="persona-selector" class="persona-selector" role="tablist" aria-label="${t("choosePersona")}" hidden></div>
      <div id="feed-content" class="feed-content" aria-live="polite">
        <div class="feed-skeleton"><i></i><i></i><i></i></div>
      </div>
    </section>

    <section id="create" class="app-page create-section" data-app-page="create" hidden>
      <div class="studio-heading">
        <h2>${t("create")}</h2>
      </div>
      <form id="create-form" class="composer">
        <div id="create-service-message" class="create-service-message" role="status" aria-live="polite" hidden>
          <span id="create-service-message-text"></span>
          <button id="create-service-retry" type="button">${t("retry")}</button>
        </div>

        <div class="mode-switch" role="tablist" aria-label="${t("generationMode")}">
          <button class="mode-switch__button is-active" data-mode="text" type="button" role="tab" aria-selected="true" tabindex="0">${t("textToVideo")}</button>
          <button class="mode-switch__button" data-mode="image" type="button" role="tab" aria-selected="false" tabindex="-1">${t("imageToVideo")}</button>
        </div>

        <div id="content-selection" class="content-selection" hidden>
          <img id="content-selection-image" src="/assets/fantivo-style-cinematic.jpg" alt="" hidden />
          <i class="ph ph-film-strip content-selection__icon" aria-hidden="true"></i>
          <span class="content-selection__copy"><small id="content-selection-kind"></small><strong id="content-selection-title"></strong></span>
          <button id="content-selection-remove" type="button" aria-label="${t("close")}"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>

        <label id="image-field" class="image-field" hidden>
          <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp" />
          <span id="image-empty" class="image-field__empty">
            <i class="ph ph-image-square" aria-hidden="true"></i><strong>${t("addImage")}</strong><small>${t("imageFormats")}</small>
          </span>
          <span id="image-preview-wrap" class="image-field__preview" hidden>
            <img id="image-preview" src="/assets/fantivo-studio-portrait.jpg" alt="${t("selectedImage")}" />
            <button id="image-remove" type="button" aria-label="${t("removeImage")}"><i class="ph ph-x" aria-hidden="true"></i></button>
          </span>
        </label>

        <label class="prompt-field">
          <span class="prompt-field__label">${t("promptLabel")}</span>
          <textarea id="prompt" rows="5" maxlength="1000" placeholder="${t("promptPlaceholder")}"></textarea>
          <span id="prompt-count" class="prompt-field__count">0 / 1000</span>
        </label>

        <div class="generation-meta" aria-label="${t("generationParams")}">
          <div id="aspect-ratio-control" class="aspect-ratio-control">
            <button
              id="aspect-ratio-trigger"
              class="generation-meta__choice"
              type="button"
              aria-label="${t("aspectRatioLabel")}: 9:16 · ${t("portrait")}"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-controls="aspect-ratio-menu"
            >
              <i class="ph ph-device-mobile" aria-hidden="true"></i>
              <span id="aspect-ratio-value">9:16 · ${t("portrait")}</span>
              <i class="ph ph-caret-down generation-meta__caret" aria-hidden="true"></i>
            </button>
            <div id="aspect-ratio-menu" class="aspect-ratio-menu" role="listbox" aria-label="${t("aspectRatioLabel")}" hidden></div>
          </div>
          <div id="duration-control" class="duration-control">
            <button
              id="duration-trigger"
              class="generation-meta__choice"
              type="button"
              aria-label="${t("duration")}: 5s"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-controls="duration-menu"
            >
              <i class="ph ph-timer" aria-hidden="true"></i>
              <span id="duration-value">5s</span>
              <i class="ph ph-caret-down generation-meta__caret" aria-hidden="true"></i>
            </button>
            <div id="duration-menu" class="duration-menu" role="listbox" aria-label="${t("duration")}" hidden></div>
          </div>
          <span><i class="ph ph-sparkle" aria-hidden="true"></i><b id="quality-value">${t("standard")}</b></span>
        </div>

        <button id="create-button" class="primary-button" type="submit" disabled>
          <span class="primary-button__copy">
            <span class="primary-button__label">${t("generate")}</span>
            <small id="generation-credit-cost" class="primary-button__cost" hidden></small>
          </span>
          <i class="ph ph-arrow-right" aria-hidden="true"></i>
        </button>
      </form>
      <section id="create-templates" class="explore-templates create-templates" aria-labelledby="create-templates-title" hidden></section>
    </section>

    <section id="jobs" class="app-page jobs-section" data-app-page="jobs" hidden>
      <div class="section-title">
        <h2>${t("recentCreations")}</h2>
        <button id="jobs-refresh" class="icon-button" type="button" aria-label="${t("refreshJobs")}"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i></button>
      </div>
      <div id="jobs-filters" class="jobs-filters" role="group" aria-label="${t("filterCreations")}"></div>
      <p id="jobs-refresh-error" role="status" hidden></p>
      <div id="jobs-list" class="jobs-list" aria-live="polite">
        <article class="job-card job-card--loading"><div></div><div></div><div></div></article>
      </div>
    </section>

    <section id="wallet" class="app-page wallet-page" data-app-page="wallet" hidden>
      <div class="wallet-sheet">
        <div class="wallet-total"><span>${t("currentBalance")}</span><strong id="dialog-balance">—</strong><small>${t("credits")}</small></div>
        <section id="referral-section" class="referral-section" hidden>
          <header class="referral-section__header"><h3>${t("inviteTitle")}</h3><span id="referral-weekly" class="referral-weekly"></span></header>
          <article class="referral-card">
            <i class="ph-fill ph-gift" aria-hidden="true"></i>
            <div><strong id="referral-reward">—</strong><p>${t("inviteDescription")}</p></div>
            <div class="referral-card__actions">
              <button id="referral-share" type="button"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i><span>${t("inviteFriends")}</span></button>
              <button id="referral-copy" class="referral-copy" type="button"><i class="ph ph-copy" aria-hidden="true"></i><span>${t("copyInviteLink")}</span></button>
            </div>
          </article>
          <details class="referral-details">
            <summary><strong>${t("inviteHistory")}</strong><span>${t("inviteLatest")}</span><i class="ph ph-caret-down" aria-hidden="true"></i></summary>
            <section class="referral-history" aria-label="${t("inviteHistory")}"><div id="referral-records"></div></section>
            <p class="referral-rules"><i class="ph ph-shield-check" aria-hidden="true"></i><span>${t("inviteRules")}</span></p>
          </details>
        </section>
        <div id="wallet-mode-switch" class="wallet-mode-switch" role="tablist" aria-label="${t("topUp")}">
          <button id="wallet-mode-subscriptions" class="wallet-mode-switch__button is-active" data-wallet-product-mode="subscriptions" type="button" role="tab" aria-controls="subscription-section" aria-selected="true" tabindex="0">${t("subscribe")}</button>
          <button id="wallet-mode-credits" class="wallet-mode-switch__button" data-wallet-product-mode="credits" type="button" role="tab" aria-controls="credit-packs-section" aria-selected="false" tabindex="-1">${t("buyCredits")}</button>
        </div>
        <section id="subscription-section" class="wallet-products wallet-products--subscriptions" hidden>
          <header class="wallet-products__header"><h3>${t("chooseSubscription")}</h3></header>
          <div id="subscription-status" class="subscription-status" hidden></div>
          <div id="subscription-plans" class="subscription-plans"></div>
          <p class="subscription-renewal-note">${t("autoRenewNotice")}</p>
        </section>
        <section id="credit-packs-section" class="wallet-products wallet-products--credits">
          <header class="wallet-products__header"><h3>${t("buyCredits")}</h3></header>
          <div id="credit-packs" class="credit-packs"></div>
        </section>
      </div>
    </section>
  </main>

  <nav class="bottom-nav" aria-label="${t("mainNavigation")}">
    <button class="is-active" type="button" data-page-target="home" data-navigation-source="bottom_navigation" aria-controls="home"><i class="ph ph-house" aria-hidden="true"></i><span>${t("home")}</span></button>
    <button type="button" data-page-target="create" data-navigation-source="bottom_navigation" aria-controls="create"><i class="ph ph-plus" aria-hidden="true"></i><span>${t("create")}</span></button>
    <button type="button" data-page-target="jobs" data-navigation-source="bottom_navigation" aria-controls="jobs"><i class="ph ph-film-strip" aria-hidden="true"></i><span>${t("works")}</span></button>
    <button id="buy-more" type="button" data-page-target="wallet" data-navigation-source="bottom_navigation" data-wallet-entry="bottom_navigation" aria-controls="wallet"><i class="ph ph-star" aria-hidden="true"></i><span>${t("topUp")}</span></button>
  </nav>

  <dialog id="welcome-dialog" class="welcome-dialog" aria-labelledby="welcome-title" aria-describedby="welcome-description">
    <article class="welcome-sheet">
      <div class="welcome-sheet__handle" aria-hidden="true"></div>
      <header>
        <h2 id="welcome-title">${t("welcomeTitle")}</h2>
        <p id="welcome-description">${t("welcomeDescription")}</p>
      </header>
      <img src="/assets/fantivo-editorial-hero.jpg" alt="" aria-hidden="true" />
      <div class="welcome-sheet__gift"><i class="ph-fill ph-gift" aria-hidden="true"></i><span id="welcome-gift-copy"></span></div>
      <button id="welcome-start" class="welcome-sheet__primary" type="button">${t("welcomeStart")}<i class="ph ph-arrow-right" aria-hidden="true"></i></button>
      <button id="welcome-explore" class="welcome-sheet__secondary" type="button">${t("welcomeExplore")}</button>
    </article>
  </dialog>

  <dialog id="template-dialog" class="template-dialog" aria-labelledby="template-detail-title">
    <article class="template-detail">
      <header class="template-detail__header">
        <button id="template-close" class="template-detail__back" type="button" aria-label="${t("back")}"><i class="ph ph-arrow-left" aria-hidden="true"></i></button>
        <strong id="template-detail-kind">${t("templateDetail")}</strong>
        <span aria-hidden="true"></span>
      </header>
      <div class="template-detail__media">
        <video id="template-detail-video" controls playsinline muted loop preload="metadata" hidden></video>
        <img id="template-detail-image" src="/assets/fantivo-editorial-hero.jpg" alt="" hidden />
        <div id="template-detail-placeholder" class="template-detail__placeholder" hidden><i class="ph ph-image-broken" aria-hidden="true"></i><span>${t("previewUnavailable")}</span></div>
      </div>
      <div class="template-detail__body">
        <div class="template-detail__scroll">
          <h2 id="template-detail-title"></h2>
          <p id="template-detail-description" hidden></p>
          <div id="template-detail-meta" class="template-detail__meta" hidden></div>
          <section id="template-detail-prompt" class="template-detail__prompt" hidden>
            <strong>${t("promptTitle")}</strong>
            <p id="template-detail-prompt-text"></p>
          </section>
          <section id="template-detail-reference" class="template-detail__reference" hidden>
            <strong id="template-detail-reference-label">${t("inputImage")}</strong>
            <img id="template-detail-reference-image" src="/assets/fantivo-editorial-hero.jpg" alt="${t("inputImage")}" />
          </section>
          <div id="template-detail-availability" class="template-detail__availability" hidden></div>
          <div id="template-detail-loading" class="template-detail__loading" aria-hidden="true"><i></i><i></i></div>
        </div>
        <button id="template-open-creator" class="primary-button" type="button"><span>${t("openCreator")}</span><i class="ph ph-arrow-right" aria-hidden="true"></i></button>
      </div>
    </article>
  </dialog>

  <dialog id="job-video-dialog" class="job-video-dialog" aria-labelledby="job-detail-heading">
    <article class="job-video-page">
      <header class="job-video-page__header">
        <button id="job-video-close" class="job-video-page__back" type="button" aria-label="${t("back")}"><i class="ph ph-arrow-left" aria-hidden="true"></i></button>
        <strong id="job-detail-heading">${t("creationDetails")}</strong>
        <span aria-hidden="true"></span>
      </header>
      <div id="job-detail-scroll" class="job-video-page__scroll" tabindex="0">
        <section id="job-video-player-section" class="job-video-page__player" aria-label="${t("outputVideo")}" hidden>
          <video id="job-video-player" playsinline preload="metadata"></video>
          <div id="job-player-controls" class="job-player-controls" aria-label="${t("playbackControls")}">
            <button id="job-player-toggle" type="button">${t("playVideo")}</button>
            <span id="job-player-current">0:00</span>
            <input id="job-player-progress" type="range" min="0" max="1000" value="0" aria-label="${t("seekVideo")}" />
            <span id="job-player-duration">0:00</span>
            <button id="job-player-mute" type="button">${t("muteVideo")}</button>
          </div>
          <p id="job-video-error" hidden>${t("genericError")}</p>
        </section>
        <nav id="job-output-actions" class="job-output-actions" aria-label="${t("creationDetails")}" hidden>
          <button id="job-download" type="button">${t("downloadVideo")}</button>
          <button id="job-publish-open" class="is-primary" type="button">${t("publishVideo")}</button>
          <button id="job-share" type="button">${t("shareVideo")}</button>
          <button id="job-create-again" type="button">${t("createAgain")}</button>
        </nav>
        <p id="job-publication-status" class="job-publication-status" role="status" hidden></p>
        <form id="job-publish-form" class="job-detail-card job-publish-form" hidden>
          <h3>${t("publishWork")}</h3>
          <label><span>${t("publishTitle")}</span><input id="job-publish-title" type="text" minlength="2" maxlength="100" required /></label>
          <label><span>${t("publishDescription")}</span><textarea id="job-publish-description" rows="3" maxlength="1000"></textarea></label>
          <label><span>${t("publishTags")}</span><input id="job-publish-tags" type="text" maxlength="320" placeholder="${t("publishTagsHint")}" /></label>
          <div class="job-publish-form__actions">
            <button id="job-publish-cancel" type="button">${t("cancelPublish")}</button>
            <button id="job-publish-submit" class="is-primary" type="submit">${t("submitForReview")}</button>
          </div>
        </form>
        <div class="job-video-page__summary">
          <span id="job-detail-status" class="job-status"></span>
          <h2 id="job-video-title"></h2>
        </div>
        <section class="job-detail-card job-detail-card--prompt">
          <header><h3>${t("promptTitle")}</h3><button id="job-prompt-copy" type="button">${t("copyPrompt")}</button></header>
          <p id="job-prompt-text"></p>
          <img id="job-input-image" src="/assets/fantivo-studio-portrait.jpg" alt="${t("inputImage")}" hidden />
        </section>
        <section class="job-detail-card job-detail-card--details">
          <h3>${t("detailsTitle")}</h3>
          <dl id="job-detail-list"></dl>
        </section>
      </div>
    </article>
  </dialog>

  <div id="toast" class="toast" role="status" aria-live="polite">
    <i id="toast-icon" class="ph ph-check-circle" aria-hidden="true"></i>
    <span id="toast-message"></span>
  </div>
`;

const promptInput = element<HTMLTextAreaElement>("prompt");
const createButton = element<HTMLButtonElement>("create-button");
const generationCreditCost = element<HTMLElement>("generation-credit-cost");
const aspectRatioControl = element<HTMLElement>("aspect-ratio-control");
const aspectRatioTrigger = element<HTMLButtonElement>("aspect-ratio-trigger");
const aspectRatioValue = element<HTMLElement>("aspect-ratio-value");
const aspectRatioMenu = element<HTMLElement>("aspect-ratio-menu");
const durationControl = element<HTMLElement>("duration-control");
const durationTrigger = element<HTMLButtonElement>("duration-trigger");
const durationValue = element<HTMLElement>("duration-value");
const durationMenu = element<HTMLElement>("duration-menu");
const imageField = element<HTMLElement>("image-field");
const imageInput = element<HTMLInputElement>("image-input");
const imagePreviewWrap = element<HTMLElement>("image-preview-wrap");
const imagePreview = element<HTMLImageElement>("image-preview");
const imageEmpty = element<HTMLElement>("image-empty");
const templateDialog = element<HTMLDialogElement>("template-dialog");
const jobVideoDialog = element<HTMLDialogElement>("job-video-dialog");
const welcomeDialog = element<HTMLDialogElement>("welcome-dialog");

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Element #${id} was not found`);
  return value as T;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);
}

function isAppPage(value: string): value is AppPage {
  return (APP_PAGES as readonly string[]).includes(value);
}

function pageFromLocation(): AppPage {
  const value = window.location.hash.replace(/^#/, "");
  return isAppPage(value) ? value : "home";
}

function navigateToPage(nextPage: AppPage, source: string, historyMode: "push" | "replace" | "none" = "push") {
  const previousPage = activePage;
  const pageChanged = previousPage !== nextPage || source === "initial";
  activePage = nextPage;
  document.documentElement.dataset.page = nextPage;
  document.querySelectorAll<HTMLElement>("[data-app-page]").forEach((page) => {
    const active = page.dataset.appPage === nextPage;
    page.hidden = !active;
    page.setAttribute("aria-hidden", String(!active));
  });
  document.querySelectorAll<HTMLButtonElement>(".bottom-nav [data-page-target]").forEach((button) => {
    const active = button.dataset.pageTarget === nextPage;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (historyMode === "push" && (previousPage !== nextPage || window.location.hash !== `#${nextPage}`)) {
    window.history.pushState({ page: nextPage }, "", `#${nextPage}`);
  } else if (historyMode === "replace") {
    window.history.replaceState({ page: nextPage }, "", `#${nextPage}`);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  trackAppSection(nextPage);
  if (nextPage === "create" && pageChanged) {
    track("creation_viewed", {
      entry_point: source,
      previous_page: previousPage,
      mode,
      data_ready: Boolean(data),
      has_source_content: Boolean(selectedContent),
      source_content_kind: selectedContent?.kind || "",
      locale,
      telegram_platform: webApp.platform,
    });
  }
  if (source !== "initial" && source !== "browser_history") {
    track("mini_app_navigation_clicked", { destination: nextPage, source, locale });
    webApp.HapticFeedback?.selectionChanged();
  }
  if (nextPage === "home") observeHomeFeed();
  else feedObserver?.disconnect();
}

function savedFeedSessionId() {
  try {
    const existing = sessionStorage.getItem("aurax_feed_session") || "";
    if (/^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing;
  } catch { /* session storage may be unavailable */ }
  return replaceFeedSessionId();
}

function replaceFeedSessionId() {
  const value = crypto.randomUUID();
  try { sessionStorage.setItem("aurax_feed_session", value); } catch { /* session storage may be unavailable */ }
  return value;
}

function mockHomeFeed(personaCode = "creator"): HomeFeed {
  return {
    schemaVersion: 2,
    personaCode,
    feedSessionId,
    rankingVersion: "preview-v1",
    banners: [
      {
        id: "unsupported-skyline", kind: "template", title: "Cinematic Reverie",
        previewUrl: "/assets/fantivo-editorial-hero.jpg",
        videoUrl: "https://media.pixverse.ai/asset%2Ftemplate%2Fskylineorbitflag_260703.mp4",
      },
      { id: "banner-motion", kind: "template", title: "Portraits in motion", previewUrl: "/assets/fantivo-studio-portrait.jpg" },
    ],
    categories: [
      { id: CREATION_TEMPLATES_CATEGORY_ID, title: "Ready to create", itemCount: 3 },
      { id: "cinematic", title: "Cinematic", itemCount: 3 },
      { id: "portrait", title: "Portrait", itemCount: 2 },
      { id: "travel", title: "Travel", itemCount: 2 },
    ],
    sections: [
      { categoryId: CREATION_TEMPLATES_CATEGORY_ID, title: "Ready to create", items: [
        { id: "cinematic-portrait", kind: "template", title: "Cinematic portrait", previewUrl: "/assets/fantivo-editorial-hero.jpg" },
        { id: "dream-drift", kind: "template", title: "Dream drift", previewUrl: "/assets/fantivo-style-dream.jpg" },
        { id: "neon-pulse", kind: "template", title: "Neon pulse", previewUrl: "/assets/fantivo-style-pulse.jpg" },
      ] },
      { categoryId: "cinematic", title: "Cinematic inspiration", items: [
        { id: "neon-city", kind: "template", title: "Cinematic", previewUrl: "/assets/fantivo-style-cinematic.jpg" },
        { id: "desert-film", kind: "template", title: "Dream", previewUrl: "/assets/fantivo-style-dream.jpg" },
        { id: "ocean-drone", kind: "asset", title: "Pulse", previewUrl: "/assets/fantivo-style-pulse.jpg", canMakeSimilar: true },
      ] },
      { categoryId: "portrait", title: "Portrait motion", items: [
        { id: "studio-light", kind: "template", title: "Soft studio light", previewUrl: "/assets/fantivo-studio-portrait.jpg" },
        { id: "street-style", kind: "asset", title: "Street style movement", previewUrl: "/assets/fantivo-style-pulse.jpg", canMakeSimilar: true },
      ] },
    ],
  };
}

function mockData(): Bootstrap {
  const previewSubscription = new URLSearchParams(window.location.search).get("subscription");
  const previewSubscriptionExpiresAt = Math.floor(Date.now() / 1_000) + 12 * 86_400;
  return {
    user: { id: 10001, firstName: "Steven", lastName: "", username: "preview", languageCode: "zh" },
    wallet: { balance: 1240, version: 1 },
    newUserGift: { credits: 300, grantedNow: true },
    referral: {
      enabled: true, code: "inv_preview0001", rewardCredits: 100, weeklyLimit: 5, rewardedThisWeek: 1, remainingRewards: 4,
      shareUrl: "https://t.me/fantivo_bot/app?startapp=ref--inv_preview0001",
      records: [{ status: "rewarded", registeredAt: "2026-08-18T09:30:00.000Z", qualifiedAt: "2026-08-18T10:01:00.000Z", rewardedAt: "2026-08-18T10:01:00.000Z", rewardCredits: 100 }],
    },
    legal: { termsVersion: "2026-08-04", termsUrl: "/terms", privacyUrl: "/privacy" },
    creditPacks: [
      { id: "starter", title: "Starter Pack", description: "500 credits", stars: 100, credits: 500 },
      { id: "creator", title: "Creator Pack", description: "1,800 credits", stars: 300, credits: 1800 },
      { id: "studio", title: "Studio Pack", description: "7,000 credits", stars: 1000, credits: 7000 },
    ],
    subscriptionPlans: [
      { id: "standard", title: "Standard", description: "A steady credit allowance for regular creation", stars: 250, creditsPerCycle: 1000, periodSeconds: 2_592_000, recommended: false },
      { id: "pro", title: "Pro", description: "More credits for frequent creators", stars: 650, creditsPerCycle: 3000, periodSeconds: 2_592_000, recommended: true },
      { id: "ultimate", title: "Ultimate", description: "High-volume credits every 30 days", stars: 4000, creditsPerCycle: 30000, periodSeconds: 2_592_000, recommended: false },
    ],
    subscription: previewSubscription === "active" || previewSubscription === "canceled" ? {
      planId: "pro",
      status: "active",
      startedAt: new Date(Date.now() - 18 * 86_400_000).toISOString(),
      renewedAt: new Date(Date.now() - 18 * 86_400_000).toISOString(),
      expiresAt: previewSubscriptionExpiresAt,
      isCanceled: previewSubscription === "canceled",
    } : null,
    subscriptionAvailable: true,
    primaryPersonaCode: "creator",
    personas: [
      { personaCode: "creator", title: "Creator", primary: true },
      { personaCode: "cinematic", title: "Cinematic", primary: false },
      { personaCode: "portrait", title: "Portrait", primary: false },
    ],
    generation: { model: "peach-max", durationSeconds: 5, durationOptions: [5, 10], aspectRatio: "9:16", aspectRatios: ["9:16", "16:9", "1:1"], creditCost: 300, quality: "standard", maxPromptLength: 1000, maxImageBytes: 10_485_760 },
    jobs: [
      {
        id: "job_city_7k2", status: "succeeded", progress: 100, mode: "image-to-video", model: "peach-max", providerModel: "peach-max-v2", seed: "53446c1fb5", creditCost: 300,
        prompt: "A clearly adult Japanese punk woman playing a claw machine in a neon Japanese arcade, preserving the exact face, outfit, hairstyle and location from the reference image.",
        imageUrl: "https://s3.aurax.one/media/template_preview_aurax-template-411563216524736.webp", createdAt: "2026-08-05T05:38:00.000Z", updatedAt: "2026-08-05T05:39:42.000Z",
        completedAt: "2026-08-05T05:39:42.000Z", quality: "standard", durationSeconds: 5, aspectRatio: "9:16", audioEnabled: false, creditsRefunded: false,
        outputUrl: import.meta.env.DEV ? "http://127.0.0.1:4181/aurax-qa-video.mp4" : undefined,
      },
      {
        id: "job_ocean_4m8", status: "processing", progress: 68, mode: "text-to-video", model: "peach-max", creditCost: 300,
        prompt: "A quiet ocean at blue hour, cinematic drone movement.", createdAt: "2026-08-05T06:12:00.000Z", quality: "standard", durationSeconds: 5, aspectRatio: "9:16", audioEnabled: false,
      },
    ],
  };
}

async function loadBootstrap(quiet = false) {
  if (bootstrapLoading || authenticationFailed) return;
  bootstrapLoading = true;
  const startedAt = performance.now();
  const initial = !data;
  track("mini_app_bootstrap_started", { initial });
  try {
    const hadData = Boolean(data);
    if (!api && !demoAllowed) throw new ApiError("unauthorized", "", 401);
    const loaded = api ? await api.bootstrap() : mockData();
    // A background wallet refresh must not overwrite newer creation/status data.
    if (hadData && data) loaded.jobs = data.jobs;
    data = loaded;
    bootstrapError = null;
    if (!jobLifecycle) {
      let storage: Storage | undefined;
      try { storage = sessionStorage; } catch { /* Storage is optional. */ }
      jobLifecycle = new JobLifecycle(track, storage, `fantivo_job_lifecycle_${data.user.id}`);
    }
    jobLifecycle.observe(data.jobs);
    if (!hadData && data) {
      selectedAspectRatio = data.generation.aspectRatio;
      selectedDurationSeconds = data.generation.durationSeconds;
    }
    const allowedPersonaCodes = new Set(data.personas.map((persona) => persona.personaCode));
    if (!selectedPersonaCode || !allowedPersonaCodes.has(selectedPersonaCode)) {
      selectedPersonaCode = allowedPersonaCodes.has(data.primaryPersonaCode)
        ? data.primaryPersonaCode
        : data.personas.find((persona) => persona.primary)?.personaCode || data.personas[0]?.personaCode || "";
    }
    if (data.subscription && subscriptionPurchase.phase !== "idle") {
      subscriptionPurchase = reduceSubscriptionPurchase(subscriptionPurchase, { type: "subscription_observed" });
    }
    if (isTelegram) {
      identifyUser(data.user.id, {
        language: data.user.languageCode || locale,
        telegram_platform: webApp.platform,
      }, {
        first_touch_source: acquisition.acquisition_source,
        first_touch_medium: acquisition.acquisition_medium,
        first_touch_campaign: acquisition.acquisition_campaign,
        first_touch_content: acquisition.acquisition_content,
        first_touch_is_referred: acquisition.acquisition_is_referred,
        first_touch_start_param: acquisition.telegram_start_param,
        first_touch_at: new Date().toISOString(),
      });
    }
    track("mini_app_initialized", { initial, duration_ms: Math.round(performance.now() - startedAt), ...acquisition });
    renderData();
    if (!quiet) showWelcomeForEligibleUser();
  } catch (error) {
    bootstrapError = error;
    console.error(JSON.stringify({ event: "mini_app_bootstrap_failed", ...analyticsError(error) }));
    track("mini_app_bootstrap_failed", { ...analyticsError(error), initial, duration_ms: Math.round(performance.now() - startedAt) });
    if (!handleAuthenticationFailure(error)) {
      if (!quiet) renderFatal(error);
      else toast(messageOf(error), "error");
    }
  } finally {
    bootstrapLoading = false;
    updateSubmitState();
  }
}

type HomeLoadReason = "initial" | "refresh" | "retry" | "persona";

async function loadHome(reason: HomeLoadReason = "initial") {
  if (!api && !demoAllowed) return;
  const requestVersion = ++homeRequestVersion;
  if (reason === "refresh" || reason === "persona") feedSessionId = replaceFeedSessionId();
  const startedAt = performance.now();
  homeLoading = true;
  homeFailed = false;
  renderHome();
  try {
    if (api) {
      const creationTemplatesStartedAt = performance.now();
      const [feed, creationTemplates] = await Promise.all([
        api.home(locale, feedSessionId, selectedPersonaCode),
        api.creationTemplates(locale, selectedPersonaCode)
          .then((result) => {
            track("creation_templates_loaded", {
              template_count: result.templates.length,
              available_template_count: result.templates.filter((template) => template.canCreate && (template.requiredImageCount || 0) <= 1).length,
              load_duration_ms: Math.round(performance.now() - creationTemplatesStartedAt),
              locale,
            });
            return result;
          })
          .catch((error) => {
            track("creation_templates_failed", {
              ...analyticsError(error),
              load_duration_ms: Math.round(performance.now() - creationTemplatesStartedAt),
              locale,
            });
            return { templates: [] };
          }),
      ]);
      if (requestVersion !== homeRequestVersion) return;
      homeFeed = withCreationTemplates(feed, creationTemplates.templates);
      selectedPersonaCode = feed.personaCode;
    } else {
      if (requestVersion !== homeRequestVersion) return;
      homeFeed = mockHomeFeed(selectedPersonaCode || "creator");
      selectedPersonaCode = homeFeed.personaCode;
    }
    if (/^[a-zA-Z0-9_-]{8,80}$/.test(homeFeed.feedSessionId)) {
      feedSessionId = homeFeed.feedSessionId;
      try { sessionStorage.setItem("aurax_feed_session", feedSessionId); } catch { /* session storage may be unavailable */ }
    }
    track("personalized_feed_loaded", {
      banner_count: homeFeed.banners.length,
      category_count: homeFeed.categories.length,
      section_count: homeFeed.sections.length,
      load_reason: reason,
      load_duration_ms: Math.round(performance.now() - startedAt),
      ...homeFeedProperties(),
    });
  } catch (error) {
    if (requestVersion !== homeRequestVersion) return;
    homeFeed = null;
    homeFailed = true;
    track("personalized_feed_failed", {
      ...analyticsError(error),
      feed_session_id: feedSessionId,
      load_reason: reason,
      load_duration_ms: Math.round(performance.now() - startedAt),
      locale,
    });
  } finally {
    if (requestVersion !== homeRequestVersion) return;
    homeLoading = false;
    renderPersonaSelector();
    renderHome();
    renderCreateTemplates();
  }
}

function renderPersonaSelector() {
  const selector = element<HTMLElement>("persona-selector");
  const personas = data?.personas || [];
  selector.hidden = personas.length < 2;
  selector.replaceChildren(...personas.map((persona) => {
    const button = document.createElement("button");
    const active = persona.personaCode === selectedPersonaCode;
    button.type = "button";
    button.className = `persona-selector__item${active ? " is-active" : ""}`;
    button.dataset.personaCode = persona.personaCode;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(active));
    button.innerHTML = `<span>${escapeHtml(persona.title || persona.personaCode)}</span>${persona.primary ? `<small>${escapeHtml(t("primaryPersona"))}</small>` : ""}`;
    return button;
  }));
}

function selectPersona(personaCode: string) {
  if (!data?.personas.some((persona) => persona.personaCode === personaCode) || personaCode === selectedPersonaCode) return;
  const previousPersonaCode = selectedPersonaCode;
  selectedPersonaCode = personaCode;
  if (selectedContent) clearSelectedContent("persona_changed");
  renderPersonaSelector();
  webApp.HapticFeedback?.selectionChanged();
  track("persona_selected", { previous_persona_code: previousPersonaCode, persona_code: personaCode, locale });
  void loadHome("persona");
}

function withCreationTemplates(feed: HomeFeed, templates: Content[]): HomeFeed {
  const available = templates.filter((template) => template.canCreate && (template.requiredImageCount || 0) <= 1);
  if (!available.length) return feed;
  const templateIds = new Set(available.map((template) => template.id));
  const items: HomeItem[] = available.map((template) => ({
    id: template.id,
    kind: "template",
    title: template.title,
    previewUrl: template.previewUrl,
    videoUrl: template.videoUrl,
  }));
  return {
    ...feed,
    banners: feed.banners.filter((item) => !templateIds.has(item.id)),
    categories: [
      { id: CREATION_TEMPLATES_CATEGORY_ID, title: t("availableTemplates"), itemCount: items.length },
      ...feed.categories.filter((category) => category.id !== CREATION_TEMPLATES_CATEGORY_ID),
    ],
    sections: [
      { categoryId: CREATION_TEMPLATES_CATEGORY_ID, title: t("availableTemplates"), items },
      ...feed.sections
        .filter((section) => section.categoryId !== CREATION_TEMPLATES_CATEGORY_ID)
        .map((section) => ({ ...section, items: section.items.filter((item) => !templateIds.has(item.id)) })),
    ],
  };
}

function renderHome() {
  const content = element("feed-content");
  feedObserver?.disconnect();
  content.setAttribute("aria-busy", String(homeLoading));
  if (homeLoading) {
    content.innerHTML = `<div class="feed-skeleton"><i></i><i></i><i></i></div>`;
    return;
  }
  if (homeFailed) {
    content.innerHTML = `<div class="feed-message feed-message--error"><i class="ph ph-warning-circle" aria-hidden="true"></i><p>${t("feedUnavailable")}</p><button data-home-retry type="button">${t("retry")}</button></div>`;
    return;
  }
  if (!homeFeed || (!homeFeed.banners.length && !homeFeed.sections.some((section) => section.items.length))) {
    content.innerHTML = `<div class="feed-message"><i class="ph ph-film-slate" aria-hidden="true"></i><p>${t("feedEmpty")}</p></div>`;
    const emptyKey = homeFeed?.feedSessionId || feedSessionId;
    if (!trackedEmptyFeedSessions.has(emptyKey)) {
      trackedEmptyFeedSessions.add(emptyKey);
      track("personalized_feed_empty", homeFeedProperties());
    }
    return;
  }

  const inspirationSections = homeFeed.sections
    .filter((section) => section.categoryId !== CREATION_TEMPLATES_CATEGORY_ID && section.items.length)
    .slice(0, 10);
  const visibleCategoryIds = new Set(inspirationSections.map((section) => section.categoryId));
  const visibleCategories = homeFeed.categories
    .filter((category) => visibleCategoryIds.has(category.id))
    .slice(0, 11);
  if (activeHomeCategoryId && !visibleCategoryIds.has(activeHomeCategoryId)) activeHomeCategoryId = "";

  const categories = [
    ...visibleCategories.filter(isHotFeedCategory).map((category) => ({ id: category.id, title: category.title })),
    { id: "", title: t("feedForYou") },
    ...visibleCategories.filter((category) => !isHotFeedCategory(category)).map((category) => ({ id: category.id, title: category.title })),
  ];
  const categoryTabs = `<div class="feed-categories" role="group" aria-label="${escapeHtml(t("feedTitle"))}">${categories.map((category) => {
    const active = category.id === activeHomeCategoryId;
    return `<button class="feed-category${active ? " is-active" : ""}" data-home-category="${escapeHtml(category.id || "all")}" type="button" aria-pressed="${active}">${escapeHtml(category.title)}</button>`;
  }).join("")}</div>`;

  const selectedSection = activeHomeCategoryId
    ? inspirationSections.find((section) => section.categoryId === activeHomeCategoryId)
    : undefined;
  const selectedItems = selectedSection
    ? selectedSection.items
    : uniqueHomeItems([...homeFeed.banners, ...inspirationSections.flatMap((section) => section.items)]);
  const feedCards = selectedItems.slice(0, 24).map((item, position) => {
    const sourceSection = selectedSection || inspirationSections.find((section) => section.items.some((candidate) => candidate.id === item.id && candidate.kind === item.kind));
    const isBanner = homeFeed!.banners.some((candidate) => candidate.id === item.id && candidate.kind === item.kind);
    return homeItem(item, "feed", {
      categoryId: sourceSection?.categoryId || "",
      sectionId: isBanner ? "banners" : sourceSection?.categoryId || "trending",
      position,
    });
  }).join("");
  const trending = `<section class="explore-feed" data-home-section="${escapeHtml(activeHomeCategoryId || "trending")}" data-category-id="${escapeHtml(activeHomeCategoryId)}">
    <div class="explore-feed__heading"><h2>${escapeHtml(t("trendingVideos"))}</h2><button data-home-refresh type="button" aria-label="${escapeHtml(t("refreshFeed"))}"><span>${escapeHtml(t("freshDaily"))}</span><i class="ph ph-arrow-clockwise" aria-hidden="true"></i></button></div>
    ${feedCards ? `<div class="explore-feed__grid">${feedCards}</div>` : `<div class="feed-message"><i class="ph ph-film-slate" aria-hidden="true"></i><p>${escapeHtml(t("feedEmpty"))}</p></div>`}
  </section>`;

  content.innerHTML = `${categoryTabs}${trending}`;
  observeHomeFeed();
}

function renderCreateTemplates() {
  const container = element<HTMLElement>("create-templates");
  const templateSection = homeFeed?.sections.find((section) => section.categoryId === CREATION_TEMPLATES_CATEGORY_ID);
  if (!templateSection?.items.length) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }

  container.hidden = false;
  container.innerHTML = `<div class="explore-templates__heading"><div><p>${escapeHtml(t("templatesEyebrow"))}</p><h2 id="create-templates-title">${escapeHtml(t("popularTemplates"))}</h2></div><span>${escapeHtml(t("swipe"))}</span></div>
    <div class="explore-templates__track">${templateSection.items.slice(0, 10).map((item, position) => homeItem(item, "template", { categoryId: templateSection.categoryId, sectionId: templateSection.categoryId, position, placement: "create_template" })).join("")}</div>`;
}

function isHotFeedCategory(category: HomeFeed["categories"][number]) {
  return category.id.trim().toLowerCase() === "hot" || category.title.trim().toLowerCase() === "hot";
}

function uniqueHomeItems(items: HomeItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function homeItem(item: HomeItem, variant: "feed" | "template", context: { categoryId: string; sectionId: string; position: number; placement?: string }) {
  const title = escapeHtml(item.title);
  const previewUrl = safeHttpUrl(item.previewUrl);
  const videoUrl = safeHttpUrl(item.videoUrl);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const autoplay = Boolean(videoUrl) && !reduceMotion;
  const visual = videoUrl
    ? `<video src="${escapeHtml(videoUrl)}"${previewUrl ? ` poster="${escapeHtml(previewUrl)}"` : ""}${autoplay ? " autoplay" : ""} muted loop playsinline preload="metadata"></video>`
    : previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="feed-item__placeholder" aria-hidden="true"><i class="ph ph-film-slate"></i></span>`;
  const analytics = `data-home-item data-item-id="${escapeHtml(item.id)}" data-item-kind="${escapeHtml(item.kind)}" data-placement="${escapeHtml(context.placement || variant)}" data-category-id="${escapeHtml(context.categoryId)}" data-section-id="${escapeHtml(context.sectionId)}" data-position="${context.position}"`;
  if (variant === "template") {
    return `<button class="explore-template" ${analytics} type="button" aria-label="${title}">${visual}<span class="feed-item__shade" aria-hidden="true"></span><strong>${title}</strong></button>`;
  }
  return `<button class="explore-feed-card" ${analytics} type="button" aria-label="${title}">${visual}<span class="feed-item__shade" aria-hidden="true"></span><span class="explore-feed-card__copy"><strong>${title}</strong></span></button>`;
}

function homeItemFromElement(element: HTMLElement) {
  if (!homeFeed) return undefined;
  const itemId = element.dataset.itemId || "";
  const sectionId = element.dataset.sectionId || "";
  const categoryId = element.dataset.categoryId || "";
  if (sectionId === "banners") return homeFeed.banners.find((item) => item.id === itemId);
  const section = homeFeed.sections.find((item) => item.categoryId === categoryId);
  return section?.items.find((item) => item.id === itemId)
    || homeFeed.sections.flatMap((item) => item.items).find((item) => item.id === itemId);
}

async function openHomeItemDetail(sourceElement: HTMLElement) {
  const item = homeItemFromElement(sourceElement);
  if (!item) return;
  const requestVersion = ++detailRequestVersion;
  detailOpenedAt = performance.now();
  detailCloseReason = "programmatic";

  const video = element<HTMLVideoElement>("template-detail-video");
  const image = element<HTMLImageElement>("template-detail-image");
  const placeholder = element<HTMLElement>("template-detail-placeholder");
  const videoUrl = safeHttpUrl(item.videoUrl);
  const previewUrl = safeHttpUrl(item.previewUrl);

  element<HTMLElement>("template-detail-kind").textContent = item.kind === "template" ? t("templateDetail") : t("assetDetail");
  element<HTMLElement>("template-detail-title").textContent = item.title;
  element<HTMLElement>("template-detail-description").hidden = true;
  element<HTMLElement>("template-detail-meta").hidden = true;
  element<HTMLElement>("template-detail-prompt").hidden = true;
  element<HTMLElement>("template-detail-reference").hidden = true;
  element<HTMLElement>("template-detail-availability").hidden = true;
  element<HTMLElement>("template-detail-loading").hidden = false;
  const creatorButton = element<HTMLButtonElement>("template-open-creator");
  creatorButton.disabled = true;
  creatorButton.querySelector("span")!.textContent = t("openCreator");
  detailContent = null;
  placeholder.hidden = true;
  image.hidden = true;
  video.hidden = true;

  if (videoUrl) {
    video.src = videoUrl;
    video.poster = previewUrl;
    video.hidden = false;
  } else if (previewUrl) {
    image.src = previewUrl;
    image.alt = item.title;
    image.hidden = false;
  } else {
    placeholder.hidden = false;
  }

  templateDialog.dataset.itemId = item.id;
  templateDialog.dataset.itemKind = item.kind;
  templateDialog.showModal();
  webApp.HapticFeedback?.impactOccurred("light");
  if (videoUrl) void video.play().catch(() => undefined);
  track("home_item_detail_opened", {
    ...homeItemProperties(sourceElement),
    can_make_similar: item.canMakeSimilar === true,
    has_video: Boolean(videoUrl),
  });

  try {
    const content = api
      ? (await api.content(item.kind, item.id, locale, homeFeed?.personaCode || selectedPersonaCode)).content
      : mockContentDetail(item);
    if (requestVersion !== detailRequestVersion || !templateDialog.open) return;
    detailContent = content;
    renderHomeItemDetail(content);
    track("home_item_detail_loaded", {
      item_id: content.id,
      item_kind: content.kind,
      can_create: content.canCreate,
      requires_image: content.requiresImage,
      required_image_count: content.requiredImageCount || 0,
      load_duration_ms: Math.round(performance.now() - detailOpenedAt),
      ...homeFeedProperties(),
    });
  } catch (error) {
    if (requestVersion !== detailRequestVersion || !templateDialog.open) return;
    element<HTMLElement>("template-detail-loading").hidden = true;
    const description = element<HTMLElement>("template-detail-description");
    description.textContent = messageOf(error);
    description.hidden = false;
    creatorButton.disabled = true;
    creatorButton.querySelector("span")!.textContent = t("serviceUnavailable");
    track("home_item_detail_failed", {
      ...homeItemProperties(sourceElement),
      ...analyticsError(error),
      load_duration_ms: Math.round(performance.now() - detailOpenedAt),
    });
  }
}

function mockContentDetail(item: HomeItem): Content {
  const unsupported = item.id === "unsupported-skyline";
  const isAsset = item.kind === "asset";
  return {
    ...item,
    prompt: isAsset ? "Preserve the subject while adding subtle cinematic movement and natural light." : undefined,
    promptDisplay: unsupported ? "Stand firm. What comes next is a city-level entrance effect." : undefined,
    defaultReferenceImageUrl: isAsset ? item.previewUrl : undefined,
    defaultReferenceEnabled: isAsset,
    canCreate: !unsupported && (item.kind === "template" || item.canMakeSimilar === true),
    requiresImage: unsupported || item.kind === "asset",
    requiredImageCount: unsupported || item.kind === "asset" ? 1 : 0,
    durationSeconds: data?.generation.durationSeconds || 5,
    aspectRatio: data?.generation.aspectRatio || "9:16",
  };
}

function renderHomeItemDetail(content: Content) {
  const meta = element<HTMLElement>("template-detail-meta");
  const prompt = element<HTMLElement>("template-detail-prompt");
  const reference = element<HTMLElement>("template-detail-reference");
  const referenceImage = element<HTMLImageElement>("template-detail-reference-image");
  const availability = element<HTMLElement>("template-detail-availability");
  const creatorButton = element<HTMLButtonElement>("template-open-creator");
  const requiredImageCount = content.requiredImageCount || (content.requiresImage ? 1 : 0);
  const supported = content.canCreate && requiredImageCount <= 1;
  const pills = [
    content.requiresImage ? `${requiredImageCount} × ${t("addImage")}` : t("textToVideo"),
    content.durationSeconds ? `${content.durationSeconds}s` : "",
    content.aspectRatio || "",
  ].filter(Boolean);

  element<HTMLElement>("template-detail-title").textContent = content.title;
  const description = element<HTMLElement>("template-detail-description");
  description.textContent = content.description || "";
  description.hidden = !content.description;
  element<HTMLElement>("template-detail-loading").hidden = true;
  meta.innerHTML = pills.map((value) => `<span>${escapeHtml(value)}</span>`).join("");
  meta.hidden = pills.length === 0;
  const promptDisplay = content.prompt?.trim() || content.promptDisplay?.trim() || "";
  element<HTMLElement>("template-detail-prompt-text").textContent = promptDisplay || t("notAvailable");
  prompt.classList.toggle("is-empty", !promptDisplay);
  prompt.hidden = false;
  const defaultReferenceImageUrl = content.kind === "asset" && content.defaultReferenceEnabled
    ? safeHttpUrl(content.defaultReferenceImageUrl)
    : "";
  const referenceImageUrl = defaultReferenceImageUrl || safeHttpUrl(content.referenceImageUrl || content.previewUrl);
  element<HTMLElement>("template-detail-reference-label").textContent = defaultReferenceImageUrl ? t("defaultReferenceImage") : t("inputImage");
  reference.hidden = !referenceImageUrl;
  if (referenceImageUrl) {
    referenceImage.src = referenceImageUrl;
    referenceImage.alt = `${content.title} · ${t("inputImage")}`;
  } else {
    referenceImage.removeAttribute("src");
  }
  availability.textContent = supported
    ? ""
    : requiredImageCount > 1 ? t("multiImageTemplateUnavailable") : t("templateUnavailableDescription");
  availability.hidden = supported;
  creatorButton.disabled = !supported;
  creatorButton.querySelector("span")!.textContent = supported ? t("openCreator") : t("templateUnavailable");
}

function resetHomeItemDetailMedia() {
  detailRequestVersion += 1;
  detailContent = null;
  const video = element<HTMLVideoElement>("template-detail-video");
  const image = element<HTMLImageElement>("template-detail-image");
  const referenceImage = element<HTMLImageElement>("template-detail-reference-image");
  video.pause();
  video.removeAttribute("src");
  video.removeAttribute("poster");
  video.load();
  image.removeAttribute("src");
  referenceImage.removeAttribute("src");
}

function observeHomeFeed() {
  feedObserver?.disconnect();
  if (!homeFeed || typeof IntersectionObserver === "undefined") return;
  const feed = homeFeed;
  feedObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
      const element = entry.target as HTMLElement;
      if (element.hasAttribute("data-home-item")) {
        const properties = homeItemProperties(element);
        const key = `${properties.feed_session_id}:item:${properties.section_id}:${properties.item_id}`;
        if (!trackedFeedItems.has(key)) {
          trackedFeedItems.add(key);
          track("home_item_impression", properties);
        }
      } else if (element.dataset.homeSection) {
        const key = `${feed.feedSessionId}:section:${element.dataset.homeSection}`;
        if (!trackedFeedSections.has(key)) {
          trackedFeedSections.add(key);
          track("home_section_viewed", {
            section_id: element.dataset.homeSection,
            category_id: element.dataset.categoryId || "",
            ...homeFeedProperties(),
          });
        }
      }
      feedObserver?.unobserve(element);
    }
  }, { threshold: 0.5 });
  document.querySelectorAll<HTMLElement>("[data-home-item], [data-home-section]").forEach((element) => feedObserver?.observe(element));
}

function homeItemProperties(element: HTMLElement) {
  return {
    item_id: element.dataset.itemId || "",
    item_kind: element.dataset.itemKind || "",
    placement: element.dataset.placement || "unknown",
    category_id: element.dataset.categoryId || "",
    section_id: element.dataset.sectionId || "",
    position: Number(element.dataset.position) || 0,
    ...homeFeedProperties(),
  };
}

function homeFeedProperties() {
  return {
    persona_code: homeFeed?.personaCode || "unknown",
    ranking_version: homeFeed?.rankingVersion || "unknown",
    feed_session_id: homeFeed?.feedSessionId || feedSessionId,
    schema_version: homeFeed?.schemaVersion || 0,
    locale,
  };
}

function trackAppSection(sectionName: string) {
  if (!sectionName || trackedAppSections.has(sectionName)) return;
  trackedAppSections.add(sectionName);
  track("mini_app_section_viewed", {
    section_name: sectionName,
    locale,
    telegram_platform: webApp.platform,
  });
}

function selectHomeCategory(categoryId: string) {
  const nextCategoryId = categoryId === "all" ? "" : categoryId;
  if (nextCategoryId === activeHomeCategoryId) return;
  if (nextCategoryId && !homeFeed?.categories.some((category) => category.id === nextCategoryId)) return;
  activeHomeCategoryId = nextCategoryId;
  renderHome();
  const activeButton = [...document.querySelectorAll<HTMLButtonElement>("[data-home-category]")]
    .find((button) => button.dataset.homeCategory === (nextCategoryId || "all"));
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  activeButton?.scrollIntoView({ behavior, block: "nearest", inline: "center" });
  webApp.HapticFeedback?.selectionChanged();
  track("home_category_selected", { category_id: nextCategoryId || "all", ...homeFeedProperties() });
}

function safeHttpUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value, location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function availableAspectRatios() {
  if (!data) return [selectedAspectRatio];
  const ratios = [data.generation.aspectRatio, ...(data.generation.aspectRatios || [])]
    .map((value) => value.trim())
    .filter((value) => /^\d{1,2}:\d{1,2}$/.test(value));
  return [...new Set(ratios.length ? ratios : [data.generation.aspectRatio])];
}

function availableDurations() {
  if (!data) return [selectedDurationSeconds];
  const durations = [data.generation.durationSeconds, ...(data.generation.durationOptions || [])]
    .filter((value) => Number.isSafeInteger(value) && value >= 1 && value <= 60);
  return [...new Set(durations.length ? durations : [data.generation.durationSeconds])];
}

function renderDurationOptions() {
  const durations = availableDurations();
  if (!durations.includes(selectedDurationSeconds)) selectedDurationSeconds = data?.generation.durationSeconds || durations[0] || 5;
  durationMenu.replaceChildren(...durations.map((duration) => {
    const option = document.createElement("button");
    const selected = duration === selectedDurationSeconds;
    option.type = "button";
    option.className = `duration-menu__item${selected ? " is-selected" : ""}`;
    option.dataset.duration = String(duration);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(selected));
    option.tabIndex = -1;
    option.innerHTML = `<span>${duration}s</span><i class="ph ph-check" aria-hidden="true"></i>`;
    return option;
  }));
  durationTrigger.disabled = durations.length < 2;
  durationControl.classList.toggle("is-disabled", durations.length < 2);
  updateDurationControl();
  setDurationMenuOpen(false);
}

function selectDuration(value: string, source: "user" | "job") {
  const durations = availableDurations();
  const requested = Number(value);
  const nextDuration = Number.isSafeInteger(requested) && durations.includes(requested)
    ? requested
    : data?.generation.durationSeconds || durations[0] || 5;
  const changed = selectedDurationSeconds !== nextDuration;
  selectedDurationSeconds = nextDuration;
  updateDurationControl();
  setDurationMenuOpen(false);
  pendingRequestId = "";
  if (changed) {
    webApp.HapticFeedback?.selectionChanged();
    track("generation_duration_selected", { duration_seconds: nextDuration, source, model: data?.generation.model || "" });
  }
}

function durationMenuItems() {
  return Array.from(durationMenu.querySelectorAll<HTMLButtonElement>("[data-duration]"));
}

function updateDurationControl() {
  durationValue.textContent = `${selectedDurationSeconds}s`;
  durationTrigger.setAttribute("aria-label", `${t("duration")}: ${selectedDurationSeconds}s`);
  for (const option of durationMenuItems()) {
    const selected = option.dataset.duration === String(selectedDurationSeconds);
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
  }
}

function setDurationMenuOpen(open: boolean, focusItem = false) {
  const nextOpen = open && !durationTrigger.disabled;
  durationMenu.hidden = !nextOpen;
  durationTrigger.setAttribute("aria-expanded", String(nextOpen));
  durationControl.classList.toggle("is-open", nextOpen);
  if (!nextOpen || !focusItem) return;
  const items = durationMenuItems();
  (items.find((item) => item.getAttribute("aria-selected") === "true") || items[0])?.focus();
}

function aspectRatioOptionLabel(aspectRatio: string) {
  const [width, height] = aspectRatio.split(":").map(Number);
  const orientation = width === height ? t("square") : width > height ? t("landscape") : t("portrait");
  return `${aspectRatio} · ${orientation}`;
}

function renderAspectRatioOptions() {
  const ratios = availableAspectRatios();
  if (!ratios.includes(selectedAspectRatio)) selectedAspectRatio = data?.generation.aspectRatio || ratios[0] || "9:16";
  aspectRatioMenu.replaceChildren(...ratios.map((aspectRatio) => {
    const option = document.createElement("button");
    const selected = aspectRatio === selectedAspectRatio;
    option.type = "button";
    option.className = `aspect-ratio-menu__item${selected ? " is-selected" : ""}`;
    option.dataset.aspectRatio = aspectRatio;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(selected));
    option.tabIndex = -1;
    option.innerHTML = `<span>${escapeHtml(aspectRatioOptionLabel(aspectRatio))}</span><i class="ph ph-check" aria-hidden="true"></i>`;
    return option;
  }));
  aspectRatioTrigger.disabled = ratios.length < 2;
  aspectRatioTrigger.classList.toggle("is-disabled", ratios.length < 2);
  updateAspectRatioControl();
  setAspectRatioMenuOpen(false);
}

function aspectRatioMenuItems() {
  return Array.from(aspectRatioMenu.querySelectorAll<HTMLButtonElement>("[data-aspect-ratio]"));
}

function updateAspectRatioControl() {
  const label = aspectRatioOptionLabel(selectedAspectRatio);
  aspectRatioValue.textContent = label;
  aspectRatioTrigger.setAttribute("aria-label", `${t("aspectRatioLabel")}: ${label}`);
  for (const option of aspectRatioMenuItems()) {
    const selected = option.dataset.aspectRatio === selectedAspectRatio;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
  }
}

function setAspectRatioMenuOpen(open: boolean, focusItem = false) {
  const nextOpen = open && !aspectRatioTrigger.disabled;
  aspectRatioMenu.hidden = !nextOpen;
  aspectRatioTrigger.setAttribute("aria-expanded", String(nextOpen));
  aspectRatioControl.classList.toggle("is-open", nextOpen);
  if (!nextOpen || !focusItem) return;
  const items = aspectRatioMenuItems();
  (items.find((item) => item.getAttribute("aria-selected") === "true") || items[0])?.focus();
}

function selectAspectRatio(value: string, source: "user" | "content" | "job") {
  const ratios = availableAspectRatios();
  const nextAspectRatio = ratios.includes(value) ? value : data?.generation.aspectRatio || ratios[0] || "9:16";
  const changed = selectedAspectRatio !== nextAspectRatio;
  selectedAspectRatio = nextAspectRatio;
  updateAspectRatioControl();
  setAspectRatioMenuOpen(false);
  pendingRequestId = "";
  if (changed) {
    webApp.HapticFeedback?.selectionChanged();
    track("generation_aspect_ratio_selected", { aspect_ratio: nextAspectRatio, source, model: data?.generation.model || "" });
  }
}

function renderData() {
  if (!data) return;
  element("balance-value").textContent = formatCompactBalance(data.wallet.balance);
  const balanceCaption = element<HTMLElement>("balance-caption");
  const inviteAvailable = data.referral.enabled && Boolean(data.referral.shareUrl);
  balanceCaption.textContent = inviteAvailable ? t("inviteEarn") : t("credits");
  element("wallet-open").classList.toggle("has-referral", inviteAvailable);
  element("dialog-balance").textContent = data.wallet.balance.toLocaleString(locale);
  element<HTMLElement>("create-service-message").hidden = true;
  element("create-service-message-text").textContent = "";
  renderAspectRatioOptions();
  renderDurationOptions();
  renderPersonaSelector();
  element("quality-value").textContent = data.generation.quality.toLowerCase() === "standard" ? t("standard") : titleCase(data.generation.quality);
  const termsLink = document.getElementById("terms-link") as HTMLAnchorElement | null;
  const privacyLink = document.getElementById("privacy-link") as HTMLAnchorElement | null;
  if (termsLink) termsLink.href = data.legal.termsUrl;
  if (privacyLink) privacyLink.href = data.legal.privacyUrl;
  promptInput.maxLength = data.generation.maxPromptLength;
  renderJobs();
  renderReferral();
  renderPacks();
  updateSubmitState();
}

function renderReferral() {
  if (!data) return;
  const referral = data.referral;
  const section = element<HTMLElement>("referral-section");
  const available = referral.enabled && Boolean(referral.shareUrl);
  section.hidden = !available;
  if (!available) return;
  element("referral-reward").textContent = t("inviteReward", { credits: referral.rewardCredits.toLocaleString(locale) });
  element("referral-weekly").textContent = t("inviteWeekly", { rewarded: referral.rewardedThisWeek, limit: referral.weeklyLimit });
  const records = element<HTMLElement>("referral-records");
  records.innerHTML = referral.records.length
    ? referral.records.map((record) => `<article><span><b>${escapeHtml(referralStatusLabel(record.status))}</b><small>${escapeHtml(referralStatusDetail(record))}</small></span><time datetime="${escapeHtml(record.rewardedAt || record.qualifiedAt || record.registeredAt)}">${escapeHtml(formatJobDate(record.rewardedAt || record.qualifiedAt || record.registeredAt))}</time></article>`).join("")
    : `<p>${t("inviteHistoryEmpty")}</p>`;
}

function referralStatusLabel(status: Bootstrap["referral"]["records"][number]["status"]) {
  if (status === "rewarded") return t("inviteStatusRewarded");
  if (status === "qualified" || status === "reward_pending") return t("inviteStatusQualified");
  if (status === "cap_reached") return t("inviteStatusCapReached");
  return t("inviteStatusPending");
}

function referralStatusDetail(record: Bootstrap["referral"]["records"][number]) {
  if (record.status === "rewarded") return t("inviteStatusRewardedDetail", { credits: record.rewardCredits.toLocaleString(locale) });
  if (record.status === "cap_reached") return t("inviteStatusCapReachedDetail");
  if (record.status === "qualified" || record.status === "reward_pending") return t("inviteStatusQualifiedDetail");
  return t("inviteStatusPendingDetail");
}

function formatCompactBalance(balance: number) {
  if (Math.abs(balance) < 100_000) return balance.toLocaleString(locale);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(balance);
}

function welcomeStorageKey(userId: number) {
  return `fantivo_welcome_v1_${userId}`;
}

function showWelcomeForEligibleUser() {
  if (welcomeChecked || !data || data.newUserGift.credits <= 0) return;
  const storageKey = welcomeStorageKey(data.user.id);
  try {
    if (localStorage.getItem(storageKey) === "seen") {
      welcomeChecked = true;
      return;
    }
  } catch { /* local storage may be unavailable */ }
  element("welcome-gift-copy").textContent = t("welcomeGift", { credits: data.newUserGift.credits.toLocaleString(locale) });
  welcomeChecked = true;
  if (!welcomeDialog.open) welcomeDialog.showModal();
}

function closeWelcomeDialog() {
  if (data) {
    try { localStorage.setItem(welcomeStorageKey(data.user.id), "seen"); } catch { /* local storage may be unavailable */ }
  }
  if (welcomeDialog.open) welcomeDialog.close();
}

function renderJobs() {
  if (!data) return;
  const list = element("jobs-list");
  renderJobFilters();
  if (!data.jobs.length) {
    list.innerHTML = `<div class="empty-state"><i class="ph ph-film-strip" aria-hidden="true"></i><h3>${t("emptyTitle")}</h3><p>${t("emptyDescription")}</p><button type="button" data-page-target="create" data-navigation-source="jobs_empty_state">${t("startCreating")}</button></div>`;
    return;
  }
  const visibleJobs = activeJobFilter === "all"
    ? data.jobs
    : data.jobs.filter((job) => jobStatusFilter(job.status) === activeJobFilter);
  if (!visibleJobs.length) {
    list.innerHTML = `<div class="empty-state empty-state--filtered"><i class="ph ph-funnel" aria-hidden="true"></i><h3>${t("filteredJobsEmptyTitle")}</h3><p>${t("filteredJobsEmptyDescription")}</p></div>`;
    return;
  }
  list.innerHTML = visibleJobs.map((job) => {
    const status = statusView(job.status);
    const normalizedStatus = job.status.toLowerCase();
    const progress = Math.min(100, Math.max(0, Math.round(job.progress || 0)));
    const canCancel = IN_PROGRESS_JOB_STATUSES.has(normalizedStatus);
    const visual = renderJobVisual(job, status);
    return `
      <article class="job-card" data-open-job-details="${escapeHtml(job.id)}">
        ${visual}
        <div class="job-card__body">
          <div class="job-card__top"><strong>${escapeHtml(displayJobTitle(job.mode))}</strong><span class="job-status ${status.className}">${status.label}</span></div>
          <p>${job.creditCost.toLocaleString(locale)} ${t("credits")}${job.creditsRefunded ? ` · ${t("refunded")}` : ""}</p>
          ${status.active ? `<progress class="progress" max="100" value="${progress}" aria-label="${escapeHtml(t("processingProgress", { progress }))}">${progress}%</progress><small>${t("processingProgress", { progress })}</small>` : ""}
          <div class="job-card__actions"><button class="job-card__action" data-open-job-details="${escapeHtml(job.id)}" type="button">${t("viewDetails")}</button>${canCancel ? `<button data-cancel-job="${escapeHtml(job.id)}" type="button">${t("cancelJob")}</button>` : ""}</div>
        </div>
      </article>`;
  }).join("");
}

function renderJobFilters() {
  if (!data) return;
  const counts: Record<JobFilter, number> = { all: data.jobs.length, completed: 0, inProgress: 0, failed: 0 };
  for (const job of data.jobs) counts[jobStatusFilter(job.status)] += 1;
  const filters: Array<{ value: JobFilter; label: Parameters<typeof t>[0] }> = [
    { value: "all", label: "jobsFilterAll" },
    { value: "completed", label: "jobsFilterCompleted" },
    { value: "inProgress", label: "jobsFilterInProgress" },
    { value: "failed", label: "jobsFilterFailed" },
  ];
  element("jobs-filters").innerHTML = filters.map(({ value, label }) => {
    const active = activeJobFilter === value;
    return `<button class="jobs-filter ${active ? "is-active" : ""}" data-job-filter="${value}" type="button" aria-pressed="${active}"><span>${t(label)}</span><small>${counts[value].toLocaleString(locale)}</small></button>`;
  }).join("");
}

function renderJobVisual(job: Job, status: ReturnType<typeof statusView>) {
  const completed = jobStatusFilter(job.status) === "completed";
  const outputUrl = completed ? safeHttpUrl(job.outputUrl) : "";
  const coverUrl = safeHttpUrl(job.coverUrl || job.thumbnailUrl);
  const fallbackImageUrl = safeHttpUrl(job.imageUrl);
  let media = "";
  if (coverUrl) {
    media = `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
  } else if (outputUrl) {
    media = `<video src="${escapeHtml(videoPreviewUrl(outputUrl))}" ${fallbackImageUrl ? `poster="${escapeHtml(fallbackImageUrl)}"` : ""} muted playsinline preload="metadata" aria-hidden="true"></video>`;
  } else if (fallbackImageUrl) {
    media = `<img src="${escapeHtml(fallbackImageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
  }
  return `<button class="job-card__visual ${status.className} is-clickable ${media ? "has-media" : ""}" data-open-job-details="${escapeHtml(job.id)}" type="button" aria-label="${escapeHtml(t("viewDetails"))}">${media}<span>${status.glyph}</span></button>`;
}

function videoPreviewUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "t=0.1";
    return url.toString();
  } catch {
    return value;
  }
}

function openJobDetails(jobId: string) {
  const job = data?.jobs.find((item) => item.id === jobId);
  if (!job) return;

  activeJobVideo = job;
  jobDetailOpenedAt = performance.now();
  jobDetailCloseReason = "programmatic";
  element("job-video-title").textContent = displayJobTitle(job.mode);
  const status = statusView(job.status);
  const statusElement = element("job-detail-status");
  statusElement.textContent = status.label;
  statusElement.className = `job-status ${status.className}`;

  const prompt = job.prompt?.trim() || "";
  element("job-prompt-text").textContent = prompt || t("notAvailable");
  element<HTMLButtonElement>("job-prompt-copy").hidden = !prompt;
  const inputImageUrl = safeHttpUrl(job.imageUrl);
  const inputImage = element<HTMLImageElement>("job-input-image");
  inputImage.hidden = !inputImageUrl;
  if (inputImageUrl) inputImage.src = inputImageUrl;
  else inputImage.removeAttribute("src");

  const detailRows: Array<[string, string]> = [
    [t("jobIdLabel"), job.id],
    [t("createdTime"), formatJobDate(job.createdAt)],
  ];
  if (job.completedAt || job.finishedAt) detailRows.push([t("completedTime"), formatJobDate(job.completedAt || job.finishedAt)]);
  detailRows.push(
    [t("createMode"), displayJobMode(job.mode)],
    [t("qualityLabel"), displayQuality(job.quality)],
    [t("durationLabel"), typeof job.durationSeconds === "number" ? `${job.durationSeconds}s` : t("notAvailable")],
    [t("aspectRatioLabel"), job.aspectRatio || t("notAvailable")],
    [t("modelLabel"), displayModel(job.model)],
    [t("costLabel"), `${job.creditCost.toLocaleString(locale)} ${t("credits")}`],
  );
  if (job.creditsRefunded) detailRows.push([t("refundedLabel"), t("yes")]);
  if (typeof job.refundedCredits === "number") detailRows.push([t("refundedCreditsLabel"), `${job.refundedCredits.toLocaleString(locale)} ${t("credits")}`]);
  if (job.sourceContentKind || job.sourceContentId) {
    const sourceKind = job.sourceContentKind === "template" ? t("sourceTemplate") : job.sourceContentKind === "asset" ? t("sourceAsset") : "";
    detailRows.push([t("sourceLabel"), [sourceKind, job.sourceContentId].filter(Boolean).join(" · ")]);
  }
  if (["failed", "error"].includes(job.status.toLowerCase())) detailRows.push([t("failureReasonLabel"), jobFailureMessage(job)]);
  element("job-detail-list").innerHTML = detailRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");

  element<HTMLElement>("job-video-error").hidden = true;
  const outputUrl = job.status.toLowerCase() === "succeeded" ? safeHttpUrl(job.outputUrl) : "";
  const playerSection = element<HTMLElement>("job-video-player-section");
  playerSection.hidden = !outputUrl || job.outputUrl === "#";
  const video = element<HTMLVideoElement>("job-video-player");
  resetPlaybackControls();
  if (outputUrl && job.outputUrl !== "#") {
    video.src = outputUrl;
    video.load();
  }
  const hasOutput = Boolean(outputUrl && job.outputUrl !== "#");
  for (const id of ["job-download", "job-publish-open", "job-share"]) {
    element<HTMLButtonElement>(id).hidden = !hasOutput;
  }
  element<HTMLButtonElement>("job-create-again").hidden = !prompt;
  const outputActions = element<HTMLElement>("job-output-actions");
  outputActions.hidden = !hasOutput && !prompt;
  outputActions.classList.toggle("is-single", !hasOutput);
  const publicationStatus = element<HTMLElement>("job-publication-status");
  publicationStatus.hidden = !submittedPublicationJobs.has(job.id);
  publicationStatus.textContent = submittedPublicationJobs.has(job.id) ? t("publishSubmitted") : "";
  element<HTMLButtonElement>("job-publish-open").disabled = submittedPublicationJobs.has(job.id);
  element<HTMLButtonElement>("job-publish-open").textContent = submittedPublicationJobs.has(job.id) ? t("publishSubmitted") : t("publishVideo");
  resetPublicationForm(job);
  element<HTMLElement>("job-detail-scroll").scrollTop = 0;
  if (!jobVideoDialog.open) jobVideoDialog.showModal();
  if (outputUrl && job.outputUrl !== "#") void video.play().catch(() => undefined);
  webApp.HapticFeedback?.impactOccurred("light");
  track("job_details_opened", {
    job_id: job.id,
    request_id: jobLifecycle?.requestId(job.id) || "",
    status: job.status.toLowerCase(),
    mode: job.mode || "unknown",
    model: job.model,
    credit_cost: job.creditCost,
    credits_refunded: Boolean(job.creditsRefunded),
    has_output: Boolean(outputUrl),
    has_input_image: Boolean(inputImageUrl),
    has_prompt: Boolean(prompt),
  });
  if (hasOutput) track("generation_result_viewed", { job_id: job.id, request_id: jobLifecycle?.requestId(job.id) || "" });
}

function formatJobDate(value?: string) {
  if (!value) return t("notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function displayJobMode(value?: Job["mode"]) {
  if (value === "text-to-video") return t("textMode");
  if (value === "image-to-video") return t("imageMode");
  return t("notAvailable");
}

function displayJobTitle(value?: Job["mode"]) {
  if (value === "text-to-video") return t("textToVideo");
  if (value === "image-to-video") return t("imageToVideo");
  return t("creationDetails");
}

function displayQuality(value?: string) {
  if (!value) return t("notAvailable");
  return value.toLowerCase() === "standard" ? t("standard") : titleCase(value.replace(/[-_]+/g, " "));
}

function displayModel(value: string) {
  if (value.toLowerCase() === "peach-max") return "Fantivo Max";
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function resetJobVideo() {
  const video = element<HTMLVideoElement>("job-video-player");
  video.pause();
  video.removeAttribute("src");
  video.load();
  resetPlaybackControls();
  activeJobVideo = null;
  pendingPublicationRequestId = "";
  publicationSubmitting = false;
  element<HTMLFormElement>("job-publish-form").hidden = true;
  const outputActions = element<HTMLElement>("job-output-actions");
  outputActions.hidden = true;
  outputActions.classList.remove("is-single");
  element<HTMLElement>("job-video-player-section").hidden = true;
  element<HTMLElement>("job-video-error").hidden = true;
}

function playbackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function updatePlaybackControls() {
  const video = element<HTMLVideoElement>("job-video-player");
  const toggle = element<HTMLButtonElement>("job-player-toggle");
  const progress = element<HTMLInputElement>("job-player-progress");
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  toggle.textContent = video.paused ? t("playVideo") : t("pauseVideo");
  toggle.setAttribute("aria-label", toggle.textContent);
  element("job-player-current").textContent = playbackTime(video.currentTime);
  element("job-player-duration").textContent = playbackTime(duration);
  progress.value = duration ? String(Math.round((video.currentTime / duration) * 1000)) : "0";
  element<HTMLButtonElement>("job-player-mute").textContent = video.muted ? t("unmuteVideo") : t("muteVideo");
}

function resetPlaybackControls() {
  const video = element<HTMLVideoElement>("job-video-player");
  element<HTMLButtonElement>("job-player-toggle").textContent = t("playVideo");
  element("job-player-current").textContent = "0:00";
  element("job-player-duration").textContent = playbackTime(Number.isFinite(video.duration) ? video.duration : 0);
  element<HTMLInputElement>("job-player-progress").value = "0";
  element<HTMLButtonElement>("job-player-mute").textContent = video.muted ? t("unmuteVideo") : t("muteVideo");
}

async function toggleActiveJobPlayback() {
  const video = element<HTMLVideoElement>("job-video-player");
  if (!video.src) return;
  if (video.paused) await video.play().catch(() => undefined);
  else video.pause();
  updatePlaybackControls();
}

function resetPublicationForm(job: Job) {
  pendingPublicationRequestId = "";
  publicationSubmitting = false;
  const form = element<HTMLFormElement>("job-publish-form");
  form.hidden = true;
  const suggestedTitle = job.prompt?.trim().replace(/\s+/g, " ").slice(0, 100) || job.id;
  element<HTMLInputElement>("job-publish-title").value = suggestedTitle;
  element<HTMLTextAreaElement>("job-publish-description").value = "";
  element<HTMLInputElement>("job-publish-tags").value = "";
  element<HTMLButtonElement>("job-publish-submit").disabled = false;
  element<HTMLButtonElement>("job-publish-submit").textContent = t("submitForReview");
}

function openPublicationForm() {
  const job = activeJobVideo;
  if (!job || submittedPublicationJobs.has(job.id)) return;
  const form = element<HTMLFormElement>("job-publish-form");
  form.hidden = false;
  const titleInput = element<HTMLInputElement>("job-publish-title");
  titleInput.focus();
  titleInput.setSelectionRange(0, 0);
  form.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  track("job_publish_opened", { job_id: job.id, model: job.model, mode: job.mode || "unknown" });
}

async function submitActiveJobPublication() {
  const job = activeJobVideo;
  if (!job || publicationSubmitting) return;
  const title = element<HTMLInputElement>("job-publish-title").value.trim();
  const description = element<HTMLTextAreaElement>("job-publish-description").value.trim();
  const tags = [...new Set(element<HTMLInputElement>("job-publish-tags").value
    .split(/[,，#\n]+/)
    .map((tag) => tag.trim())
    .filter(Boolean))].slice(0, 10);
  if (title.length < 2) {
    element<HTMLInputElement>("job-publish-title").reportValidity();
    return;
  }

  publicationSubmitting = true;
  pendingPublicationRequestId ||= crypto.randomUUID();
  const submitButton = element<HTMLButtonElement>("job-publish-submit");
  submitButton.disabled = true;
  submitButton.textContent = t("publishing");
  try {
    const result = api
      ? await api.submitPublication(job.id, title, description, tags, pendingPublicationRequestId)
      : { publication: { id: `pub_${job.id}`, jobId: job.id, title, description, tags, status: "pending_review", version: 1 } };
    submittedPublicationJobs.add(job.id);
    element<HTMLFormElement>("job-publish-form").hidden = true;
    const status = element<HTMLElement>("job-publication-status");
    status.textContent = t("publishSubmitted");
    status.hidden = false;
    const publishButton = element<HTMLButtonElement>("job-publish-open");
    publishButton.textContent = t("publishSubmitted");
    publishButton.disabled = true;
    track("job_publish_submitted", {
      job_id: job.id,
      publication_id: result.publication.id,
      publication_status: result.publication.status,
      tag_count: tags.length,
    });
    toast(t("publishSubmitted"), "success");
    webApp.HapticFeedback?.notificationOccurred("success");
  } catch (error) {
    track("job_publish_failed", { job_id: job.id, ...analyticsError(error) });
    submitButton.disabled = false;
    submitButton.textContent = t("submitForReview");
    toast(error instanceof ApiError ? messageOf(error) : t("publishFailed"), "error");
  } finally {
    publicationSubmitting = false;
  }
}

function downloadActiveJobVideo() {
  const job = activeJobVideo;
  const url = safeHttpUrl(job?.outputUrl);
  if (!job || !url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = `${job.id}.mp4`;
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
  track("job_video_downloaded", { job_id: job.id, model: job.model });
  toast(t("downloadStarted"), "success");
}

async function shareActiveJobVideo() {
  const job = activeJobVideo;
  const url = safeHttpUrl(job?.outputUrl);
  if (!job || !url) return;
  try {
    if (navigator.share) await navigator.share({ title: job.id, text: job.prompt || job.id, url });
    else {
      await navigator.clipboard.writeText(url);
      toast(t("shareCopied"), "success");
    }
    track("job_video_shared", { job_id: job.id, native_share: Boolean(navigator.share) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast(t("genericError"), "error");
  }
}

function createAgainFromActiveJob() {
  const job = activeJobVideo;
  if (!job) return;
  const nextMode = job.mode === "image-to-video" ? "image" : "text";
  const prompt = job.prompt || "";
  jobDetailCloseReason = "programmatic";
  jobVideoDialog.close();
  clearSelectedContent();
  setMode(nextMode, "reset");
  if (typeof job.durationSeconds === "number") selectDuration(String(job.durationSeconds), "job");
  if (job.aspectRatio) selectAspectRatio(job.aspectRatio, "job");
  promptInput.value = prompt;
  element("prompt-count").textContent = `${prompt.length} / ${data?.generation.maxPromptLength ?? 1000}`;
  pendingRequestId = "";
  updateSubmitState();
  navigateToPage("create", "job_create_again");
  promptInput.focus();
  track("job_create_again_opened", { job_id: job.id, source_mode: job.mode || "unknown" });
}

async function copyActiveJobPrompt() {
  const job = activeJobVideo;
  const prompt = job?.prompt?.trim();
  if (!job || !prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = prompt;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }
  track("job_prompt_copied", {
    job_id: job.id,
    status: job.status.toLowerCase(),
    mode: job.mode || "unknown",
    model: job.model,
    prompt_length: prompt.length,
  });
  toast(t("promptCopied"), "success");
  webApp.HapticFeedback?.notificationOccurred("success");
}

function renderPacks() {
  if (!data) return;
  const subscriptionSection = element<HTMLElement>("subscription-section");
  const creditSection = element<HTMLElement>("credit-packs-section");
  const modeSwitch = element<HTMLElement>("wallet-mode-switch");
  const subscriptionsAvailable = Boolean(data.subscriptionPlans.length || data.subscription);
  const creditsAvailable = Boolean(data.creditPacks.length);
  if (!subscriptionsAvailable && creditsAvailable) walletProductMode = "credits";
  if (!creditsAvailable && subscriptionsAvailable) walletProductMode = "subscriptions";
  modeSwitch.hidden = !subscriptionsAvailable || !creditsAvailable;
  subscriptionSection.hidden = !subscriptionsAvailable || walletProductMode !== "subscriptions";
  creditSection.hidden = !creditsAvailable || walletProductMode !== "credits";
  for (const button of modeSwitch.querySelectorAll<HTMLButtonElement>("[data-wallet-product-mode]")) {
    const selected = button.dataset.walletProductMode === walletProductMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  const status = element<HTMLElement>("subscription-status");
  if (data.subscription) {
    const plan = data.subscriptionPlans.find((item) => item.id === data!.subscription?.planId);
    const renewalDate = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(data.subscription.expiresAt * 1_000));
    const action = data.subscription.isCanceled ? "resume" : "cancel";
    status.innerHTML = `
      <span><small>${t("activeSubscription")}</small><strong>${escapeHtml(plan?.title || data.subscription.planId)}</strong></span>
      <span><small>${t(data.subscription.isCanceled ? "endsOn" : "renewsOn")}</small><strong>${escapeHtml(renewalDate)}</strong></span>
      ${data.subscription.isCanceled ? `<p>${t("renewalCanceled")}</p>` : ""}
      <button data-subscription-action="${action}" type="button">${t(data.subscription.isCanceled ? "resumeRenewal" : "cancelRenewal")}</button>`;
    status.hidden = false;
  } else {
    status.hidden = true;
    status.textContent = "";
  }
  const subscriptionPurchaseBusy = subscriptionPurchase.phase !== "idle";
  element("subscription-plans").innerHTML = data.subscriptionPlans.map((plan) => {
    const pendingPlan = subscriptionPurchaseBusy && subscriptionPurchase.productId === plan.id;
    const pendingLabel = subscriptionPurchase.phase === "creating_invoice"
      ? t("openingPayment")
      : subscriptionPurchase.phase === "awaiting_payment"
        ? t("awaitingPayment")
        : t("confirmingSubscription");
    const buttonLabel = data!.subscription?.planId === plan.id
      ? t("currentPlan")
      : pendingPlan ? pendingLabel : t("subscribe");
    const disabled = !data!.subscriptionAvailable || Boolean(data!.subscription) || subscriptionPurchaseBusy;
    return `
    <article class="subscription-plan ${plan.recommended ? "subscription-plan--featured" : ""} ${data!.subscription?.planId === plan.id ? "is-active" : ""}">
      ${plan.recommended ? `<span class="subscription-plan__tag">${t("featured")}</span>` : ""}
      <header><div><h4>${escapeHtml(plan.title)}</h4></div><strong><b>${plan.stars.toLocaleString(locale)}</b><small><i class="ph-fill ph-star" aria-hidden="true"></i> / 30 ${t("days")}</small></strong></header>
      <div class="subscription-plan__credits"><b>${plan.creditsPerCycle.toLocaleString(locale)}</b><span>${t("creditsEachCycle")}</span></div>
      <button class="${pendingPlan ? "is-pending" : ""}" data-subscription-plan="${escapeHtml(plan.id)}" type="button" ${disabled ? "disabled" : ""} ${pendingPlan ? `aria-busy="true" aria-live="polite"` : ""}>${buttonLabel}</button>
    </article>`;
  }).join("");
  element("credit-packs").innerHTML = data.creditPacks.map((pack) => `
    <button class="credit-pack" data-pack="${escapeHtml(pack.id)}" type="button">
      <span><strong>${pack.credits.toLocaleString(locale)}</strong><small>${t("credits")}</small></span>
      <b>${pack.stars.toLocaleString(locale)} <i class="ph-fill ph-star" aria-hidden="true"></i><small>${t("buy")}</small></b>
    </button>`).join("");
  if (activePage === "wallet" && walletProductMode === "subscriptions" && !subscriptionSection.hidden) showFeaturedSubscriptionPlan();
}

function showFeaturedSubscriptionPlan() {
  window.requestAnimationFrame(() => {
    const featuredPlan = element<HTMLElement>("subscription-plans").querySelector<HTMLElement>(".subscription-plan--featured");
    featuredPlan?.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
  });
}

function setWalletProductMode(nextMode: WalletProductMode) {
  const changed = walletProductMode !== nextMode;
  walletProductMode = nextMode;
  renderPacks();
  if (walletProductMode === "subscriptions") showFeaturedSubscriptionPlan();
  if (changed) webApp.HapticFeedback?.selectionChanged();
}

const IN_PROGRESS_JOB_STATUSES = new Set(["queued", "pending", "processing", "running", "in_progress", "generating"]);
const CANCELLED_JOB_STATUSES = new Set(["cancelled", "canceled"]);

function jobStatusFilter(status: string): Exclude<JobFilter, "all"> {
  const normalized = status.toLowerCase();
  if (normalized === "succeeded") return "completed";
  if (IN_PROGRESS_JOB_STATUSES.has(normalized)) return "inProgress";
  return "failed";
}

function statusView(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "succeeded") return { label: t("statusSucceeded"), glyph: '<i class="ph-fill ph-play" aria-hidden="true"></i>', className: "is-success", active: false };
  if (["queued", "pending"].includes(normalized)) return { label: t("statusQueued"), glyph: '<i class="ph ph-clock" aria-hidden="true"></i>', className: "is-active", active: true };
  if (IN_PROGRESS_JOB_STATUSES.has(normalized)) return { label: t("statusProcessing"), glyph: '<i class="ph ph-sparkle" aria-hidden="true"></i>', className: "is-active", active: true };
  if (CANCELLED_JOB_STATUSES.has(normalized)) return { label: t("statusCancelled"), glyph: '<i class="ph ph-x" aria-hidden="true"></i>', className: "is-muted", active: false };
  return { label: t("statusFailed"), glyph: '<i class="ph ph-warning" aria-hidden="true"></i>', className: "is-error", active: false };
}

function titleCase(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function renderFatal(error: unknown) {
  const message = messageOf(error);
  element("create-service-message-text").textContent = message;
  element<HTMLElement>("create-service-message").hidden = false;
  element("create-service-retry").textContent = authenticationFailed ? t("openTelegram") : t("retry");
  element("jobs-list").innerHTML = `<div class="empty-state empty-state--error"><b>!</b><h3>${t("connectionFailed")}</h3><p>${escapeHtml(message)}</p><button id="retry-load" type="button">${t("retry")}</button></div>`;
  element("retry-load").textContent = authenticationFailed ? t("openTelegram") : t("retry");
  element<HTMLButtonElement>("retry-load").addEventListener("click", retryBootstrap);
}

function retryBootstrap() {
  if (authenticationFailed) window.location.assign("https://t.me/fantivo_bot/app");
  else void loadBootstrap();
}

function handleAuthenticationFailure(error: unknown) {
  if (!(error instanceof ApiError) || !["unauthorized", "session_expired"].includes(error.code)) return false;
  authenticationFailed = true;
  bootstrapError = error;
  renderFatal(error);
  updateSubmitState();
  return true;
}

function messageOf(error: unknown) {
  if (error instanceof ApiError) return localizedApiError(error);
  return withSupport(t("genericError"));
}

function localizedApiError(error: ApiError) {
  const presentation = apiErrorPresentation(error.code);
  const maxPromptLength = data?.generation.maxPromptLength ?? 1_000;
  const maxImageMegabytes = Math.max(1, Math.floor((data?.generation.maxImageBytes ?? 10_485_760) / 1024 / 1024));
  const message = t(presentation.key, { max: presentation.key === "errorImageTooLarge" ? maxImageMegabytes : maxPromptLength });
  return presentation.contactSupport ? withSupport(message) : message;
}

function jobFailureMessage(job: Job) {
  const refunded = job.creditsRefunded === true || (job.refundedCredits || 0) > 0;
  const presentation = jobFailurePresentation(job.failureCode, refunded);
  const message = t(presentation.key);
  return presentation.contactSupport ? withSupport(message) : message;
}

function withSupport(message: string) {
  return `${message} ${t("supportHint")}`;
}

function setMode(nextMode: "text" | "image", selectionSource: "user" | "content_requirement" | "reset" = "user") {
  const requiredMode = selectedContent && (selectedContent.kind === "asset" || selectedContent.requiresImage) ? "image" : selectedContent ? "text" : null;
  if (requiredMode && nextMode !== requiredMode) return;
  mode = nextMode;
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === nextMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  imageField.hidden = nextMode !== "image";
  pendingRequestId = "";
  webApp.HapticFeedback?.selectionChanged();
  track("generation_mode_selected", { mode: nextMode, selection_source: selectionSource });
  updateSubmitState();
  if (selectionSource === "user") scrollCreateControlIntoView(nextMode === "image" ? imageField : promptInput);
}

function scrollCreateControlIntoView(target: HTMLElement) {
  if (activePage !== "create") return;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  });
}

function selectContentForCreation(content: Content) {
  selectedContent = content;
  selectedContentPersonaCode = homeFeed?.personaCode || selectedPersonaCode;
  pendingRequestId = "";
  const maxPromptLength = data?.generation.maxPromptLength ?? 1000;
  promptInput.value = (content.prompt?.trim() || content.promptDisplay?.trim() || "").slice(0, maxPromptLength);
  element("prompt-count").textContent = `${promptInput.value.length} / ${maxPromptLength}`;
  const requiredMode = content.kind === "asset" || content.requiresImage ? "image" : "text";
  if (requiredMode === "text") {
    chooseFile(null);
    imageInput.value = "";
  }
  setMode(requiredMode, "content_requirement");
  if (content.aspectRatio) selectAspectRatio(content.aspectRatio, "content");
  renderContentSelection();
  track("home_content_selected_for_creation", {
    item_id: content.id,
    item_kind: content.kind,
    requires_image: requiredMode === "image",
    ...homeFeedProperties(),
  });
}

function clearSelectedContent(clearReason: "user_removed" | "generation_created" | "persona_changed" = "user_removed") {
  const previous = selectedContent;
  selectedContent = null;
  selectedContentPersonaCode = "";
  if (clearReason === "persona_changed") {
    promptInput.value = "";
    element("prompt-count").textContent = `0 / ${data?.generation.maxPromptLength ?? 1000}`;
  }
  pendingRequestId = "";
  renderContentSelection();
  updateSubmitState();
  if (previous) track("home_content_selection_cleared", {
    item_id: previous.id,
    item_kind: previous.kind,
    clear_reason: clearReason,
    ...homeFeedProperties(),
  });
}

function renderContentSelection() {
  const selection = element<HTMLElement>("content-selection");
  const image = element<HTMLImageElement>("content-selection-image");
  selection.hidden = !selectedContent;
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    if (!selectedContent) {
      button.disabled = false;
      return;
    }
    const requiredMode = selectedContent.kind === "asset" || selectedContent.requiresImage ? "image" : "text";
    button.disabled = button.dataset.mode !== requiredMode;
  });
  if (!selectedContent) {
    image.hidden = true;
    image.removeAttribute("src");
    return;
  }
  element<HTMLElement>("content-selection-kind").textContent = selectedContent.kind === "template" ? t("templateDetail") : t("assetDetail");
  element<HTMLElement>("content-selection-title").textContent = selectedContent.title;
  const visual = selectedContent.kind === "asset" && selectedContent.defaultReferenceEnabled
    ? safeHttpUrl(selectedContent.defaultReferenceImageUrl || selectedContent.previewUrl)
    : safeHttpUrl(selectedContent.previewUrl);
  image.hidden = !visual;
  if (visual) image.src = visual;
  else image.removeAttribute("src");
}

function updateSubmitState() {
  // Keep validation failures actionable so a tap explains the missing input.
  createButton.disabled = submitting;
  createButton.classList.toggle("is-loading", submitting);
  createButton.querySelector<HTMLElement>(".primary-button__label")!.textContent = submitting ? t("submitting") : t("generate");
  const creditCost = data?.generation.creditCost;
  generationCreditCost.hidden = creditCost == null;
  generationCreditCost.textContent = creditCost == null ? "" : `${creditCost.toLocaleString(locale)} ${t("credits")}`;
}

function chooseFile(file: File | null) {
  const maxBytes = data?.generation.maxImageBytes ?? 10_485_760;
  if (file && !new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
    toast(t("errorUnsupportedImage"), "error");
    imageInput.value = "";
    return;
  }
  if (file && file.size > maxBytes) {
    toast(t("errorImageTooLarge", { max: Math.max(1, Math.floor(maxBytes / 1024 / 1024)) }), "error");
    imageInput.value = "";
    return;
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  selectedFile = file;
  previewUrl = file ? URL.createObjectURL(file) : "";
  imagePreview.src = previewUrl;
  imageEmpty.hidden = Boolean(file);
  imagePreviewWrap.hidden = !file;
  pendingRequestId = "";
  if (file) {
    track("generation_image_selected", {
      mime_type: file.type,
      size_bucket: fileSizeBucket(file.size),
    });
  }
  updateSubmitState();
}

async function submitCreation(trigger: "button" | "form_submit") {
  if (submitting) return;
  const prompt = promptInput.value.trim();
  const sourceContent = selectedContent;
  const validationBlockReason = generationValidationBlockReason(prompt, sourceContent);
  if (!validationBlockReason) pendingRequestId ||= crypto.randomUUID();
  const eventProperties = {
    mode,
    prompt_length: prompt.length,
    has_image: Boolean(selectedFile),
    model: data?.generation.model || "",
    duration_seconds: selectedDurationSeconds,
    aspect_ratio: selectedAspectRatio,
    quality: data?.generation.quality || "",
    source_content_kind: sourceContent?.kind || "",
    source_content_id: sourceContent?.id || "",
  };
  track("generate_clicked", {
    ...eventProperties,
    trigger,
    validation_result: validationBlockReason ? "blocked" : "accepted",
    validation_block_reason: validationBlockReason,
    request_id: validationBlockReason ? "" : pendingRequestId,
  });
  if (validationBlockReason || !data) {
    const message = validationBlockReason === "image_required" ? t("errorImageRequired")
      : validationBlockReason === "content_unavailable" ? t("templateUnavailableDescription")
      : validationBlockReason.startsWith("prompt_") ? t("errorInvalidPrompt", { max: data?.generation.maxPromptLength || 1_000 })
      : bootstrapError ? messageOf(bootstrapError) : t("preparing");
    toast(message, "error");
    return;
  }

  submitting = true;
  const requestId = pendingRequestId;
  try {
    updateSubmitState();
    track("generation_submitted", { ...eventProperties, request_id: requestId });
    let job: Job;
    let replayed = false;
    if (!api) {
      if (!demoAllowed) throw new ApiError("unauthorized", "", 401);
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      job = {
        id: `job_preview_${Date.now().toString(36)}`, status: "queued", progress: 4, mode: mode === "image" ? "image-to-video" : "text-to-video",
        prompt, model: data.generation.model, creditCost: data.generation.creditCost ?? 0, quality: data.generation.quality, durationSeconds: selectedDurationSeconds,
        aspectRatio: selectedAspectRatio, audioEnabled: false, imageUrl: previewUrl || undefined, createdAt: new Date().toISOString(),
      };
      job.sourceContentKind = sourceContent?.kind;
      job.sourceContentId = sourceContent?.id;
      data.wallet.balance = Math.max(0, data.wallet.balance - job.creditCost);
      data.jobs.unshift(job);
    } else {
      const result = sourceContent
        ? mode === "image"
          ? await api.createContentImageJob(sourceContent, selectedFile!, prompt, selectedDurationSeconds, selectedAspectRatio, requestId, selectedContentPersonaCode)
          : await api.createContentTextJob(sourceContent, prompt, selectedDurationSeconds, selectedAspectRatio, requestId, selectedContentPersonaCode)
        : mode === "image"
          ? await api.createImageJob(selectedFile!, prompt, selectedDurationSeconds, selectedAspectRatio, requestId)
          : await api.createTextJob(prompt, selectedDurationSeconds, selectedAspectRatio, requestId);
      job = result.job;
      replayed = result.replayed;
      data.jobs = [job, ...data.jobs.filter((item) => item.id !== job.id)];
    }
    track("generation_created", {
      ...eventProperties,
      request_id: requestId,
      job_id: job.id,
      credit_cost: job.creditCost,
      replayed,
    });
    jobLifecycle?.created(job, requestId);
    pendingRequestId = "";
    promptInput.value = "";
    element("prompt-count").textContent = `0 / ${data.generation.maxPromptLength}`;
    chooseFile(null);
    clearSelectedContent("generation_created");
    setMode("text", "reset");
    renderData();
    toast(t("taskSubmitted"), "success");
    try { webApp.HapticFeedback?.notificationOccurred("success"); } catch { /* Optional feedback. */ }
    navigateToPage("jobs", "generation_success");
    if (api) window.setTimeout(() => void loadBootstrap(true), 900);
  } catch (error) {
    track("generation_failed", { ...eventProperties, request_id: requestId, ...analyticsError(error) });
    handleAuthenticationFailure(error);
    if (error instanceof ApiError && error.code === "insufficient_credits") {
      openWallet("insufficient_credits");
      toast(t("insufficientCreditsInvite"), "error");
    } else {
      toast(messageOf(error), "error");
    }
    try { webApp.HapticFeedback?.notificationOccurred("error"); } catch { /* Optional feedback. */ }
  } finally {
    submitting = false;
    updateSubmitState();
  }
}

function generationValidationBlockReason(prompt: string, sourceContent: Content | null) {
  if (authenticationFailed || (!api && !demoAllowed)) return "authentication_required";
  if (!data) return "bootstrap_not_ready";
  if (sourceContent && (!sourceContent.canCreate || (sourceContent.requiredImageCount || 0) > 1)) return "content_unavailable";
  if ((!sourceContent && prompt.length < 3) || (sourceContent && prompt.length > 0 && prompt.length < 3)) return "prompt_too_short";
  if (prompt.length > data.generation.maxPromptLength) return "prompt_too_long";
  if (mode === "image" && !selectedFile) return "image_required";
  return "";
}

function openWallet(entryPoint: "balance" | "bottom_navigation" | "insufficient_credits") {
  walletProductMode = entryPoint === "insufficient_credits" ? "credits" : "subscriptions";
  navigateToPage("wallet", entryPoint);
  if (!data) return;
  renderPacks();
  if (walletProductMode === "subscriptions") showFeaturedSubscriptionPlan();
  webApp.HapticFeedback?.impactOccurred("light");
  track("wallet_opened", { entry_point: entryPoint, product_mode: walletProductMode });
}

async function shareReferral() {
  const referral = data?.referral;
  if (!referral?.enabled || !referral.shareUrl) return;
  const text = t("inviteShareText", { credits: referral.rewardCredits.toLocaleString(locale) });
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referral.shareUrl)}&text=${encodeURIComponent(text)}`;
  const shareMethod = isTelegram && webApp.openTelegramLink
    ? "telegram_share"
    : "share" in navigator
      ? "native_share"
      : "clipboard";
  track("referral_share_clicked", {
    share_method: shareMethod,
    reward_credits: referral.rewardCredits,
    weekly_limit: referral.weeklyLimit,
    remaining_rewards: referral.remainingRewards,
  });
  try {
    if (shareMethod === "telegram_share") {
      webApp.openTelegramLink!(telegramShareUrl);
    } else if (shareMethod === "native_share") {
      await navigator.share({ title: t("inviteTitle"), text, url: referral.shareUrl });
    } else {
      await navigator.clipboard.writeText(`${text} ${referral.shareUrl}`);
      toast(t("inviteCopied"), "success");
    }
    webApp.HapticFeedback?.impactOccurred("light");
  } catch (error) {
    if ((error as { name?: string } | null)?.name !== "AbortError") toast(t("inviteShareFailed"), "error");
  }
}

async function copyReferralLink() {
  const referral = data?.referral;
  if (!referral?.enabled || !referral.shareUrl) return;
  track("referral_share_clicked", {
    share_method: "copy_link",
    reward_credits: referral.rewardCredits,
    weekly_limit: referral.weeklyLimit,
    remaining_rewards: referral.remainingRewards,
  });
  try {
    await copyText(referral.shareUrl);
    toast(t("inviteCopied"), "success");
    webApp.HapticFeedback?.notificationOccurred("success");
  } catch {
    toast(t("inviteCopyFailed"), "error");
  }
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard_unavailable");
}

async function buyProduct(productId: string, productType: "credit_pack" | "subscription") {
  if (!data) return;
  const product = productType === "subscription"
    ? data.subscriptionPlans.find((item) => item.id === productId)
    : data.creditPacks.find((item) => item.id === productId);
  if (!product) return;
  if (productType === "subscription" && subscriptionPurchase.phase !== "idle") return;
  if (productType === "subscription") updateSubscriptionPurchase({ type: "start", productId });
  const credits = "creditsPerCycle" in product ? product.creditsPerCycle : product.credits;
  const packProperties = { product_id: product.id, product_type: productType, stars: product.stars, credits };
  track(productType === "subscription" ? "subscription_plan_selected" : "credit_pack_selected", packProperties);
  try {
    const invoice = api ? await api.createInvoice(product.id, productType, data.legal.termsVersion) : { invoiceUrl: "https://t.me/$preview" };
    const invoiceUrl = invoice.invoiceUrl || invoice.invoice_url || "";
    const orderId = invoice.orderId || invoice.order_id || "";
    track("invoice_opened", packProperties);
    if (productType === "subscription") updateSubscriptionPurchase({ type: "invoice_opened" });
    webApp.openInvoice(invoiceUrl, (status) => {
      track("payment_result_received", { ...packProperties, status });
      if (productType === "subscription") {
        updateSubscriptionPurchase({ type: "invoice_result", status });
        if (status === "paid" || status === "pending") void syncSubscriptionAfterPayment();
      }
      if (productType === "subscription" && status === "paid") toast(t("subscriptionSuccess"), "success");
      if (productType === "credit_pack" && (status === "paid" || status === "pending") && orderId) {
        void syncCreditOrderAfterInvoice(orderId, packProperties);
      } else if (status === "failed") toast(`${t("paymentFailed")} ${t("paymentSupportHint")}`, "error");
    });
  } catch (error) {
    if (productType === "subscription") updateSubscriptionPurchase({ type: "invoice_error" });
    track("invoice_creation_failed", { ...packProperties, ...analyticsError(error) });
    toast(messageOf(error), "error");
  }
}

async function syncCreditOrderAfterInvoice(orderId: string, properties: Record<string, unknown>) {
  if (!api) return;
  for (const delayMs of [500, 1_000, 1_500, 2_500, 4_000, 7_000]) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    try {
      const order = await api.paymentOrder(orderId);
      if (order.status === "PAID") {
        track("payment_paid", { ...properties, order_id: orderId });
        await loadBootstrap(true);
        toast(t("paymentSuccess"), "success");
        return;
      }
      if (order.status === "FAILED") {
        toast(`${t("paymentFailed")} ${t("paymentSupportHint")}`, "error");
        return;
      }
    } catch {
      // A transient status read is retried; the authoritative Webhook remains the source of truth.
    }
  }
}

function updateSubscriptionPurchase(event: SubscriptionPurchaseEvent) {
  subscriptionPurchase = reduceSubscriptionPurchase(subscriptionPurchase, event);
  if (data) renderPacks();
}

async function syncSubscriptionAfterPayment() {
  for (const delayMs of [1_000, 1_500, 2_500, 4_000, 7_000]) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    await loadBootstrap(true);
    if (data?.subscription || subscriptionPurchase.phase === "idle") return;
  }
}

async function manageSubscriptionRenewal(action: "cancel" | "resume") {
  if (!data?.subscription) return;
  if (action === "cancel" && !(await confirmInTelegram(t("cancelSubscriptionConfirm")))) return;
  const button = element<HTMLElement>("subscription-status").querySelector<HTMLButtonElement>("[data-subscription-action]");
  if (button) button.disabled = true;
  try {
    const subscription = api
      ? (action === "cancel" ? await api.cancelSubscription() : await api.resumeSubscription()).subscription
      : { ...data.subscription, isCanceled: action === "cancel" };
    data.subscription = subscription;
    renderPacks();
    track("subscription_renewal_changed", { action, plan_id: subscription.planId, expires_at: subscription.expiresAt });
    toast(t(action === "cancel" ? "subscriptionCanceled" : "subscriptionResumed"), "success");
    webApp.HapticFeedback?.notificationOccurred("success");
  } catch (error) {
    track("subscription_renewal_change_failed", { action, ...analyticsError(error) });
    toast(messageOf(error), "error");
    if (button) button.disabled = false;
  }
}

async function cancelJob(jobId: string) {
  const confirmed = await confirmInTelegram(t("cancelConfirm"));
  if (!confirmed || !data) return;
  const job = data.jobs.find((item) => item.id === jobId);
  const previousStatus = job?.status || "unknown";
  try {
    if (api) await api.cancelJob(jobId);
    if (job) job.status = "cancelled";
    track("job_cancelled", { previous_status: previousStatus });
    renderJobs();
    toast(t("cancelSubmitted"), "success");
    if (api) window.setTimeout(() => void loadBootstrap(true), 700);
  } catch (error) {
    track("job_cancel_failed", analyticsError(error));
    toast(messageOf(error), "error");
  }
}

function confirmInTelegram(message: string) {
  return new Promise<boolean>((resolve) => {
    if (webApp.showConfirm) webApp.showConfirm(message, resolve);
    else resolve(window.confirm(message));
  });
}

let toastTimer = 0;
function toast(message: string, kind: "success" | "error") {
  const toastElement = element("toast");
  const activeDialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  (activeDialog || document.body).append(toastElement);
  element("toast-message").textContent = message;
  element("toast-icon").className = kind === "error" ? "ph ph-warning-circle" : "ph ph-check-circle";
  toastElement.className = `toast is-visible toast--${kind}`;
  toastElement.setAttribute("role", kind === "error" ? "alert" : "status");
  toastElement.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastElement.className = "toast"; }, kind === "error" ? 7_000 : 3_500);
}

function analyticsError(error: unknown) {
  if (error instanceof ApiError) return { error_code: error.code, http_status: error.status };
  return { error_code: "unexpected_error" };
}

function fileSizeBucket(bytes: number) {
  if (bytes < 1024 * 1024) return "under_1mb";
  if (bytes < 5 * 1024 * 1024) return "1mb_to_5mb";
  return "5mb_to_10mb";
}

document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode === "image" ? "image" : "text"));
});
element<HTMLElement>("create-form").querySelector<HTMLElement>(".mode-switch")?.addEventListener("keydown", (event) => {
  if (!(event instanceof KeyboardEvent) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")].filter((button) => !button.disabled);
  const current = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>("[data-mode]") : null;
  if (!current || !buttons.length) return;
  event.preventDefault();
  const currentIndex = Math.max(0, buttons.indexOf(current));
  const forward = event.key === "ArrowRight" ? !isRtl(locale) : event.key === "ArrowLeft" ? isRtl(locale) : false;
  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (currentIndex + (forward ? 1 : -1) + buttons.length) % buttons.length;
  const next = buttons[nextIndex];
  next.focus();
  setMode(next.dataset.mode === "image" ? "image" : "text");
});
aspectRatioTrigger.addEventListener("click", () => {
  setAspectRatioMenuOpen(aspectRatioMenu.hidden, aspectRatioMenu.hidden);
});
aspectRatioTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  setAspectRatioMenuOpen(true, false);
  const items = aspectRatioMenuItems();
  const selectedIndex = Math.max(0, items.findIndex((item) => item.getAttribute("aria-selected") === "true"));
  const targetIndex = event.key === "ArrowUp" ? (selectedIndex - 1 + items.length) % items.length : selectedIndex;
  items[targetIndex]?.focus();
});
aspectRatioMenu.addEventListener("click", (event) => {
  const option = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-aspect-ratio]");
  if (option?.dataset.aspectRatio) selectAspectRatio(option.dataset.aspectRatio, "user");
});
aspectRatioMenu.addEventListener("keydown", (event) => {
  const items = aspectRatioMenuItems();
  const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") nextIndex = (activeIndex + 1) % items.length;
  if (event.key === "ArrowUp") nextIndex = (activeIndex - 1 + items.length) % items.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = items.length - 1;
  if (nextIndex !== null) {
    event.preventDefault();
    items[nextIndex]?.focus();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setAspectRatioMenuOpen(false);
    aspectRatioTrigger.focus();
  } else if (event.key === "Tab") {
    setAspectRatioMenuOpen(false);
  }
});
durationTrigger.addEventListener("click", () => {
  setDurationMenuOpen(durationMenu.hidden, durationMenu.hidden);
});
durationTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  setDurationMenuOpen(true, false);
  const items = durationMenuItems();
  const selectedIndex = Math.max(0, items.findIndex((item) => item.getAttribute("aria-selected") === "true"));
  const targetIndex = event.key === "ArrowUp" ? (selectedIndex - 1 + items.length) % items.length : selectedIndex;
  items[targetIndex]?.focus();
});
durationMenu.addEventListener("click", (event) => {
  const option = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-duration]");
  if (option?.dataset.duration) selectDuration(option.dataset.duration, "user");
});
durationMenu.addEventListener("keydown", (event) => {
  const items = durationMenuItems();
  const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") nextIndex = (activeIndex + 1) % items.length;
  if (event.key === "ArrowUp") nextIndex = (activeIndex - 1 + items.length) % items.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = items.length - 1;
  if (nextIndex !== null) {
    event.preventDefault();
    items[nextIndex]?.focus();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setDurationMenuOpen(false);
    durationTrigger.focus();
  } else if (event.key === "Tab") {
    setDurationMenuOpen(false);
  }
});
promptInput.addEventListener("input", () => {
  const maxLength = data?.generation.maxPromptLength ?? 1000;
  element("prompt-count").textContent = `${promptInput.value.length} / ${maxLength}`;
  pendingRequestId = "";
  updateSubmitState();
});
promptInput.addEventListener("focus", () => window.setTimeout(() => scrollCreateControlIntoView(promptInput), 220));
imageInput.addEventListener("change", () => chooseFile(imageInput.files?.[0] || null));
element<HTMLButtonElement>("image-remove").addEventListener("click", (event) => { event.preventDefault(); chooseFile(null); imageInput.value = ""; });
element<HTMLFormElement>("create-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const trigger = event instanceof SubmitEvent && event.submitter === createButton ? "button" : "form_submit";
  void submitCreation(trigger);
});
element<HTMLButtonElement>("create-service-retry").addEventListener("click", retryBootstrap);
element<HTMLButtonElement>("welcome-start").addEventListener("click", () => {
  closeWelcomeDialog();
  webApp.HapticFeedback?.impactOccurred("light");
  navigateToPage("create", "welcome_start");
});
element<HTMLButtonElement>("welcome-explore").addEventListener("click", closeWelcomeDialog);
welcomeDialog.addEventListener("cancel", () => {
  if (data) {
    try { localStorage.setItem(welcomeStorageKey(data.user.id), "seen"); } catch { /* local storage may be unavailable */ }
  }
});
element<HTMLButtonElement>("template-close").addEventListener("click", () => {
  detailCloseReason = "back";
  templateDialog.close();
});
element<HTMLButtonElement>("template-open-creator").addEventListener("click", () => {
  if (!detailContent || !detailContent.canCreate || (detailContent.requiredImageCount || 0) > 1) return;
  track("home_item_creator_opened", {
    item_id: templateDialog.dataset.itemId || "",
    item_kind: templateDialog.dataset.itemKind || "unknown",
    requires_image: detailContent.requiresImage,
    required_image_count: detailContent.requiredImageCount || 0,
    ...homeFeedProperties(),
  });
  selectContentForCreation(detailContent);
  detailCloseReason = "creator";
  templateDialog.close();
  navigateToPage("create", "template_detail");
});
templateDialog.addEventListener("cancel", () => { detailCloseReason = "escape"; });
templateDialog.addEventListener("close", () => {
  track("home_item_detail_closed", {
    item_id: templateDialog.dataset.itemId || "",
    item_kind: templateDialog.dataset.itemKind || "unknown",
    close_reason: detailCloseReason,
    detail_loaded: Boolean(detailContent),
    open_duration_ms: detailOpenedAt ? Math.round(performance.now() - detailOpenedAt) : 0,
    ...homeFeedProperties(),
  });
  resetHomeItemDetailMedia();
  detailOpenedAt = 0;
  detailCloseReason = "programmatic";
});
element<HTMLButtonElement>("job-video-close").addEventListener("click", () => {
  jobDetailCloseReason = "back";
  jobVideoDialog.close();
});
element<HTMLButtonElement>("job-prompt-copy").addEventListener("click", () => void copyActiveJobPrompt());
const jobVideoPlayer = element<HTMLVideoElement>("job-video-player");
element<HTMLButtonElement>("job-player-toggle").addEventListener("click", () => void toggleActiveJobPlayback());
jobVideoPlayer.addEventListener("click", () => void toggleActiveJobPlayback());
for (const eventName of ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended", "volumechange"] as const) {
  jobVideoPlayer.addEventListener(eventName, updatePlaybackControls);
}
element<HTMLInputElement>("job-player-progress").addEventListener("input", (event) => {
  const duration = jobVideoPlayer.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  jobVideoPlayer.currentTime = (Number((event.currentTarget as HTMLInputElement).value) / 1000) * duration;
  updatePlaybackControls();
});
element<HTMLButtonElement>("job-player-mute").addEventListener("click", () => {
  jobVideoPlayer.muted = !jobVideoPlayer.muted;
  updatePlaybackControls();
});
element<HTMLButtonElement>("job-download").addEventListener("click", downloadActiveJobVideo);
element<HTMLButtonElement>("job-share").addEventListener("click", () => void shareActiveJobVideo());
element<HTMLButtonElement>("job-publish-open").addEventListener("click", openPublicationForm);
element<HTMLButtonElement>("job-publish-cancel").addEventListener("click", () => { element<HTMLFormElement>("job-publish-form").hidden = true; });
element<HTMLFormElement>("job-publish-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void submitActiveJobPublication();
});
element<HTMLButtonElement>("job-create-again").addEventListener("click", createAgainFromActiveJob);
jobVideoPlayer.addEventListener("error", () => {
  if (activeJobVideo) {
    element<HTMLElement>("job-video-error").hidden = false;
    track("job_video_playback_failed", { job_id: activeJobVideo.id, media_error_code: jobVideoPlayer.error?.code || 0 });
  }
});
jobVideoDialog.addEventListener("cancel", () => { jobDetailCloseReason = "escape"; });
jobVideoDialog.addEventListener("close", () => {
  const job = activeJobVideo;
  if (job) track("job_details_closed", {
    job_id: job.id,
    status: job.status.toLowerCase(),
    mode: job.mode || "unknown",
    close_reason: jobDetailCloseReason,
    open_duration_ms: jobDetailOpenedAt ? Math.round(performance.now() - jobDetailOpenedAt) : 0,
  });
  resetJobVideo();
  jobDetailOpenedAt = 0;
  jobDetailCloseReason = "programmatic";
});
element<HTMLButtonElement>("content-selection-remove").addEventListener("click", () => clearSelectedContent());
element("credit-packs").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-pack]");
  if (target?.dataset.pack) void buyProduct(target.dataset.pack, "credit_pack");
});
element("subscription-plans").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-subscription-plan]");
  if (target?.dataset.subscriptionPlan) void buyProduct(target.dataset.subscriptionPlan, "subscription");
});
element("subscription-status").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-subscription-action]");
  const action = target?.dataset.subscriptionAction;
  if (action === "cancel" || action === "resume") void manageSubscriptionRenewal(action);
});
element("wallet-mode-switch").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-wallet-product-mode]");
  const nextMode = target?.dataset.walletProductMode;
  if (nextMode === "subscriptions" || nextMode === "credits") setWalletProductMode(nextMode);
});
element("wallet-mode-switch").addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const nextMode: WalletProductMode = walletProductMode === "subscriptions" ? "credits" : "subscriptions";
  setWalletProductMode(nextMode);
  element<HTMLButtonElement>(nextMode === "subscriptions" ? "wallet-mode-subscriptions" : "wallet-mode-credits").focus();
});
element<HTMLButtonElement>("referral-share").addEventListener("click", () => void shareReferral());
element<HTMLButtonElement>("referral-copy").addEventListener("click", () => void copyReferralLink());
element("jobs-list").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-cancel-job]");
  if (target?.dataset.cancelJob) {
    void cancelJob(target.dataset.cancelJob);
    return;
  }
  const details = (event.target as HTMLElement).closest<HTMLElement>("[data-open-job-details]");
  if (details?.dataset.openJobDetails) openJobDetails(details.dataset.openJobDetails);
});
element("jobs-filters").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-job-filter]");
  const filter = target?.dataset.jobFilter;
  if (!filter || !["all", "completed", "inProgress", "failed"].includes(filter)) return;
  activeJobFilter = filter as JobFilter;
  renderJobs();
  webApp.HapticFeedback?.selectionChanged();
});
element<HTMLButtonElement>("jobs-refresh").addEventListener("click", () => {
  track("jobs_refreshed");
  if (data) void refreshJobs(true);
  else retryBootstrap();
});
element("persona-selector").addEventListener("click", (event) => {
  const option = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-persona-code]");
  if (option?.dataset.personaCode) selectPersona(option.dataset.personaCode);
});
element("feed-content").addEventListener("click", (event) => {
  const refresh = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-home-refresh]");
  if (refresh) {
    webApp.HapticFeedback?.impactOccurred("light");
    track("personalized_feed_refreshed", homeFeedProperties());
    void loadHome("refresh");
    return;
  }
  const category = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-home-category]");
  if (category?.dataset.homeCategory) {
    selectHomeCategory(category.dataset.homeCategory);
    return;
  }
  const item = (event.target as HTMLElement).closest<HTMLElement>("[data-home-item]");
  if (item) {
    track("home_item_clicked", homeItemProperties(item));
    void openHomeItemDetail(item);
    return;
  }
  const retry = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-home-retry]");
  if (retry) {
    track("personalized_feed_retry_clicked", {
      feed_session_id: feedSessionId,
      locale,
    });
    void loadHome("retry");
  }
});
element("create-templates").addEventListener("click", (event) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>("[data-home-item]");
  if (!item) return;
  track("home_item_clicked", homeItemProperties(item));
  void openHomeItemDetail(item);
});
root.addEventListener("click", (event) => {
  const control = (event.target as HTMLElement).closest<HTMLElement>("[data-page-target]");
  if (!control) return;
  const destination = control.dataset.pageTarget || "";
  if (!isAppPage(destination)) return;
  event.preventDefault();
  const source = control.dataset.navigationSource || "content_link";
  if (destination === "wallet") openWallet(control.dataset.walletEntry === "balance" ? "balance" : "bottom_navigation");
  else navigateToPage(destination, source);
});
window.addEventListener("popstate", () => navigateToPage(pageFromLocation(), "browser_history", "none"));
const languageControl = document.querySelector<HTMLElement>(".language-control");
const languageTrigger = element<HTMLButtonElement>("language-trigger");
const languageMenu = element<HTMLElement>("language-menu");

function languageMenuItems() {
  return Array.from(languageMenu.querySelectorAll<HTMLButtonElement>("[data-locale]"));
}

function setLanguageMenuOpen(open: boolean, focusItem = false) {
  languageMenu.hidden = !open;
  languageTrigger.setAttribute("aria-expanded", String(open));
  if (!open || !focusItem) return;
  const items = languageMenuItems();
  const selected = items.find((item) => item.getAttribute("aria-checked") === "true");
  (selected || items[0])?.focus();
}

async function selectLocale(nextLocale: Locale) {
  setLanguageMenuOpen(false);
  if (nextLocale === locale) {
    languageTrigger.focus();
    return;
  }
  track("locale_changed", { from: locale, to: nextLocale });
  webApp.HapticFeedback?.selectionChanged();
  try {
    await flushAnalytics();
  } finally {
    saveLocale(nextLocale);
    window.location.reload();
  }
}

languageTrigger.addEventListener("click", () => {
  setLanguageMenuOpen(languageMenu.hidden, languageMenu.hidden);
});

languageTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  setLanguageMenuOpen(true, false);
  const items = languageMenuItems();
  const target = event.key === "ArrowUp"
    ? items[items.length - 1]
    : items.find((item) => item.getAttribute("aria-checked") === "true") || items[0];
  target?.focus();
});

languageMenu.addEventListener("click", (event) => {
  const item = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-locale]");
  const nextLocale = item?.dataset.locale as Locale | undefined;
  if (!nextLocale || !(SUPPORTED_LOCALES as readonly Locale[]).includes(nextLocale)) return;
  void selectLocale(nextLocale);
});

languageMenu.addEventListener("keydown", (event) => {
  const items = languageMenuItems();
  const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") nextIndex = (activeIndex + 1) % items.length;
  if (event.key === "ArrowUp") nextIndex = (activeIndex - 1 + items.length) % items.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = items.length - 1;
  if (nextIndex !== null) {
    event.preventDefault();
    items[nextIndex]?.focus();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setLanguageMenuOpen(false);
    languageTrigger.focus();
  } else if (event.key === "Tab") {
    setLanguageMenuOpen(false);
  }
});

document.addEventListener("click", (event) => {
  if (!languageMenu.hidden && !languageControl?.contains(event.target as Node)) {
    setLanguageMenuOpen(false);
  }
  if (!aspectRatioMenu.hidden && !aspectRatioControl.contains(event.target as Node)) {
    setAspectRatioMenuOpen(false);
  }
  if (!durationMenu.hidden && !durationControl.contains(event.target as Node)) {
    setDurationMenuOpen(false);
  }
});

if (isTelegram && !analyticsConfigured()) {
  console.warn("PostHog analytics is not configured for this build.");
}

void loadBootstrap();
void loadHome();
navigateToPage(activePage, "initial", "replace");
async function refreshJobs(manual = false) {
  if (!api || !data || jobsRefreshing || authenticationFailed || bootstrapLoading || submitting) return;
  if (!manual && Date.now() < nextJobsRefreshAt) return;
  jobsRefreshing = true;
  const startedAt = performance.now();
  try {
    const { jobs } = await api.jobs();
    // Keep a just-created task if the upstream list is briefly behind.
    const newJobs = data.jobs.filter((job) => !jobs.some((next) => next.id === job.id)
      && jobLifecycle?.requestId(job.id) && IN_PROGRESS_JOB_STATUSES.has(job.status.toLowerCase()));
    data.jobs = [...newJobs, ...jobs];
    jobLifecycle?.observe(jobs);
    renderJobs();
    element<HTMLElement>("jobs-refresh-error").hidden = true;
    if (jobsRefreshFailures) track("jobs_refresh_recovered", { failures: jobsRefreshFailures });
    jobsRefreshFailures = 0;
    nextJobsRefreshAt = Date.now() + 8_000;
  } catch (error) {
    jobsRefreshFailures += 1;
    nextJobsRefreshAt = Date.now() + Math.min(60_000, 8_000 * 2 ** Math.min(jobsRefreshFailures, 3));
    track("jobs_refresh_failed", { ...analyticsError(error), manual, consecutive_failures: jobsRefreshFailures, duration_ms: Math.round(performance.now() - startedAt) });
    element("jobs-refresh-error").textContent = t("jobsRefreshFailed");
    element<HTMLElement>("jobs-refresh-error").hidden = false;
    handleAuthenticationFailure(error);
  } finally {
    jobsRefreshing = false;
  }
}

if (api) window.setInterval(() => {
  if (!document.hidden && data?.jobs.some((job) => IN_PROGRESS_JOB_STATUSES.has(job.status.toLowerCase()) || job.status === "succeeded" && !job.outputUrl)) void refreshJobs();
}, 8_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshJobs(true); });
