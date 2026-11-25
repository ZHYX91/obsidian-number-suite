import { describe, expect, it } from "vitest";

import { parseDocumentSemantics } from "../../src/core/document-semantics";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { maskInlineProtectedSyntax } from "../../src/core/markdown-protection";
import { parseDocumentNotes } from "../../src/core/note-semantics";
import { planHeadingTransform } from "../../src/core/transform";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

function writeHeadingNumbers(source: string): string {
  return planHeadingTransform(source, "write", {
    numbering: { scheme: BUILT_IN_SCHEMES.hierarchical, missingLevelStrategy: "fill-one", starts: {} },
    writeMarkers: false, cleanupScope: "templates", templateSources: [],
    removeMultiplePrefixes: true, normalizeManualOnRenumber: true,
  }).result;
}

describe("shared Markdown protection", () => {
  it("keeps marker offsets outside quoted tags, overlapping openers and unfinished tags", () => {
    const tag = `<i title='x > <a "none"'>`;
    const line = ["literal", tag, "@[[#First]]", "</i>", '<a "unfinished', "<b>", "@[[#Last]]"].join(" ");
    const masked = maskInlineProtectedSyntax(line);
    expect(masked).toBe(line.replace(tag, " ".repeat(tag.length)).replace("</i>", "    ").replace("<b>", "   "));
    expect(masked.indexOf("@[[#Last]]")).toBe(line.indexOf("@[[#Last]]"));
  });

  it.each(["<!doctype html", "<!mixed", "<!DoCtYpE"])("protects a multiline HTML declaration beginning %s", opening => {
    const source = ["Paragraph", opening, "# Inside", "Figure: Inside", "example >", "# Outside"].join("\n");
    expect(writeHeadingNumbers(source)).toBe(source.replace("# Outside", "# 1 Outside"));
    expect(parseDocumentSemantics(source).captions).toEqual([]);
  });

  it.each(["<!3example", "<!ä", "\\<!doctype"])("preserves a heading after ordinary text beginning %s", opening => {
    const source = [opening, "# Outside", ">"].join("\n");
    expect(writeHeadingNumbers(source)).toBe(source.replace("# Outside", "# 1 Outside"));
  });

  it.each([["- ", "  "], ["> ", "> "]])("keeps literal references inside a nested %s declaration", (opening, prefix) => {
    const source = [opening + "<!doctype", prefix + "@[[#Inside]] [^inside]", prefix + "end>",
      "", "@[[#Outside]] [^outside]"].join("\n");
    expect(parseDocumentSemantics(source).references.map(row => row.target)).toEqual(["Outside"]);
    expect(parseDocumentNotes(source).references.map(row => row.id)).toEqual(["outside"]);
  });

  it("returns an unclosed declaration to the surrounding container and ignores commented lookalikes", () => {
    const source = ["> <!doctype", "> @[[#Inside]]", "# Outside", "%%", "<!doctype", "%%", "# Also outside"].join("\n");
    expect(writeHeadingNumbers(source)).toBe(source.replace("# Outside", "# 1 Outside").replace("# Also outside", "# 2 Also outside"));
    expect(parseDocumentSemantics(source).references).toEqual([]);
  });

  it("keeps comment and fence examples inside a declaration from hiding later headings", () => {
    const source = ["<!doctype", "%% example", "```", ">", "<custom-tag>", "# HTML", "", "# Outside"].join("\n");
    expect(writeHeadingNumbers(source)).toBe(source.replace("# Outside", "# 1 Outside"));
  });

  it.each(["pre", "script", "style", "textarea"])(
    "protects a raw %s tag whose attributes start on the following line", (tag) => {
      const source = [`<${tag.toUpperCase()}`, 'class="example">', "", "# literal", `</${tag}>`, "# Real"].join("\n");
      expect(writeHeadingNumbers(source)).toBe(source.replace("# Real", "# 1 Real"));
    },
  );

  it.each([
    ["<pre>", "</PRE >", "# literal", "</pre>", "", "# Real"],
    ["<textarea>", "</textarea\t>", "# literal", "</STYLE>", "", "# Real"],
    ["<script>", "# literal", "const sample = '</TeXtArEa>';", "", "# Real"],
    ["<style> body::after { content: '</PRE>' }", "", "# Real"],
  ])("honors CommonMark raw HTML end conditions after %s", (...lines) => {
    const source = lines.join("\n");
    expect(writeHeadingNumbers(source)).toBe(source.replace("# Real", "# 1 Real"));
  });

  it.each([
    ["<script>", "</ſcript>", "# literal", "</STYLE>", "# Real"],
    ["<div>", "\u00a0", "# literal", "", "# Real"],
    ["<widget>", "\u2003", "# literal", "\t", "# Real"],
    ["<ſtyle>", "# Real"],
  ])("keeps actual HTML boundaries for Unicode text after %s", (...lines) => {
    const source = lines.join("\n");
    expect(writeHeadingNumbers(source)).toBe(source.replace("# Real", "# 1 Real"));
  });

  it("keeps similar tag-name prefixes from starting raw HTML blocks", () => {
    expect(parseAtxHeadings("<preview\n# Real").map((heading) => heading.content)).toEqual(["Real"]);
  });

  it.each(["pre", "script", "style", "textarea"])(
    "resumes numbering after a standalone self-closing <%s/> block", (tag) => {
      const source = [`<${tag}/>`, "# Inside HTML", "", "# First", "## Second"].join("\n");
      expect(writeHeadingNumbers(source)).toBe(source.replace("# First", "# 1 First").replace("## Second", "## 1.1 Second"));
    },
  );

  it("preserves caption code and link source while masking comments and literal references", () => {
    const source = "Figure: Using `foo()` and [docs](https://example.com) <!-- private --> ^fig\n\nCode: `print(x)`\n\nSee `@[[#Hidden]]` and @[[#^fig]]";
    const parsed = parseDocumentSemantics(source);
    expect(parsed.captions[0]?.title).toBe("Using `foo()` and [docs](https://example.com)");
    expect(parsed.captions[1]?.title).toBe("`print(x)`");
    expect(parsed.references.map((r) => r.target)).toEqual(["fig"]);
  });

  it.each(["# Heading", "```\ncode\n```", "***", "[label]: /url", "[label]:\n  /url"]) (
    "protects type-7 HTML after a completed block: %s", (prefix) => {
      const source = `${prefix}\n<custom-tag>\n## Protected\n\n## Visible`;
      expect(writeHeadingNumbers(source)).toContain("<custom-tag>\n## Protected\n");
    },
  );

  it.each(["</widget disabled>", "</widget/>", "<widget = >", "<widget key=>", "<widget 3=value>",
    "<widget key=two=parts>", "<widget\u00a0key>", "<div\u00a0key>", "<script\u00a0key>", "<widget key='unfinished>"])(
    "leaves headings after malformed tag text available: %s", (line) => {
      expect(parseAtxHeadings(`${line}\n## Visible`).map((heading) => heading.content)).toEqual(["Visible"]);
    },
  );

  it.each(["<widget-tag data-a='a > b' disabled :slot.name=main />", '<widget data="two words">',
    "<widget key = unquoted>", "</widget   >"])("protects complete standalone tag %s", (line) => {
    expect(parseAtxHeadings(`${line}\n## Protected\n\n# Visible`).map((heading) => heading.content)).toEqual(["Visible"]);
  });

  it("does not start type-7 HTML in the middle of a paragraph", () => {
    expect(parseAtxHeadings("Paragraph\n<custom-tag>\n## Visible").map((h) => h.content)).toEqual(["Visible"]);
  });

  it("keeps a complete custom tag inline after a non-interrupting ordered list marker", () => {
    const source = "Body\n2. continuation\n<custom-tag>\n# Candidate\n\n# Tail";
    expect(writeHeadingNumbers(source)).toBe(source.replace("# Candidate", "# 1 Candidate").replace("# Tail", "# 2 Tail"));
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

  it.each([1, 3])("keeps references between backticks escaped by %i backslashes", (slashes) => {
    const escapedTick = `${"\\".repeat(slashes)}\``;
    const source = `# Title\n\n${escapedTick} @[[#Title]] [^note] ${escapedTick}`;
    const references = parseDocumentSemantics(source).references;
    const notes = parseDocumentNotes(source).references;
    expect(references.map(({ target }) => target)).toEqual(["Title"]);
    expect(references.map(({ from, to }) => source.slice(from, to))).toEqual(["@[[#Title]]"]);
    expect(notes.map(({ id }) => id)).toEqual(["note"]);
    expect(notes.map(({ from, to }) => source.slice(from, to))).toEqual(["[^note]"]);
  });

  it.each([0, 2, 4])("still masks code spans after %i backslashes", (slashes) => {
    const source = `${"\\".repeat(slashes)}\`@[[#Hidden]] [^hidden]\` @[[#Visible]] [^visible]`;
    expect(parseDocumentSemantics(source).references.map(({ target }) => target)).toEqual(["Visible"]);
    expect(parseDocumentNotes(source).references.map(({ id }) => id)).toEqual(["visible"]);
  });

  it("allows an unescaped backtick after an escaped backtick to open a code span", () => {
    const source = "\\`` @[[#Hidden]] [^hidden] ` @[[#Visible]] [^visible]";
    expect(parseDocumentSemantics(source).references.map(({ target }) => target)).toEqual(["Visible"]);
    expect(parseDocumentNotes(source).references.map(({ id }) => id)).toEqual(["visible"]);
  });

  it("does not let a backslash inside code escape the closing backtick", () => {
    const source = "`@[[#Hidden]] [^hidden]\\` @[[#Visible]] [^visible]";
    expect(parseDocumentSemantics(source).references.map(({ target }) => target)).toEqual(["Visible"]);
    expect(parseDocumentNotes(source).references.map(({ id }) => id)).toEqual(["visible"]);
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
