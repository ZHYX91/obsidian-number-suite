import { describe, expect, it } from "vitest";
import { nativeHeadingsInSource, readOutlineStructure, updateOutlineStructure } from "../../src/integration/native-outline-source";

describe("native Outline source positions", () => {
  it.each(["\n", "\r", "\r\n"])("reconciles plain edits and structural edits with a fresh parse (%j)", (eol) => {
    const rows = ["---", "title: Note", "---", "# Root", "Prose", "", "Figure: First", "", "####### Extra", "Title", "====", "", "# Last"];
    let previous = rows.join(eol);
    let structure = readOutlineStructure(previous);
    for (const [from, to] of [
      ["Prose", "More prose"], ["More prose", "其他文字"], ["其他文字", ""], ["Figure: First", "Table: Second"],
      ["Title", "Other title"], ["####### Extra", "```" + eol + "####### Extra"], ["# Last", "```" + eol + "# Last"],
    ]) {
      const next = previous.replace(from!, to!);
      structure = updateOutlineStructure(previous, next, structure);
      expect(structure).toEqual(readOutlineStructure(next));
      previous = next;
    }
  });

  it("reuses an unchanged row set after the last heading", () => {
    const source = "# Root\nA paragraph\n";
    const structure = readOutlineStructure(source);
    expect(updateOutlineStructure(source, source + "x", structure)).toBe(structure);
    const plain = source + "tail";
    expect(updateOutlineStructure(plain, plain + " ends", structure)).toBe(structure);
  });

  it("aligns a CRLF cache to LF only when all indexed headings match", () => {
    const source = "Intro\n# Root\n\n  ## Child";
    const structure = readOutlineStructure(source);
    const cached = [
      { heading: "Root", level: 1, position: { start: { line: 1, col: 0, offset: 7 }, end: { line: 1, col: 6, offset: 13 } } },
      { heading: "Child", level: 2, position: { start: { line: 3, col: 2, offset: 19 }, end: { line: 3, col: 10, offset: 27 } } },
    ];
    const aligned = nativeHeadingsInSource(cached, structure)!;
    expect(aligned.map((item) => [item.position.start.offset, item.position.end.offset])).toEqual([[6, 12], [16, 24]]);
    expect(nativeHeadingsInSource(aligned, structure)).toBe(aligned);
    expect(nativeHeadingsInSource(cached, readOutlineStructure(source.replace(/\n/gu, "\r\n")))).toBe(cached);
    expect(nativeHeadingsInSource([cached[0]!, aligned[1]!], structure)).toBeNull();
    expect(nativeHeadingsInSource(cached, readOutlineStructure(source.replace("Child", "Other")))).toBeNull();
    expect(cached[1]!.position.start.offset).toBe(19);
  });
});
