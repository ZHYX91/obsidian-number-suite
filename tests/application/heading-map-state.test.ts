import { describe, expect, it } from "vitest";

import { createHeadingMap } from "../../src/application/heading-map";
import { headingMapCollapsedForRange } from "../../src/application/heading-map-state";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

function roots() {
  return createHeadingMap("# A\n## B\n### C\n#### D", {
    headingDisplayPlan: [],
    numbering: {
      scheme: BUILT_IN_SCHEMES.hierarchical,
      missingLevelStrategy: "fill-one",
      starts: {},
    },
    cleanupScope: "templates",
    templateSources: [],
    concealStoredNumbers: false,
    recognizeStoredNumbers: false,
  });
}

describe("heading map expansion ranges", () => {
  it("collapses at the selected structural depth", () => {
    const tree = roots();
    const [a] = tree;
    const b = a?.children[0];
    const c = b?.children[0];
    expect([...headingMapCollapsedForRange(tree, 1)]).toEqual([a?.id]);
    expect([...headingMapCollapsedForRange(tree, 2)]).toEqual([b?.id]);
    expect([...headingMapCollapsedForRange(tree, 3)]).toEqual([c?.id]);
    expect(headingMapCollapsedForRange(tree, "all").size).toBe(0);
  });
});
