import { describe, expect, it, vi } from "vitest";
import type { HeadingCache } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { createNativeOutlineProjection } from "../../src/integration/native-outline-projection";

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
    const result = createNativeOutlineProjection(source, headings, { ...DEFAULT_SETTINGS, showVirtualNumbers: true });
    expect(result.headings.map((item) => [item.position.start.line, item.level, item.heading])).toEqual([
      [0, 2, "Chapter"],
      [1, 8, "Deep"],
      [2, 10, "Figure 1: Diagram"],
      [3, 2, "Next"],
      [4, 10, "Table 1: Result"],
    ]);
    expect(result.headings.slice(1).some((item) => item.__numberSuiteExtra === "caption")).toBe(true);
    expect(result.numberLabels.get(0)).toBeTruthy();
  });

  it("localizes the actual host heading field used by native filtering", () => {
    const result = createNativeOutlineProjection(source, headings, DEFAULT_SETTINGS,
      (kind) => ({ Figure: "图", Table: "表", Equation: "公式", Code: "代码" }[kind]));
    expect(result.headings.filter((item) => item.__numberSuiteExtra === "caption")
      .map((item) => item.heading)).toEqual(["图 1: Diagram", "表 1: Result"]);
    expect(result.headings[0]).toBe(headings[0]);
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
  it("matches effective body display rather than inventing heading numbers", () => {
    const plain = "## Heading";
    const cache = [native(0, "Heading", 2, 0)];
    const off = createNativeOutlineProjection(plain, cache, { ...DEFAULT_SETTINGS, showVirtualNumbers: false });
    expect(off.numberLabels.size).toBe(0);
    const on = createNativeOutlineProjection(plain, cache, { ...DEFAULT_SETTINGS, showVirtualNumbers: true });
    expect(on.numberLabels.get(0)).toBe("1");
    const concealed = createNativeOutlineProjection(plain, cache, {
      ...DEFAULT_SETTINGS, showVirtualNumbers: true, concealStoredNumbers: true,
    });
    expect(concealed.numberLabels.get(0)).toBe("1");
  });

  it("makes captions leaves so a following skipped-level heading stays under its heading parent", () => {
    const text = "# Parent\nFigure: One\n####### Deep\nTable: Two\n######### Child\nFigure: Three";
    const result = createNativeOutlineProjection(text, [native(0, "Parent", 1, 0)], DEFAULT_SETTINGS);
    const stack: Array<{ level: number; line: number }> = [];
    const parents = new Map<number, number | null>();
    for (const heading of result.headings) {
      while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
      parents.set(heading.position.start.line, stack[stack.length - 1]?.line ?? null);
      stack.push({ level: heading.level, line: heading.position.start.line });
    }
    expect([...parents]).toEqual([[0, null], [1, 0], [2, 0], [3, 2], [4, 2], [5, 4]]);
    expect(result.headings.filter((heading) => heading.__numberSuiteExtra === "caption").map((heading) => heading.__numberSuiteCaption?.ordinal)).toEqual([1, 1, 2]);
  });

});
