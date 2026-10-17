/** Additional Number Suite interface locales.
 * Each language lives in its own file for review and maintenance.
 * All locale keys match the English catalog; native language review is separate.
 */
import { LOCALE_ZH_TW } from "./locales/zh-TW";
import { LOCALE_JA } from "./locales/ja";
import { LOCALE_KO } from "./locales/ko";
import { LOCALE_DE } from "./locales/de";
import { LOCALE_FR } from "./locales/fr";
import { LOCALE_ES } from "./locales/es";
import { LOCALE_PT_BR } from "./locales/pt-BR";
import { LOCALE_RU } from "./locales/ru";
import { LOCALE_VI } from "./locales/vi";
import { LOCALE_AR } from "./locales/ar";

export const NUMBER_SUITE_LOCALE_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "zh-TW": LOCALE_ZH_TW,
  "ja": LOCALE_JA,
  "ko": LOCALE_KO,
  "de": LOCALE_DE,
  "fr": LOCALE_FR,
  "es": LOCALE_ES,
  "pt-BR": LOCALE_PT_BR,
  "ru": LOCALE_RU,
  "vi": LOCALE_VI,
  "ar": LOCALE_AR,
};
