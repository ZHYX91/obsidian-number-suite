import { describe, expect, it } from "vitest";
import { createDisplayPlan } from "../../src/application/display-plan";
import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import type { NumberingOptions, CleanupTemplateSource } from "../../src/core/types";

const numbering: NumberingOptions = {
  scheme: BUILT_IN_SCHEMES.hierarchical,
  missingLevelStrategy: "fill-one",
  starts: {},
};
const templateSources: CleanupTemplateSource[] = [{
  schemeId: "hierarchical",
  schemeName: "Hierarchical",
  revision: 1,
  templates: BUILT_IN_SCHEMES.hierarchical.templates,
}];

function references(source: string, enabled: boolean, numbered = true) {
  const headings = parseAtxHeadings(source);
  const headingDisplayPlan = createDisplayPlan(headings, {
    showVirtualNumbers: numbered,
    concealStoredNumbers: false,
    numbering,
    cleanupScope: "templates",
    templateSources,
    revealOnActiveLine: false,
    selections: [],
    composing: false,
  });
  return createSemanticDisplayPlan(source, headings, {
    showCaptionNumbers: true,
    centeredCaptionKinds: [],
    showCrossReferences: false,
    enhanceNativeWikiHeadingLinks: enabled,
    showNoteNumbers: false,
    noteSelections: [],
    numbering,
    templateSources,
    headingDisplayPlan,
    composing: false,
  }).filter((item) => item.kind === "reference");
}

describe("optional same-note Wiki heading link enhancement", () => {
  it("stays off until explicitly enabled and retains authored aliases", () => {
    const source = "# Heading\nSee [[#Heading]] and [[#Heading|chapter]].";
    expect(references(source, false)).toEqual([]);
    const enabled = references(source, true);
    expect(enabled.map((item) => item.label)).toEqual(["1 Heading", "1 chapter"]);
    expect(enabled.map((item) => item.targetLine)).toEqual([0, 0]);
    expect(references(source, true, false)).toEqual([]);
  });

  it("leaves other-file, embedded, block, caption and ambiguous links native", () => {
    const source = [
      "# Same", "# Same", "Figure: Diagram",
      "See [[#Same]] [[Other#Same]] ![[#Same]] [[#Figure: Diagram]] [[#^block]]",
    ].join("\n");
    expect(references(source, true)).toEqual([]);
  });

  it("protects fenced and inline code as well as escaped Wiki lookalikes", () => {
    const source = "# Heading\n" + "\\[[#Heading]]" +
      " \`[[#Heading]]\`\n\`\`\`md\n[[#Heading]]\n\`\`\`";
    expect(references(source, true)).toEqual([]);
  });
});
