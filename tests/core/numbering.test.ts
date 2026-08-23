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
    expect(result[1]?.counters).toEqual([1, 1, 0, 0, 0, 0]);
    expect(result[3]?.counters).toEqual([1, 2, 0, 0, 0, 0]);
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
      counters: [1, 0, 1, 0, 0, 0],
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
