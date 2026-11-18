import { describe, expect, it } from "vitest";
import { createDisplayPlan } from "../../src/application/display-plan";
import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../../src/config/settings";
import type { CleanupTemplateSource, NumberingOptions } from "../../src/core/types";

const numbering: NumberingOptions = {
  scheme: BUILT_IN_SCHEMES.hierarchical,
  missingLevelStrategy: "fill-one",
  starts: {},
};
const templateSources: CleanupTemplateSource[] = [{
  schemeId: "chinese-official",
  schemeName: "Chinese official",
  revision: 1,
  templates: BUILT_IN_SCHEMES["chinese-official"].templates,
}, {
  schemeId: "hierarchical",
  schemeName: "Hierarchical",
  revision: 1,
  templates: BUILT_IN_SCHEMES.hierarchical.templates,
}];

function plans(
  source: string,
  virtual: boolean,
  conceal: boolean,
) {
  const headings = parseAtxHeadings(source);
  const display = createDisplayPlan(headings, {
    showVirtualNumbers: virtual,
    concealStoredNumbers: conceal,
    styleStoredNumbers: true,
    numbering,
    cleanupScope: "templates",
    templateSources,
    revealOnActiveLine: false,
    selections: [],
    composing: false,
  });
  const semantic = createSemanticDisplayPlan(source, headings, {
    showCaptionNumbers: false,
    centeredCaptionKinds: [],
    showCrossReferences: false,
    enhanceNativeWikiHeadingLinks: true,
    showNoteNumbers: false,
    noteSelections: [],
    numbering,
    templateSources,
    headingDisplayPlan: display,
    composing: false,
  }).filter((item) => item.kind === "native-link-number");
  return { display, semantic, source };
}

describe("virtual and reliable source-number presentation", () => {
  const heading = "# 一、实验设计";
  const base = heading + "\nSee [[#一、实验设计]].";
  const withAlias = heading + "\nSee [[#一、实验设计|my own alias]].";

  it("defaults stored-number outlining ON and keeps the Wiki enhancement OFF", () => {
    expect(DEFAULT_SETTINGS.styleStoredHeadingNumbers).toBe(true);
    expect(DEFAULT_SETTINGS.enhanceNativeWikiHeadingLinks).toBe(false);
    expect(sanitizeSettings({ styleStoredHeadingNumbers: false }).styleStoredHeadingNumbers).toBe(false);
    expect(sanitizeSettings({ styleStoredHeadingNumbers: true }).styleStoredHeadingNumbers).toBe(true);
  });

  it("handles all four virtual/conceal combinations without modifying Markdown", () => {
    const offOff = plans(base, false, false);
    expect(offOff.display.some((x) => x.kind === "stored")).toBe(true);
    expect(offOff.display.some((x) => x.kind === "virtual")).toBe(false);
    expect(offOff.semantic).toEqual([]);

    const offOn = plans(base, false, true);
    expect(offOn.display.some((x) => x.kind === "conceal")).toBe(true);
    expect(offOn.display.some((x) => x.kind === "stored")).toBe(false);
    expect(offOn.semantic).toHaveLength(1);
    expect(offOn.semantic[0]).toMatchObject({ label: "", nativeHiddenPrefix: "一、" });
    expect(offOn.semantic[0]?.nativeHiddenFrom).toBe(base.indexOf("一、", base.indexOf("[[")));
    expect(offOn.semantic[0]?.nativeHiddenTo).toBe((offOn.semantic[0]?.nativeHiddenFrom ?? 0) + 2);

    const onOff = plans(base, true, false);
    expect(onOff.display.some((x) => x.kind === "virtual")).toBe(true);
    expect(onOff.display.some((x) => x.kind === "stored")).toBe(true);
    expect(onOff.semantic).toHaveLength(1);
    expect(onOff.semantic[0]).toMatchObject({ label: "1" });
    expect(onOff.semantic[0]?.nativeHiddenPrefix).toBeUndefined();

    const onOn = plans(base, true, true);
    expect(onOn.display.some((x) => x.kind === "conceal")).toBe(true);
    expect(onOn.display.some((x) => x.kind === "virtual")).toBe(true);
    expect(onOn.semantic).toHaveLength(1);
    expect(onOn.semantic[0]).toMatchObject({ label: "1", nativeHiddenPrefix: "一、" });

    for (const result of [offOff, offOn, onOff, onOn]) {
      expect(result.source).toBe(base);
      expect(result.semantic.every((x) => x.from === x.to)).toBe(true);
    }
  });

  it("keeps explicit aliases intact while retaining a separately displayed virtual badge", () => {
    const actual = plans(withAlias, true, true);
    expect(actual.semantic).toHaveLength(1);
    expect(actual.semantic[0]?.label).toBe("1");
    expect(actual.semantic[0]?.nativeHiddenPrefix).toBeUndefined();
    expect(actual.semantic[0]?.nativeHiddenFrom).toBeUndefined();
    expect(actual.semantic[0]?.nativeHiddenTo).toBeUndefined();
    expect(withAlias).toContain("[[#一、实验设计|my own alias]]");
  });

  it("does not mark a misleading prefix in a differently authored link target", () => {
    const source = "# 一、实验设计\nSee [[#一、实验设计]].";
    const items = plans(source, true, true).semantic;
    expect(items).toHaveLength(1);
    const start = items[0]?.nativeHiddenFrom;
    expect(start == null ? "" : source.slice(start, items[0]!.nativeHiddenTo)).toBe("一、");
  });

  it("never deduplicates a user-authored number against a virtual badge", () => {
    const source = "# 1 Stored\nSee [[#1 Stored|1 Stored]].";
    const result = plans(source, true, false);
    expect(result.semantic).toHaveLength(1);
    expect(result.semantic[0]?.label).toBe("1");
  });

  it("refuses absent or suspicious stored numbers instead of expanding recognition", () => {
    const candidates = ["# 2026.11 release", "# v2.1 release", "# 2025 report", "# Chapter title"];
    for (const source of candidates) {
      const actual = plans(source, false, false);
      expect(actual.display.filter((item) => item.kind === "stored")).toEqual([]);
    }
  });

  it("does not style an authored number when the source is being edited", () => {
    const source = heading;
    const headings = parseAtxHeadings(source);
    const result = createDisplayPlan(headings, {
      showVirtualNumbers: false,
      concealStoredNumbers: false,
      styleStoredNumbers: true,
      numbering,
      cleanupScope: "templates",
      templateSources,
      revealOnActiveLine: true,
      selections: [{ from: 4, to: 4 }],
      composing: false,
    });
    expect(result.filter((item) => item.kind === "stored")).toEqual([]);
  });

  it("does not show badges for unnumbered, excluded or disabled headings", () => {
    const scheme = { ...BUILT_IN_SCHEMES.hierarchical, exclusions: [
      { title: "Excluded", scope: "subtree" as const },
    ] };
    const source = "# Excluded\nSee [[#Excluded]]";
    const h = parseAtxHeadings(source);
    const display = createDisplayPlan(h, {
      showVirtualNumbers: true, concealStoredNumbers: false, styleStoredNumbers: false,
      numbering: { ...numbering, scheme }, cleanupScope: "templates",
      templateSources, revealOnActiveLine: false, selections: [], composing: false,
    });
    expect(display.filter((item) => item.kind === "virtual")).toEqual([]);
  });
});
