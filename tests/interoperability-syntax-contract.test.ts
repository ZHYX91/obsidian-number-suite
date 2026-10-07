import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  numberCaptions,
  parseDocumentSemantics,
} from "../src/core/document-semantics";
import {
  numberDocumentNotes,
  parseDocumentNotes,
} from "../src/core/note-semantics";

type CaptionExpectation = {
  kind: string;
  title: string;
  block_id: string | null;
  number: number;
};

type ReferenceExpectation = {
  kind: string;
  target: string;
  alias: string | null;
};

type NoteExpectation = {
  kind: string;
  id: string;
  number?: number;
};

type CorpusCase = {
  id: string;
  domain: "document" | "notes";
  source: string;
  expected: {
    captions?: CaptionExpectation[];
    references?: ReferenceExpectation[];
    definitions?: NoteExpectation[];
    numbered_references?: NoteExpectation[];
  };
};

type Corpus = {
  schema: string;
  cases: CorpusCase[];
  unresolved_boundaries: { id: string; description: string }[];
};

const corpus = JSON.parse(
  readFileSync(new URL("./fixtures/interoperability-syntax-contract.json", import.meta.url), "utf8"),
) as Corpus;

describe("Number Suite interoperability syntax contract", () => {
  it("has a stable corpus identity and keeps unresolved cross-plugin boundaries explicit", () => {
    expect(corpus.schema).toBe("number-suite.interoperability-corpus.v1");
    expect(corpus.unresolved_boundaries.map((item) => item.id)).toContain(
      "structural-table-reference-alias-pipe",
    );
  });

  for (const fixture of corpus.cases) {
    it(fixture.id, () => {
      if (fixture.domain === "document") {
        const semantics = parseDocumentSemantics(fixture.source);
        if (fixture.expected.captions !== undefined) {
          expect(
            numberCaptions(semantics.captions).map((caption) => ({
              kind: caption.kind,
              title: caption.title,
              block_id: caption.blockId,
              number: caption.number,
            })),
          ).toEqual(fixture.expected.captions);
        }
        if (fixture.expected.references !== undefined) {
          expect(
            semantics.references.map((reference) => ({
              kind: reference.kind,
              target: reference.target,
              alias: reference.alias,
            })),
          ).toEqual(fixture.expected.references);
        }
        return;
      }

      const semantics = parseDocumentNotes(fixture.source);
      if (fixture.expected.definitions !== undefined) {
        expect(
          semantics.definitions.map((note) => ({
            kind: note.kind,
            id: note.id,
          })),
        ).toEqual(fixture.expected.definitions);
      }
      if (fixture.expected.references !== undefined) {
        expect(
          semantics.references.map((note) => ({
            kind: note.kind,
            id: note.id,
          })),
        ).toEqual(fixture.expected.references);
      }
      if (fixture.expected.numbered_references !== undefined) {
        expect(
          numberDocumentNotes(semantics).references.map((note) => ({
            kind: note.kind,
            id: note.id,
            number: note.number,
          })),
        ).toEqual(fixture.expected.numbered_references);
      }
    });
  }
});
