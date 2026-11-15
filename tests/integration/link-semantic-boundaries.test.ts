import { parser, Table } from "@lezer/markdown";
import { describe, expect, it } from "vitest";

import { createSemanticSnapshot } from "../../src/application/semantic-snapshot";
import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { DEFAULT_SETTINGS, toNumberingOptions } from "../../src/config/settings";
import { inlineSemanticMarkers } from "../../src/core/markdown-inline-markers";
import { exportSemanticSnapshotV2, NUMBER_SUITE_INTEROP_SCHEMA_V2 } from "../../src/integration/semantic-export";

const hidden = "[^ghost] @[[#Target🐈|hidden]]";
const visible = "[^visible] @[[#Target🐈|label]]";
const endings = [
  { name: "LF", text: "\n" }, { name: "CRLF", text: "\r\n" }, { name: "CR", text: "\r" },
];

function document(body: string, ending: string): string {
  return ["# Target🐈", "", body, "", "Prose [^real] @[[#Target🐈|body]]", "",
    "[^ghost]: Ghost", "[^visible]: Visible", "[^real]: Real"].join("\n").replace(/\n/gu, ending);
}

function assertConsumers(source: string, ids: readonly string[], aliases: readonly (string | null)[]): void {
  const snapshot = createSemanticSnapshot(source);
  expect(snapshot.semantics.captions).toEqual([]);
  expect(snapshot.notes.references.map(({ id, number }) => [id, number]))
    .toEqual(ids.map((id, index) => [id, index + 1]));
  const references = aliases.map((alias) => `@[[#Target🐈${alias == null ? "" : `|${alias}`}]]`);
  expect(snapshot.semantics.references.map(({ from, to }) => source.slice(from, to))).toEqual(references);
  const display = createSemanticDisplayPlan(source, snapshot.headings, {
    showCaptionNumbers: true, centeredCaptionKinds: [], showCrossReferences: true,
    showNoteNumbers: true, noteSelections: [], numbering: toNumberingOptions(DEFAULT_SETTINGS),
    templateSources: [], headingDisplayPlan: [], composing: false,
  }, snapshot);
  expect(display.filter((item) => item.kind === "note-reference").map((item) => item.label))
    .toEqual(ids.map((_id, index) => String(index + 1)));
  expect(display.filter((item) => item.kind === "reference").map(({ from, to }) => source.slice(from, to)))
    .toEqual(references);
  const exported = exportSemanticSnapshotV2(DEFAULT_SETTINGS, {
    schema: NUMBER_SUITE_INTEROP_SCHEMA_V2, authoredMarkdown: source, frontmatter: null,
  });
  expect(exported.references.map(({ sourceStartUtf16, sourceEndUtf16 }) => source.slice(sourceStartUtf16, sourceEndUtf16)))
    .toEqual(references);
  expect(exported.references.map(({ sourceStartUtf16 }) => sourceStartUtf16))
    .toEqual(references.map((reference) => source.indexOf(reference)));
}

