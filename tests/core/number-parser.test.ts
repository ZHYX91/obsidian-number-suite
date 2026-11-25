import { describe, expect, it } from "vitest";

import { WORD_JOINER } from "../../src/core/markers";
import {
  isSuspiciousNumericPrefix,
  meetsCleanupScope,
  parseHeadingNumber,
  parseHeadingNumberPrefixes,
} from "../../src/core/number-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

const HIERARCHICAL_SOURCE = [{
  schemeId: "hierarchical",
  schemeName: "Hierarchical",
  revision: 1,
  templates: BUILT_IN_SCHEMES.hierarchical.templates,
}];

describe("number parser", () => {
  it("recognizes exact plugin markers", () => {
    const match = parseHeadingNumber(`${WORD_JOINER}1.2${WORD_JOINER} Heading`);
    expect(match).toMatchObject({
      numberCore: "1.2",
      provenance: "plugin",
      confidence: "certain",
      ruleId: "plugin-marker",
    });
    expect(parseHeadingNumber(`${WORD_JOINER}1.2 Heading`)).toBeNull();
  });

  it.each([
    ["1.1 Heading", "manual-hierarchical"],
    ["1.1.1 Heading", "manual-hierarchical"],
    ["（一）范围", "manual-bracketed"],
    ["(1) Scope", "manual-bracketed"],
    ["① 示例", "manual-circled"],
    ["一、总则", "manual-chinese"],
    ["第一章 总则", "manual-legal"],
    ["第12条 目的", "manual-legal"],
  ])("recognizes high-confidence prefix %s", (source, ruleId) => {
    expect(parseHeadingNumber(source)).toMatchObject({ confidence: "high", ruleId });
  });

  it.each([
    "3.14 圆周率",
    "2.0 版本说明",
    "2026. 年度总结",
    "1.5 倍缩放",
    "3.11 事件",
  ])("downgrades ambiguous numeric text: %s", (source) => {
    expect(parseHeadingNumber(source)?.confidence).toBe("low");
    expect(isSuspiciousNumericPrefix(source)).toBe(true);
  });

  it.each(["2.0版本说明", "2026 年度总结", "6 种常见方法"]) (
    "flags numeric-looking text even without a removable match: %s",
    (source) => expect(isSuspiciousNumericPrefix(source)).toBe(true),
  );

  it("does not confuse ordinary legal-looking words", () => {
    expect(parseHeadingNumber("第一次尝试")).toBeNull();
    expect(parseHeadingNumber("Chapter One")).toBeNull();
  });

  it("parses chained prefixes and raises chained confidence", () => {
    const matches = parseHeadingNumberPrefixes("一、1. 标题");
    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.confidence)).toEqual(["high", "high"]);
    expect(matches[1]?.ruleId).toBe("manual-arabic-chained");
  });

  it("applies cleanup scopes conservatively", () => {
    const plugin = parseHeadingNumber(`${WORD_JOINER}1${WORD_JOINER} A`);
    const manual = parseHeadingNumber("1.1 A");
    const medium = parseHeadingNumber("1. A");
    expect(plugin && meetsCleanupScope(plugin, "plugin")).toBe(true);
    expect(manual && meetsCleanupScope(manual, "plugin")).toBe(false);
    expect(manual && meetsCleanupScope(manual, "templates")).toBe(false);
    expect(manual && meetsCleanupScope(manual, "common")).toBe(true);
    expect(medium && meetsCleanupScope(medium, "templates")).toBe(false);
    expect(medium && meetsCleanupScope(medium, "common")).toBe(true);
  });

  it("recognizes bare Arabic prefixes without elevating them by default", () => {
    expect(parseHeadingNumber("1 Heading")).toMatchObject({
      confidence: "medium",
      ruleId: "manual-arabic-bare",
    });
    expect(parseHeadingNumber("6 种方法")?.confidence).toBe("low");
    expect(parseHeadingNumber("2026 Annual")?.confidence).toBe("low");
  });

  it.each([
    ["2026 Annual", 1],
    ["6 种常见方法", 1],
    ["6 kg load", 1],
    ["3.14 Version notes", 2],
  ])("keeps suspicious template-shaped text conservative: %s", (source, headingLevel) => {
    const match = parseHeadingNumber(source, {
      headingLevel,
      templateSources: HIERARCHICAL_SOURCE,
    });
    expect(match).toMatchObject({ provenance: "template", confidence: "low" });
    expect(match && meetsCleanupScope(match, "templates")).toBe(false);
    expect(match && meetsCleanupScope(match, "common")).toBe(false);
  });

  it.each([
    ["2026.8.24 Date", "date"],
    ["1.2.3 Version notes", "version"],
    ["6.2.3 kg load", "measurement"],
    ["2.5.1 版本记录", "localized version"],
  ])("keeps hierarchical %s text conservative for active and historical templates", (source) => {
    for (const revision of [1, 2]) {
      const match = parseHeadingNumber(source, {
        headingLevel: 3,
        templateSources: [{
          schemeId: "hierarchical",
          schemeName: "Hierarchical",
          revision,
          templates: ["{1.arabic}", "{1.arabic}.{2.arabic}", "{1.arabic}.{2.arabic}.{3.arabic}"],
        }],
      });
      expect(match).toMatchObject({ provenance: "template", confidence: "low" });
      expect(match && meetsCleanupScope(match, "templates")).toBe(false);
    }
  });
  it("uses explicit separators, including mixed horizontal whitespace, and returns exact ranges", () => {
    const context = {
      headingLevel: 1,
      templateSources: [{ schemeId: "custom", schemeName: "Custom", revision: 3, templates: ["{1.chinese_lower}、  "] }],
    };
    for (const separator of [" ", "  ", "\t　 ", "\u00a0"]) {
      expect(parseHeadingNumber(`一、${separator}你好`, context)).toMatchObject({
        provenance: "template", numberCore: "一、", separator, from: 0, to: 2 + separator.length,
      });
    }
    expect(parseHeadingNumber("一、二、三", context)).toMatchObject({ provenance: "manual", numberCore: "一、" });
    expect(parseHeadingNumber("一、\n下一行", context)).toBeNull();
  });

  it("permits other template levels only for callers that request them and prefers matching-level provenance", () => {
    const context = {
      headingLevel: 2,
      templateSources: [{ schemeId: "official", schemeName: "Official", revision: 1, templates: BUILT_IN_SCHEMES["chinese-official"].templates }],
    };
    expect(parseHeadingNumber("一、你好", context)?.provenance).toBe("manual");
    for (const text of ["一、你好", "一、 你好", "一、　　你好"]) {
      expect(parseHeadingNumber(text, { ...context, matchOtherLevels: true })).toMatchObject({
        provenance: "template", templateLevel: 1, schemeId: "official", numberCore: "一、",
      });
    }
    const sameLevel = { schemeId: "custom", schemeName: "Custom", revision: 2, templates: ["", "{2.chinese_lower}、"] };
    expect(parseHeadingNumber("一、你好", {
      ...context, matchOtherLevels: true, templateSources: [...context.templateSources, sameLevel],
    })).toMatchObject({ templateLevel: 2, schemeId: "custom" });
  });

  it("retains numeric safeguards through H9 even when a shorter heading uses this template", () => {
    const context = { headingLevel: 1, matchOtherLevels: true, templateSources: HIERARCHICAL_SOURCE };
    for (const text of ["1.2.3.4.5.6.7.8.9 Version notes", "1.2.3.4.5.6.7.8.9 kg load", "2026.2.3.4.5.6.7.8.9 Date"]) {
      const match = parseHeadingNumber(text, context);
      expect(match).toMatchObject({ confidence: "low", templateLevel: 9 });
      expect(match && meetsCleanupScope(match, "templates")).toBe(false);
    }
    expect(parseHeadingNumber("1.2.3.4.5.6.7.8.9 Chapter", context)?.confidence).toBe("high");
  });

  it("does not hide title text when two valid templates disagree about the boundary", () => {
    const context = {
      headingLevel: 2,
      matchOtherLevels: true,
      templateSources: [{ schemeId: "custom", schemeName: "Custom", revision: 1, templates: ["{1.arabic}.", "{2.arabic}.示"] }],
    };
    for (const headingLevel of [1, 2]) {
      const match = parseHeadingNumber("1.示例", { ...context, headingLevel });
      expect(match).toMatchObject({ confidence: "low", templateLevel: headingLevel });
      expect(match && meetsCleanupScope(match, "common")).toBe(false);
    }
  });

  it("keeps dotted template prefixes distinct from decimals, versions, years, units, and abbreviations", () => {
    const context = {
      headingLevel: 1,
      matchOtherLevels: true,
      templateSources: [{ schemeId: "custom", schemeName: "Custom", revision: 1, templates: ["{1.arabic}.", "{2.letter_upper}."] }],
    };
    expect(parseHeadingNumber("1.工作目标", context)).toMatchObject({ numberCore: "1.", confidence: "high" });
    for (const title of ["1.项目管理", "1.Goals"]) {
      expect(parseHeadingNumber(title, context)).toMatchObject({ numberCore: "1.", confidence: "high" });
    }
    expect(parseHeadingNumber("1. Medium")).toMatchObject({ provenance: "manual", confidence: "low" });
    for (const title of ["3.14倍", "1.2.3", "1.２项", "U.S. policies", "A.B"]) {
      expect(parseHeadingNumber(title, context)).toBeNull();
    }
    for (const title of ["2026.年度总结", "1.版本说明", "1.kg load", "1.米", "1.项（估算）"]) {
      expect(parseHeadingNumber(title, context)).toMatchObject({ confidence: "low" });
    }
  });

  it.each([
    ["一、　范围", "一、", "　"],
    ["貳、条款", "貳、", ""],
    ["1.2)\tHeading", "1.2)", "\t"],
    ["1.  总则", "1.", "  "],
    ["IV) Heading", "IV)", " "],
    ["A.　Heading", "A.", "　"],
  ])("keeps all handwritten punctuation inside the number core in %s", (text, numberCore, separator) => {
    expect(parseHeadingNumber(text)).toMatchObject({
      provenance: "manual", numberCore, separator, fullPrefix: numberCore + separator,
    });
  });

});
