import { describe, expect, it } from "vitest";

import { createDisplayPlan } from "../../src/application/display-plan";
import {
  createSemanticDisplayPlan,
  imageTooltipContentAtOffset,
} from "../../src/application/semantic-display-plan";
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
    centeredCaptionKinds: [],
    showCrossReferences: true,
    showNoteNumbers: true,
    noteSelections: [],
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
      { kind: "reference", line: 2, label: "Figure 2: diagram" },
    ]);
  });

  it("renders heading references as pills whether or not the target has a number", () => {
    const source = "# Heading\nSee @[[#Heading]]";
    expect(plan(source, true).find((item) => item.kind === "reference")?.label).toBe("1 Heading");
    expect(plan(source, false).find((item) => item.kind === "reference")?.label).toBe("Heading");
    expect(plan("# 7 Stored\nSee @[[#7 Stored]]", false)
      .find((item) => item.kind === "reference")?.label).toBe("7 Stored");
  });

  it("resolves a user-authored block ID attached to a numbered heading", () => {
    const source = "# Heading\n^heading-block\nSee @[[#^heading-block|section]]";
    expect(plan(source).find((item) => item.kind === "reference")).toMatchObject({
      line: 2,
      label: "1 section",
      target: "^heading-block",
      targetKind: "heading",
      targetLine: 0,
    });
  });

  it("fails closed for missing, duplicate, and ambiguous targets", () => {
    const source = [
      "# Same",
      "# Same",
      "Figure: One ^duplicate",
      "Table: Two ^duplicate",
      "@[[#Same]] @[[#Missing]] @[[#^duplicate]]",
    ].join("\n");
    expect(plan(source).filter((item) => item.kind === "reference")).toEqual([]);
  });

  it("resolves a unique caption title without a block ID and fails closed against a same-name heading", () => {
    const unique = "Figure: Miao\nSee @[[#Figure: Miao]]";
    expect(plan(unique).find((item) => item.kind === "reference")).toMatchObject({
      label: "Figure 1: Miao",
      targetKind: "caption",
      targetLine: 0,
    });

    const ambiguous = "# Figure: Miao\nFigure: Miao\nSee @[[#Figure: Miao]]";
    expect(plan(ambiguous).filter((item) => item.kind === "reference")).toEqual([]);
  });

  it("keeps a two-blank unbound caption numbered and referenceable", () => {
    const source = [
      "Figure: Planned image",
      "",
      "",
      "![[later.png]]",
      "See @[[#Figure: Planned image]]",
    ].join("\n");
    const items = plan(source);
    expect(items.find((item) => item.kind === "caption")).toMatchObject({
      line: 0,
      label: "1",
      displayLabel: "Figure 1: Planned image",
    });
    expect(items.find((item) => item.kind === "caption")).not.toHaveProperty("objectKind");
    expect(items.find((item) => item.kind === "reference")).toMatchObject({
      line: 4,
      label: "Figure 1: Planned image",
      targetKind: "caption",
      targetLine: 0,
    });
  });

  it("keeps caption reference pills when caption numbering is off", () => {
    const source = "Figure: Miao\nSee @[[#Figure: Miao|diagram]]";
    const headings = parseAtxHeadings(source);
    const items = createSemanticDisplayPlan(source, headings, {
      showCaptionNumbers: false,
      centeredCaptionKinds: [],
      showCrossReferences: true,
      showNoteNumbers: false,
      noteSelections: [],
      numbering,
      templateSources,
      headingDisplayPlan: [],
      composing: false,
    });
    expect(items.find((item) => item.kind === "caption")?.label).toBe("");
    expect(items.find((item) => item.kind === "reference")?.label).toBe("Figure: diagram");
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
      { kind: "note-reference", line: 0, label: "E1", noteKind: "endnote" },
      { kind: "note-reference", line: 0, label: "1", noteKind: "footnote" },
      { kind: "note-definition", line: 2, label: "1", noteKind: "footnote" },
      { kind: "note-definition", line: 3, label: "E1", noteKind: "endnote" },
    ]);
  });

  it("does not create note decorations for HTML attributes or link destinations", () => {
    const source = [
      "<span data-note=[^html]>Text</span>",
      "[Link](https://example.test/[^destination]) and visible[^ok].",
      "",
      "[^html]: HTML attribute only",
      "[^destination]: Link destination only",
      "[^ok]: Visible reference",
    ].join("\n");

    expect(plan(source).filter((item) => item.kind.startsWith("note-")).map((item) => ({
      kind: item.kind,
      line: item.line,
      noteId: item.noteId,
    }))).toEqual([
      { kind: "note-reference", line: 1, noteId: "ok" },
      { kind: "note-definition", line: 5, noteId: "ok" },
    ]);
  });

  it("centers selected caption types independently from caption numbering", () => {
    const source = "Figure: Centered\nTable: Theme default";
    expect(createSemanticDisplayPlan(source, [], {
      showCaptionNumbers: false,
      centeredCaptionKinds: ["Figure"],
      showCrossReferences: false,
      showNoteNumbers: false,
      noteSelections: [],
      numbering,
      templateSources,
      headingDisplayPlan: [],
      composing: false,
    }).filter((item) => item.kind === "caption-alignment")).toEqual([{
      kind: "caption-alignment",
      from: 0,
      to: 0,
      line: 0,
      label: "",
      captionKind: "Figure",
    }]);
  });

  it("reveals only the note marker touched by the editor selection", () => {
    const source = "Foot[^a], end[^endnote:x].\n\n[^a]: Footnote\n[^endnote:x]: Endnote";
    const from = source.indexOf("[^a]");
    const items = createSemanticDisplayPlan(source, [], {
      showCaptionNumbers: false,
      centeredCaptionKinds: [],
      showCrossReferences: false,
      showNoteNumbers: true,
      noteSelections: [{ from, to: from }],
      numbering,
      templateSources,
      headingDisplayPlan: [],
      composing: false,
    }).filter((item) => item.kind.startsWith("note-"));
    expect(items.map(({ kind, label, line }) => ({ kind, label, line }))).toEqual([
      { kind: "note-reference", label: "E1", line: 0 },
      { kind: "note-definition", label: "1", line: 2 },
      { kind: "note-definition", label: "E1", line: 3 },
    ]);
  });

  it("keeps inactive semantic pills while composing", () => {
    const source = "Figure: Active\n\nParagraph\n\nFigure: Inactive";
    const active = source.indexOf("Active");
    const items = createSemanticDisplayPlan(source, [], {
      showCaptionNumbers: true,
      centeredCaptionKinds: ["Figure", "Equation"],
      showCrossReferences: false,
      showNoteNumbers: false,
      noteSelections: [{ from: active, to: active }],
      numbering,
      templateSources,
      headingDisplayPlan: [],
      composing: true,
    }).filter((item) => item.kind === "caption");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ line: 4, displayLabel: "Figure 2: Inactive" });
  });

  it("reveals an active caption line and keeps inactive captions as full pills", () => {
    const source = "Figure: Active\nFigure: Inactive";
    const from = source.indexOf("Active");
    const items = createSemanticDisplayPlan(source, [], {
      showCaptionNumbers: true,
      centeredCaptionKinds: [],
      showCrossReferences: false,
      showNoteNumbers: false,
      noteSelections: [{ from, to: from }],
      numbering,
      templateSources,
      headingDisplayPlan: [],
      composing: false,
    }).filter((item) => item.kind === "caption");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ line: 1, displayLabel: "Figure 2: Inactive" });
  });

  it("plans display-only relocation and shared Figure tooltip content", () => {
    const source = "Figure: Miao\n\n![[miao.png|Cat]]";
    const item = createSemanticDisplayPlan(source, [], {
      showCaptionNumbers: true,
      centeredCaptionKinds: ["Figure"],
      captionPlacements: { Figure: "below", Table: "above", Equation: "above", Code: "above" },
      showImageCaptionTooltips: true,
      showCrossReferences: false,
      showNoteNumbers: false,
      noteSelections: [],
      numbering,
      templateSources,
      headingDisplayPlan: [],
      composing: false,
    }).find((candidate) => candidate.kind === "caption");
    expect(item).toMatchObject({
      displayLabel: "Figure 1: Miao",
      sourcePlacement: "above",
      displayPlacement: "below",
      objectKind: "Figure",
      captionCentered: true,
      tooltipTitle: "Figure 1: Miao",
      tooltipBody: "Cat",
    });
    expect(imageTooltipContentAtOffset(source, source.indexOf("miao.png"), true)).toEqual({
      title: "Figure 1: Miao",
      body: "Cat",
    });
  });

  it("deduplicates matching caption and replacement text and supports inline image hover text", () => {
    const bound = "Figure: Cat\n\n![[miao.png|Cat]]";
    expect(imageTooltipContentAtOffset(bound, bound.indexOf("miao.png"), true)).toEqual({
      title: "Figure 1: Cat",
      body: "",
    });
    const inline = "See ![Lunch](lunch.png).";
    expect(imageTooltipContentAtOffset(inline, inline.indexOf("Lunch"), true)).toEqual({
      title: "",
      body: "Lunch",
    });
  });
});