describe("Markdown links through shared semantic consumers", () => {
  it("retains one outer link around supported visible markers in the shared parser", () => {
    const body = `[Contact name@example.test ${visible}](target "title\n${hidden}")`;
    const nodes: Array<{ name: string; text: string }> = [];
    parser.configure(inlineSemanticMarkers()).parse(body).iterate({ enter(node) {
      if (["Link", "NumberSuiteSemanticMarker", "LinkTitle"].includes(node.name)) {
        nodes.push({ name: node.name, text: body.slice(node.from, node.to) });
      }
    } });
    expect(nodes.filter(({ name }) => name === "Link")).toEqual([{ name: "Link", text: body }]);
    expect(nodes.filter(({ name }) => name === "NumberSuiteSemanticMarker").map(({ text }) => text))
      .toEqual(["[^visible]", "@[[#Target🐈|label]]"]);
    expect(nodes.find(({ name }) => name === "LinkTitle")?.text).toBe(`"title\n${hidden}"`);
    assertConsumers(document(body, "\n"), ["visible", "real"], ["label", "body"]);
  });

  it.each(["(target)", "[reference]"])("does not turn a real nested link %s into visible marker text", (suffix) => {
    const body = `[outer [^visible]${suffix}](invalid ${hidden})`;
    const tree = parser.configure(inlineSemanticMarkers()).parse(body);
    expect(tree.toString()).not.toContain("NumberSuiteSemanticMarker");
    const links: string[] = [];
    tree.iterate({ enter(node) { if (node.name === "Link") links.push(body.slice(node.from, node.to)); } });
    expect(links).toContain(`[^visible]${suffix}`);
    expect(links).not.toContain(body);
    assertConsumers(document(body, "\n"), ["visible", "ghost", "real"], ["hidden", "body"]);
  });

  const titles = [
    { label: "multiline double quote", body: `[label](target "title\n${hidden}")` },
    { label: "multiline single quote", body: `[label](target 'title\n${hidden}')` },
    { label: "multiline parentheses", body: `[label](target (title\n${hidden}))` },
    { label: "title on the next line", body: `[label](target\n"${hidden}")` },
    { label: "same-line double quote", body: `[label](target "${hidden}")` },
    { label: "same-line single quote", body: `[label](target '${hidden}')` },
    { label: "same-line parentheses", body: `[label](target (${hidden}))` },
  ];
  it.each(endings.flatMap((ending) => titles.map((title) => ({ ...title, ending }))))(
    "excludes $label contents for $ending.name", ({ body, ending }) => {
      expect(parser.parse(body).toString()).toContain("LinkTitle");
      assertConsumers(document(body, ending.text), ["real"], ["body"]);
    },
  );

  it.each(endings)("keeps visible link text and same-line surrounding prose for $name", ({ text }) => {
    for (const title of [`"${hidden}"`, `"title\n${hidden}"`, `'title\n${hidden}'`, `(title\n${hidden})`]) {
      const source = document(`[See ${visible}](target ${title})`, text);
      assertConsumers(source, ["visible", "real"], ["label", "body"]);
    }
    assertConsumers(document(`[label](target "${hidden}") after ${visible}`, text), ["visible", "real"], ["label", "body"]);
  });

  it.each(endings)("protects only valid destination ranges for $name", ({ text }) => {
    for (const destination of ["target/[^ghost]/@[[#Target🐈|hidden]]", "<target/[^ghost]/@[[#Target🐈|hidden]]>"]) {
      const source = document(`[label](${destination})`, text);
      expect(parser.parse(source.replace(/\r\n|\r/gu, "\n")).toString()).toContain("URL");
      assertConsumers(source, ["real"], ["body"]);
    }
  });

  const invalid = [
    `[label](target invalid ${hidden})`,
    `[label](target "unclosed\n${hidden})`,
    `[label](target "title\n\n${hidden}")`,
    `[label](<target/\n${hidden}>)`,
    `prose ](target ${hidden})`,
  ];
  it.each(endings.flatMap((ending) => invalid.map((body) => ({ body, ending }))))(
    "retains invalid or unclosed link text $body for $ending.name", ({ body, ending }) => {
      expect(parser.parse(body).toString()).not.toMatch(/LinkTitle|URL/u);
      assertConsumers(document(body, ending.text), ["ghost", "real"], ["hidden", "body"]);
    },
  );

  it.each(["%%", "<!--", "$$"])("keeps %s literal inside a title without consuming later prose", (literal) => {
    for (const ending of endings) {
      const body = `[label](target "title ${literal}\n${hidden}")`;
      expect(parser.parse(body).toString()).toContain("LinkTitle");
      assertConsumers(document(body, ending.text), ["real"], ["body"]);
    }
  });

  it.each(endings)("does not let title contents declare captions or equations for $name", ({ text }) => {
    const body = `[label](target "title\n$$\nFigure: ${hidden}\n$$\nend")`;
    expect(parser.parse(body).toString()).toContain("LinkTitle");
    const source = document(body, text);
    assertConsumers(source, ["real"], ["body"]);
    expect(createSemanticSnapshot(source).objects).toEqual([]);
  });

});

const tableMarker = "[^ghost] @[[#Target🐈]]";

