import assert from "node:assert/strict";
import test from "node:test";
import { acquisitionFromLaunch } from "../web/src/acquisition.ts";

test("Telegram acquisition tags produce normalized source properties", () => {
  assert.deepEqual(acquisitionFromLaunch({ startParam: "acq--XHS--summer_2026--creator-01" }), {
    acquisition_source: "xhs",
    acquisition_medium: "telegram_deep_link",
    acquisition_campaign: "summer_2026",
    acquisition_content: "creator-01",
    acquisition_is_referred: false,
    acquisition_tagged: true,
    telegram_start_param: "acq--XHS--summer_2026--creator-01",
  });
});

test("launch URLs can provide Telegram start parameters or UTM fallbacks", () => {
  assert.equal(acquisitionFromLaunch({ url: "https://app.example/#tgWebAppStartParam=acq--youtube--launch--video7" }).acquisition_source, "youtube");
  assert.deepEqual(acquisitionFromLaunch({ url: "https://app.example/?utm_source=Google+Ads&utm_medium=cpc&utm_campaign=Launch&utm_content=Video+A" }), {
    acquisition_source: "google-ads",
    acquisition_medium: "cpc",
    acquisition_campaign: "launch",
    acquisition_content: "video-a",
    acquisition_is_referred: false,
    acquisition_tagged: true,
    telegram_start_param: "none",
  });
});

test("untagged or unsafe launches stay attributable without leaking arbitrary input", () => {
  assert.deepEqual(acquisitionFromLaunch({ startParam: "checkout_offer" }), {
    acquisition_source: "telegram_organic",
    acquisition_medium: "telegram",
    acquisition_campaign: "none",
    acquisition_content: "none",
    acquisition_is_referred: false,
    acquisition_tagged: false,
    telegram_start_param: "checkout_offer",
  });
  assert.equal(acquisitionFromLaunch({ startParam: "bad value&secret=1" }).telegram_start_param, "none");
});

test("referral launches are attributable without exposing the reusable referral code", () => {
  const acquisition = acquisitionFromLaunch({ startParam: "ref--inv_private_9x2k7" });
  assert.deepEqual(acquisition, {
    acquisition_source: "referral",
    acquisition_medium: "telegram_deep_link",
    acquisition_campaign: "invite_v1",
    acquisition_content: "shared_link",
    acquisition_is_referred: true,
    acquisition_tagged: true,
    telegram_start_param: "referral",
  });
  assert.doesNotMatch(JSON.stringify(acquisition), /inv_private_9x2k7/);
});
