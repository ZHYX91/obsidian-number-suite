import { describe, expect, it } from "vitest";

import { createDisplayPlan } from "../../src/application/display-plan";
import { createDocumentOutline } from "../../src/application/document-outline";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

function headingPlan(source: string) {
  return createDisplayPlan(parseAtxHeadings(source), {
    showVirtualNumbers: true,
    concealStoredNumbers: false,
    numbering: {
      scheme: BUILT_IN_SCHEMES.hierarchical,
      missingLevelStrategy: "fill-one",
      starts: {},
    },
    cleanupScope: "templates",
    templateSources: [],
    revealOnActiveLine: false,
    selections: [],
    composing: false,
  });
}

describe("document outline", () => {
  it("nests H1-H9 headings and captions by source structure", () => {
    const source = [
      "Figure: Root figure ^root-figure",
      "# Chapter ^chapter",
      "####### Deep",
      "Table: Deep results ^results",
      "## Next",
      "Equation: Formula",
      "########## Plain text",
      "```",
      "######### Fenced",
      "Figure: Fenced",
      "```",
    ].join("\n");
    const outline = createDocumentOutline(source, {
      headingDisplayPlan: headingPlan(source),
      showCaptionNumbers: true,
    });

    expect(outline).toHaveLength(2);
    expect(outline[0]).toMatchObject({
      kind: "caption",
      line: 0,
      title: "Root figure",
      numberLabel: "Figure 1",
    });
    expect(outline[1]).toMatchObject({
      kind: "heading",
      level: 1,
      title: "Chapter",
      numberLabel: "1",
    });
    expect(outline[1]?.children[0]).toMatchObject({
      kind: "heading",
      level: 7,
      title: "Deep",
      numberLabel: "1.1.1.1.1.1.1",
    });
    expect(outline[1]?.children[0]?.children[0]).toMatchObject({
      kind: "caption",
      captionKind: "Table",
      title: "Deep results",
      numberLabel: "Table 1",
    });
    expect(outline[1]?.children[1]).toMatchObject({
      kind: "heading",
      level: 2,
      title: "Next",
      numberLabel: "1.2",
    });
    expect(outline[1]?.children[1]?.children[0]).toMatchObject({
      kind: "caption",
      captionKind: "Equation",
      numberLabel: "Equation 1",
    });
  });

  it("uses the display plan to conceal a stored prefix and can omit caption numbers", () => {
    const source = "# 9 Stored\nFigure: Diagram";
    const plan = createDisplayPlan(parseAtxHeadings(source), {
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      numbering: {
        scheme: BUILT_IN_SCHEMES.hierarchical,
        missingLevelStrategy: "fill-one",
        starts: {},
      },
      cleanupScope: "common",
      templateSources: [],
      revealOnActiveLine: false,
      selections: [],
      composing: false,
    });
    const outline = createDocumentOutline(source, {
      headingDisplayPlan: plan,
      showCaptionNumbers: false,
    });

    expect(outline[0]).toMatchObject({ title: "Stored", numberLabel: "1" });
    expect(outline[0]?.children[0]).toMatchObject({ title: "Diagram", numberLabel: "Figure" });
  });
});
