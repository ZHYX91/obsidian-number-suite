import { describe, expect, it } from "vitest";

import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import { cleanupTemplateSources, displayTemplateSources, sanitizeSettings } from "../../src/config/settings";
import { WORD_JOINER } from "../../src/core/markers";
import type { NumberingOptions } from "../../src/core/types";
import { createDisplayPlan, type DisplayPlanOptions } from "../../src/application/display-plan";

const numbering: NumberingOptions = {
  scheme: BUILT_IN_SCHEMES.hierarchical,
  missingLevelStrategy: "fill-one",
  starts: {},
};

function options(overrides: Partial<DisplayPlanOptions>): DisplayPlanOptions {
  return {
    showVirtualNumbers: true,
    concealStoredNumbers: false,
    numbering,
    cleanupScope: "templates",
    templateSources: [{
      schemeId: "hierarchical",
      schemeName: "Hierarchical",
      revision: 1,
      templates: BUILT_IN_SCHEMES.hierarchical.templates,
    }],
    revealOnActiveLine: true,
    selections: [],
    composing: false,
    ...overrides,
  };
}

describe("display plan", () => {
  it("disables only the scheme's automatic matches, including historical revisions", () => {
    const settings = sanitizeSettings({
      hiddenBuiltInSchemeIds: ["chinese-official"],
      cleanupHistory: [{
        schemeId: "chinese-official", revision: 2, templates: ["{1.chinese_lower}、"],
      }],
    });
    const headings = parseAtxHeadings(`# 一、 Title
# ${WORD_JOINER}二、${WORD_JOINER} Marked`);
    const visible = options({
      showVirtualNumbers: false,
      storedHeadingNumberStyleScope: "templates",
      templateSources: displayTemplateSources(settings),
    });
    expect(visible.templateSources.filter(s => s.schemeId === "chinese-official")).toHaveLength(0);
    expect(cleanupTemplateSources(settings).filter(s => s.schemeId === "chinese-official")
      .map(s => s.revision)).toEqual([1, 2]);
    expect(createDisplayPlan(headings, visible)).toMatchObject([{ line: 1, pillKind: "stored" }]);
    expect(createDisplayPlan(headings, { ...visible, concealStoredNumbers: true }))
      .toMatchObject([{ line: 1, kind: "conceal" }]);
    expect(createDisplayPlan(headings, { ...visible, storedHeadingNumberStyleScope: "common" }))
      .toMatchObject([{ line: 0, pillKind: "manual" }, { line: 1, pillKind: "stored" }]);
    expect(createDisplayPlan(headings, { ...visible, cleanupScope: "common", concealStoredNumbers: true }))
      .toMatchObject([{ line: 0, kind: "conceal" }, { line: 1, kind: "conceal" }]);

    settings.customSchemes.push({
      id: "custom-copy", name: "Copy", revision: 1, baseLevel: 1,
      templates: [...BUILT_IN_SCHEMES["chinese-official"].templates], exclusions: [],
    });
    expect(createDisplayPlan(headings, { ...visible, templateSources: displayTemplateSources(settings) }))
      .toMatchObject([{ line: 0, pillKind: "stored" }, { line: 1, pillKind: "stored" }]);
    settings.customSchemes = [];
    settings.disabledBuiltInSchemeIds = [];
    expect(createDisplayPlan(headings, { ...visible, templateSources: displayTemplateSources(settings) }))
      .toMatchObject([{ line: 0, pillKind: "stored" }, { line: 1, pillKind: "stored" }]);
  });

  it("does not display overflowed numbers or conceal their authored prefixes", () => {
    const source = `# First\n# ${WORD_JOINER}2${WORD_JOINER} Overflow\n## Child`;
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      concealStoredNumbers: true,
      numbering: { ...numbering, starts: { 1: Number.MAX_SAFE_INTEGER } },
    }));
    expect(plan.map((item) => ({ line: item.line, kind: item.kind, label: item.label }))).toEqual([
      { line: 0, kind: "virtual", label: String(Number.MAX_SAFE_INTEGER) },
    ]);
  });

  it("shows virtual numbers alongside both recognized source numbers and ambiguous decimals", () => {
    const source = "# Plain\n## 1.1 Stored\n## 3.14 Pi\n## Next";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({}));
    expect(plan.map((item) => ({ line: item.line, label: item.label }))).toEqual([
      { line: 0, label: "1" },
      { line: 1, label: "1.1" },
      { line: 2, label: "1.2" },
      { line: 3, label: "1.3" },
    ]);
  });

  it("uses the same skip-first and first-number semantics for virtual display", () => {
    const source = "# Preface\n# Chapter\n## Lead\n## Topic";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      numbering: {
        ...numbering,
        starts: { 1: 3, 2: 2 },
        skipFirst: { 1: 1, 2: 1 },
      },
    }));
    expect(plan.map((item) => ({ line: item.line, label: item.label }))).toEqual([
      { line: 1, label: "3" },
      { line: 3, label: "3.2" },
    ]);
  });

  it("conceals high-confidence prefixes", () => {
    const source = "# 1.1 Stored\n# 1. Medium\n# 3.14 Pi";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: false,
      concealStoredNumbers: true,
      cleanupScope: "common",
    }));
    expect(plan).toHaveLength(1);
    expect(source.slice(plan[0]?.from, plan[0]?.to)).toBe("1.1 ");
  });

  it("conceals expected unmarked single-level numbers", () => {
    const source = "# 1 First\n# 2 Second";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: false,
      concealStoredNumbers: true,
    }));
    expect(plan.map((item) => source.slice(item.from, item.to))).toEqual(["1 ", "2 "]);
  });

  it("keeps unmarked matches visible in source-marked-only concealment mode", () => {
    const source = `# 1 Manual\n# ${WORD_JOINER}2${WORD_JOINER} Stored`;
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: false,
      concealStoredNumbers: true,
      cleanupScope: "plugin",
    }));
    expect(plan.map((item) => source.slice(item.from, item.to))).toEqual([
      `${WORD_JOINER}2${WORD_JOINER} `,
    ]);
  });

  it("reveals the active heading's stored prefix while keeping its virtual badge outside composition", () => {
    const source = "# 1.1 Stored\n# Next";
    const headings = parseAtxHeadings(source);
    const heading = headings[0];
    expect(createDisplayPlan([heading!], options({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      selections: [{ from: heading!.lineFrom, to: heading!.lineFrom }],
    }))).toMatchObject([{ kind: "virtual", line: 0, label: "1" }]);
    expect(createDisplayPlan(headings, options({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      selections: [{ from: heading!.lineFrom, to: heading!.lineFrom }],
      composing: true,
    }))).toMatchObject([{ kind: "virtual", line: 1, label: "2" }]);
  });

  it("conceals a recognized stored prefix and replaces it with one virtual number", () => {
    const source = "# 1 Stored\n# Next";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    }));
    expect(plan.map((item) => ({
      kind: item.kind,
      line: item.line,
      source: source.slice(item.from, item.to),
      label: item.label,
    }))).toEqual([
      { kind: "conceal", line: 0, source: "1 ", label: "" },
      { kind: "virtual", line: 0, source: "", label: "1" },
      { kind: "virtual", line: 1, source: "", label: "2" },
    ]);
  });

  it.each(["3.14 Sample", "2025. Example", "2.12 Release", "v2.1 Snapshot"])(
    "shows a virtual number and preserves the original text of %s with common concealment",
    (title) => {
      const source = `# ${title}`;
      expect(createDisplayPlan(parseAtxHeadings(source), options({
        showVirtualNumbers: true,
        concealStoredNumbers: true,
        cleanupScope: "common",
      }))).toMatchObject([{ kind: "virtual", line: 0, label: "1" }]);
    },
  );

  it.each(["plugin", "templates", "common"] as const)(
    "shows a virtual number with %s recognition and only hides a manual prefix in common scope",
    (cleanupScope) => {
      const source = "## 1. 示例章节";
      const plan = createDisplayPlan(parseAtxHeadings(source), options({
        concealStoredNumbers: true,
        cleanupScope,
      }));
      expect(plan.filter((item) => item.kind === "virtual").map((item) => item.label)).toEqual(["1.1"]);
      expect(plan.filter((item) => item.kind === "conceal").map((item) => source.slice(item.from, item.to)))
        .toEqual(cleanupScope === "common" ? ["1. "] : []);
    },
  );

  it("conceals a common manual prefix with virtual numbers off", () => {
    const source = "## 2. Sample topic";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: false,
      concealStoredNumbers: true,
      cleanupScope: "common",
    }));
    expect(plan).toMatchObject([{ kind: "conceal", sourceText: "2. " }]);
  });

  it("does not render excluded titles and can conceal a confirmed stored prefix", () => {
    const source = "# 1 First\n# 2 References\n# 3 Next";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      numbering: {
        ...numbering,
        scheme: {
          ...numbering.scheme,
          exclusions: [{ title: "References", scope: "heading" }],
        },
      },
    }));
    expect(plan.map((item) => ({ kind: item.kind, line: item.line, label: item.label }))).toEqual([
      { kind: "conceal", line: 0, label: "" },
      { kind: "virtual", line: 0, label: "1" },
      { kind: "conceal", line: 1, label: "" },
      { kind: "conceal", line: 2, label: "" },
      { kind: "virtual", line: 2, label: "2" },
    ]);
  });

  it("supports punctuation titles and comment-mapped source ranges", () => {
    const source = "# <!-- lead --> 1 ???\n# 2 ...";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    }));
    expect(plan.filter((item) => item.kind === "conceal").map((item) => source.slice(item.from, item.to)))
      .toEqual(["1 ", "2 "]);
    expect(plan.filter((item) => item.kind === "virtual").map((item) => item.label))
      .toEqual(["1", "2"]);
  });

  it("maps a virtual replacement through hidden inline comments inside the stored prefix", () => {
    const source = "# 1<!-- gap --> ???";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    }));
    const conceal = plan.find((item) => item.kind === "conceal");
    const virtual = plan.find((item) => item.kind === "virtual");

    expect(conceal).toBeDefined();
    expect(virtual).toBeDefined();
    expect(source.slice(conceal?.from, conceal?.to)).toBe("1<!-- gap --> ");
    expect(virtual?.from).toBe(conceal?.to);
    expect(virtual?.from).toBe(source.indexOf("???"));
  });

  it("fails closed for unsafe bare alphabetic schemes", () => {
    const unsafe = {
      id: "custom-letter",
      baseLevel: 1,
      templates: ["{1.letter_lower}", "", "", "", "", ""],
      exclusions: [],
    };
    expect(createDisplayPlan(parseAtxHeadings("# Plan"), options({
      numbering: { scheme: unsafe, missingLevelStrategy: "fill-one", starts: {} },
    }))).toEqual([]);
  });
});
