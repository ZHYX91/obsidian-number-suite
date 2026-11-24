import { describe, expect, it } from "vitest";

import { WORD_JOINER } from "../../src/core/markers";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import type { NumberingScheme } from "../../src/core/types";
import { applyTextChanges, planHeadingTransform, type TransformOptions } from "../../src/core/transform";

function options(overrides: Partial<TransformOptions> = {}): TransformOptions {
  return {
    numbering: {
      scheme: BUILT_IN_SCHEMES.hierarchical,
      missingLevelStrategy: "fill-one",
      starts: {},
    },
    writeMarkers: false,
    cleanupScope: "templates",
    templateSources: [{
      schemeId: "hierarchical",
      schemeName: "Hierarchical",
      revision: 1,
      templates: BUILT_IN_SCHEMES.hierarchical.templates,
    }],
    removeMultiplePrefixes: true,
    normalizeManualOnRenumber: true,
    ...overrides,
  };
}

function withScheme(scheme: NumberingScheme, overrides: Partial<TransformOptions> = {}): TransformOptions {
  return options({
    numbering: { ...options().numbering, scheme },
    templateSources: [{ schemeId: scheme.id, schemeName: scheme.id, revision: 1, templates: scheme.templates }],
    ...overrides,
  });
}

describe("heading transforms", () => {
  it("assembles unsorted edits with stable same-position behavior and checks original ranges", () => {
    expect(applyTextChanges("abcdef", [
      { from: 2, to: 3, insert: "X" }, { from: 2, to: 2, insert: "Y" },
      { from: 6, to: 6, insert: "!" }, { from: 0, to: 1, insert: "" },
    ])).toBe("bYXdef!");
    expect(applyTextChanges("abc", [{ from: 1, to: 1, insert: "x" }, { from: 1, to: 1, insert: "y" }])).toBe("ayxbc");
    expect(() => applyTextChanges("abc", [{ from: 1, to: 3, insert: "" }, { from: 2, to: 2, insert: "x" }]))
      .toThrow("overlap");
    expect(() => applyTextChanges("abc", [{ from: 2, to: 4, insert: "" }])).toThrow("Invalid heading change range");
  });

  it("preserves an incomplete marked prefix chain through all source operations", () => {
    const m = WORD_JOINER;
    for (const text of [`${m}1${m}\u3000${m}dangling`, `${m}1${m}${m}${m} Title`, `${m}${m} Title`]) {
      const source = `# ${text}`;
      for (const operation of ["write", "renumber", "remove", "strip-markers"] as const) {
        expect(planHeadingTransform(source, operation, options()).changes).toEqual([]);
      }
    }
    for (const prefix of [`${m}1${m}`, `${m}1${m}\u3000${m}2${m}`]) {
      expect(planHeadingTransform(`# ${prefix} Title${m}`, "remove", options()).result).toBe(`# Title${m}`);
    }
  });

  it("ends a subtree exclusion at an empty sibling without stripping its descendants' numbers", () => {
    const numbering = options().numbering;
    const opts = options({ writeMarkers: true, numbering: { ...numbering, scheme: {
      ...numbering.scheme, exclusions: [{ title: "References", scope: "subtree" }],
    } } });
    const marker = WORD_JOINER;
    const source = `# References ^refs\n## Excluded\n#\n## ${marker}1.1${marker} Next section\n# Body`;
    const plan = planHeadingTransform(source, "write", opts);
    expect(plan.result).toBe(source.replace("# Body", `# ${marker}2${marker} Body`));
    expect(plan.changes.map((change) => change.line)).toEqual([4]);
  });

  it.each(["roman_upper", "roman_lower"])("refuses the entire write/renumber plan when %s crosses 3999", (format) => {
    const templates = [...BUILT_IN_SCHEMES.hierarchical.templates];
    templates[0] = `{1.${format}}.`;
    const opts = options({
      numbering: { ...options().numbering, scheme: { ...BUILT_IN_SCHEMES.hierarchical, templates }, starts: { 1: 3999 } },
      templateSources: [{ schemeId: "roman", schemeName: "Roman", revision: 1, templates }],
    });
    for (const operation of ["write", "renumber"] as const) {
      const source = "# First\n# Beyond Roman range";
      const plan = planHeadingTransform(source, operation, opts);
      expect(plan.result).toBe(source);
      expect(plan.changes).toEqual([]);
      expect(plan.warnings).toMatchObject([{ line: 1, code: "roman-range" }]);
    }
    const valid = planHeadingTransform("# First", "write", opts);
    expect(valid.warnings).toEqual([]);
    expect(planHeadingTransform(valid.result, "remove", opts).result).toBe("# First");
    const highStart = { ...opts, numbering: { ...opts.numbering, starts: { 1: 4000 } } };
    expect(planHeadingTransform("# First", "write", highStart).warnings).toMatchObject([{ code: "roman-range" }]);
    expect(planHeadingTransform(valid.result, "remove", highStart).result).toBe("# First");
    expect(planHeadingTransform("# 4000. An unrelated manual heading", "remove", highStart).result)
      .toBe("# 4000. An unrelated manual heading");
  });

  it.each(["write", "renumber"] as const)("refuses all %s changes when a counter overflows", (operation) => {
    const source = "# First\n# Overflow\n## Child";
    const plan = planHeadingTransform(source, operation, options({
      numbering: {
        ...options().numbering,
        starts: { 1: Number.MAX_SAFE_INTEGER },
      },
    }));
    expect(plan.changes).toEqual([]);
    expect(plan.result).toBe(source);
    expect(plan.warnings.map((warning) => ({ line: warning.line, code: warning.code }))).toEqual([
      { line: 1, code: "counter-overflow" },
      { line: 2, code: "counter-overflow" },
    ]);
  });

  it.each(["remove", "strip-markers"] as const)("keeps %s available when generating a number would overflow", (operation) => {
    const source = `# ${WORD_JOINER}1${WORD_JOINER} First\n# ${WORD_JOINER}2${WORD_JOINER} Second`;
    const plan = planHeadingTransform(source, operation, options({
      cleanupScope: "plugin",
      numbering: { ...options().numbering, starts: { 1: Number.MAX_SAFE_INTEGER } },
    }));
    expect(plan.changes).toHaveLength(2);
    expect(plan.result).toBe(operation === "remove" ? "# First\n# Second" : "# 1 First\n# 2 Second");
    expect(plan.warnings).toEqual([]);
  });

  it("writes numbers without touching excluded regions", () => {
    const source = "---\ntitle: Test\n---\n# A\n```\n## Code\n```\n## B ##\n";
    const plan = planHeadingTransform(source, "write", options());
    expect(plan.result).toBe("---\ntitle: Test\n---\n# 1 A\n```\n## Code\n```\n## 1.1 B ##\n");
    expect(plan.changes).toHaveLength(2);
  });

  it.each(["\u00a0", "\u3000", " \u3000\t\u00a0"])("handles a DocWen marked separator %j", (separator) => {
    const source = `# ${WORD_JOINER}第一章${WORD_JOINER}${separator}Title`;
    const opts = options({ cleanupScope: "plugin" });
    expect(planHeadingTransform(source, "remove", opts).result).toBe("# Title");
    expect(planHeadingTransform(source, "renumber", opts).result).toBe("# 1 Title");
    expect(planHeadingTransform(source, "strip-markers", opts).result).toBe(`# 第一章${separator}Title`);
  });

  it("is idempotent with and without source markers", () => {
    for (const writeMarkers of [false, true]) {
      const first = planHeadingTransform("# A\n## B", "write", options({ writeMarkers }));
      const second = planHeadingTransform(first.result, "write", options({ writeMarkers }));
      expect(second.result).toBe(first.result);
      expect(second.changes).toEqual([]);
    }
  });

  it.each([false, true])("writes compact official H1–H4 and spaced H5 with markers=%s", (writeMarkers) => {
    const opts = withScheme(BUILT_IN_SCHEMES["chinese-official"], { writeMarkers });
    const source = "# 总体要求\r\n## 指导思想\r\n### 工作目标\r\n#### 具体措施\r\n##### 扩展";
    const written = planHeadingTransform(source, "write", opts);
    const marker = writeMarkers ? WORD_JOINER : "";
    expect(written.result).toBe([
      `# ${marker}一、${marker}总体要求`,
      `## ${marker}（一）${marker}指导思想`,
      `### ${marker}1.${marker}工作目标`,
      `#### ${marker}（1）${marker}具体措施`,
      `##### ${marker}①${marker} 扩展`,
    ].join("\r\n"));
    for (const operation of ["write", "renumber"] as const) {
      const repeated = planHeadingTransform(written.result, operation, opts);
      expect(repeated.changes).toEqual([]);
      expect(repeated.warnings).toEqual([]);
    }
    expect(planHeadingTransform(written.result, "remove", opts).result).toBe(source);
  });

  it("reads old spaced official headings and only normalizes them on an explicit renumber", () => {
    const opts = withScheme(BUILT_IN_SCHEMES["chinese-official"]);
    const legacy = "# 一、 总体要求\n## （一）  指导思想";
    expect(planHeadingTransform(legacy, "write", opts).result).toBe(legacy);
    const normalized = planHeadingTransform(legacy, "renumber", opts);
    expect(normalized.result).toBe("# 一、总体要求\n## （一）指导思想");
    expect(planHeadingTransform(normalized.result, "renumber", opts).changes).toEqual([]);
  });

  it.each([" ", "  ", "　", " \t　"])("writes exactly the explicit custom separator %j outside source markers", (separator) => {
    const scheme = { ...BUILT_IN_SCHEMES["chinese-official"], id: "custom-spaced", templates: ["{1.chinese_lower}、" + separator] };
    for (const writeMarkers of [false, true]) {
      const opts = withScheme(scheme, { writeMarkers });
      const written = planHeadingTransform("# 你好", "write", opts);
      const marker = writeMarkers ? WORD_JOINER : "";
      expect(written.result).toBe(`# ${marker}一、${marker}${separator}你好`);
      expect(planHeadingTransform(written.result, "write", opts).warnings).toEqual([]);
      expect(planHeadingTransform(written.result, "renumber", opts).changes).toEqual([]);
      expect(planHeadingTransform(written.result, "remove", opts).result).toBe("# 你好");
      if (writeMarkers) {
        const legacy = `# ${marker}一、${separator}${marker} 你好`;
        expect(planHeadingTransform(legacy, "renumber", opts).result).toBe(written.result);
        expect(planHeadingTransform(legacy, "strip-markers", opts).result).toBe(`# 一、${separator} 你好`);
      }
    }
    const strict = withScheme(scheme);
    expect(planHeadingTransform("# 一、二、三", "remove", strict).changes).toEqual([]);
  });

  it("separates a compact dot from a digit-leading title through write, strip, and cleanup", () => {
    const opts = withScheme(BUILT_IN_SCHEMES["chinese-official"]);
    const source = "### 2项措施";
    const expected = "### 1. 2项措施";
    for (const operation of ["write", "renumber"] as const) {
      const plan = planHeadingTransform(source, operation, opts);
      expect(plan.result).toBe(expected);
      expect(planHeadingTransform(plan.result, operation, opts).changes).toEqual([]);
      const markedOpts = { ...opts, writeMarkers: true };
      const marked = planHeadingTransform(source, operation, markedOpts);
      expect(marked.result).toBe(`### ${WORD_JOINER}1.${WORD_JOINER} 2项措施`);
      expect(planHeadingTransform(marked.result, "strip-markers", opts).result).toBe(expected);
      expect(planHeadingTransform(expected, "remove", opts).result).toBe(source);
    }
    const oldCompact = `### ${WORD_JOINER}1.${WORD_JOINER}2项措施`;
    expect(planHeadingTransform(oldCompact, "strip-markers", opts).result).toBe("### 1.2项措施");
  });

  it.each([
    ["chinese_lower", "一 你好"],
    ["arabic", "1 你好"],
    ["circled", "①你好"],
  ])("uses the boundary of the %s counter when current-only drops the final punctuation", (format, expected) => {
    const scheme = { ...BUILT_IN_SCHEMES.hierarchical, templates: ["", `{1.arabic}.{2.${format}}、`] };
    const opts = withScheme(scheme, { numbering: { scheme, missingLevelStrategy: "current-only", starts: {} } });
    const written = planHeadingTransform("## 你好", "write", opts);
    expect(written.result).toBe("## " + expected);
    expect(planHeadingTransform(written.result, "write", opts).changes).toEqual([]);
  });

  it("uses skip-first and first-number together for stored writes", () => {
    const source = "# Preface\n# Chapter\n## Lead\n## Topic";
    const plan = planHeadingTransform(source, "write", options({
      numbering: {
        scheme: BUILT_IN_SCHEMES.hierarchical,
        missingLevelStrategy: "fill-one",
        starts: { 1: 3, 2: 2 },
        skipFirst: { 1: 1, 2: 1 },
      },
    }));
    expect(plan.result).toBe("# Preface\n# 3 Chapter\n## Lead\n## 3.2 Topic");
  });

  it.each(["write", "renumber"] as const)("previews removal of previously marked numbers in a newly skipped section on %s", (operation) => {
    const source = "# Chapter\n## Introduction\n### Context\n## Methods\n### Design";
    const opts = options({ writeMarkers: true, cleanupScope: "plugin" });
    const marked = planHeadingTransform(source, "write", opts).result;
    const skipped = { ...opts, numbering: { ...opts.numbering, skipPerParent: { 2: 1 } } };
    const preview = planHeadingTransform(marked, operation, skipped);
    expect(preview.source).toBe(marked);
    expect(preview.result).toBe(planHeadingTransform(source, "write", skipped).result);
    expect(preview.changes.filter((change) => change.ruleId === "remove-skipped-number").map((change) => change.line)).toEqual([1, 2]);
    expect(planHeadingTransform(preview.result, operation, skipped).changes).toEqual([]);
  });

  it.each(["write", "renumber"] as const)("preserves unmarked, ambiguous and malformed prefixes inside skipped sections on %s", (operation) => {
    const lines = [
      "## 8.1 Authored", `### ${WORD_JOINER}2.1${WORD_JOINER} 3.7 Multiple`, `### ${WORD_JOINER}2.2 Malformed`,
    ];
    const opts = options({ cleanupScope: "common", numbering: { ...options().numbering, skipFirst: { 2: 1 } } });
    expect(planHeadingTransform(lines.join("\n"), operation, opts).result).toBe(lines.join("\n"));
  });

  it("skips manual prefixes on write and only normalizes high confidence on renumber", () => {
    const source = "# 9.2 Existing\n# 3.14 Pi\n# Plain";
    const write = planHeadingTransform(source, "write", options());
    expect(write.result).toBe("# 9.2 Existing\n# 3.14 Pi\n# 3 Plain");
    expect(write.warnings).toHaveLength(2);
    const renumber = planHeadingTransform(source, "renumber", options({ cleanupScope: "common" }));
    expect(renumber.result).toBe("# 1 Existing\n# 3.14 Pi\n# 3 Plain");
    expect(planHeadingTransform(source, "renumber", options({ cleanupScope: "plugin" })).result)
      .toBe("# 9.2 Existing\n# 3.14 Pi\n# 3 Plain");
  });

  it("removes high-confidence and chained prefixes but preserves risky text", () => {
    const source = [
      "# 1.1 Heading",
      "# 一、1. Chained",
      "# 3.14 Pi",
      "# 2026. Annual",
      "# 1. Medium",
    ].join("\n");
    const plan = planHeadingTransform(source, "remove", options({ cleanupScope: "common" }));
    expect(plan.result).toBe([
      "# Heading",
      "# Chained",
      "# 3.14 Pi",
      "# 2026. Annual",
      "# 1. Medium",
    ].join("\n"));
    expect(plan.changes).toHaveLength(2);
  });

  it.each(["remove", "renumber"] as const)(
    "preserves bare years, quantities, measurements, and versions during %s",
    (operation) => {
      const source = [
        "# 2026 Annual",
        "# 6 种常见方法",
        "# 6 kg load",
        "## 3.14 Version notes",
      ].join("\n");
      const plan = planHeadingTransform(source, operation, options());
      expect(plan.result).toBe(source);
      expect(plan.changes).toEqual([]);
      expect(plan.warnings).toHaveLength(4);
    },
  );

  it("removes exact plugin numbers and can strip markers without deleting numbers", () => {
    const source = `# ${WORD_JOINER}1${WORD_JOINER} Heading`;
    expect(planHeadingTransform(source, "remove", options({ cleanupScope: "plugin" })).result)
      .toBe("# Heading");
    expect(planHeadingTransform(source, "strip-markers", options()).result)
      .toBe("# 1 Heading");
  });

  it.each(["remove", "strip-markers"] as const)(
    "preserves ambiguous and unowned prefixes with missing parents during %s",
    (operation) => {
      const configured = options({
        numbering: {
          scheme: BUILT_IN_SCHEMES.hierarchical,
          missingLevelStrategy: "skip",
          starts: {},
        },
        cleanupScope: "plugin",
      });
      const source = [
        "## 3.14 Pi",
        "## 2026 Annual",
        "## 6 kg load",
        "## 1.1 Manual",
        `## ${WORD_JOINER}2 One-sided marker`,
      ].join("\n");
      const plan = planHeadingTransform(source, operation, configured);
      expect(plan.result).toBe(source);
      expect(plan.changes).toEqual([]);
    },
  );

  it.each(["remove", "strip-markers"] as const)(
    "cleans confirmed plugin prefixes even when missing parents skip new numbering during %s",
    (operation) => {
      const configured = options({
        numbering: {
          scheme: BUILT_IN_SCHEMES.hierarchical,
          missingLevelStrategy: "skip",
          starts: {},
        },
        cleanupScope: "plugin",
      });
      const source = `## ${WORD_JOINER}2${WORD_JOINER} Title\r\n`;
      const plan = planHeadingTransform(source, operation, configured);
      expect(plan.result).toBe(operation === "remove" ? "## Title\r\n" : "## 2 Title\r\n");
      expect(plan.changes).toHaveLength(1);
      expect(plan.warnings).toEqual([]);
    },
  );

  it.each(["write", "renumber"] as const)(
    "still skips new numbering when a required parent is missing during %s",
    (operation) => {
      const source = `## ${WORD_JOINER}2${WORD_JOINER} Title`;
      const plan = planHeadingTransform(source, operation, options({
        numbering: {
          scheme: BUILT_IN_SCHEMES.hierarchical,
          missingLevelStrategy: "skip",
          starts: {},
        },
      }));
      expect(plan.result).toBe(source);
      expect(plan.changes).toEqual([]);
      expect(plan.warnings.map((warning) => warning.code)).toEqual(["missing-parent"]);
    },
  );

  it("can remove its expected unmarked single-level numbers after preview", () => {
    const source = "# 1 First\n# 2 Second";
    const plan = planHeadingTransform(source, "remove", options());
    expect(plan.result).toBe("# First\n# Second");
    expect(plan.changes.map((change) => change.ruleId)).toEqual([
      "template:hierarchical@1",
      "template:hierarchical@1",
    ]);
  });

  it("preserves CRLF, wiki links, formatting, and unrelated bytes", () => {
    const source = "# [[Note|Title]]\r\n## **Bold** and `code`\r\n";
    const result = planHeadingTransform(source, "write", options()).result;
    expect(result).toBe("# 1 [[Note|Title]]\r\n## 1.1 **Bold** and `code`\r\n");
  });

  it("round-trips plugin-marked writes through exact cleanup", () => {
    const source = "# Alpha\n## 中文标题\n### [[Target|Alias]] **Bold**\n";
    const marked = planHeadingTransform(source, "write", options({ writeMarkers: true }));
    const cleaned = planHeadingTransform(
      marked.result,
      "remove",
      options({ writeMarkers: true, cleanupScope: "plugin" }),
    );
    expect(cleaned.result).toBe(source);
  });

  it("round-trips stored numbering for H7-H9 extension headings", () => {
    const source = "####### Seven\n######## Eight\n######### Nine\n";
    const written = planHeadingTransform(source, "write", options({ writeMarkers: true }));
    expect(written.changes).toHaveLength(3);
    expect(written.result).toContain("1.1.1.1.1.1.1");
    expect(written.result).toContain("1.1.1.1.1.1.1.1.1");
    const cleaned = planHeadingTransform(
      written.result,
      "remove",
      options({ writeMarkers: true, cleanupScope: "plugin" }),
    );
    expect(cleaned.result).toBe(source);
  });

  it.each([false, true])(
    "round-trips punctuation-only titles with writeMarkers=%s",
    (writeMarkers) => {
      const source = ["# ???", "# ...", "# ---", "# ()"].join("\n");
      const written = planHeadingTransform(source, "write", options({ writeMarkers }));
      expect(written.changes).toHaveLength(4);
      const cleaned = planHeadingTransform(
        written.result,
        "remove",
        options({ writeMarkers, cleanupScope: writeMarkers ? "plugin" : "templates" }),
      );
      expect(cleaned.result).toBe(source);
    },
  );

  it("preserves closed comment bytes inside a removable visible prefix", () => {
    const source = "# 1<!-- gap --> ???";
    const plan = planHeadingTransform(source, "remove", options());
    expect(plan.result).toBe("# <!-- gap -->???");
    expect(plan.result).toContain("<!-- gap -->");
  });

  it("leaves empty and comment-only headings unnumbered without consuming counters", () => {
    const source = "# #\n# ###\n## ##\n# <!-- only -->\n# # title\n# Actual";
    expect(planHeadingTransform(source, "write", options()).result).toBe(
      "# #\n# ###\n## ##\n# <!-- only -->\n# 1 # title\n# 2 Actual",
    );
  });

  it.each([false, true])(
    "preserves inline HTML comment bytes across write and cleanup with writeMarkers=%s",
    (writeMarkers) => {
      const source = [
        "# <!-- lead --> Title",
        "# Ti<!-- middle -->tle",
        "# Tail <!-- tail -->",
      ].join("\n");
      const written = planHeadingTransform(source, "write", options({ writeMarkers }));
      expect(written.result).toContain("<!-- lead -->");
      expect(written.result).toContain("<!-- middle -->");
      expect(written.result).toContain("<!-- tail -->");
      expect(planHeadingTransform(
        written.result,
        "remove",
        options({ writeMarkers, cleanupScope: writeMarkers ? "plugin" : "templates" }),
      ).result).toBe(source);
    },
  );

  it("fails closed for bare alphabetic templates across cleanup and repeated current-only writes", () => {
    const bareLetter = {
      id: "custom-letter",
      baseLevel: 1,
      templates: ["{1.letter_lower}", "{1.arabic}.{2.letter_lower}", "", "", "", ""],
      exclusions: [],
    };
    const configured = options({
      numbering: { scheme: bareLetter, missingLevelStrategy: "current-only", starts: {} },
      templateSources: [{
        schemeId: "custom-letter",
        schemeName: "Letter",
        revision: 1,
        templates: bareLetter.templates,
      }],
    });
    expect(planHeadingTransform("# a plan", "remove", configured).result).toBe("# a plan");
    const first = planHeadingTransform("## Plan", "write", configured);
    const second = planHeadingTransform(first.result, "write", configured);
    expect(first.result).toBe("## Plan");
    expect(second.result).toBe("## Plan");

    const romanScheme = {
      ...bareLetter,
      id: "custom-roman",
      templates: ["{1.roman_lower}", "{1.arabic}.{2.roman_lower}", "", "", "", ""],
    };
    expect(planHeadingTransform("## Think", "write", options({
      numbering: { scheme: romanScheme, missingLevelStrategy: "current-only", starts: {} },
      templateSources: [],
    })).result).toBe("## Think");
  });

  it("round-trips explicitly delimited alphabetic templates", () => {
    const scheme = {
      id: "custom-letter-safe",
      baseLevel: 1,
      templates: ["{1.letter_lower}.", "", "", "", "", ""],
      exclusions: [],
    };
    const configured = options({
      numbering: { scheme, missingLevelStrategy: "current-only", starts: {} },
      templateSources: [{
        schemeId: scheme.id,
        schemeName: "Safe letters",
        revision: 1,
        templates: scheme.templates,
      }],
    });
    const written = planHeadingTransform("# Plan", "write", configured);
    expect(written.result).toBe("# a. Plan");
    expect(planHeadingTransform(written.result, "remove", configured).result).toBe("# Plan");
  });

  it("preserves date and version shaped H3 prefixes from active and historical templates", () => {
    const templateSources = [1, 2].map((revision) => ({
      schemeId: "hierarchical",
      schemeName: "Hierarchical",
      revision,
      templates: ["{1.arabic}", "{1.arabic}.{2.arabic}", "{1.arabic}.{2.arabic}.{3.arabic}"],
    }));
    const source = "### 2026.8.24 Date\n### 1.2.3 Version notes";
    const plan = planHeadingTransform(source, "remove", options({ templateSources }));
    expect(plan.result).toBe(source);
    expect(plan.changes).toEqual([]);
    expect(plan.warnings).toHaveLength(2);
  });

  it("removes prefixes from active and historical templates without broad manual cleanup", () => {
    const templateSources = [
      { schemeId: "custom", schemeName: "Custom", revision: 2, templates: ["Part {1.arabic}"] },
      { schemeId: "custom", schemeName: "Custom", revision: 1, templates: ["Old {1.roman_upper}"] },
    ];
    const configured = options({ cleanupScope: "templates", templateSources });
    expect(planHeadingTransform("# Part 3 Current\n# Old IV Historical", "remove", configured).result)
      .toBe("# Current\n# Historical");
    expect(planHeadingTransform("# 1.1 Manual", "remove", configured).result).toBe("# 1.1 Manual");
  });

  it("removes confirmed old numbers from excluded titles while preserving manual ambiguity", () => {
    const configured = options();
    configured.numbering = {
      ...configured.numbering,
      scheme: {
        ...configured.numbering.scheme,
        exclusions: [{ title: "References", scope: "heading" }],
      },
    };
    const source = "# 1 First\n# 2 References\n# 3 Next\n# 2026. References";
    const plan = planHeadingTransform(source, "renumber", configured);
    expect(plan.result).toBe("# 1 First\n# References\n# 2 Next\n# 2026. References");
    expect(plan.changes.some((change) => change.ruleId === "remove-excluded-number")).toBe(true);
    expect(plan.warnings.some((warning) => warning.heading === "2026. References")).toBe(true);
  });

  it("never throws for deterministic arbitrary text", () => {
    let state = 0x5EED1234;
    const alphabet = "#`~<>!-_ .\n\r0123456789一二三ABC()（）①\u2060";
    for (let sample = 0; sample < 1_000; sample += 1) {
      let source = "";
      const length = state % 200;
      for (let index = 0; index < length; index += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        source += alphabet[Math.abs(state) % alphabet.length] ?? "";
      }
      expect(() => planHeadingTransform(source, "renumber", options())).not.toThrow();
    }
  });
});
