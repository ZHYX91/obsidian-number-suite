import { describe, expect, it } from "vitest";

import {
  compileTemplate,
  renderTemplate,
  templatePrefixPattern,
} from "../../src/core/template-compiler";

const counters = [2, 3, 4, 5, 6, 7] as const;

describe("template compiler", () => {
  it("compiles readable placeholders and renders mixed formats", () => {
    const template = "第{1.chinese_lower}章 {2.arabic_full}.{3.letter_upper}";
    expect(compileTemplate(template).diagnostics).toEqual([]);
    expect(renderTemplate(template, [...counters])).toBe("第二章 ３.D");
  });

  it.each([
    ["{1.arabic", "unclosed-token"],
    ["{7.arabic}", "invalid-token"],
    ["{1.unknown}", "invalid-token"],
    ["1}", "unexpected-closing-brace"],
  ])("reports %s without interpreting it", (source, code) => {
    expect(compileTemplate(source).diagnostics[0]?.code).toBe(code);
    expect(renderTemplate(source, [...counters])).toBe(source);
  });

  it("builds an anchored inverse matcher for cleanup", () => {
    const pattern = templatePrefixPattern("第{2.chinese_lower}章");
    expect(pattern?.exec("第三章 范围")?.[1]).toBe("第三章");
    expect(pattern?.test("前言 第三章 范围")).toBe(false);
  });
});
