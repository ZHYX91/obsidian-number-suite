import { parser, Table } from "@lezer/markdown";
import { describe, expect, it } from "vitest";

import { createSemanticDisplayPlan } from "../../src/application/semantic-display-plan";
import { createSemanticSnapshot } from "../../src/application/semantic-snapshot";
import { DEFAULT_SETTINGS, toNumberingOptions } from "../../src/config/settings";

const marker = "[^probe]";
const header = "A | B\n--- | ---\n";
const cases = [
  { name: "paragraph title", body: `[L](url "open\n${marker}")` },
  { name: "pipe-containing paragraph title", body: `[L](url "open | X\n${marker}")` },
  { name: "same-cell title", body: `${header}[L](url "${marker}") | X` },
  { name: "second-cell title", body: `${header}X | [L](url "${marker}")` },
  { name: "escaped pipe in title", body: `${header}[L](url "a \\| ${marker}") | X` },
  { name: "destination", body: `${header}[L](url/${marker}) | X` },
  { name: "cross-cell title lookalike", body: `${header}[L](url "a | ${marker}") | X` },
  { name: "cross-row title lookalike", body: `${header}[L](url "open | X\n${marker} | end")` },
  { name: "visible prose after title", body: `[L](url "open\nend") ${marker} | X` },
  { name: "table after non-table prose", body: `prose\n${header}X | [L](url "open\n${marker}")` },
];
const containers = [
  { name: "root", wrap: (body: string) => body },
  { name: "quote", wrap: (body: string) => body.split("\n").map((line) => `> ${line}`).join("\n") },
  { name: "list", wrap: (body: string) => body.split("\n").map((line, index) => `${index === 0 ? "- " : "  "}${line}`).join("\n") },
  { name: "quoted list", wrap: (body: string) => body.split("\n").map((line, index) => `${index === 0 ? "> - " : ">   "}${line}`).join("\n") },
];

describe("ordinary GFM links against an independent native parser", () => {
  // No production inline or table extension participates in this oracle. In
  // particular, multi-row structural headers and merge markers belong to the
  // explicit Structural Tables contract in link-semantic-boundaries.test.ts.
  it.each(cases.flatMap((example) => containers.map((container) => ({
    name: example.name, container: container.name,
    source: `${container.wrap(example.body)}\n\n[^probe]: Example`,
  }))))("matches $name inside $container", ({ source }) => {
    const markerStart = source.indexOf(marker);
    let protectedByNativeSyntax = false;
    parser.configure(Table).parse(source).iterate({ enter(node) {
      if (["URL", "LinkTitle", "InlineCode", "CodeBlock", "HTMLBlock"].includes(node.name)
        && node.from <= markerStart && node.to >= markerStart + marker.length) {
        protectedByNativeSyntax = true;
      }
    } });
    const expectedIds = protectedByNativeSyntax ? [] : ["probe"];
    const expectedLabels = protectedByNativeSyntax ? [] : ["1"];
    const snapshot = createSemanticSnapshot(source);
    expect(snapshot.notes.references.map(({ id }) => id)).toEqual(expectedIds);

    const display = createSemanticDisplayPlan(source, snapshot.headings, {
      showCaptionNumbers: true, centeredCaptionKinds: [], showCrossReferences: true,
      showNoteNumbers: true, noteSelections: [], numbering: toNumberingOptions(DEFAULT_SETTINGS),
      templateSources: [], headingDisplayPlan: [], composing: false,
    }, snapshot);
    expect(display.filter((item) => item.kind === "note-reference").map(({ label }) => label))
      .toEqual(expectedLabels);
  });
});
