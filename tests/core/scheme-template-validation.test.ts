import { describe, expect, it } from "vitest";

import { inspectSchemeTemplates } from "../../src/core/scheme-template-validation";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

describe("scheme template semantics", () => {
  it("accepts empty levels and current-level templates that reference parents", () => {
    expect(inspectSchemeTemplates([
      "{1.arabic}",
      "",
      "{1.arabic}.{2.arabic}.{3.arabic}",
      "   ",
      "",
      "",
    ])).toEqual([]);
  });

  it("requires every non-empty Hn template to contain its own counter", () => {
    expect(inspectSchemeTemplates([
      "{1.arabic}",
      "Part {1.arabic}",
      "",
      "",
      "",
      "",
    ])).toContainEqual({
      headingLevel: 2,
      code: "missing-current-level",
    });
  });

  it("rejects descendant counter references and invalid placeholders", () => {
    expect(inspectSchemeTemplates([
      "{1.arabic}.{2.arabic}",
      "{2.unknown}",
      "",
      "",
      "",
      "",
    ])).toEqual([
      {
        headingLevel: 1,
        code: "descendant-level-reference",
        referencedLevel: 2,
      },
      {
        headingLevel: 2,
        code: "invalid-placeholder",
      },
    ]);
  });

  it("keeps every built-in scheme inside the target semantic contract", () => {
    for (const scheme of Object.values(BUILT_IN_SCHEMES)) {
      expect(inspectSchemeTemplates(scheme.templates), scheme.id).toEqual([]);
    }
  });
});
