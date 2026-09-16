import type { TranslationKey } from "./i18n";

export type ErrorPresentation = {
  key: TranslationKey;
  contactSupport?: boolean;
};

const API_ERROR_PRESENTATIONS: Record<string, ErrorPresentation> = {
  unauthorized: { key: "errorUnauthorized" },
  session_expired: { key: "errorUnauthorized" },
  request_timeout: { key: "errorRequestTimeout" },
  insufficient_credits: { key: "errorInsufficient" },
  limit_exceeded: { key: "errorLimit" },
  not_found: { key: "errorResourceNotFound" },
  job_not_found: { key: "errorNotFound" },
  platform_unavailable: { key: "errorPlatform", contactSupport: true },
  upstream_unavailable: { key: "errorPlatform", contactSupport: true },
  callback_not_configured: { key: "errorPlatform", contactSupport: true },
  internal_error: { key: "genericError", contactSupport: true },
  invalid_response: { key: "errorInvalidResponse", contactSupport: true },
  request_failed: { key: "errorRequest", contactSupport: true },
  network_error: { key: "errorNetwork", contactSupport: true },
  invalid_request: { key: "errorInvalidRequestRefresh" },
  invalid_request_id: { key: "errorInvalidRequestRefresh" },
  invalid_identifier: { key: "errorInvalidRequestRefresh" },
  invalid_header: { key: "errorInvalidRequestRefresh" },
  invalid_json: { key: "errorInvalidRequestRefresh" },
  invalid_locale: { key: "errorFeedRefresh" },
  invalid_feed_session: { key: "errorFeedRefresh" },
  invalid_persona: { key: "errorFeedRefresh" },
  home_profile_not_configured: { key: "feedUnavailable" },
  conflict: { key: "errorConflict" },
  invalid_prompt: { key: "errorInvalidPrompt" },
  unsupported_image: { key: "errorUnsupportedImage" },
  image_too_large: { key: "errorImageTooLarge" },
  missing_image: { key: "errorImageRequired" },
  unsupported_aspect_ratio: { key: "errorUnsupportedAspectRatio" },
  unsupported_duration: { key: "errorUnsupportedDuration" },
  content_not_supported: { key: "templateUnavailableDescription" },
  content_model_unavailable: { key: "templateUnavailableDescription" },
  content_requires_image: { key: "errorImageRequired" },
  product_not_found: { key: "errorProductUnavailable" },
  terms_not_accepted: { key: "errorTerms" },
  subscription_already_active: { key: "errorSubscriptionActive" },
  subscription_unavailable: { key: "errorSubscriptionUnavailable", contactSupport: true },
  subscription_not_found: { key: "errorSubscriptionNotFound", contactSupport: true },
  invalid_publication: { key: "errorPublicationFields" },
  job_not_publishable: { key: "errorJobNotPublishable" },
  publication_service_unavailable: { key: "publishFailed", contactSupport: true },
};

export const KNOWN_API_ERROR_CODES = Object.freeze(Object.keys(API_ERROR_PRESENTATIONS));

export function apiErrorPresentation(code: string): ErrorPresentation {
  return API_ERROR_PRESENTATIONS[code] || { key: "genericError", contactSupport: true };
}

export function jobFailurePresentation(code: string | undefined, refunded: boolean): ErrorPresentation {
  if (code === "provider_timeout") return { key: "errorJobProviderTimeout", contactSupport: true };
  return { key: refunded ? "errorJobFailedRefunded" : "errorJobFailed", contactSupport: true };
}
