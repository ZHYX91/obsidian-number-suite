import { describe, expect, it } from "vitest";

import { parseAtxHeadings } from "../../src/core/heading-parser";

describe("parseAtxHeadings", () => {
  it("does not promote headings inside multiline note definitions", () => {
    const source = [
      "# Document",
      "[^note]: Text",
      "  # Footnote heading",
      "[^endnote:item]: Text",
      "   ## Endnote heading",
      "## Section",
    ].join("\n");
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Document", "Section"]);
  });

  it("parses ATX H1-H6 with indentation and closing hashes", () => {
    const source = "# One\n ## Two ##\n  ### Three\n   #### Four\n##### Five\n###### Six";
    const headings = parseAtxHeadings(source);
    expect(headings.map(({ level, content }) => ({ level, content }))).toEqual([
      { level: 1, content: "One" },
      { level: 2, content: "Two" },
      { level: 3, content: "Three" },
      { level: 4, content: "Four" },
      { level: 5, content: "Five" },
      { level: 6, content: "Six" },
    ]);
    expect(source.slice(headings[1]?.contentFrom, headings[1]?.contentTo)).toBe("Two");
  });

  it("skips frontmatter, fenced code, comments, and HTML blocks", () => {
    const source = [
      "\uFEFF---",
      "title: '# Not a heading'",
      "---",
      "# Real",
      "```markdown",
      "# In code",
      "```",
      "<!--",
      "## In comment",
      "-->",
      "<div>",
      "### In HTML",
      "### <!-- hidden --> Also in HTML",
      "</div>",
      "",
      "## Also real",
    ].join("\n");
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Real", "Also real"]);
  });

  it("preserves CRLF offsets and ignores non-ATX constructs", () => {
    const source = "Title\r\n=====\r\n> # Quote\r\n- ## List\r\n    ### Code\r\n# Actual\r\n";
    const headings = parseAtxHeadings(source);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.line).toBe(5);
    expect(source.slice(headings[0]?.contentFrom, headings[0]?.contentTo)).toBe("Actual");
  });

  it("fails closed on an unclosed frontmatter or fence", () => {
    expect(parseAtxHeadings("---\ntitle: broken\n# Hidden")).toEqual([]);
    expect(parseAtxHeadings("```\n# Hidden")).toEqual([]);
  });

  it("skips Obsidian percent comments", () => {
    const source = "%%\n# Hidden\n%%\n# Visible\n%% # Inline hidden %%\n## Also visible";
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual([
      "Visible",
      "Also visible",
    ]);
  });

  it("treats closing-hash-only ATX headings as empty without hiding a real hash title", () => {
    const source = "# #\n# ###\n## ##\n# # title\n# Actual";
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual([
      "",
      "",
      "",
      "# title",
      "Actual",
    ]);
  });

  it("projects closed inline HTML comments out of heading semantics and preserves source spans", () => {
    const source = [
      "# <!-- lead --> Title",
      "# Ti<!-- middle -->tle",
      "# Tail <!-- tail -->",
      "# <!-- only -->",
    ].join("\n");
    const headings = parseAtxHeadings(source);
    expect(headings.map((heading) => heading.content)).toEqual(["Title", "Title", "Tail", ""]);
    expect(source.slice(headings[0]?.contentFrom, headings[0]?.contentTo)).toBe("Title");
    expect(headings[1]?.contentSpans).toHaveLength(2);
  });

  it("fails closed for an unclosed inline HTML comment", () => {
    const source = "# Visible\n# Broken <!--\n## Hidden\n-->\n# After";
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Visible", "After"]);
  });
});
