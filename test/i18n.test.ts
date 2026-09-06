import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiErrorPresentation, jobFailurePresentation, KNOWN_API_ERROR_CODES } from "../web/src/error-copy.ts";
import { isRtl, resolveLocale, SUPPORTED_LOCALES, translate } from "../web/src/i18n.ts";

test("resolves Telegram and browser language variants", () => {
  assert.equal(resolveLocale("ru-RU"), "ru");
  assert.equal(resolveLocale("uk-UA"), "uk");
  assert.equal(resolveLocale("uz-Latn-UZ"), "uz");
  assert.equal(resolveLocale("pt-BR"), "pt-BR");
  assert.equal(resolveLocale("pt-PT"), "pt-BR");
  assert.equal(resolveLocale("ar-AE"), "ar");
  assert.equal(resolveLocale("unknown"), "en");
});

test("includes all requested Mini App languages", () => {
  for (const locale of ["zh-CN", "en", "ru", "uk", "uz", "vi", "id", "es", "pt-BR", "ar", "tr", "fa"] as const) {
    assert.ok(SUPPORTED_LOCALES.includes(locale));
    assert.notEqual(translate(locale, "generate"), "");
  }
});

test("personalized feed controls are localized in every supported language", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of ["home", "feedEyebrow", "feedTitle", "choosePersona", "primaryPersona", "defaultReferenceImage", "refreshFeed", "feedEmpty", "feedUnavailable", "back", "templateDetail", "assetDetail", "templatePreviewDescription", "openCreator", "previewUnavailable", "availableTemplates", "templateUnavailable", "templateUnavailableDescription", "multiImageTemplateUnavailable"] as const) {
      assert.notEqual(translate(locale, key), "");
      if (locale !== "en") assert.notEqual(translate(locale, key), translate("en", key));
    }
  }
});

test("job detail data labels are localized in every supported language", () => {
  const keys = [
    "viewDetails", "creationDetails", "promptTitle", "copyPrompt", "detailsTitle", "inputImage", "jobIdLabel",
    "createdTime", "updatedTime", "completedTime", "statusLabel", "progressLabel", "createMode", "qualityLabel",
    "durationLabel", "aspectRatioLabel", "modelLabel", "providerModelLabel", "seedLabel", "audioLabel", "costLabel", "refundedLabel",
    "sourceLabel", "failureCodeLabel", "textMode", "imageMode", "notAvailable",
  ] as const;
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      assert.notEqual(translate(locale, key), "");
    }
    if (locale !== "en") {
      assert.notEqual(translate(locale, "creationDetails"), translate("en", "creationDetails"));
      assert.notEqual(translate(locale, "notAvailable"), translate("en", "notAvailable"));
    }
  }
});

test("job playback and output actions are localized in every supported language", () => {
  const keys = [
    "playbackControls", "playVideo", "pauseVideo", "muteVideo", "unmuteVideo", "seekVideo", "downloadVideo", "publishVideo",
    "shareVideo", "createAgain", "publishWork", "publishTitle", "publishDescription", "publishTags", "publishTagsHint",
    "submitForReview", "cancelPublish", "publishing", "publishSubmitted", "publishFailed", "shareCopied", "downloadStarted",
  ] as const;
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) assert.notEqual(translate(locale, key), "");
    if (locale !== "en") assert.notEqual(translate(locale, "createAgain"), translate("en", "createAgain"));
  }
});

test("job status filters are localized", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of ["filterCreations", "jobsFilterAll", "jobsFilterCompleted", "jobsFilterInProgress", "jobsFilterFailed", "filteredJobsEmptyTitle", "filteredJobsEmptyDescription"] as const) {
      assert.notEqual(translate(locale, key), "");
      if (locale !== "en") assert.notEqual(translate(locale, key), translate("en", key));
    }
  }
});

test("uses right-to-left layout for Arabic and Persian", () => {
  assert.equal(isRtl("ar"), true);
  assert.equal(isRtl("fa"), true);
  assert.equal(isRtl("en"), false);
});

test("keeps the public language catalog to the selected 12 languages", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["zh-CN", "en", "ru", "uk", "uz", "vi", "id", "es", "pt-BR", "ar", "tr", "fa"]);
  assert.equal(resolveLocale("kk-KZ"), "en");
  assert.equal(resolveLocale("hi-IN"), "en");
  assert.equal(resolveLocale("ms-MY"), "en");
  assert.equal(resolveLocale("th-TH"), "en");
});

test("aspect-ratio controls and errors are localized", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of ["aspectRatioLabel", "portrait", "landscape", "square", "errorUnsupportedAspectRatio", "errorUnsupportedDuration"] as const) {
      assert.notEqual(translate(locale, key), "");
      if (locale !== "en") assert.notEqual(translate(locale, key), translate("en", key));
    }
  }
});

