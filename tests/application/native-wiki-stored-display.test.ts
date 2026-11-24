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
    storedHeadingNumberStyleScope: "templates",
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
  const heading = "# 一、 实验设计";
  const base = heading + "\nSee [[#一、 实验设计]].";
  const withAlias = heading + "\nSee [[#一、 实验设计|my own alias]].";

  it("looks up each ordinary link without rescanning the heading plan", () => {
    const count = 128;
    const source = Array.from({ length: count }, (_, index) => (
      `# Heading ${index}\nSee [[#Heading ${index}]].`
    )).join("\n");
    const headings = parseAtxHeadings(source);
    let entryVisits = 0;
    const headingDisplayPlan = headings.map((heading, index) => ({
      get kind(): "virtual" { entryVisits++; return "virtual"; },
      from: heading.contentFrom, to: heading.contentFrom,
      label: String(index + 1), line: heading.line,
    }));
    const plan = createSemanticDisplayPlan(source, headings, {
      showCaptionNumbers: false, centeredCaptionKinds: [], showCrossReferences: false,
      enhanceNativeWikiHeadingLinks: true, showNoteNumbers: false, noteSelections: [],
      numbering, templateSources, headingDisplayPlan, composing: false,
    });
    expect(plan.map((entry) => entry.label)).toEqual(headings.map((_, index) => String(index + 1)));
    expect(entryVisits).toBeLessThanOrEqual(4 * count);
  });

  it("defaults to template outlining, honors the legacy toggle, and keeps the Wiki enhancement off", () => {
    expect(DEFAULT_SETTINGS.storedHeadingNumberStyleScope).toBe("templates");
    expect(DEFAULT_SETTINGS.enhanceNativeWikiHeadingLinks).toBe(false);
    expect(sanitizeSettings({ styleStoredHeadingNumbers: false }).storedHeadingNumberStyleScope).toBe("off");
    expect(sanitizeSettings({ styleStoredHeadingNumbers: true }).storedHeadingNumberStyleScope).toBe("templates");
    expect(sanitizeSettings({}).storedHeadingNumberStyleScope).toBe("templates");
    expect(sanitizeSettings({
      styleStoredHeadingNumbers: false,
      storedHeadingNumberStyleScope: "common",
    }).storedHeadingNumberStyleScope).toBe("common");
  });

  it("handles all four virtual/conceal combinations without modifying Markdown", () => {
    const offOff = plans(base, false, false);
    expect(offOff.display.find((x) => x.kind === "stored")?.label).toBe("一、");
    expect(offOff.display.some((x) => x.kind === "virtual")).toBe(false);
    expect(offOff.semantic).toEqual([]);

    const offOn = plans(base, false, true);
    expect(offOn.display.some((x) => x.kind === "conceal")).toBe(true);
    expect(offOn.display.some((x) => x.kind === "stored")).toBe(false);
    expect(offOn.semantic).toHaveLength(1);
    expect(offOn.semantic[0]).toMatchObject({ label: "", nativeHiddenPrefix: "一、 " });
    expect(offOn.semantic[0]?.nativeHiddenFrom).toBe(base.indexOf("一、", base.indexOf("[[")));
    expect(offOn.semantic[0]?.nativeHiddenTo).toBe((offOn.semantic[0]?.nativeHiddenFrom ?? 0) + "一、 ".length);

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
    expect(onOn.semantic[0]).toMatchObject({ label: "1", nativeHiddenPrefix: "一、 " });

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
    expect(withAlias).toContain("[[#一、 实验设计|my own alias]]");
  });

  it.each(["#", "##"])("conceals only the compact official prefix in a %s heading and its unaliased link", (level) => {
    const source = level + " 一、实验设计\nSee [[#一、实验设计]].";
    const result = plans(source, true, true);
    expect(result.display.find((item) => item.kind === "conceal")?.sourceText).toBe("一、");
    expect(result.semantic).toHaveLength(1);
    const link = result.semantic[0];
    expect(source.slice(link?.nativeHiddenFrom, link?.nativeHiddenTo)).toBe("一、");
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

  it("outlines visible manual prefixes independently of concealment and virtual numbering", () => {
    const source = [
      "# 7 Lantern archive",
      "## 3) Lantern patterns",
      "## 2026.11 release",
      "## 2025 inventory",
      "## version 2.1",
      "# \u2060Box 3\u2060 Forest lights",
    ].join("\n");
    const headings = parseAtxHeadings(source);
    const options = {
      showVirtualNumbers: true, concealStoredNumbers: true,
      numbering, cleanupScope: "templates" as const, templateSources,
      revealOnActiveLine: false, selections: [], composing: false,
    };
    const common = createDisplayPlan(headings, { ...options, storedHeadingNumberStyleScope: "common" });
    expect(common.filter((item) => item.kind === "stored")).toMatchObject([
      { line: 1, label: "3)", pillKind: "manual" },
    ]);
    expect(common.filter((item) => item.kind === "conceal").map((item) => item.line)).toEqual([0, 5]);
    expect(common.filter((item) => item.kind === "virtual").map((item) => item.line)).toEqual([0, 1, 2, 3, 4, 5]);
    const templates = createDisplayPlan(headings, {
      ...options, concealStoredNumbers: false, storedHeadingNumberStyleScope: "templates",
    });
    expect(templates.filter((item) => item.kind === "stored")).toMatchObject([
      { line: 0, label: "7", pillKind: "stored" },
      { line: 5, label: "Box 3", pillKind: "stored" },
    ]);
    const off = createDisplayPlan(headings, {
      ...options, concealStoredNumbers: false, storedHeadingNumberStyleScope: "off",
    });
    expect(off.map((item) => item.kind)).toEqual(Array.from({ length: headings.length }, () => "virtual"));
  });

  it("does not style an authored number when the source is being edited", () => {
    const source = heading;
    const headings = parseAtxHeadings(source);
    const result = createDisplayPlan(headings, {
      showVirtualNumbers: false,
      concealStoredNumbers: false,
      storedHeadingNumberStyleScope: "templates",
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
      showVirtualNumbers: true, concealStoredNumbers: false, storedHeadingNumberStyleScope: "off",
      numbering: { ...numbering, scheme }, cleanupScope: "templates",
      templateSources, revealOnActiveLine: false, selections: [], composing: false,
    });
    expect(display.filter((item) => item.kind === "virtual")).toEqual([]);
  });
});
