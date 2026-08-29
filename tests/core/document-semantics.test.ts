import { describe, expect, it } from "vitest";

import {
  numberCaptions,
  parseDocumentSemantics,
  resolveUniqueSemanticTitleTarget,
} from "../../src/core/document-semantics";
import { parseAtxHeadings } from "../../src/core/heading-parser";

describe("document semantics", () => {
  it("recognizes only the four frozen caption declarations and numbers each type per file", () => {
    const source = [
      "Figure: First",
      "Table: First",
      "Figure: Second ^fig-two",
      "Equation: E",
      "Code: Sample",
      "Listing: Not supported",
    ].join("\n");
    const parsed = parseDocumentSemantics(source);
    expect(numberCaptions(parsed.captions).map(({ kind, number, label }) => ({ kind, number, label }))).toEqual([
      { kind: "Figure", number: 1, label: "Figure 1" },
      { kind: "Table", number: 1, label: "Table 1" },
      { kind: "Figure", number: 2, label: "Figure 2" },
      { kind: "Equation", number: 1, label: "Equation 1" },
      { kind: "Code", number: 1, label: "Code 1" },
    ]);
  });

  it("recognizes explicit same-file semantic references and preserves aliases as metadata", () => {
    const parsed = parseDocumentSemantics([
      "@[[#Heading]] @[[#Heading|chapter]]",
      "@[[#^fig-one]] @[[#^fig-one|diagram]]",
      "[[#Heading]] `@[[#Hidden]]`",
    ].join("\n"));
    expect(parsed.references.map(({ kind, target, alias }) => ({ kind, target, alias }))).toEqual([
      { kind: "title", target: "Heading", alias: null },
      { kind: "title", target: "Heading", alias: "chapter" },
      { kind: "block", target: "fig-one", alias: null },
      { kind: "block", target: "fig-one", alias: "diagram" },
    ]);
  });

  it("ignores declarations and references in protected Markdown regions", () => {
    const parsed = parseDocumentSemantics([
      "---",
      "title: Figure: Hidden",
      "---",
      "```md",
      "Figure: Hidden ^hidden",
      "@[[#^hidden]]",
      "```",
      "    @[[#Indented-code]]",
      "<div>",
      "Figure: Hidden in HTML",
      "</div>",
      "",
      "%% Figure: Hidden @[[#Hidden]] %%",
      "Figure: Visible",
    ].join("\n"));
    expect(parsed.captions.map((caption) => caption.kind)).toEqual(["Figure"]);
    expect(parsed.references).toEqual([]);
  });

  it("treats multiline footnote and endnote definitions as protected regions", () => {
    const parsed = parseDocumentSemantics([
      "Figure: Visible",
      "[^note]: Text",
      "  Figure: Hidden",
      "  @[[#Hidden]]",
      "[^endnote:item]: Text",
      "  Table: Hidden",
    ].join("\n"));
    expect(parsed.captions.map((caption) => caption.kind)).toEqual(["Figure"]);
    expect(parsed.references).toEqual([]);
  });

  it("associates inline and immediately following block IDs without requiring an ID", () => {
    const parsed = parseDocumentSemantics([
      "Figure: No ID",
      "Table: With inline ID ^table-one",
      "Equation: With following ID",
      "^equation-one",
    ].join("\n"));
    expect(parsed.captions).toHaveLength(3);
    expect([...parsed.blockOwners.keys()].sort()).toEqual(["block:equation-one", "block:table-one"]);
  });

  it("associates a structured-object block ID across one required blank line", () => {
    const source = "| A |\n| --- |\n| 1 |\n\n^table-block\n\nSee @[[#^table-block]]";
    const parsed = parseDocumentSemantics(source);
    expect(parsed.blockOwners.get("block:table-block")).toBe(2);
  });

  it("uses one title namespace for headings and fixed-type captions", () => {
    const headingOnly = "# Figure: Miao\n@[[#Figure: Miao]]";
    const headingSemantics = parseDocumentSemantics(headingOnly);
    expect(resolveUniqueSemanticTitleTarget(
      "Figure: Miao",
      parseAtxHeadings(headingOnly),
      headingSemantics.captions,
    )).toEqual({ kind: "heading", line: 0 });

    const captionOnly = "Figure: Miao\n@[[#Figure: Miao]]";
    const captionSemantics = parseDocumentSemantics(captionOnly);
    expect(resolveUniqueSemanticTitleTarget(
      "Figure: Miao",
      [],
      captionSemantics.captions,
    )).toEqual({ kind: "caption", line: 0 });

    const ambiguous = "# Figure: Miao\nFigure: Miao\n@[[#Figure: Miao]]";
    const ambiguousSemantics = parseDocumentSemantics(ambiguous);
    expect(resolveUniqueSemanticTitleTarget(
      "Figure: Miao",
      parseAtxHeadings(ambiguous),
      ambiguousSemantics.captions,
    )).toBeNull();
  });

  it("fails closed for duplicate headings or duplicate caption names", () => {
    const source = [
      "# Same",
      "# Same",
      "Figure: Repeated",
      "Figure: Repeated",
    ].join("\n");
    const semantics = parseDocumentSemantics(source);
    const headings = parseAtxHeadings(source);
    expect(resolveUniqueSemanticTitleTarget("Same", headings, semantics.captions)).toBeNull();
    expect(resolveUniqueSemanticTitleTarget("Figure: Repeated", headings, semantics.captions)).toBeNull();
  });

  it("removes trailing block IDs from caption titles", () => {
    const parsed = parseDocumentSemantics("Figure: Architecture ^fig-architecture");
    expect(parsed.captions[0]).toMatchObject({
      content: "Architecture ^fig-architecture",
      title: "Architecture",
      blockId: "fig-architecture",
    });
  });
});
