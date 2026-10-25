import { describe, expect, it } from "vitest";

import { parseAtxHeadings } from "../../src/core/heading-parser";
import { numberHeadings } from "../../src/core/numbering-engine";
import { BUILT_IN_SCHEMES, formatCounter } from "../../src/core/schemes";
import type { NumberingOptions } from "../../src/core/types";

function options(overrides: Partial<NumberingOptions> = {}): NumberingOptions {
  return {
    scheme: BUILT_IN_SCHEMES.hierarchical,
    missingLevelStrategy: "fill-one",
    starts: {},
    ...overrides,
  };
}

describe("numberHeadings", () => {
  it("increments and resets hierarchical counters", () => {
    const source = "# A\n## B\n## C\n### D\n# E\n## F";
    const labels = numberHeadings(parseAtxHeadings(source), options()).map((item) => item.label);
    expect(labels).toEqual(["1", "1.1", "1.2", "1.2.1", "2", "2.1"]);
  });

  it("supports H2 as the numbering root", () => {
    const source = "# Document\n## Part\n### Detail\n## Next";
    const labels = numberHeadings(parseAtxHeadings(source), options({ scheme: BUILT_IN_SCHEMES["hierarchical-h2"] }))
      .map((item) => item.label);
    expect(labels).toEqual([null, "1", "1.1", "2"]);
  });

  it("numbers the complete H1-H9 extension hierarchy", () => {
    const source = Array.from({ length: 9 }, (_unused, index) => (
      `${"#".repeat(index + 1)} Level ${index + 1}`
    )).join("\n");
    const result = numberHeadings(parseAtxHeadings(source), options());
    expect(result[result.length - 1]?.label).toBe("1.1.1.1.1.1.1.1.1");
    expect(result[result.length - 1]?.counters).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("implements all skipped-level strategies", () => {
    const headings = parseAtxHeadings("### Deep");
    expect(numberHeadings(headings, options({ missingLevelStrategy: "fill-one" }))[0]?.label).toBe("1.1.1");
    expect(numberHeadings(headings, options({ missingLevelStrategy: "current-only" }))[0]?.label).toBe("1");
    expect(numberHeadings(headings, options({ missingLevelStrategy: "skip" }))[0]).toMatchObject({
      label: null,
      warning: "missing-parent",
    });
  });

  it("honors custom starts", () => {
    const result = numberHeadings(
      parseAtxHeadings("# A\n## B\n### C"),
      options({ starts: { 1: 2, 2: 3 } }),
    );
    expect(result.map((item) => item.label)).toEqual(["2", "2.3", "2.3.1"]);
  });

  it.each([
    [Number.MAX_SAFE_INTEGER - 1, 1],
    [Number.MAX_SAFE_INTEGER - 1, 2],
    [Number.MAX_SAFE_INTEGER - 1, 3],
    [Number.MAX_SAFE_INTEGER, 1],
    [Number.MAX_SAFE_INTEGER, 2],
    [Number.MAX_SAFE_INTEGER, 3],
  ])("keeps counters exact with start %s and %s headings", (start, count) => {
    const result = numberHeadings(
      parseAtxHeadings(Array.from({ length: count }, (_unused, index) => `# Heading ${index}`).join("\n")),
      options({ starts: { 1: start } }),
    );
    expect(result.map((item) => ({ label: item.label, warning: item.warning }))).toEqual(
      Array.from({ length: count }, (_unused, index) => index <= Number.MAX_SAFE_INTEGER - start
        ? { label: String(start + index), warning: null }
        : { label: null, warning: "counter-overflow" }),
    );
    expect(result.every((item) => item.counters.every(Number.isSafeInteger))).toBe(true);
  });

  it("does not render a descendant template with an overflowing parent counter", () => {
    const result = numberHeadings(
      parseAtxHeadings("# Last exact\n# Overflow\n## Child\n# Still overflow\n### Grandchild"),
      options({ starts: { 1: Number.MAX_SAFE_INTEGER } }),
    );
    expect(result.map((item) => item.label)).toEqual([String(Number.MAX_SAFE_INTEGER), null, null, null, null]);
    expect(result.slice(1).map((item) => item.warning)).toEqual(Array(4).fill("counter-overflow"));
  });

  it("resets an overflowing child counter when a new parent starts", () => {
    const result = numberHeadings(
      parseAtxHeadings("# Parent\n## Last exact\n## Overflow\n### Child\n# Next\n## Exact again"),
      options({ starts: { 2: Number.MAX_SAFE_INTEGER } }),
    );
    expect(result.map((item) => item.label)).toEqual([
      "1", `1.${Number.MAX_SAFE_INTEGER}`, null, null, "2", `2.${Number.MAX_SAFE_INTEGER}`,
    ]);
    expect(result[5]?.warning).toBeNull();
  });

  it("keeps independent templates and numbering roots usable after an unrelated counter overflows", () => {
    const source = "# Last exact\n# Overflow\n## Independent";
    const result = numberHeadings(parseAtxHeadings(source), options({
      scheme: BUILT_IN_SCHEMES["hierarchical-h2"],
      starts: { 1: Number.MAX_SAFE_INTEGER },
    }));
    expect(result.map((item) => ({ label: item.label, warning: item.warning }))).toEqual([
      { label: null, warning: null },
      { label: null, warning: null },
      { label: "1", warning: null },
    ]);
  });

  it("protects references to an overflowing structural level with an empty template", () => {
    const result = numberHeadings(
      parseAtxHeadings("# Last exact\n# Hidden overflow\n## Child"),
      options({
        starts: { 1: Number.MAX_SAFE_INTEGER },
        scheme: { ...BUILT_IN_SCHEMES.hierarchical, templates: ["", "{1.arabic}.{2.arabic}"] },
      }),
    );
    expect(result[2]).toMatchObject({ label: null, warning: "counter-overflow" });
  });

  it("renders only the safe current counter when the missing-level strategy omits parents", () => {
    const result = numberHeadings(
      parseAtxHeadings("# Last exact\n# Overflow\n### Independent current level"),
      options({ starts: { 1: Number.MAX_SAFE_INTEGER }, missingLevelStrategy: "current-only" }),
    );
    expect(result[1]).toMatchObject({ label: null, warning: "counter-overflow" });
    expect(result[2]).toMatchObject({ label: "1", warning: null });
  });

  it("does not clear the overflowing level when a same-level heading is excluded", () => {
    const result = numberHeadings(
      parseAtxHeadings("# Last exact\n# Overflow\n# Excluded\n# Still overflow"),
      options({
        starts: { 1: Number.MAX_SAFE_INTEGER },
        scheme: { ...BUILT_IN_SCHEMES.hierarchical, exclusions: [{ title: "Excluded", scope: "heading" }] },
      }),
    );
    expect(result[2]).toMatchObject({ label: null, exclusion: "heading" });
    expect(result[3]).toMatchObject({ label: null, warning: "counter-overflow" });
  });

  it("skips the first non-empty headings per level without consuming counters", () => {
    const result = numberHeadings(
      parseAtxHeadings("# Preface\n# Chapter\n## Lead\n## Topic\n# Next"),
      options({ starts: { 1: 3, 2: 2 }, skipFirst: { 1: 1, 2: 1 } }),
    );
    expect(result.map((item) => item.label)).toEqual([null, "3", null, "3.2", "4"]);
  });

  it("does not spend skip quota on empty headings and does not skip descendants as a subtree", () => {
    const result = numberHeadings(
      parseAtxHeadings("#\n# Preface\n## Detail\n# Chapter"),
      options({ skipFirst: { 1: 1 } }),
    );
    expect(result.map((item) => item.label)).toEqual([null, null, "1.1", "2"]);
  });

  it("lets excluded headings occupy their source-order skip position while retaining exclusion behavior", () => {
    const result = numberHeadings(
      parseAtxHeadings("# References\n# Preface\n# Chapter"),
      options({
        skipFirst: { 1: 2 },
        scheme: {
          ...BUILT_IN_SCHEMES.hierarchical,
          exclusions: [{ title: "References", scope: "heading" }],
        },
      }),
    );
    expect(result.map((item) => ({ label: item.label, exclusion: item.exclusion }))).toEqual([
      { label: null, exclusion: "heading" },
      { label: null, exclusion: null },
      { label: "1", exclusion: null },
    ]);
  });

  it("keeps an empty-template level structural for descendant counters and resets", () => {
    const result = numberHeadings(
      parseAtxHeadings("# A\n## Hidden B\n### C\n## Hidden D\n### E"),
      options({
        scheme: {
          id: "custom-empty-level",
          baseLevel: 1,
          templates: [
            "{1.arabic}",
            "",
            "{1.arabic}.{2.arabic}.{3.arabic}",
            "",
            "",
            "",
          ],
          exclusions: [],
        },
      }),
    );

    expect(result.map((item) => item.label)).toEqual(["1", null, "1.1.1", null, "1.2.1"]);
    expect(result[1]?.counters).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(result[3]?.counters).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("does not report a missing parent for a structural empty-template level", () => {
    const result = numberHeadings(
      parseAtxHeadings("# A\n### Hidden"),
      options({
        missingLevelStrategy: "skip",
        scheme: {
          id: "custom-empty-deep-level",
          baseLevel: 1,
          templates: ["{1.arabic}", "{2.arabic}", "", "", "", ""],
          exclusions: [],
        },
      }),
    );

    expect(result[1]).toMatchObject({
      label: null,
      warning: null,
      counters: [1, 0, 1, 0, 0, 0, 0, 0, 0],
    });
  });

  it("formats built-in numeral styles", () => {
    expect(formatCounter(12, "arabic_full")).toBe("１２");
    expect(formatCounter(12, "chinese_lower")).toBe("十二");
    expect(formatCounter(12, "chinese_upper")).toBe("壹拾贰");
    expect(formatCounter(20, "circled")).toBe("⑳");
    expect(formatCounter(27, "letter_upper")).toBe("AA");
    expect(formatCounter(14, "roman_lower")).toBe("xiv");
  });

  it.each([
    [10, "十"],
    [1010, "一千零一十"],
    [10010, "一万零一十"],
    [10011, "一万零一十一"],
    [100000010, "一亿零一十"],
    [100100000, "一亿零一十万"],
  ])("preserves one in non-leading Chinese groups for %i", (value, expected) => {
    expect(formatCounter(value as number, "chinese_lower")).toBe(expected);
  });

  it("excludes one exact heading without consuming its counter", () => {
    const result = numberHeadings(
      parseAtxHeadings("# First\n# References\n# Next"),
      options({
        scheme: {
          ...BUILT_IN_SCHEMES.hierarchical,
          exclusions: [{ title: "References", scope: "heading" }],
        },
      }),
    );
    expect(result.map((item) => ({ label: item.label, exclusion: item.exclusion }))).toEqual([
      { label: "1", exclusion: null },
      { label: null, exclusion: "heading" },
      { label: "2", exclusion: null },
    ]);
  });

  it("excludes a whole subtree and resumes the surrounding level", () => {
    const result = numberHeadings(
      parseAtxHeadings("# First\n## Body\n## References\n### Book\n## Next"),
      options({
        scheme: {
          ...BUILT_IN_SCHEMES.hierarchical,
          exclusions: [{ title: "References", scope: "subtree" }],
        },
      }),
    );
    expect(result.map((item) => ({ label: item.label, exclusion: item.exclusion }))).toEqual([
      { label: "1", exclusion: null },
      { label: "1.1", exclusion: null },
      { label: null, exclusion: "subtree" },
      { label: null, exclusion: "subtree" },
      { label: "1.2", exclusion: null },
    ]);
  });

  it("routes heading-only descendants through the missing-level strategy", () => {
    const scheme = {
      ...BUILT_IN_SCHEMES.hierarchical,
      exclusions: [{ title: "Interlude", scope: "heading" as const }],
    };
    const headings = parseAtxHeadings("# First\n## Interlude\n### Detail");
    expect(numberHeadings(headings, options({ scheme, missingLevelStrategy: "fill-one" }))[2]?.label)
      .toBe("1.1.1");
    expect(numberHeadings(headings, options({ scheme, missingLevelStrategy: "current-only" }))[2]?.label)
      .toBe("1");
    expect(numberHeadings(headings, options({ scheme, missingLevelStrategy: "skip" }))[2])
      .toMatchObject({ label: null, warning: "missing-parent" });
  });
});