describe("native GFM table link boundaries through semantic consumers", () => {
  it.each([
    `| [label](target "title | ${tableMarker}") |`,
    `| [label](target | "${tableMarker}") |`,
    `| [label](target "title | ${tableMarker} |\n| more | end") |`,
    `| [label](target "title | value |\n| ${tableMarker} | end") |`,
  ])("does not let a link cross native table cells or rows: %s", (body) => {
    for (const ending of endings) {
      const table = `| Name | Value |\n| --- | --- |\n${body}`;
      const native = parser.configure(Table).parse(table).toString();
      expect(native).toContain("Table(");
      expect(native).not.toContain("LinkTitle");
      assertConsumers(document(table, ending.text), ["ghost", "real"], [null, "body"]);
    }
  });

  it.each(["", "escaped \\| pipe "])("keeps a real title inside one native cell: %s", (prefix) => {
    const table = `| Name | Value |\n| --- | --- |\n| [label](target "${prefix}${tableMarker}") | value |`;
    expect(parser.configure(Table).parse(table).toString()).toContain("LinkTitle");
    assertConsumers(document(table, "\n"), ["real"], ["body"]);
  });

  it.each(["quote", "list"])("respects table cells and visible prose inside a %s", (container) => {
    const wrap = (body: string) => body.split("\n").map((line, index) =>
      `${container === "quote" ? "> " : index === 0 ? "- " : "  "}${line}`).join("\n");
    for (const ending of endings) {
      const table = wrap(`A | B\n--- | ---\n[label](target "open | x\n${tableMarker} | end")`);
      const native = parser.configure(Table).parse(table).toString();
      expect(native).toContain("Table(");
      expect(native).not.toContain("LinkTitle");
      assertConsumers(document(table, ending.text), ["ghost", "real"], [null, "body"]);
      const sameCell = wrap(`A | B\n--- | ---\n[label](target "${tableMarker}") | value`);
      expect(parser.configure(Table).parse(sameCell).toString()).toContain("LinkTitle");
      assertConsumers(document(sameCell, ending.text), ["real"], ["body"]);
      const prose = wrap(`[label](target "title\n${hidden}")`);
      expect(parser.configure(Table).parse(prose).toString()).toContain("LinkTitle");
      assertConsumers(document(prose, ending.text), ["real"], ["body"]);
    }
  });

  it("does not let a false table title suppress a real Obsidian comment", () => {
    const table = `| Name | Value |\n| --- | --- |\n| [label](target "title | %% ${tableMarker} |\n| end") %% ${visible} | value |`;
    expect(parser.configure(Table).parse(table).toString()).not.toContain("LinkTitle");
    assertConsumers(document(table, "\n"), ["visible", "real"], ["label", "body"]);
  });

  it.each([
    "<!--\nA | B\n- | -\n-->",
    "```md\nA | B\n- | -\n```",
    "prefix %%\nA | B\n- | -\n%%",
  ])("does not extend a literal table example into a following valid link: %s", (prefix) => {
    const body = `${prefix}\n[label](target "title\n${hidden}")`;
    if (!prefix.startsWith("prefix %%")) {
      const native = parser.configure(Table).parse(body).toString();
      expect(native).toContain("LinkTitle");
      expect(native).not.toContain("Table(");
    }
    assertConsumers(document(body, "\n"), ["real"], ["body"]);
  });

  it("preserves a valid paragraph title containing table-like lines", () => {
    const body = `[label](target "title | literal\ncontinuation\nA | B\n--- | ---\n${hidden}\nend")`;
    const native = parser.configure(Table).parse(body).toString();
    expect(native).toContain("LinkTitle");
    expect(native).not.toContain("Table(");
    assertConsumers(document(body, "\n"), ["real"], ["body"]);
  });

});

describe("Structural Tables extension boundaries through semantic consumers", () => {
  // These expectations follow the product's structural-row contract. Native GFM
  // deliberately does not act as an oracle for opaque structural code cells.
  it.each([
    { kind: "internal divider", table: `Name | Value\n--- || ---\n\`code ${tableMarker} | still code\` | [^visible]` },
    { kind: "multiple header rows", table: `Group | Value\nName | Value\n--- | ---\n\`code ${tableMarker} | still code\` | [^visible]` },
    { kind: "merge marker", table: `Name | Value\n--- | ---\n\`code ${tableMarker} | still code\` | [^visible]\njoined | ^` },
  ])("retains code-cell ownership with $kind", ({ table }) => {
    for (const ending of endings) {
      assertConsumers(document(table, ending.text), ["visible", "real"], ["body"]);
    }
  });
});
