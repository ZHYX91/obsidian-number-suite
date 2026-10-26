import { parser } from "@lezer/markdown";
import { describe, expect, it } from "vitest";

import { createDisplayPlan } from "../../src/application/display-plan";
import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { cleanupTemplateSources, DEFAULT_SETTINGS, toNumberingOptions } from "../../src/config/settings";
import { scanCaptionObjects } from "../../src/core/caption-objects";
import { scanSemanticSourceLines } from "../../src/core/document-semantics";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { numberDocumentNotes, parseDocumentNotes } from "../../src/core/note-semantics";
import { exportSemanticSnapshotV2, NUMBER_SUITE_INTEROP_SCHEMA_V2 } from "../../src/integration/semantic-export";

const settings = { ...DEFAULT_SETTINGS, selectedSchemeId: "hierarchical", showVirtualNumbers: true, showNoteNumbers: true };
const numbering = toNumberingOptions(settings);
const templateSources = cleanupTemplateSources(settings);

function display(source: string) {
  const headings = parseAtxHeadings(source);
  const headingDisplayPlan = createDisplayPlan(headings, {
    showVirtualNumbers: true, concealStoredNumbers: false, numbering,
    cleanupScope: "templates", templateSources, revealOnActiveLine: false, selections: [], composing: false,
  });
  return createSemanticDisplayPlan(source, headings, {
    showCaptionNumbers: true, centeredCaptionKinds: [], showCrossReferences: true,
    showNoteNumbers: true, noteSelections: [], numbering, templateSources, headingDisplayPlan, composing: false,
  });
}

function snapshot(source: string) {
  return exportSemanticSnapshotV2(settings, { schema: NUMBER_SUITE_INTEROP_SCHEMA_V2, authoredMarkdown: source, frontmatter: null });
}

describe("literal blocks through production semantic consumers", () => {
  it.each(["\n", "\r\n", "\r"])("numbers only real first references with %j source offsets", (newline) => {
    const source = ["    [^b]", "", "正文🐈先引用[^a]，再引用[^b]。", "", "[^a]: A", "[^b]: B"].join(newline);
    expect(parser.parse(source.replace(/\r\n?|\n/gu, "\n")).toString()).toContain("CodeBlock(CodeText)");
    const numbered = numberDocumentNotes(parseDocumentNotes(source));
    expect(numbered.references.map(({ id, number, line, from, to }) => ({ id, number, line, text: source.slice(from, to) }))).toEqual([
      { id: "a", number: 1, line: 2, text: "[^a]" },
      { id: "b", number: 2, line: 2, text: "[^b]" },
    ]);
    const plan = display(source);
    expect(plan.filter((entry) => entry.kind === "note-reference").map(({ label, line, from, to }) => ({ label, line, text: source.slice(from, to) }))).toEqual([
      { label: "1", line: 2, text: "[^a]" }, { label: "2", line: 2, text: "[^b]" },
    ]);
    expect(plan.filter((entry) => entry.kind === "note-definition").map(({ label, line }) => ({ label, line }))).toEqual([
      { label: "1", line: 4 }, { label: "2", line: 5 },
    ]);
  });

  it.each([
    "    [^b] @[[#Target]]",
    "\t[^b] @[[#Target]]",
    "- item\n\n      [^b] @[[#Target]]",
    ">     [^b] @[[#Target]]",
  ])("excludes real root or container CodeBlocks: %j", (literal) => {
    expect(parser.parse(literal).toString()).toContain("CodeBlock");
    const source = `# Target\n\n${literal}\n\n正文[^a] then[^b] @[[#Target]]\n\n[^a]: A\n[^b]: B`;
    expect(numberDocumentNotes(parseDocumentNotes(source)).references.map(({ id, number }) => ({ id, number })))
      .toEqual([{ id: "a", number: 1 }, { id: "b", number: 2 }]);
    expect(snapshot(source).references.map(({ sourceStartUtf16, sourceEndUtf16 }) => source.slice(sourceStartUtf16, sourceEndUtf16)))
      .toEqual(["@[[#Target]]"]);
  });

  it.each([
    "paragraph\n    @[[#Target]] [^b]",
    "paragraph\n\t@[[#Target]] [^b]",
    "- paragraph\n    @[[#Target]] [^b]",
    "> paragraph\n>     @[[#Target]] [^b]",
  ])("retains real paragraph continuations in display and export: %j", (paragraph) => {
    expect(parser.parse(paragraph).toString()).not.toContain("CodeBlock");
    const source = `# Target\n\n${paragraph}\n\n正文[^a] then[^b]\n\n[^a]: A\n[^b]: B`;
    expect(numberDocumentNotes(parseDocumentNotes(source)).references.map(({ id, number }) => ({ id, number })))
      .toEqual([{ id: "b", number: 1 }, { id: "a", number: 2 }, { id: "b", number: 1 }]);
    expect(display(source).filter((entry) => entry.kind === "reference").map(({ label }) => label)).toEqual(["1 Target"]);
    const exported = snapshot(source);
    expect(exported.references).toHaveLength(1);
    expect(exported.references[0]).toMatchObject({ targetSourceStartUtf16: 0, targetSourceEndUtf16: 8 });
    expect(source.slice(exported.references[0]!.sourceStartUtf16, exported.references[0]!.sourceEndUtf16)).toBe("@[[#Target]]");
  });

  it.each(["# Before", "paragraph\n", "---"])("starts indented code after a completed block boundary: %j", (before) => {
    const source = `# Target\n\n${before}\n    @[[#Target]] [^b]\n\n正文[^a] then[^b]\n\n[^a]: A\n[^b]: B`;
    expect(parser.parse(source).toString()).toContain("CodeBlock");
    expect(snapshot(source).references).toEqual([]);
    expect(display(source).filter((entry) => entry.kind === "note-reference").map(({ label }) => label)).toEqual(["1", "2"]);
  });

  it("keeps actual root fence openings available to Code caption binding", () => {
    const source = "Code: Example ^code\n```ts\n    [^b] @[[#Hidden]]\n```\n\n正文[^a] then[^b]\n\n[^a]: A\n[^b]: B";
    expect(scanSemanticSourceLines(source).filter((line) => line.fenceOpening).map((line) => line.number)).toEqual([1]);
    expect(scanCaptionObjects(source).map(({ kind, from, to }) => ({ kind, text: source.slice(from, to) })))
      .toEqual([{ kind: "Code", text: "```ts\n    [^b] @[[#Hidden]]\n```" }]);
    expect(display(source).filter((entry) => entry.kind === "note-reference").map(({ label }) => label)).toEqual(["1", "2"]);
    expect(snapshot(source).captionTargets[0]).toMatchObject({ kind: "Code", targetId: "code", enabled: true });
  });

  it("does not promote a fenced-code lookalike inside an Obsidian comment", () => {
    const source = "%%\n```md\n%%\n# Target\nparagraph\n    @[[#Target]] [^a]\n\n[^a]: A";
    expect(scanSemanticSourceLines(source).some((line) => line.fenceOpening)).toBe(false);
    expect(snapshot(source).references).toHaveLength(1);
    expect(display(source).filter((entry) => entry.kind === "note-reference").map(({ label }) => label)).toEqual(["1"]);
  });
});
