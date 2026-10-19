import { describe, expect, it } from "vitest";

import { scanCaptionObjects } from "../../src/core/caption-objects";
import { parseDocumentSemantics } from "../../src/core/document-semantics";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { wrapPluginNumber } from "../../src/core/markers";
import { parseDocumentNotes } from "../../src/core/note-semantics";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import { planHeadingTransform, type TransformOptions } from "../../src/core/transform";

const OPTIONS: TransformOptions = {
  numbering: {
    scheme: BUILT_IN_SCHEMES.hierarchical,
    missingLevelStrategy: "fill-one",
    starts: {},
  },
  writeMarkers: false,
  cleanupScope: "plugin",
  templateSources: [],
  removeMultiplePrefixes: true,
  normalizeManualOnRenumber: true,
};

const CONTAINERS = [
  { name: "list fence", source: "- ```markdown\n  # Hidden\n  ```" },
  { name: "ordered list fence", source: "1. ~~~markdown\n   # Hidden\n   ~~~" },
  { name: "nested list fence", source: "1. Parent\n   - ```markdown\n     # Hidden\n     ```" },
  { name: "blockquote fence", source: "> ```markdown\n> # Hidden\n> ```" },
  { name: "list heading", source: "- Item\n\n  # Hidden" },
  { name: "list HTML block", source: "- <div>\n  # Hidden\n  </div>" },
  { name: "list with a tab-indented continuation", source: "- Item\n\n\t# Hidden" },
] as const;

describe("Markdown container contracts", () => {
  it.each(CONTAINERS)("keeps $name byte-for-byte and numbers the following document heading", ({ source: container }) => {
    const source = `${container}\n\n# Visible`;
    const plan = planHeadingTransform(source, "write", OPTIONS);
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Visible"]);
    expect(plan.result).toBe(`${container}\n\n# 1 Visible`);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes.every((change) => change.from > container.length)).toBe(true);
  });

  it.each(["\n", "\r\n", "\r"])("retains source bytes and offsets with %j line endings", (newline) => {
    const container = ["- ```md", "  # Hidden", "  ```"].join(newline);
    const source = `${container}${newline}${newline}# Visible`;
    const heading = parseAtxHeadings(source)[0];
    expect(source.slice(heading?.contentFrom, heading?.contentTo)).toBe("Visible");
    expect(planHeadingTransform(source, "write", OPTIONS).result)
      .toBe(`${container}${newline}${newline}# 1 Visible`);
  });

  it.each(["renumber", "remove", "strip-markers"] as const)("never applies %s inside a list container", (operation) => {
    const protectedText = `- Item\n\n  # ${wrapPluginNumber("9")} Hidden\n\n`;
    const source = `${protectedText}# ${wrapPluginNumber("2")} Visible`;
    const plan = planHeadingTransform(source, operation, OPTIONS);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes.every((change) => change.from >= protectedText.length)).toBe(true);
    expect(plan.result.slice(0, protectedText.length)).toBe(protectedText);
  });

  it("ends an unclosed container fence when the list ends", () => {
    const source = "- ```md\n  # Hidden\n# Visible";
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Visible"]);
  });

  it("keeps Number Suite H7-H9 as document blocks after a list", () => {
    for (const level of [7, 8, 9]) {
      const source = `- Item\n${"#".repeat(level)} Visible`;
      expect(parseAtxHeadings(source).map((heading) => heading.level)).toEqual([level]);
    }
  });

  it("does not confuse a thematic break with a list or hide later indented top-level headings", () => {
    const source = "- - -\n # First\n\n- Item\n\n # Second";
    expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["First", "Second"]);
  });

  it("excludes nested declarations and objects while retaining ordinary list references", () => {
    const source = [
      "- Item @[[#^figure]] and note[^note]",
      "",
      "  Figure: Hidden",
      "",
      "  ![[hidden.png]]",
      "",
      "  ```md",
      "  Figure: Code example @[[#^hidden]] [^hidden]",
      "  ```",
      "",
      "Figure: Visible ^figure",
      "",
      "![[visible.png]]",
      "",
      "[^note]: Visible note",
    ].join("\n");
    const semantics = parseDocumentSemantics(source);
    expect(semantics.captions.map((caption) => caption.title)).toEqual(["Visible"]);
    expect(semantics.references.map((reference) => reference.target)).toEqual(["figure"]);
    expect(parseDocumentNotes(source).references.map((reference) => reference.id)).toEqual(["note"]);
    expect(scanCaptionObjects(source).map((object) => source.slice(object.from, object.to)))
      .toEqual(["![[visible.png]]"]);
  });
});
