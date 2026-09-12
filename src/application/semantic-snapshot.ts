import { bindCaptionObjects, scanCaptionObjects } from "../core/caption-objects";
import { numberCaptions, parseDocumentSemantics, scanSemanticSourceLines } from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";
import { numberDocumentNotes, parseDocumentNotes } from "../core/note-semantics";

/** Source facts only: settings, selection and composition are projected by each view. */
export function createSemanticSnapshot(source: string) {
  const lines = scanSemanticSourceLines(source);
  const semantics = parseDocumentSemantics(source);
  const objects = scanCaptionObjects(source, lines);
  return {
    source,
    lines,
    semantics,
    objects,
    bindings: bindCaptionObjects(source, lines, semantics.captions, objects),
    numberedCaptions: numberCaptions(semantics.captions),
    headings: parseAtxHeadings(source),
    notes: numberDocumentNotes(parseDocumentNotes(source)),
  };
}

export type SemanticSnapshot = ReturnType<typeof createSemanticSnapshot>;

export class SemanticSnapshotCache {
  private readonly documents = new WeakMap<object, SemanticSnapshot>();

  get(document: object, source: () => string): SemanticSnapshot {
    let snapshot = this.documents.get(document);
    if (snapshot == null) {
      snapshot = createSemanticSnapshot(source());
      this.documents.set(document, snapshot);
    }
    return snapshot;
  }
}
