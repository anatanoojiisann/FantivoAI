import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const miniApp = readFileSync(new URL("../web/src/main.ts", import.meta.url), "utf8");
const miniAppCss = readFileSync(new URL("../web/src/style.css", import.meta.url), "utf8");
const analyticsClient = readFileSync(new URL("../web/src/analytics.ts", import.meta.url), "utf8");
const analyticsIntegration = readFileSync(new URL("../admin-service/src/integrations.ts", import.meta.url), "utf8");

test("personalized Feed records impressions, clicks and section views with ranking context", () => {
  assert.match(miniApp, /home_item_impression/);
  assert.match(miniApp, /home_item_clicked/);
  assert.match(miniApp, /home_section_viewed/);
  assert.match(miniApp, /persona_code/);
  assert.match(miniApp, /ranking_version/);
  assert.match(miniApp, /feed_session_id/);
  assert.match(miniApp, /load_duration_ms/);
  assert.match(miniApp, /data-placement/);
  assert.match(miniApp, /IntersectionObserver/);
});

test("Mini App selects an API-key persona and reloads all persona-scoped content", () => {
  assert.match(miniApp, /id="persona-selector"/);
  assert.match(miniApp, /data-persona-code/);
  assert.match(miniApp, /selectPersona/);
  assert.match(miniApp, /api\.home\(locale, feedSessionId, selectedPersonaCode\)/);
  assert.match(miniApp, /api\.creationTemplates\(locale, selectedPersonaCode\)/);
  assert.match(miniApp, /api\.content\(item\.kind, item\.id, locale, homeFeed\?\.personaCode \|\| selectedPersonaCode\)/);
  assert.match(miniApp, /selectedContentPersonaCode/);
  assert.match(miniApp, /persona_selected/);
  assert.match(miniAppCss, /\.persona-selector\s*\{/);
  assert.match(miniAppCss, /\.persona-selector__item\.is-active\s*\{/);
});

test("new Mini App sections record reach, navigation, empty feeds and retry actions", () => {
  assert.match(miniApp, /mini_app_section_viewed/);
  assert.match(miniApp, /mini_app_navigation_clicked/);
  assert.match(miniApp, /personalized_feed_empty/);
  assert.match(miniApp, /personalized_feed_retry_clicked/);
  assert.match(miniApp, /home_category_selected/);
  assert.match(miniApp, /job_details_opened/);
  assert.match(miniApp, /jobs_empty_state/);
});

test("creation entry and generate intent are tracked before submission", () => {
  assert.match(miniApp, /track\("creation_viewed",\s*\{/);
  assert.match(miniApp, /entry_point:\s*source/);
  assert.match(miniApp, /previous_page:\s*previousPage/);
  assert.match(miniApp, /track\("generate_clicked",\s*\{/);
  assert.match(miniApp, /validation_result:\s*validationBlockReason \? "blocked" : "accepted"/);
  assert.match(miniApp, /validation_block_reason:\s*validationBlockReason/);
  assert.match(miniApp, /if \(validationBlockReason \|\| !data\) \{[\s\S]*?return;[\s\S]*?track\("generation_submitted", \{ \.\.\.eventProperties, request_id: requestId \}\)/);
});

test("bottom navigation switches four exclusive app pages instead of scrolling a long document", () => {
  for (const page of ["home", "create", "jobs", "wallet"]) {
    assert.match(miniApp, new RegExp(`data-app-page="${page}"`));
    assert.match(miniApp, new RegExp(`data-page-target="${page}"`));
  }
  assert.match(miniApp, /navigateToPage/);
  assert.match(miniApp, /page\.hidden = !active/);
  assert.match(miniApp, /history\.pushState/);
  assert.match(miniApp, /popstate/);
  assert.doesNotMatch(miniApp, /\.bottom-nav a\[href="#create"\]/);
  assert.match(miniAppCss, /\.app-page\s*\{/);
  assert.match(miniAppCss, /\.wallet-sheet\s*\{[\s\S]*?position:\s*relative/);
});

test("healthy creation state keeps the service error banner hidden", () => {
  assert.match(miniApp, /id="create-service-message"[^>]*hidden/);
  assert.match(miniAppCss, /\.create-service-message\[hidden\]\s*\{[\s\S]*?display:\s*none/);
});

test("wallet purchases do not require a separate legal consent checkbox", () => {
  assert.doesNotMatch(miniApp, /id="terms-consent"/);
  assert.doesNotMatch(miniApp, /wallet-consent/);
  assert.doesNotMatch(miniApp, /termsConsent/);
  assert.match(miniApp, /createInvoice\(product\.id, productType, data\.legal\.termsVersion\)/);
});

test("Feed category tags are interactive, accessible and theme-aware", () => {
  assert.match(miniApp, /data-home-category/);
  assert.match(miniApp, /aria-pressed/);
  assert.match(miniApp, /selectHomeCategory/);
  assert.match(miniApp, /visibleCategories\.filter\(isHotFeedCategory\)[\s\S]*?\{ id: "", title: t\("feedForYou"\) \}/);
  assert.match(miniApp, /function isHotFeedCategory\(category: HomeFeed\["categories"\]\[number\]\)/);
  assert.match(miniApp, /scrollIntoView/);
  assert.match(miniAppCss, /\.feed-category\s*\{/);
  assert.match(miniAppCss, /\.feed-category[\s\S]*?color:\s*var\(--text\)/);
  assert.match(miniAppCss, /\.feed-category\.is-active[\s\S]*?color:\s*var\(--accent-text\)/);
});

test("Feed items open an in-app detail page instead of an external media link", () => {
  assert.match(miniApp, /id="template-dialog"/);
  assert.match(miniApp, /openHomeItemDetail/);
  assert.match(miniApp, /template-detail-video/);
  assert.match(miniApp, /playsinline/);
  assert.match(miniApp, /home_item_detail_opened/);
  assert.match(miniAppCss, /\.template-dialog\s*\{/);
});

test("Explore home uses filter tabs and a two-column video feed, while Create ends with templates", () => {
  assert.match(miniApp, /class="explore-intro"/);
  assert.match(miniApp, /class="explore-feed__grid"/);
  assert.match(miniApp, /id="create-templates" class="explore-templates create-templates"/);
  assert.match(miniApp, /function renderCreateTemplates\(\)/);
  assert.match(miniApp, /placement: "create_template"/);
  assert.match(miniApp, /content\.innerHTML = `\$\{categoryTabs\}\$\{trending\}`/);
  assert.match(miniApp, /<video src=.*muted loop playsinline preload="metadata"/);
  assert.match(miniApp, /const autoplay = Boolean\(videoUrl\) && !reduceMotion/);
  assert.doesNotMatch(miniApp, /explore-feed-card__media-state|explore-template__play/);
  assert.doesNotMatch(miniApp, /<small>\$\{escapeHtml\(kind\)\}<\/small>/);
  assert.match(miniApp, /id="welcome-dialog"/);
  assert.match(miniApp, /fantivo_welcome_v1_/);
  assert.match(miniApp, /data-page-target="create" data-navigation-source="home_explore_cta"/);
  assert.match(miniApp, /navigateToPage\("create", "welcome_start"\)/);
  assert.match(miniAppCss, /\.explore-feed__grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(miniAppCss, /\.explore-feed-card\s*\{[\s\S]*?aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(miniAppCss, /\.welcome-dialog::backdrop\s*\{/);
});

test("all jobs open a tracked detail view with custom playback, publishing and prompt copy", () => {
  assert.match(miniApp, /id="job-video-dialog"/);
  assert.match(miniApp, /id="job-video-player"[^>]*playsinline/);
  assert.doesNotMatch(miniApp, /id="job-video-player"[^>]*\scontrols(?:\s|>)/);
  assert.match(miniApp, /id="job-player-toggle"/);
  assert.match(miniApp, /id="job-player-progress"/);
  assert.match(miniApp, /toggleActiveJobPlayback/);
  assert.match(miniApp, /openJobDetails/);
  assert.match(miniApp, /data-open-job-details=/);
  assert.match(miniApp, /id="job-prompt-text"/);
  assert.match(miniApp, /id="job-prompt-copy"/);
  assert.match(miniApp, /id="job-detail-list"/);
  assert.match(miniApp, /job_details_opened/);
  assert.match(miniApp, /job_details_closed/);
  assert.match(miniApp, /job_prompt_copied/);
  assert.match(miniApp, /id="job-output-actions"/);
  assert.match(miniApp, /id="job-publish-form"/);
  assert.match(miniApp, /api\.submitPublication/);
  assert.match(miniApp, /job_publish_submitted/);
  assert.match(miniApp, /job_video_shared/);
  assert.match(miniApp, /job_create_again_opened/);
  assert.match(miniApp, /prompt_length/);
  assert.match(miniApp, /video\.play\(\)/);
  assert.match(miniApp, /video\.removeAttribute\("src"\)/);
  assert.doesNotMatch(miniApp, /data-open-job-details[^\n]*target="_blank"/);
  assert.match(miniAppCss, /\.job-video-dialog\s*\{/);
  assert.match(miniAppCss, /\.job-video-page__player video\s*\{/);
  assert.match(miniAppCss, /\.job-player-controls\s*\{/);
  assert.match(miniAppCss, /\.job-output-actions\s*\{/);
  assert.match(miniAppCss, /\.job-publish-form\s*\{/);
  assert.match(miniAppCss, /\.job-video-page__scroll\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(miniAppCss, /\.job-detail-card--details dl > div\s*\{/);
});

test("job list shows real media covers and filters by completion state", () => {
  assert.match(miniApp, /id="jobs-filters"/);
  assert.match(miniApp, /data-job-filter=/);
  assert.match(miniApp, /jobStatusFilter/);
  assert.match(miniApp, /<video src=.*preload="metadata"/);
  assert.match(miniApp, /job\.coverUrl \|\| job\.thumbnailUrl/);
  assert.match(miniAppCss, /\.jobs-filter\.is-active\s*\{/);
  assert.match(miniAppCss, /\.job-card__visual > video\s*\{[\s\S]*?object-fit:\s*cover/);
});

test("content details can select a template or Asset for Mini App creation", () => {
  assert.match(miniApp, /api\.content/);
  assert.match(miniApp, /api\.creationTemplates/);
  assert.match(miniApp, /withCreationTemplates/);
  assert.match(miniApp, /ready-to-create/);
  assert.match(miniApp, /detailContent/);
  assert.match(miniApp, /content-selection/);
  assert.match(miniApp, /selectContentForCreation/);
  assert.match(miniApp, /createContentTextJob/);
  assert.match(miniApp, /createContentImageJob/);
  assert.match(miniApp, /source_content_kind/);
  assert.match(miniApp, /creation_templates_loaded/);
  assert.match(miniApp, /creation_templates_failed/);
  assert.match(miniApp, /home_item_detail_loaded/);
  assert.match(miniApp, /home_item_detail_failed/);
  assert.match(miniApp, /home_item_detail_closed/);
  assert.match(miniApp, /home_item_creator_opened/);
  assert.match(miniApp, /home_content_selected_for_creation/);
  assert.match(miniApp, /home_content_selection_cleared/);
  assert.match(miniApp, /close_reason/);
  assert.match(miniApp, /clear_reason/);
  assert.match(miniApp, /selection_source/);
  assert.match(miniAppCss, /\.content-selection\s*\{/);
  assert.match(miniAppCss, /\.template-detail__prompt\s*\{/);
  assert.match(miniApp, /id="template-detail-reference"/);
  assert.match(miniApp, /id="template-detail-reference-image"/);
  assert.match(miniApp, /content\.prompt\?\.trim\(\) \|\| content\.promptDisplay\?\.trim\(\)/);
  assert.match(miniApp, /content\.kind === "asset" && content\.defaultReferenceEnabled/);
  assert.match(miniApp, /safeHttpUrl\(content\.defaultReferenceImageUrl\)/);
  assert.match(miniApp, /promptInput\.value = \(content\.prompt\?\.trim\(\) \|\| content\.promptDisplay\?\.trim\(\) \|\| ""\)/);
  assert.doesNotMatch(miniApp, /selectedFile\s*=\s*.*defaultReferenceImageUrl/);
  assert.match(miniAppCss, /\.template-detail__reference\s*\{/);
  assert.match(miniAppCss, /\.template-dialog\s*\{[^}]*height:\s*var\(--tg-viewport-stable-height,\s*100dvh\)[^}]*overflow-y:\s*auto/);
  assert.match(miniAppCss, /\.template-detail\s*\{[^}]*min-height:\s*var\(--tg-viewport-stable-height,\s*100dvh\)[^}]*grid-template-rows:\s*auto\s+minmax\([^;]+\)\s+auto/);
  assert.match(miniAppCss, /\.template-detail__body\s*\{[^}]*grid-template-rows:\s*auto\s+auto/);
  assert.doesNotMatch(miniAppCss, /\.template-detail__scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(miniAppCss, /\.template-detail__availability\s*\{/);
  assert.match(miniAppCss, /\.template-detail__body\s*>\s*\.primary-button\s*\{/);
});

test("every Mini App event is available to the Admin PostHog aggregation", () => {
  const events = [...miniApp.matchAll(/track\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(events.length > 0);
  for (const event of new Set(events)) {
    assert.match(analyticsIntegration, new RegExp(`"${event}"`), `${event} is missing from ANALYTICS_EVENTS`);
  }
});

test("locale changes flush all pending events before the page reloads", () => {
  assert.match(analyticsClient, /options\?: CaptureOptions/);
  assert.match(analyticsClient, /posthog\.capture\(event, properties, options\)/);
  assert.match(analyticsClient, /flushAnalytics[\s\S]*?posthog\.shutdown\(\)/);
  assert.match(miniApp, /locale_changed[\s\S]*?await flushAnalytics\(\)[\s\S]*?window\.location\.reload\(\)/);
});

test("Mini App attribution is first-touch aware and does not send Telegram URL hashes", () => {
  assert.match(miniApp, /initDataUnsafe\.start_param/);
  assert.match(miniApp, /first_touch_source/);
  assert.match(miniApp, /\.\.\.acquisition/);
  assert.match(analyticsClient, /disable_capture_url_hashes:\s*true/);
  assert.match(analyticsClient, /disable_external_dependency_loading:\s*true/);
  assert.match(analyticsClient, /advanced_disable_flags:\s*true/);
  assert.match(analyticsClient, /request_batching:\s*false/);
  assert.match(analyticsClient, /custom_personal_data_properties:\s*\["tgWebAppData",\s*"tgWebAppStartParam"\]/);
  assert.match(miniApp, /first_touch_is_referred/);
  assert.match(miniApp, /share_method:\s*shareMethod/);
  assert.match(analyticsClient, /posthog\.identify\(`telegram_\$\{telegramId\}`, properties, firstTouchProperties\)/);
});

test("language selection uses a controlled accessible menu instead of a native select popup", () => {
  assert.doesNotMatch(miniApp, /id="language-select"/);
  assert.match(miniApp, /aria-haspopup="menu"/);
  assert.match(miniApp, /role="menuitemradio"/);
  assert.match(miniApp, /event\.key === "ArrowDown"/);
  assert.match(miniApp, /event\.key === "Escape"/);
  assert.match(miniApp, /languageControl\?\.contains/);
});

test("aspect ratio uses a controlled menu that works across Telegram WebViews", () => {
  assert.doesNotMatch(miniApp, /id="aspect-ratio-select"/);
  assert.match(miniApp, /id="aspect-ratio-trigger"/);
  assert.match(miniApp, /aria-haspopup="listbox"/);
  assert.match(miniApp, /setAttribute\("role", "option"\)/);
  assert.match(miniApp, /data-aspect-ratio/);
  assert.match(miniApp, /setAspectRatioMenuOpen/);
  assert.match(miniApp, /selectAspectRatio\(option\.dataset\.aspectRatio, "user"\)/);
  assert.match(miniApp, /aspect_ratio: selectedAspectRatio/);
  assert.match(miniApp, /aspectRatio: selectedAspectRatio/);
  assert.match(miniApp, /event\.key === "Escape"/);
  assert.match(miniAppCss, /\.aspect-ratio-menu\s*\{/);
  assert.match(miniAppCss, /\.aspect-ratio-menu__item\.is-selected/);
});

test("duration uses a controlled menu and remains part of the creation request", () => {
  assert.doesNotMatch(miniApp, /id="duration-select"/);
  assert.match(miniApp, /id="duration-trigger"/);
  assert.match(miniApp, /aria-haspopup="listbox"/);
  assert.match(miniApp, /data-duration/);
  assert.match(miniApp, /selectDuration\(option\.dataset\.duration, "user"\)/);
  assert.match(miniApp, /duration_seconds: selectedDurationSeconds/);
  assert.match(miniApp, /durationSeconds: selectedDurationSeconds/);
  assert.match(miniApp, /event\.key === "Escape"/);
  assert.match(miniAppCss, /\.duration-menu\s*\{/);
  assert.match(miniAppCss, /\.duration-menu__item\.is-selected/);
});

test("toast feedback keeps semantic icons and renders inside an open top-layer dialog", () => {
  assert.match(miniApp, /id="toast-icon"/);
  assert.match(miniApp, /ph-warning-circle/);
  assert.match(miniApp, /ph-check-circle/);
  assert.match(miniApp, /querySelector<HTMLDialogElement>\("dialog\[open\]"\)/);
  assert.match(miniApp, /activeDialog \|\| document\.body/);
});
