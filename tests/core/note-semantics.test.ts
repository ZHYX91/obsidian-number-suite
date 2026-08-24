import { describe, expect, it } from "vitest";

import {
  numberDocumentNotes,
  parseDocumentNotes,
} from "../../src/core/note-semantics";

describe("document note semantics", () => {
  it("recognizes default, explicit, and endnote labels without special-casing dashed IDs", () => {
    const source = [
      "Default[^alpha], explicit[^footnote:beta], end[^endnote:gamma], dash[^topic-delta].",
      "",
      "[^alpha]: A",
      "[^footnote:beta]: B",
      "[^endnote:gamma]: C",
      "[^topic-delta]: D",
    ].join("\n");
    const parsed = parseDocumentNotes(source);
    expect(parsed.definitions.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: "footnote", id: "alpha" },
      { kind: "footnote", id: "beta" },
      { kind: "endnote", id: "gamma" },
      { kind: "footnote", id: "topic-delta" },
    ]);
    expect(parsed.references.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: "footnote", id: "alpha" },
      { kind: "footnote", id: "beta" },
      { kind: "endnote", id: "gamma" },
      { kind: "footnote", id: "topic-delta" },
    ]);
  });

  it("numbers footnotes and endnotes independently by first reference and reuses labels", () => {
    const source = [
      "End[^endnote:z], foot[^a], end again[^endnote:z], foot two[^footnote:b].",
      "",
      "[^a]: A",
      "[^footnote:b]: B",
      "[^endnote:z]: Z",
    ].join("\n");
    const numbered = numberDocumentNotes(parseDocumentNotes(source));
    expect(numbered.references.map(({ kind, id, number }) => ({ kind, id, number }))).toEqual([
      { kind: "endnote", id: "z", number: 1 },
      { kind: "footnote", id: "a", number: 1 },
      { kind: "endnote", id: "z", number: 1 },
      { kind: "footnote", id: "b", number: 2 },
    ]);
    expect(numbered.definitions.map(({ kind, id, number }) => ({ kind, id, number }))).toEqual([
      { kind: "endnote", id: "z", number: 1 },
      { kind: "footnote", id: "a", number: 1 },
      { kind: "footnote", id: "b", number: 2 },
    ]);
  });

  it("fails closed for missing, duplicate, canonical conflicts, and mismatched source labels", () => {
    const source = [
      "Missing[^missing], duplicate[^dup], conflict[^same], mismatched[^footnote:other].",
      "",
      "[^dup]: One",
      "[^dup]: Two",
      "[^same]: Implicit",
      "[^footnote:same]: Explicit conflict",
      "[^other]: Does not match the explicit reference label",
    ].join("\n");
    expect(numberDocumentNotes(parseDocumentNotes(source))).toEqual({ definitions: [], references: [] });
  });

  it("ignores protected regions, inline code, escapes, and complete note containers", () => {
    const source = [
      "`Code[^code]` and \\[^escaped] and visible[^ok].",
      "",
      "[^ok]: First line",
      "  continuation[^hidden]",
      "  # not a document heading",
      "  Figure: not a document caption",
      "[^hidden]: Hidden definition",
      "```",
      "fenced[^fenced]",
      "[^fenced]: Fenced definition",
      "```",
    ].join("\n");
    const parsed = parseDocumentNotes(source);
    expect(parsed.references.map((item) => item.id)).toEqual(["ok"]);
    expect(parsed.definitions.map((item) => item.id)).toEqual(["ok", "hidden"]);
    expect([...parsed.containerLines]).toEqual([2, 3, 4, 5, 6]);
  });

  it("ignores note-like text in inline HTML and Markdown link destinations", () => {
    const source = [
      "<span data-note=[^html]>Text</span>",
      "[Link](https://example.test/[^destination]) and visible[^ok].",
      "[Titled](https://example.test \"title ) [^title]\")",
      "",
      "[^html]: HTML attribute only",
      "[^destination]: Link destination only",
      "[^title]: Link title only",
      "[^ok]: Visible reference",
    ].join("\n");

    const parsed = parseDocumentNotes(source);

    expect(parsed.references.map((item) => item.id)).toEqual(["ok"]);
    expect(parsed.definitions.map((item) => item.id)).toEqual(["html", "destination", "title", "ok"]);
  });
});
