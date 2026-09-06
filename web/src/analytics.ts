import posthog from "posthog-js";
import type { CaptureOptions, Properties } from "posthog-js";
import type { AcquisitionProperties } from "./acquisition";

const projectKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const apiHost = import.meta.env.VITE_POSTHOG_HOST?.trim();
let initialized = false;

export function initAnalytics(enabled: boolean, acquisition: AcquisitionProperties) {
  if (!enabled || initialized || !projectKey || !apiHost) return false;

  posthog.init(projectKey, {
    api_host: apiHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_performance: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    disable_compression: import.meta.env.DEV,
    disable_external_dependency_loading: true,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    advanced_disable_feature_flags: true,
    disable_capture_url_hashes: true,
    disableDeviceModel: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ["tgWebAppData", "tgWebAppStartParam"],
    person_profiles: "identified_only",
    persistence: "localStorage",
    request_batching: false,
    respect_dnt: true,
  });
  posthog.register({ app_channel: "telegram_mini_app", ...acquisition });
  initialized = true;
  return true;
}

export function identifyUser(telegramId: number, properties: Properties, firstTouchProperties: Properties) {
  if (!initialized) return;
  posthog.identify(`telegram_${telegramId}`, properties, firstTouchProperties);
}

export function track(event: string, properties: Properties = {}, options?: CaptureOptions) {
  if (!initialized) return;
  posthog.capture(event, properties, options);
}

export async function flushAnalytics() {
  if (!initialized) return;
  await posthog.shutdown();
}

export function analyticsConfigured() {
  return Boolean(projectKey && apiHost);
}
