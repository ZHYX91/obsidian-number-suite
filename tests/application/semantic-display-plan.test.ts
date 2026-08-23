import { describe, expect, it } from "vitest";

import { createDisplayPlan } from "../../src/application/display-plan";
import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import type { CleanupTemplateSource, NumberingOptions } from "../../src/core/types";

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

function plan(source: string, showVirtualNumbers = true) {
  const headings = parseAtxHeadings(source);
  const headingDisplayPlan = createDisplayPlan(headings, {
    showVirtualNumbers,
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
    showCrossReferences: true,
    showNoteNumbers: true,
    numbering,
    templateSources,
    headingDisplayPlan,
    composing: false,
  });
}

describe("semantic display plan", () => {
  it("numbers ID-free captions and resolves existing caption block IDs", () => {
    const source = "Figure: Plain\nFigure: Target ^fig\nSee @[[#^fig|diagram]]";
    expect(plan(source).map(({ kind, line, label }) => ({ kind, line, label }))).toEqual([
      { kind: "caption", line: 0, label: "1" },
      { kind: "caption", line: 1, label: "2" },
      { kind: "reference", line: 2, label: "Figure 2" },
    ]);
  });

  it("resolves headings only when they have an effective visible number", () => {
    const source = "# Heading\nSee @[[#Heading]]";
    expect(plan(source, true).find((item) => item.kind === "reference")?.label).toBe("1");
    expect(plan(source, false).find((item) => item.kind === "reference")).toBeUndefined();
    expect(plan("# 7 Stored\nSee @[[#7 Stored]]", false)
      .find((item) => item.kind === "reference")?.label).toBe("7");
  });

  it("resolves a user-authored block ID attached to a numbered heading", () => {
    const source = "# Heading\n^heading-block\nSee @[[#^heading-block|section]]";
    expect(plan(source).find((item) => item.kind === "reference")).toMatchObject({
      line: 2,
      label: "1",
      target: "^heading-block",
    });
  });

  it("fails closed for missing, duplicate, and unnumbered targets", () => {
    const source = [
      "# Same",
      "# Same",
      "Figure: One ^duplicate",
      "Table: Two ^duplicate",
      "@[[#Same]] @[[#Missing]] @[[#^duplicate]]",
    ].join("\n");
    expect(plan(source).filter((item) => item.kind === "reference")).toEqual([]);
  });

  it("creates independent display-only footnote and endnote decorations", () => {
    const source = [
      "Foot[^a], end[^endnote:x], foot again[^a].",
      "",
      "[^a]: Footnote",
      "[^endnote:x]: Endnote",
    ].join("\n");
    expect(plan(source).filter((item) => item.kind.startsWith("note-")).map((item) => ({
      kind: item.kind,
      line: item.line,
      label: item.label,
      noteKind: item.noteKind,
    }))).toEqual([
      { kind: "note-reference", line: 0, label: "1", noteKind: "footnote" },
      { kind: "note-reference", line: 0, label: "1", noteKind: "endnote" },
      { kind: "note-reference", line: 0, label: "1", noteKind: "footnote" },
      { kind: "note-definition", line: 2, label: "1", noteKind: "footnote" },
      { kind: "note-definition", line: 3, label: "1", noteKind: "endnote" },
    ]);
  });

  it("never produces decorations while composing", () => {
    const source = "Figure: One\n@[[#^one]]";
    expect(createSemanticDisplayPlan(source, [], {
      showCaptionNumbers: true,
      showCrossReferences: true,
      showNoteNumbers: true,
      numbering,
      templateSources,
      headingDisplayPlan: [],
      composing: true,
    })).toEqual([]);
  });
});
