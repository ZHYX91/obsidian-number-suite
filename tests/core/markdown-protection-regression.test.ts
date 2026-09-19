import { describe, expect, it } from "vitest";

import { parseDocumentSemantics } from "../../src/core/document-semantics";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { parseDocumentNotes } from "../../src/core/note-semantics";
import { planHeadingTransform } from "../../src/core/transform";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

describe("shared Markdown protection", () => {
  it("preserves caption code and link source while masking comments and literal references", () => {
    const source = "Figure: Using `foo()` and [docs](https://example.com) <!-- private --> ^fig\n\nCode: `print(x)`\n\nSee `@[[#Hidden]]` and @[[#^fig]]";
    const parsed = parseDocumentSemantics(source);
    expect(parsed.captions[0]?.title).toBe("Using `foo()` and [docs](https://example.com)");
    expect(parsed.captions[1]?.title).toBe("`print(x)`");
    expect(parsed.references.map((r) => r.target)).toEqual(["fig"]);
  });

  it.each(["# Heading", "```\ncode\n```", "***"]) (
    "protects type-7 HTML after a completed block: %s", (prefix) => {
      const source = `${prefix}\n<custom-tag>\n## Protected\n\n## Visible`;
      const plan = planHeadingTransform(source, "write", {
        numbering: { scheme: BUILT_IN_SCHEMES.hierarchical, missingLevelStrategy: "fill-one", starts: {} },
        writeMarkers: false, cleanupScope: "templates", templateSources: [],
        removeMultiplePrefixes: true, normalizeManualOnRenumber: true,
      });
      expect(plan.result).toContain("<custom-tag>\n## Protected\n");
    },
  );

  it("does not start type-7 HTML in the middle of a paragraph", () => {
    expect(parseAtxHeadings("Paragraph\n<custom-tag>\n## Visible").map((h) => h.content)).toEqual(["Visible"]);
  });

  it("keeps comment delimiters inert inside another comment and recognizes successive comments", () => {
    expect(parseAtxHeadings("Text <!-- %% -->\n## Visible").map((h) => h.content)).toEqual(["Visible"]);
    expect(parseAtxHeadings("Text %% closed %% then %% open\n## Hidden\n%%\n## Visible").map((h) => h.content)).toEqual(["Visible"]);
    expect(parseAtxHeadings("Text %% <!-- %%\n## Visible").map((h) => h.content)).toEqual(["Visible"]);
  });

  it("keeps references on both sides of multiline inline comments at exact source offsets", () => {
    const source = "Body[^a] <!-- comment\nhidden[^x]\n--> tail[^b]\n\n%% hidden %% text[^c]\n\n[^a]: A\n[^b]: B\n[^c]: C";
    const refs = parseDocumentNotes(source).references;
    expect(refs.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(refs.map((r) => source.slice(r.from, r.to))).toEqual(["[^a]", "[^b]", "[^c]"]);
  });

  it("matches exact backtick runs and ignores fences inside inline comments", () => {
    expect(parseDocumentNotes("`[^a]``").references.map((r) => r.id)).toEqual(["a"]);
    expect(parseAtxHeadings("Text <!--\n```\n-->\n## Visible").map((h) => h.content)).toEqual(["Visible"]);
    expect(parseAtxHeadings("```invalid`info\n## Visible").map((h) => h.content)).toEqual(["Visible"]);
  });
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
