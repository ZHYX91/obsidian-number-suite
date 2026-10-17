import type { BuiltInSchemeId } from "../core/types";
import type { UiLocale } from "./language-options";

/**
 * Recommend a writing convention; never apply it merely because UI language changed.
 * Decimal hierarchical headings remain suitable across many UI languages.
 */
export function recommendedSchemeForLocale(locale: UiLocale): BuiltInSchemeId {
  switch (locale) {
    case "zh": return "chinese-official";
    case "zh-TW": return "chinese-traditional-chapters";
    case "ja": return "japanese-chapters";
    case "ko": return "korean-chapters";
    case "ar": return "arabic-indic-hierarchical";
    default: return "hierarchical-h2";
  }
}