test("subscription and one-time purchase controls are localized in every supported language", () => {
  const keys = [
    "subscriptionPlans", "chooseSubscription", "perThirtyDays", "oneTimePurchase", "buyCredits", "activeSubscription",
    "renewsOn", "endsOn", "renewalCanceled", "cancelRenewal", "resumeRenewal", "cancelSubscriptionConfirm",
    "subscriptionCanceled", "subscriptionResumed", "errorSubscriptionUpdate", "autoRenewNotice", "creditsEachCycle",
    "subscribe", "openingPayment", "awaitingPayment", "confirmingSubscription", "currentPlan", "days", "buy",
    "subscriptionSuccess", "errorSubscriptionActive", "errorSubscriptionUnavailable",
  ] as const;
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      assert.notEqual(translate(locale, key), "");
      if (locale !== "en") assert.notEqual(translate(locale, key), translate("en", key));
    }
  }
});

test("all Mini App error guidance is localized in every supported language", () => {
  const keys = [
    "supportHint", "paymentSupportHint", "errorResourceNotFound", "errorInvalidRequestRefresh", "errorFeedRefresh",
    "errorConflict", "errorImageRequired", "errorSubscriptionNotFound", "errorPublicationFields", "errorJobNotPublishable",
    "errorNetwork", "errorProductUnavailable", "failureReasonLabel", "errorJobProviderTimeout", "errorJobFailedRefunded", "errorJobFailed",
  ] as const;
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      assert.notEqual(translate(locale, key), "");
      if (locale !== "en") assert.notEqual(translate(locale, key), translate("en", key));
    }
    assert.match(translate(locale, "errorInvalidPrompt", { max: 777 }), /777/);
    assert.match(translate(locale, "errorImageTooLarge", { max: 8 }), /8/);
  }
});

test("every known Mini App API error has an intentional presentation", () => {
  const expectedCodes = [
    "callback_not_configured", "conflict", "content_model_unavailable", "content_not_supported", "content_requires_image",
    "home_profile_not_configured", "image_too_large", "insufficient_credits", "internal_error", "invalid_feed_session",
    "invalid_header", "invalid_identifier", "invalid_json", "invalid_locale", "invalid_persona", "invalid_prompt", "invalid_publication",
    "invalid_request", "invalid_request_id", "invalid_response", "job_not_found", "job_not_publishable", "limit_exceeded",
    "missing_image", "network_error", "not_found", "platform_unavailable", "product_not_found", "publication_service_unavailable",
    "request_failed", "subscription_already_active", "subscription_not_found", "subscription_unavailable", "terms_not_accepted",
    "unauthorized", "unsupported_aspect_ratio", "unsupported_duration", "unsupported_image", "upstream_unavailable",
  ];
  assert.deepEqual([...KNOWN_API_ERROR_CODES].sort(), expectedCodes.sort());
  assert.equal(apiErrorPresentation("invalid_prompt").contactSupport, undefined);
  assert.equal(apiErrorPresentation("internal_error").contactSupport, true);
  assert.equal(apiErrorPresentation("subscription_not_found").key, "errorSubscriptionNotFound");
  assert.equal(apiErrorPresentation("unknown_future_code").contactSupport, true);
  assert.equal(jobFailurePresentation("provider_timeout", true).key, "errorJobProviderTimeout");
  assert.equal(jobFailurePresentation("unknown_provider_error", true).key, "errorJobFailedRefunded");
});

test("legal pages load the shared localized renderer", () => {
  const terms = readFileSync(new URL("../web/public/terms.html", import.meta.url), "utf8");
  const privacy = readFileSync(new URL("../web/public/privacy.html", import.meta.url), "utf8");
  const legal = readFileSync(new URL("../web/public/legal.js", import.meta.url), "utf8");
  assert.match(terms, /data-legal-page="terms"/);
  assert.match(privacy, /data-legal-page="privacy"/);
  assert.match(terms, /src="\/legal\.js"/);
  assert.match(privacy, /src="\/legal\.js"/);
  assert.match(legal, /aurax_locale/);
  assert.match(legal, /URLSearchParams\(location\.search\)/);
  assert.match(legal, /rtlLocales/);
  for (const locale of ["uk", "uz", "kk"]) {
    assert.match(legal, new RegExp(`\\b${locale}: \\{ back:`));
    assert.match(legal, new RegExp(`\\b${locale}: \\["7\\.`));
  }
});

test("localized layouts include wrapping and script-aware typography", () => {
  const appCss = readFileSync(new URL("../web/src/style.css", import.meta.url), "utf8");
  const legalCss = readFileSync(new URL("../web/public/legal.css", import.meta.url), "utf8");
  assert.match(appCss, /overflow-wrap:\s*anywhere/);
  assert.match(appCss, /:lang\(ar\) \.section-title h2/);
  assert.match(appCss, /\.mode-switch__button[\s\S]*?white-space:\s*normal/);
  assert.match(appCss, /\.job-card__top[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(legalCss, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(legalCss, /:lang\(hi\) h1/);
});
