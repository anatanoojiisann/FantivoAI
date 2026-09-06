export type AcquisitionProperties = {
  acquisition_source: string;
  acquisition_medium: string;
  acquisition_campaign: string;
  acquisition_content: string;
  acquisition_is_referred: boolean;
  acquisition_tagged: boolean;
  telegram_start_param: string;
};

type AcquisitionInput = {
  startParam?: string;
  url?: string;
};

const NONE = "none";
const ORGANIC_SOURCE = "telegram_organic";

export function acquisitionFromLaunch(input: AcquisitionInput): AcquisitionProperties {
  const startParam = safeStartParam(input.startParam || launchParameter(input.url));
  if (referralStartParameter(startParam)) {
    return {
      acquisition_source: "referral",
      acquisition_medium: "telegram_deep_link",
      acquisition_campaign: "invite_v1",
      acquisition_content: "shared_link",
      acquisition_is_referred: true,
      acquisition_tagged: true,
      // The referral code remains server-only so analytics cannot leak a reusable invite token.
      telegram_start_param: "referral",
    };
  }
  const tagged = taggedStartParameter(startParam);
  if (tagged) {
    return {
      acquisition_source: tagged.source,
      acquisition_medium: "telegram_deep_link",
      acquisition_campaign: tagged.campaign,
      acquisition_content: tagged.content,
      acquisition_is_referred: false,
      acquisition_tagged: true,
      telegram_start_param: startParam,
    };
  }

  const utmSource = urlParameter(input.url, "utm_source");
  if (utmSource) {
    return {
      acquisition_source: slug(utmSource, ORGANIC_SOURCE),
      acquisition_medium: slug(urlParameter(input.url, "utm_medium"), "campaign"),
      acquisition_campaign: slug(urlParameter(input.url, "utm_campaign"), NONE),
      acquisition_content: slug(urlParameter(input.url, "utm_content"), NONE),
      acquisition_is_referred: false,
      acquisition_tagged: true,
      telegram_start_param: startParam || NONE,
    };
  }

  return {
    acquisition_source: ORGANIC_SOURCE,
    acquisition_medium: "telegram",
    acquisition_campaign: NONE,
    acquisition_content: NONE,
    acquisition_is_referred: false,
    acquisition_tagged: false,
    telegram_start_param: startParam || NONE,
  };
}

function referralStartParameter(value: string) {
  const [prefix, code, ...extra] = value.split("--");
  return prefix.toLowerCase() === "ref" && /^[A-Za-z0-9_-]{8,96}$/.test(code || "") && extra.length === 0;
}

function taggedStartParameter(value: string) {
  const [prefix, rawSource, rawCampaign = NONE, rawContent = NONE, ...extra] = value.split("--");
  if (prefix.toLowerCase() !== "acq" || !rawSource || extra.length) return null;
  const source = slug(rawSource, "");
  if (!source) return null;
  return {
    source,
    campaign: slug(rawCampaign, NONE),
    content: slug(rawContent, NONE),
  };
}

function launchParameter(url?: string) {
  return urlParameter(url, "tgWebAppStartParam") || urlParameter(url, "startapp");
}

function urlParameter(value: string | undefined, key: string) {
  if (!value) return "";
  try {
    const url = new URL(value, "https://mini-app.invalid");
    const queryValue = url.searchParams.get(key);
    if (queryValue) return queryValue;
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    return new URLSearchParams(hash).get(key) || "";
  } catch {
    return "";
  }
}

function safeStartParam(value: string) {
  const trimmed = value.trim().slice(0, 128);
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : "";
}

function slug(value: string | undefined, fallback: string) {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}
