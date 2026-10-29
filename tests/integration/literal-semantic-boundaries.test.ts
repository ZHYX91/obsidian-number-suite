import { MarkdownParser, parser, Table } from "@lezer/markdown";
import { describe, expect, it, vi } from "vitest";

import { createSemanticSnapshot } from "../../src/application/semantic-snapshot";
import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { DEFAULT_SETTINGS, toNumberingOptions } from "../../src/config/settings";
import { createCaptionInsertionPlan } from "../../src/core/caption-insertion";
import { exportSemanticSnapshotV2, NUMBER_SUITE_INTEROP_SCHEMA_V2 } from "../../src/integration/semantic-export";

function exported(source: string) {
  return exportSemanticSnapshotV2(DEFAULT_SETTINGS, {
    schema: NUMBER_SUITE_INTEROP_SCHEMA_V2, authoredMarkdown: source, frontmatter: null,
  });
}

function display(source: string) {
  const snapshot = createSemanticSnapshot(source);
  return createSemanticDisplayPlan(source, snapshot.headings, {
    showCaptionNumbers: true, centeredCaptionKinds: [], showCrossReferences: true,
    showNoteNumbers: true, noteSelections: [], numbering: toNumberingOptions(DEFAULT_SETTINGS),
    templateSources: [], headingDisplayPlan: [], composing: false,
  }, snapshot);
}

