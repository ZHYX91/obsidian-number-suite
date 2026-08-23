import { describe, expect, it } from "vitest";

import { WORD_JOINER } from "../../src/core/markers";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import { planHeadingTransform, type TransformOptions } from "../../src/core/transform";

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

describe("heading transforms", () => {
  it("writes numbers without touching excluded regions", () => {
    const source = "---\ntitle: Test\n---\n# A\n```\n## Code\n```\n## B ##\n";
    const plan = planHeadingTransform(source, "write", options());
    expect(plan.result).toBe("---\ntitle: Test\n---\n# 1 A\n```\n## Code\n```\n## 1.1 B ##\n");
    expect(plan.changes).toHaveLength(2);
  });

  it("is idempotent with and without source markers", () => {
    for (const writeMarkers of [false, true]) {
      const first = planHeadingTransform("# A\n## B", "write", options({ writeMarkers }));
      const second = planHeadingTransform(first.result, "write", options({ writeMarkers }));
      expect(second.result).toBe(first.result);
      expect(second.changes).toEqual([]);
    }
  });

  it("skips manual prefixes on write and only normalizes high confidence on renumber", () => {
    const source = "# 9.2 Existing\n# 3.14 Pi\n# Plain";
    const write = planHeadingTransform(source, "write", options());
    expect(write.result).toBe("# 9.2 Existing\n# 3.14 Pi\n# 3 Plain");
    expect(write.warnings).toHaveLength(2);
    const renumber = planHeadingTransform(source, "renumber", options());
    expect(renumber.result).toBe("# 1 Existing\n# 3.14 Pi\n# 3 Plain");
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

  it("removes exact plugin numbers and can strip markers without deleting numbers", () => {
    const source = `# ${WORD_JOINER}1${WORD_JOINER} Heading`;
    expect(planHeadingTransform(source, "remove", options({ cleanupScope: "plugin" })).result)
      .toBe("# Heading");
    expect(planHeadingTransform(source, "strip-markers", options()).result)
      .toBe("# 1 Heading");
  });

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
