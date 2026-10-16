/** Language selection is independent of heading and caption numbering schemes. */
export const UI_LOCALE_LABELS = {
  "en": "English",
  "zh": "简体中文",
  "zh-TW": "繁體中文",
  "ja": "日本語",
  "ko": "한국어",
  "de": "Deutsch",
  "fr": "Français",
  "es": "Español",
  "pt-BR": "Português (Brasil)",
  "ru": "Русский",
  "vi": "Tiếng Việt",
  "ar": "العربية"
} as const;
export type UiLocale = keyof typeof UI_LOCALE_LABELS;
export type UiLanguage = "auto" | UiLocale;
export const UI_LOCALES = Object.keys(UI_LOCALE_LABELS) as UiLocale[];
export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "auto" || (typeof value === "string" && Object.hasOwn(UI_LOCALE_LABELS, value));
}
export function languageOptions(auto: string): Record<string, string> {
  return { auto, ...UI_LOCALE_LABELS };
}
