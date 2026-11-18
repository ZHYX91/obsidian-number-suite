import { describe, expect, it, vi } from "vitest";
import type { HeadingCache } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { createNativeOutlineProjection } from "../../src/integration/native-outline";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  getFrontMatterInfo: (source: string) => {
    const match = /^---\n([\s\S]*?)\n---\n/u.exec(source);
    return { exists: match != null, frontmatter: match?.[1] ?? "", from: 0, to: match?.[0].length ?? 0, contentStart: match?.[0].length ?? 0 };
  },
  parseYaml: (source: string) => source === "number-suite: [disabled=true]" ? { "number-suite": ["disabled=true"] } : {},
}));

function native(line: number, heading: string, level: number, from: number): HeadingCache {
  return {
    heading, level,
    position: {
      start: { line, col: 0, offset: from },
      end: { line, col: heading.length, offset: from + heading.length },
    },
  };
}

describe("native Outline projection", () => {
  const source = [
    "## Chapter",
    "######## Deep",
    "Figure: Diagram",
    "## Next",
    "Table: Result",
  ].join("\n");
  const headings: HeadingCache[] = [
    native(0, "Chapter", 2, 0),
    native(3, "Next", 2, source.indexOf("## Next")),
  ];

  it("adds H7–H9 and captions as navigation-only entries at true source lines", () => {
    const result = createNativeOutlineProjection(source, headings, DEFAULT_SETTINGS);
    expect(result.headings.map((item) => [item.position.start.line, item.level, item.heading])).toEqual([
      [0, 2, "Chapter"],
      [1, 8, "Deep"],
      [2, 9, "Figure 1: Diagram"],
      [3, 2, "Next"],
      [4, 3, "Table 1: Result"],
    ]);
    expect(result.headings.slice(1).some((item) => item.__numberSuiteExtra === "caption")).toBe(true);
    expect(result.numberLabels.get(0)).toBeTruthy();
  });

  it("keeps all switches independent, including explicit false", () => {
    const off = createNativeOutlineProjection(source, headings, {
      ...DEFAULT_SETTINGS,
      showOutlineNumbers: false,
      showOutlineExtendedHeadings: false,
      showOutlineCaptions: false,
    });
    expect(off.headings).toEqual(headings);
    expect(off.numberLabels.size).toBe(0);
    const noCaptions = createNativeOutlineProjection(source, headings, {
      ...DEFAULT_SETTINGS, showOutlineCaptions: false,
    });
    expect(noCaptions.headings.some((item) => item.__numberSuiteExtra === "caption")).toBe(false);
    expect(noCaptions.headings.some((item) => item.__numberSuiteExtra === "extended")).toBe(true);
  });

  it("does not duplicate extended heading rows supplied by another plugin", () => {
    const from = source.indexOf("######## Deep");
    const existing = native(1, "Deep", 8, from);
    const result = createNativeOutlineProjection(source, [...headings, existing], DEFAULT_SETTINGS);
    expect(result.headings.filter((item) => item.position.start.line === 1)).toHaveLength(1);
  });

  it("keeps the original Outline when the metadata cache has a stale heading level", () => {
    const stale = [native(0, "Chapter", 3, 0), headings[1]!];
    const result = createNativeOutlineProjection(source, stale, DEFAULT_SETTINGS);
    expect(result.headings).toEqual(stale);
    expect(result.numberLabels.size).toBe(0);
  });

  it("fails closed when Number Suite is disabled for this note", () => {
    const disabled = "---\nnumber-suite: [disabled=true]\n---\n" + source;
    const result = createNativeOutlineProjection(disabled, [], DEFAULT_SETTINGS);
    expect(result.headings).toEqual([]);
    expect(result.numberLabels.size).toBe(0);
  });
});
