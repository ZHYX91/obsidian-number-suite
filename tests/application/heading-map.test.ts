import { describe, expect, it } from "vitest";

import { createDisplayPlan } from "../../src/application/display-plan";
import { createHeadingMap, createHeadingMapDocument, headingMapOverview } from "../../src/application/heading-map";
import { layoutHeadingMap } from "../../src/application/heading-map-layout";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import type { CleanupTemplateSource, NumberingOptions } from "../../src/core/types";

const numbering: NumberingOptions = {
  scheme: BUILT_IN_SCHEMES.hierarchical,
  missingLevelStrategy: "fill-one",
  starts: {},
};

const templates: readonly CleanupTemplateSource[] = [{
  schemeId: "hierarchical",
  schemeName: "Hierarchical",
  revision: 1,
  templates: BUILT_IN_SCHEMES.hierarchical.templates,
}];

function mapFor(
  source: string,
  showVirtualNumbers = true,
  concealStoredNumbers = false,
  recognizeStoredNumbers = true,
) {
  const plan = createDisplayPlan(parseAtxHeadings(source), {
    showVirtualNumbers,
    concealStoredNumbers,
    numbering,
    cleanupScope: "templates",
    templateSources: templates,
    revealOnActiveLine: false,
    selections: [],
    composing: false,
  });
  return createHeadingMap(source, {
    headingDisplayPlan: plan,
    numbering,
    cleanupScope: "templates",
    templateSources: templates,
    concealStoredNumbers,
    recognizeStoredNumbers,
  });
}

describe("heading mind map", () => {
  it("connects every parentless heading to the document without merging its namesake H1", () => {
    const roots = mapFor("## Before\n#### Child\n# Note\n## Section\n# Last");
    const document = createHeadingMapDocument("Note", roots);
    expect(document).toMatchObject({ title: "Note", level: 0, numberLabel: null, line: 0 });
    expect(document.children.map((node) => node.title)).toEqual(["Before", "Note", "Last"]);
    expect(layoutHeadingMap([document], new Set()).edges).toHaveLength(5);
  });

  it("keeps the document root for an empty note", () => {
    const document = createHeadingMapDocument("Empty", mapFor(""));
    const layout = layoutHeadingMap([document], new Set());
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]?.node.children).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  it("limits the initial overview by structural depth instead of heading level", () => {
    const roots = mapFor("## Start\n#### Jump\n###### Deep\n#### Sibling\n# Last");
    const collapsed = headingMapOverview(roots);
    const layout = layoutHeadingMap([createHeadingMapDocument("Note", roots)], collapsed);
    expect(layout.nodes.map(({ node }) => node.title)).toEqual(["Note", "Start", "Jump", "Sibling", "Last"]);
    expect(collapsed.has(roots[0]!.children[0]!.id)).toBe(true);
  });

  it("builds a heading-only hierarchy and treats skipped levels as direct children", () => {
    const roots = mapFor([
      "# Root",
      "### Jump",
      "#### Deep",
      "## Sibling",
      "# Other",
    ].join("\n"));

    expect(roots).toHaveLength(2);
    expect(roots[0]).toMatchObject({ title: "Root", numberLabel: "1", level: 1 });
    expect(roots[0]?.children).toHaveLength(2);
    expect(roots[0]?.children[0]).toMatchObject({ title: "Jump", level: 3 });
    expect(roots[0]?.children[0]?.children[0]).toMatchObject({ title: "Deep", level: 4 });
    expect(roots[0]?.children[1]).toMatchObject({ title: "Sibling", level: 2 });
    expect(roots[1]).toMatchObject({ title: "Other", numberLabel: "2" });
  });

  it("moves a reliably recognized visible stored number into the left handle", () => {
    const roots = mapFor("# 7 Stored\n## 7.2 Child", false, false);

    expect(roots[0]).toMatchObject({ title: "Stored", numberLabel: "7" });
    expect(roots[0]?.children[0]).toMatchObject({ title: "Child", numberLabel: "7.2" });
  });

  it("uses the virtual replacement label when a stored prefix is concealed", () => {
    const roots = mapFor("# 7 Stored", true, true);

    expect(roots[0]).toMatchObject({ title: "Stored", numberLabel: "1" });
  });

  it("does not interpret stored numbering when the note has opted out", () => {
    const roots = mapFor("# 7 Stored", false, false, false);

    expect(roots[0]).toMatchObject({ title: "7 Stored", numberLabel: null });
  });

  it("lays out only visible descendants when a branch is collapsed", () => {
    const roots = mapFor("# Root\n## A\n### A1\n## B");
    const root = roots[0];
    expect(root).toBeDefined();
    if (root == null) return;

    const expanded = layoutHeadingMap(roots, new Set());
    expect(expanded.nodes).toHaveLength(4);
    const collapsed = layoutHeadingMap(roots, new Set([root.id]));
    expect(collapsed.nodes).toHaveLength(1);
    expect(collapsed.edges).toHaveLength(0);
  });
});
