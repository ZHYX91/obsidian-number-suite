import { parser } from "@lezer/markdown";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { exportSemanticSnapshotV2, NUMBER_SUITE_INTEROP_SCHEMA_V2 } from "../../src/integration/semantic-export";

const settings = { ...DEFAULT_SETTINGS, selectedSchemeId: "hierarchical", showVirtualNumbers: true };

function snapshot(source: string) {
  return exportSemanticSnapshotV2(settings, { schema: NUMBER_SUITE_INTEROP_SCHEMA_V2, authoredMarkdown: source, frontmatter: null });
}

function indexedSource(count: number): string {
  return Array.from({ length: count }, (_, index) => [
    `# Heading ${index} ^Heading-${index}`,
    `Figure: Caption ${index}`,
    `^Figure-${index}`,
    `@[[#^Heading-${index}]] @[[#^Figure-${index}]]`,
    "",
  ].join("\r\n")).join("\r\n");
}

describe("semantic export per-snapshot target indexes", () => {
  it("keeps real Markdown parse passes bounded as heading/caption targets grow", () => {
    const parse = vi.spyOn(parser, "parse");
    try {
      const small = snapshot(indexedSource(8));
      const smallPasses = parse.mock.calls.length;
      expect(small.headingTargets).toHaveLength(8);
      expect(small.references).toHaveLength(16);
      parse.mockClear();
      const large = snapshot(indexedSource(400));
      expect(parse.mock.calls.length).toBe(smallPasses);
      expect(smallPasses).toBeGreaterThan(0);
      expect(large.headingTargets).toHaveLength(400);
      expect(large.captionTargets).toHaveLength(400);
      expect(large.references).toHaveLength(800);
      expect(large.headingTargets.map(({ targetId }) => targetId)).toEqual(Array.from({ length: 400 }, (_, index) => `Heading-${index}`));
      expect(large.captionTargets.map(({ targetId }) => targetId)).toEqual(Array.from({ length: 400 }, (_, index) => `Figure-${index}`));
      expect(large.headingTargets[large.headingTargets.length - 1]?.derivedNumber).toBe("400");
      expect(large.captionTargets[large.captionTargets.length - 1]?.derivedNumber).toBe("400");
      const source = indexedSource(400);
      expect(large.references.every((reference) => source.slice(reference.sourceStartUtf16, reference.sourceEndUtf16).startsWith("@[[#^"))).toBe(true);
    } finally { parse.mockRestore(); }
  });

  it("retains duplicate-ID ambiguity and rejects multiple IDs for one target line", () => {
    const source = [
      "# First ^Duplicate", "", "# Second ^duplicate", "",
      "# Several ^first-id", "^second-id", "",
      "# Unique ^Original-Case", "",
      "Figure: Unique caption", "^Caption-Case", "",
      "@[[#^duplicate]] @[[#^first-id]] @[[#^second-id]] @[[#^Original-Case]] @[[#^Caption-Case]]",
    ].join("\n");
    const exported = snapshot(source);
    expect(exported.headingTargets.map(({ targetId }) => targetId)).toEqual([null, null, null, "Original-Case"]);
    expect(exported.captionTargets[0]?.targetId).toBe("Caption-Case");
    expect(exported.references).toHaveLength(4);
    expect(exported.references.map((reference) => source.slice(reference.targetSourceStartUtf16, reference.targetSourceEndUtf16)))
      .toEqual(["# Several ^first-id", "# Several ^first-id", "# Unique ^Original-Case", "Figure: Unique caption"]);
  });
});
