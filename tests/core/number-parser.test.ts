import { describe, expect, it } from "vitest";

import { WORD_JOINER } from "../../src/core/markers";
import {
  isSuspiciousNumericPrefix,
  meetsCleanupScope,
  parseHeadingNumber,
  parseHeadingNumberPrefixes,
} from "../../src/core/number-parser";

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
});