describe("full-document literal ownership", () => {
  it.each(["\n", "\r\n", "\r"])("excludes cross-line code without consuming prose note numbers for %j", (ending) => {
    for (const ticks of ["`", "``", "```"]) {
      const source = ["prefix " + ticks + "example", "@[[#Actual]] [^x]", "end" + ticks, "",
        "# Actual", "", "Prose [^y] [^x] @[[#Actual]]", "", "[^x]: X", "[^y]: Y"].join(ending);
      expect(parser.parse(source.replace(/\r\n|\r/gu, "\n")).toString()).toContain("InlineCode");
      const snapshot = createSemanticSnapshot(source);
      expect(snapshot.semantics.references.map((ref) => ref.line)).toEqual([6]);
      expect(snapshot.notes.references.map((ref) => [ref.id, ref.number])).toEqual([["y", 1], ["x", 2]]);
      expect(display(source).filter((item) => item.kind === "reference" || item.kind === "note-reference")
        .every((item) => item.line === 6)).toBe(true);
      expect(exported(source).references).toHaveLength(1);
    }
  });

  it.each(["\n", "\r\n", "\r"])("keeps equation interiors separate from external captions for %j", (ending) => {
    const source = ["$$", "Figure: literal", "@[[#Actual]] [^x]", "$$", "Figure: actual", "", "# Actual", "", "[^x]: X"].join(ending);
    const snapshot = createSemanticSnapshot(source);
    expect(snapshot.objects.map((object) => object.kind)).toEqual(["Equation"]);
    expect(snapshot.bindings[0]?.caption.title).toBe("actual");
    expect(snapshot.numberedCaptions.map((caption) => [caption.title, caption.number])).toEqual([["actual", 1]]);
    expect(snapshot.semantics.references).toEqual([]);
    expect(snapshot.notes.references).toEqual([]);
    expect(exported(source).captionTargets.map((caption) => [caption.authoredText, caption.derivedNumber])).toEqual([["actual", "1"]]);
    expect(display(source).filter((item) => item.kind === "caption").map((item) => item.label)).toEqual(["1"]);
  });

  it("keeps same-line equations and inline-code caption titles, and fails closed on unclosed math", () => {
    expect(createSemanticSnapshot("$$ a=b $$\nCode: `actual`").bindings[0]?.object.kind).toBe("Equation");
    expect(createSemanticSnapshot("$$\nFigure: literal").semantics.captions).toEqual([]);
    expect(createSemanticSnapshot("`open\nFigure: actual").semantics.captions).toHaveLength(1);
  });

  it.each(["%%", "<!--"])("does not activate %s inside a cross-line code span", (comment) => {
    const source = `prefix \`example\nliteral ${comment} @[[#Actual]] [^x]\nend\`\n\n# Actual\n\n@[[#Actual]]`;
    const snapshot = createSemanticSnapshot(source);
    expect(snapshot.headings).toHaveLength(1);
    expect(snapshot.semantics.references.map((reference) => reference.line)).toEqual([6]);
  });

  it.each(["- x", "> x", "x %% TeX comment", "<!-- literal"])("keeps Markdown-looking TeX %j inside the equation carrier", (body) => {
    for (const ending of ["\n", "\r\n", "\r"]) for (const gap of ["", ending]) {
      const source = ["Code: Before", "$$", body, "$$"].join(ending) + ending + gap + "Figure: actual";
      const snapshot = createSemanticSnapshot(source);
      expect(snapshot.objects.map((object) => object.kind)).toEqual(["Equation"]);
      // Two adjacent captions are ambiguous by design; each side binds when isolated.
      const before = createSemanticSnapshot(["Code: Before", "$$", body, "$$"].join(ending));
      expect(before.bindings[0]?.caption.kind).toBe("Code");
      const afterSource = ["$$", body, "$$"].join(ending) + ending + gap + "Figure: actual";
      expect(createSemanticSnapshot(afterSource).bindings[0]?.caption.kind).toBe("Figure");
      expect(display(afterSource).find((item) => item.kind === "caption")?.objectKind).toBe("Equation");
      expect(exported(afterSource).captionTargets[0]?.derivedNumber).toBe("1");
    }
  });

  it("does not turn dollar delimiters inside cross-line code into an equation", () => {
    const source = "prefix `example\n$$\nFigure: literal\n$$\nend`\n\nFigure: actual";
    const snapshot = createSemanticSnapshot(source);
    expect(snapshot.objects).toEqual([]);
    expect(snapshot.numberedCaptions.map((caption) => caption.title)).toEqual(["actual"]);
  });

  it.each(["<!-- literal", "%% TeX comment"])("keeps %s literal on the equation opening line", (literal) => {
    for (const equation of [`$$ x ${literal} $$`, `$$ x ${literal}\n$$`]) {
      const source = `${equation}\n\nFigure: actual`;
      const snapshot = createSemanticSnapshot(source);
      expect(snapshot.objects.map((object) => object.kind)).toEqual(["Equation"]);
      expect(snapshot.bindings[0]?.caption.title).toBe("actual");
      expect(exported(source).captionTargets[0]?.derivedNumber).toBe("1");
    }
    expect(createSemanticSnapshot(`%%\n$$ x ${literal} $$\n%%\n\nFigure: actual`).objects).toEqual([]);
  });

  it.each(["Figure", "Table", "Equation", "Code"])("owns omitted-pipe %s rows before interpreting captions", (kind) => {
    for (const row of [`${kind}: Alpha | Beta`, `| ${kind}: Alpha | Beta`, `${kind}: Alpha | Beta |`, `| ${kind}: Alpha | Beta |`]) {
      const source = `| Name | Value |\n| --- | --- |\n${row}\n| Gamma | Delta |`;
      let rows = 0;
      parser.configure(Table).parse(source).iterate({ enter: (node) => { if (node.name === "TableRow") rows += 1; } });
      expect(rows).toBe(2);
      expect(createSemanticSnapshot(source).semantics.captions).toEqual([]);
      const plan = createCaptionInsertionPlan(source, 2, "Actual");
      expect(plan?.target.action).toBe("insert");
      expect(plan?.result).toBe(`Table: Actual\n\n${source}`);
      expect(exported(source).captionTargets).toEqual([]);
    }
  });

  it.each(["Figure", "Table", "Equation", "Code"])("retains zero-blank-line %s captions containing pipes", (kind) => {
    const table = "| Name | Value |\n| --- | --- |\n| Gamma | Delta |";
    for (const gap of ["\n", "\n\n"]) {
      const source = `${kind}: A | B${gap}${table}`;
      const snapshot = createSemanticSnapshot(source);
      expect(snapshot.bindings[0]?.caption).toMatchObject({ kind, title: "A | B" });
      expect(snapshot.bindings[0]?.object.kind).toBe("Table");
      expect(createCaptionInsertionPlan(source, source.indexOf("Name"), "Another")).toBeNull();
      const lower = source.replace(kind, kind.toLowerCase());
      expect(createCaptionInsertionPlan(lower, lower.indexOf("Name"), "A | B")?.target.action).toBe("normalize");
    }
  });

  it("shares bounded block passes per snapshot/export and indexes titles without per-reference scans", () => {
    const parse = vi.spyOn(MarkdownParser.prototype, "parse");
    const normalize = vi.spyOn(String.prototype, "normalize");
    try {
      const source = Array.from({ length: 300 }, (_, i) => `# Target${i}\n\n@[[#Target${i}]]`).join("\n\n");
      const snapshot = createSemanticSnapshot(source);
      expect(parse).toHaveBeenCalledTimes(2);
      expect(snapshot.titleTargets.size).toBe(300);
      parse.mockClear(); normalize.mockClear();
      expect(exported(source).references).toHaveLength(300);
      expect(parse).toHaveBeenCalledTimes(2);
      expect(normalize.mock.calls.length).toBeLessThan(300 * 20);
      expect(exported("# Figure: A\n\nFigure: A\n\n@[[#Figure: A]]").references).toEqual([]);
      expect(exported("# CAFÉ\n\n@[[#café]]").references).toHaveLength(1);
    } finally { parse.mockRestore(); normalize.mockRestore(); }
  });
});
