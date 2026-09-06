import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BOT_LOCALE,
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
  botText,
  uiText,
} from "../src/bot-i18n.ts";
import type { Env } from "../src/types.ts";
import { saveUserLocale, userLocale } from "../src/user-preferences.ts";

class MemoryKv {
  readonly values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("Bot supports the same 12 display languages as the Mini App", () => {
  assert.equal(SUPPORTED_LOCALES.length, 12);
  assert.equal(DEFAULT_BOT_LOCALE, "en");
  for (const locale of SUPPORTED_LOCALES) {
    assert.ok(LOCALE_NAMES[locale]);
    assert.ok(botText(locale, "chooseLanguage").length > 5);
    assert.ok(botText(locale, "languageChanged", { language: LOCALE_NAMES[locale] }).includes(LOCALE_NAMES[locale]));
    assert.ok(uiText(locale, "language"));
    assert.ok(uiText(locale, "topUp"));
  }
});

test("Bot language defaults to English and persists an explicit selection", async () => {
  assert.equal(await userLocale({} as Env, 42), "en");

  const memory = new MemoryKv();
  const env = { USER_PREFERENCES: memory as unknown as KVNamespace } as Env;
  assert.equal(await userLocale(env, 42), "en");

  await saveUserLocale(env, 42, "ru");
  assert.equal(await userLocale(env, 42), "ru");

  memory.values.set("telegram:locale:42", "unsupported");
  assert.equal(await userLocale(env, 42), "en");
});
