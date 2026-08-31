import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseDocumentSemantics } from "../../src/core/document-semantics";

const fixturePath = fileURLToPath(
  new URL("../../acceptance/fixtures/Number Suite.md", import.meta.url),
);

describe("authoritative acceptance fixture", () => {
  it("contains two explicit same-line references for selective Live Preview reveal", () => {
    const source = readFileSync(fixturePath, "utf8");
    const references = parseDocumentSemantics(source).references;

    expect(references.map(({ kind, target, alias }) => ({ kind, target, alias }))).toEqual([
      { kind: "title", target: "Figure: Square edge", alias: null },
      { kind: "title", target: "Figure: Square edge", alias: "the square edge" },
    ]);
    expect(new Set(references.map((reference) => reference.line)).size).toBe(1);
    expect(references.map((reference) => source.slice(reference.from, reference.to))).toEqual([
      "@[[#Figure: Square edge]]",
      "@[[#Figure: Square edge|the square edge]]",
    ]);
  });
});
