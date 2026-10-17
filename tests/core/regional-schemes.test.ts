import { describe, expect, it } from "vitest";

import { recommendedSchemeForLocale } from "../../src/config/recommended-schemes";
import { DEFAULT_SETTINGS, cleanupTemplateSources, sanitizeSettings, toNumberingOptions } from "../../src/config/settings";
import { resolvedUiLocale } from "../../src/config/i18n";
import { numberHeadings } from "../../src/core/numbering-engine";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { parseHeadingNumber } from "../../src/core/number-parser";
import { formatCounter, BUILT_IN_SCHEMES } from "../../src/core/schemes";
import { inspectSchemeTemplates } from "../../src/core/scheme-template-validation";
import { renderTemplate, templatePrefixPattern } from "../../src/core/template-compiler";
import { BUILT_IN_SCHEME_IDS } from "../../src/core/types";

describe("optional regional numbering schemes", () => {
  it("keeps original ASCII arabic numerals stable while adding native formats", () => {
    expect(formatCounter(12, "arabic")).toBe("12");
    expect(formatCounter(12, "arabic_indic")).toBe("١٢");
    expect(formatCounter(10001, "chinese_traditional_lower")).toBe("一萬零一");
    expect(formatCounter(21, "chinese_traditional_upper")).toBe("貳拾壹");
    expect(formatCounter(12, "chinese_upper")).toBe("壹拾贰");
  });

  it.each(BUILT_IN_SCHEME_IDS)("retains nine valid templates for built-in %s", (id) => {
    const scheme = BUILT_IN_SCHEMES[id];
    expect(scheme.templates).toHaveLength(9);
    expect(inspectSchemeTemplates(scheme.templates), id).toEqual([]);
  });

  it.each([
    ["chinese-traditional-chapters", ["第一章", "第一節", "第1條"]],
    ["japanese-chapters", ["第１章", "第１節", "第1項"]],
    ["korean-chapters", ["제1장", "제1절", "제1항"]],
    ["arabic-indic-hierarchical", ["١", "١٫١", "١٫١٫١"]],
  ] as const)("renders %s for H1–H3 without modifying the source text", (schemeId, labels) => {
    const source = "# A\n## B\n### C";
    const configured = sanitizeSettings({ ...DEFAULT_SETTINGS, selectedSchemeId: schemeId });
    const options = toNumberingOptions(configured);
    expect(options.scheme.id).toBe(schemeId);
    expect(numberHeadings(parseAtxHeadings(source), options).map((result) => result.label))
      .toEqual(labels);
    expect(source).toBe("# A\n## B\n### C");
  });

  it("reverses exactly matching regional formats for safe template cleanup", () => {
    const ar = templatePrefixPattern("{1.arabic_indic}٫{2.arabic_indic}");
    expect(ar?.exec("١٫٢ Chapter")?.[1]).toBe("١٫٢");
    expect(ar?.test("1.2 Chapter")).toBe(false);
    const tw = templatePrefixPattern("第{1.chinese_traditional_lower}章");
    expect(tw?.exec("第一章 前言")?.[1]).toBe("第一章");
    expect(tw?.test("第1章 前言")).toBe(false);
    const jp = templatePrefixPattern("第{1.arabic_full}章");
    expect(jp?.exec("第１章 はじめに")?.[1]).toBe("第１章");
    expect(renderTemplate("{2.arabic_indic}٫{3.arabic_indic}", [1, 2, 3, 0, 0, 0, 0, 0, 0]))
      .toBe("٢٫٣");
  });

  it("recognizes native prefixes only through their explicit selected template", () => {
    const settings = sanitizeSettings({ selectedSchemeId: "arabic-indic-hierarchical" });
    const result = parseHeadingNumber("١٫٢ Title", {
      headingLevel: 2,
      templateSources: cleanupTemplateSources(settings),
    });
    expect(result).toMatchObject({ provenance: "template", schemeId: "arabic-indic-hierarchical" });
  });

  it("suggests conventions but never changes a user's selected scheme on locale switch", () => {
    expect(recommendedSchemeForLocale("zh-TW")).toBe("chinese-traditional-chapters");
    expect(recommendedSchemeForLocale("ja")).toBe("japanese-chapters");
    expect(recommendedSchemeForLocale("ko")).toBe("korean-chapters");
    expect(recommendedSchemeForLocale("ar")).toBe("arabic-indic-hierarchical");
    for (const locale of ["en", "de", "fr", "es", "pt-BR", "ru", "vi"] as const) {
      expect(recommendedSchemeForLocale(locale)).toBe("hierarchical-h2");
    }
    expect(recommendedSchemeForLocale("zh")).toBe("chinese-official");
    const saved = sanitizeSettings({ ...DEFAULT_SETTINGS, language: "ar", selectedSchemeId: "japanese-chapters" });
    expect(saved.selectedSchemeId).toBe("japanese-chapters");
    expect(resolvedUiLocale("auto", "ar-SA")).toBe("ar");
    expect(toNumberingOptions(saved).scheme.id).toBe("japanese-chapters");
    expect(DEFAULT_SETTINGS.selectedSchemeId).toBe("hierarchical-h2");
  });
});
