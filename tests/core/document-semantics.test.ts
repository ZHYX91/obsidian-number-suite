import { describe, expect, it } from "vitest";

import {
  numberCaptions,
  parseDocumentSemantics,
  resolveUniqueSemanticTitleTarget,
} from "../../src/core/document-semantics";
import { numberHeadings } from "../../src/core/numbering-engine";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import type { HeadingLevel, NumberingOptions } from "../../src/core/types";
import { parseAtxHeadings } from "../../src/core/heading-parser";

function sectionNumbers(source: string, level: HeadingLevel, overrides: Partial<NumberingOptions> = {}) {
  const headings = numberHeadings(parseAtxHeadings(source), {
    scheme: BUILT_IN_SCHEMES.hierarchical, missingLevelStrategy: "fill-one", starts: {}, ...overrides,
  });
  return numberCaptions(parseDocumentSemantics(source).captions, { level, headings });
}

describe("document semantics", () => {
  it("resets each caption kind only at its section boundary and resumes the unprefixed sequence", () => {
    const source = [
      "Figure: Front", "Table: Front", "# Chapter", "## A", "Figure: First", "Table: Results", "Code: A", "Equation: A",
      "### More", "Figure: Second", "## B", "Figure: Third", "Table: Second table", "Code: B", "Equation: B",
      "# New chapter", "Figure: Outside", "Table: Outside", "## Next", "Figure: Fourth",
    ].join("\r\n");
    const captions = sectionNumbers(source, 2, { starts: { 1: 3, 2: 4 } });
    expect(captions.map((caption) => caption.displayNumber)).toEqual([
      "1", "1", "3.4-1", "3.4-1", "3.4-1", "3.4-1", "3.4-2",
      "3.5-1", "3.5-1", "3.5-1", "3.5-1", "2", "2", "4.4-1",
    ]);
    expect(captions.filter((caption) => caption.kind === "Figure").map((caption) => caption.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ends a section on skipped, excluded, empty or unnumberable headings", () => {
    const source = [
      "# Skip", "Figure: A", "# Normal", "Figure: B", "# Exclude", "Figure: C", "# Good", "Figure: D",
      "#", "Figure: E", "# Last", "Figure: F",
    ].join("\n");
    const scope = { ...BUILT_IN_SCHEMES.hierarchical, exclusions: [{ title: "Exclude", scope: "subtree" as const }] };
    expect(sectionNumbers(source, 1, { scheme: scope, skipFirst: { 1: 1 } }).map((c) => c.displayNumber))
      .toEqual(["1", "1-1", "2", "2-1", "3", "3-1"]);
    expect(sectionNumbers("## Missing\nTable: A", 2, { missingLevelStrategy: "skip" })[0]?.displayNumber).toBe("1");
    const overflow = sectionNumbers("# Last\nFigure: A\n# Overflow\nFigure: B", 1, { starts: { 1: Number.MAX_SAFE_INTEGER } });
    expect(overflow.map((c) => c.displayNumber)).toEqual([`${Number.MAX_SAFE_INTEGER}-1`, "1"]);
  });

  it("uses a hidden heading's valid counter, the full configured label, and all nine levels", () => {
    const hidden = sectionNumbers("# No H1 label\nCode: First\n# Next\nCode: Second", 1, {
      scheme: BUILT_IN_SCHEMES["hierarchical-h2"], starts: { 1: 4 },
    });
    expect(hidden.map((c) => c.displayNumber)).toEqual(["4-1", "5-1"]);
    const templates = [...BUILT_IN_SCHEMES.hierarchical.templates];
    templates[1] = "Part {1.roman_upper}.{2.arabic}";
    expect(sectionNumbers("# A\n## Sub\nTable: X", 2, { scheme: { ...BUILT_IN_SCHEMES.hierarchical, templates } })[0]?.displayNumber)
      .toBe("Part I.1-1");
    const allLevels = Array.from({ length: 9 }, (_, index) => `${"#".repeat(index + 1)} Chapter`).join("\n");
    expect(sectionNumbers(`${allLevels}\nEquation: Nine`, 9)[0]?.displayNumber).toBe("1.1.1.1.1.1.1.1.1-1");
  });

  it("recognizes only the four frozen caption declarations and numbers each type per file", () => {
    const source = [
      "Figure: First",
      "Table: First",
      "Figure: Second ^fig-two",
      "Equation: E",
      "Code: Sample",
      "figure: Lowercase near-miss",
      "FIGURE: Uppercase near-miss",
      "Figure : Spaced-colon near-miss",
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

  it("requires visible Figure/Table titles but permits ID-only Equation/Code declarations", () => {
    const source = [
      "Figure: ^figure-only",
      "Table: ^table-only",
      "Equation: ^energy",
      "Code: ^snippet",
      "Figure: Visible figure",
      "Table: Visible table",
    ].join("\n");
    const parsed = parseDocumentSemantics(source);
    expect(numberCaptions(parsed.captions).map(({ kind, title, number }) => ({ kind, title, number }))).toEqual([
      { kind: "Equation", title: "", number: 1 },
      { kind: "Code", title: "", number: 1 },
      { kind: "Figure", title: "Visible figure", number: 1 },
      { kind: "Table", title: "Visible table", number: 1 },
    ]);
    expect([...parsed.blockOwners.keys()].sort()).toEqual([
      "block:energy",
      "block:figure-only",
      "block:snippet",
      "block:table-only",
    ]);
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
