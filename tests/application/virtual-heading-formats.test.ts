import { describe, expect, it } from "vitest";
import { createDisplayPlan } from "../../src/application/display-plan";
import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { createSourcePlan } from "../../src/commands/transform-options";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import type { NumberingOptions } from "../../src/core/types";
import { exportSemanticSnapshotV2, NUMBER_SUITE_INTEROP_SCHEMA_V2 } from "../../src/integration/semantic-export";

const templateSources = [{
  schemeId: "hierarchical", schemeName: "Hierarchical", revision: 1,
  templates: BUILT_IN_SCHEMES.hierarchical.templates,
}];
const displayOptions = {
  showVirtualNumbers: true, concealStoredNumbers: false,
  storedHeadingNumberStyleScope: "templates", cleanupScope: "templates",
  templateSources, revealOnActiveLine: false, selections: [], composing: false,
} as const;

describe("virtual heading formats", () => {
  it.each([
    ["chinese-traditional-chapters", "第三章", "第二節"],
    ["japanese-chapters", "第３章", "第２節"],
    ["korean-chapters", "제3장", "제2절"],
    ["legal", "第三编", "第二章"],
    ["chinese-official", "三、", "（二）"],
    ["arabic-indic-hierarchical", "٣", "٢"],
    ["hierarchical", "3", "2"],
  ] as const)("uses the %s template's current-level style and note starts", (scheme, first, second) => {
    const headings = parseAtxHeadings("# Parent\n## Child");
    const numbering: NumberingOptions = { scheme: BUILT_IN_SCHEMES[scheme], missingLevelStrategy: "fill-one", starts: { 1: 3, 2: 2 } };
    const plan = createDisplayPlan(headings, { ...displayOptions, numbering, virtualNumberFormat: "current-only" });
    expect(plan.map((item) => item.label)).toEqual([first, second]);
  });

  it("leaves the untargeted first level unnumbered in an H2-based scheme", () => {
    const headings = parseAtxHeadings("# Document\n## Chapter\n### Detail");
    const numbering: NumberingOptions = { scheme: BUILT_IN_SCHEMES["hierarchical-h2"], missingLevelStrategy: "skip", starts: { 2: 3, 3: 2 } };
    const plan = createDisplayPlan(headings, { ...displayOptions, numbering, virtualNumberFormat: "current-only" });
    expect(plan.map((entry) => [entry.line, entry.label])).toEqual([[1, "3"], [2, "2"]]);
  });

  it("uses the local counter token in a compound custom label and preserves unnumbered levels", () => {
    const templates = ["{1.roman_upper}.", "{1.roman_upper}/{2.letter_lower}", ""];
    const numbering: NumberingOptions = {
      scheme: { ...BUILT_IN_SCHEMES.hierarchical, templates }, missingLevelStrategy: "skip", starts: { 1: 2, 2: 3 },
    };
    const headings = parseAtxHeadings("# Parent\n## Child\n### Empty");
    const plan = createDisplayPlan(headings, { ...displayOptions, numbering, virtualNumberFormat: "current-only" });
    expect(plan.map((item) => item.label)).toEqual(["II.", "c"]);
    expect(createDisplayPlan(parseAtxHeadings("## No parent"), { ...displayOptions, numbering, virtualNumberFormat: "current-only" })).toEqual([]);
  });

  it.each([
    [true, false, "current-only", "1 1.1 Item", "1 1.1 alias", "1", true],
    [true, true, "current-only", "1 Item", "1 1.1 alias", "1", false],
    [true, false, "scheme", "1.1 Item", "1.1 alias", "1.1", true],
    [true, true, "scheme", "1.1 Item", "1.1 alias", "1.1", false],
    [false, false, "current-only", "1.1 Item", "1.1 alias", null, true],
    [false, true, "current-only", "Item", "1.1 alias", null, false],
  ] as const)("preserves source numbers and aliases with virtual=%s, conceal=%s, references=%s",
    (virtual, conceal, format, plainReference, aliasedReference, nativeNumber, storedVisible) => {
      const source = "# Intro\n## 1.1 Item ^item\n\nSee @[[#^item]], @[[#^item|1.1 alias]] and [[#1.1 Item|1.1 alias]].";
      const headings = parseAtxHeadings(source);
      const numbering: NumberingOptions = { scheme: BUILT_IN_SCHEMES.hierarchical, missingLevelStrategy: "fill-one", starts: {} };
      const display = createDisplayPlan(headings, {
        ...displayOptions, numbering, virtualNumberFormat: "current-only", referenceNumberFormat: format,
        showVirtualNumbers: virtual, concealStoredNumbers: conceal,
      });
      expect(display.filter((item) => item.kind === "stored").map((item) => item.label)).toEqual(storedVisible ? ["1.1"] : []);
      const semantic = createSemanticDisplayPlan(source, headings, {
        showCaptionNumbers: true, centeredCaptionKinds: [], showCrossReferences: true,
        enhanceNativeWikiHeadingLinks: true, showNoteNumbers: false, noteSelections: [],
        numbering, templateSources, headingDisplayPlan: display, composing: false,
      });
      expect(semantic.filter((item) => item.kind === "reference").map((item) => item.label))
        .toEqual([plainReference, aliasedReference]);
      const wiki = semantic.find((item) => item.kind === "native-link-number");
      expect(wiki?.label ?? null).toBe(nativeNumber);
      expect(wiki?.nativeHiddenPrefix).toBeUndefined();
    });

  it("writes and exports the scheme's full number with identical counters and display segments", () => {
    const source = "# Chapter\n## Detail\n@[[#Detail]]";
    const settings = { ...DEFAULT_SETTINGS, showVirtualNumbers: true, selectedSchemeId: "hierarchical" };
    const shortened = { ...settings, bodyHeadingNumberFormat: "current-only", referenceHeadingNumberFormat: "current-only" } as const;
    const request = { schema: NUMBER_SUITE_INTEROP_SCHEMA_V2, authoredMarkdown: source, frontmatter: {} };
    const original = exportSemanticSnapshotV2(settings, request);
    expect(original.headingTargets[1]?.derivedNumber).toBe("1.1");
    expect(exportSemanticSnapshotV2(shortened, request)).toEqual(original);
    for (const operation of ["write", "renumber"] as const) {
      const baseline = createSourcePlan(source, operation, settings);
      expect(baseline.plan?.changes[1]?.after).toBe("1.1 Detail");
      expect(createSourcePlan(source, operation, shortened)).toEqual(baseline);
    }
  });
});
