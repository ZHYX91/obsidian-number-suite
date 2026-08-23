import { describe, expect, it } from "vitest";

import { findMatchingBuiltInSchemeId } from "../../src/core/schemes";

describe("numbering schemes", () => {
  it("identifies a custom scheme that duplicates a built-in scheme", () => {
    expect(findMatchingBuiltInSchemeId({
      baseLevel: 1,
      templates: [
        "{1.arabic}",
        "{1.arabic}.{2.arabic}",
        "{1.arabic}.{2.arabic}.{3.arabic}",
        "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}",
        "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
        "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
      ],
    })).toBe("hierarchical");
  });

  it("does not treat a different base level or template as equivalent", () => {
    expect(findMatchingBuiltInSchemeId({
      baseLevel: 2,
      templates: ["{1.arabic}", "{1.arabic}.{2.arabic}"],
    })).toBeNull();
    expect(findMatchingBuiltInSchemeId({
      baseLevel: 1,
      templates: ["第{1.arabic}章"],
    })).toBeNull();
  });
});
