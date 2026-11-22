import { describe, expect, it } from "vitest";
import { readOutlineStructure, updateOutlineStructure } from "../../src/integration/native-outline-source";

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
});
