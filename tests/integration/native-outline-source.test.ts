import type { HeadingCache } from "obsidian";
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

  const endings = ["\n", "\r", "\r\n"];
  const combinations = endings.flatMap(first =>
    endings.flatMap(second => endings.map(third => [first, second, third] as const)));

  it.each(combinations)("aligns physical heading offsets for %j, %j, %j", (first, second, third) => {
    const editor = headingFixture(["\n", "\n", "\n"]);
    const diskEndings = [first, second, third] as const;
    const physical = headingFixture(diskEndings);
    const before = headingFixture(diskEndings).headings;
    const aligned = nativeHeadingsInSource(physical.headings, readOutlineStructure(editor.source), editor.source);
    expect(aligned).toEqual(editor.headings);
    expect(physical.headings).toEqual(before);
    expect(nativeHeadingsInSource(physical.headings, readOutlineStructure(physical.source), physical.source))
      .toBe(physical.headings);
  });

  it("reuses heading objects whose physical offsets already match the editor", () => {
    const editor = headingFixture(["\n", "\n", "\n"]);
    const structure = readOutlineStructure(editor.source);
    const oneMixedEnding = headingFixture(["\n", "\n", "\r\n"]);
    const aligned = nativeHeadingsInSource(oneMixedEnding.headings, structure, editor.source)!;
    expect(aligned[0]).toBe(oneMixedEnding.headings[0]);
    expect(nativeHeadingsInSource(aligned, structure, editor.source)).toBe(aligned);
  });

  it.each(endings)("rejects stale and out-of-bounds endpoints in physical %j source", ending => {
    const { source, headings: [root, child] } = headingFixture([ending, ending, ending]);
    const structure = readOutlineStructure(source);
    const valid = root.position.end;
    for (const end of [
      { ...valid, offset: valid.offset + 1 },
      { ...valid, offset: valid.offset + 1, col: valid.col + 1 },
      { ...child.position.end, offset: child.position.end.offset + 4 },
    ]) {
      const item = end.line === valid.line ? root : child;
      expect(nativeHeadingsInSource([{ ...item, position: { start: item.position.start, end } }], structure, source)).toBeNull();
    }
  });

  it("rejects cache positions that cannot belong to the same physical note", () => {
    const editor = headingFixture(["\n", "\n", "\n"]);
    const { headings: [root, child] } = headingFixture(["\r\n", "\r\n", "\r\n"]);
    const structure = readOutlineStructure(editor.source);
    const align = (headings: HeadingCache[]) =>
      nativeHeadingsInSource(headings, structure, editor.source);

    // There is no line break inside the root heading on which an extra CR could disappear.
    const inconsistentEnd = { ...root.position.end, offset: root.position.end.offset - 1 };
    expect(align([{ ...root, position: { ...root.position, end: inconsistentEnd } }])).toBeNull();
    expect(align([root, editor.headings[1]])).toBeNull();
    const impossibleUnderline = { ...child.position.end, offset: child.position.end.offset + 1 };
    expect(align([root, { ...child, position: { ...child.position, end: impossibleUnderline } }])).toBeNull();
    expect(align([root, { ...child, heading: "Renamed" }])).toBeNull();
  });
});

/** Use the actual string as the offset oracle for both the on-disk and editor spellings. */
function headingFixture(endings: readonly [string, string, string]) {
  const rows = ["Intro", "  # 🌱 Root", "Child", "-----"] as const;
  const source = rows.map((row, i) => row + (endings[i] ?? "")).join("");
  const position = (line: number, col: number) => ({ line, col, offset: source.indexOf(rows[line]!) + col });
  const headings: [HeadingCache, HeadingCache] = [
    { heading: "🌱 Root", level: 1, position: { start: position(1, 2), end: position(1, rows[1].length) } },
    { heading: "Child", level: 2, position: { start: position(2, 0), end: position(3, rows[3].length) } },
  ];
  return { source, headings };
}
