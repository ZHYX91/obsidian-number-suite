import { describe, expect, it } from "vitest";

import { parseDocumentSemantics } from "../../src/core/document-semantics";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { parseDocumentNotes } from "../../src/core/note-semantics";

describe("shared Markdown protection", () => {
  it("keeps headings inside CommonMark HTML blocks out of every heading transform", () => {
    const source = [
      "</div>",
      "## Still HTML",
      "",
      "## Markdown",
    ].join("\n");
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Markdown"]);
  });

  it("keeps semantic declarations inside CommonMark HTML blocks protected too", () => {
    const source = [
      "</div>",
      "Figure: Hidden",
      "",
      "Figure: Visible",
    ].join("\n");
    expect(parseDocumentSemantics(source).captions.map((caption) => caption.title)).toEqual(["Visible"]);
  });

  it("does not let comment-like text inside inline code open a protected block", () => {
    const source = "`<!--`\n## Visible";
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Visible"]);
  });

  it("keeps valid note references before inline comments and masks comment contents", () => {
    const source = [
      "HTML[^ok] <!-- hidden[^hidden] -->",
      "Obsidian[^two] %% hidden[^hidden] %%",
      "",
      "[^ok]: One",
      "[^two]: Two",
      "[^hidden]: Hidden",
    ].join("\n");
    expect(parseDocumentNotes(source).references.map((note) => note.id)).toEqual(["ok", "two"]);
  });

  it("keeps semantic references before inline comments without consuming hidden references", () => {
    const source = [
      "See @[[#Visible]] <!-- @[[#Hidden]] -->",
      "And @[[#Second]] %% @[[#Hidden]] %%",
    ].join("\n");
    expect(parseDocumentSemantics(source).references.map((reference) => reference.target)).toEqual([
      "Visible",
      "Second",
    ]);
  });

  it("projects comments out of caption text while preserving the declaration", () => {
    const parsed = parseDocumentSemantics("Figure: Architecture <!-- private note -->");
    expect(parsed.captions).toHaveLength(1);
    expect(parsed.captions[0]).toMatchObject({ kind: "Figure", title: "Architecture" });
  });
});
