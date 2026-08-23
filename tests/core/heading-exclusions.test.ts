import { describe, expect, it } from "vitest";

import { matchHeadingExclusion, normalizeExclusionTitle } from "../../src/core/heading-exclusions";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { WORD_JOINER } from "../../src/core/markers";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

const scheme = {
  ...BUILT_IN_SCHEMES.hierarchical,
  exclusions: [{ title: "参考文献", scope: "subtree" as const }],
};

describe("heading exclusions", () => {
  it("normalizes only surrounding and repeated horizontal whitespace", () => {
    expect(normalizeExclusionTitle("  参考\t 文献  ")).toBe("参考 文献");
    expect(normalizeExclusionTitle("Ｒｅｆｅｒｅｎｃｅｓ")).toBe("Ｒｅｆｅｒｅｎｃｅｓ");
  });

  it("matches exact source titles and safely recognized numbered titles", () => {
    for (const source of [
      "# 参考文献",
      "# 2 参考文献",
      `# ${WORD_JOINER}2${WORD_JOINER} 参考文献`,
    ]) {
      expect(matchHeadingExclusion(parseAtxHeadings(source)[0]!, scheme)?.scope).toBe("subtree");
    }
  });

  it("does not use partial or case-insensitive matching", () => {
    expect(matchHeadingExclusion(parseAtxHeadings("# 参考文献综述")[0]!, scheme)).toBeNull();
    expect(matchHeadingExclusion(parseAtxHeadings("# references")[0]!, {
      ...scheme,
      exclusions: [{ title: "References", scope: "heading" }],
    })).toBeNull();
    expect(matchHeadingExclusion(parseAtxHeadings("# 2026. 参考文献")[0]!, scheme)).toBeNull();
  });
});
