import { scanMarkdownProtectedLines } from "../core/markdown-protection";
import { bindCaptionObjects, scanCaptionObjects } from "../core/caption-objects";
import { createSemanticTitleIndex, numberCaptions, parseDocumentSemantics, scanSemanticSourceLines } from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";
import { noteContainerLines, numberDocumentNotes, parseDocumentNotes } from "../core/note-semantics";

/** Source facts only: settings, selection and composition are projected by each view. */
export function createSemanticSnapshot(source: string) {
  const protectedLines = scanMarkdownProtectedLines(source);
  const noteLines = noteContainerLines(source, protectedLines);
  const lines = scanSemanticSourceLines(source, protectedLines, noteLines);
  const semantics = parseDocumentSemantics(source, lines);
  const headings = parseAtxHeadings(source, protectedLines, noteLines);
  const objects = scanCaptionObjects(source, lines);
  let headingOrCaptionLines: Set<number> | undefined;
  return {
    source,
    lines,
    semantics,
    objects,
    bindings: bindCaptionObjects(source, lines, semantics.captions, objects),
    numberedCaptions: numberCaptions(semantics.captions),
    headings,
    get headingOrCaptionLines(): ReadonlySet<number> {
      if (headingOrCaptionLines == null) {
        headingOrCaptionLines = new Set(headings.map((heading) => heading.line));
        for (const caption of semantics.captions) headingOrCaptionLines.add(caption.line);
      }
      return headingOrCaptionLines;
    },
    titleTargets: createSemanticTitleIndex(headings, semantics.captions),
    notes: numberDocumentNotes(parseDocumentNotes(source, protectedLines)),
  };
}

export type SemanticSnapshot = ReturnType<typeof createSemanticSnapshot>;

export class SemanticSnapshotCache {
  private readonly documents = new WeakMap<object, SemanticSnapshot>();

  peek(document: object): SemanticSnapshot | undefined {
    return this.documents.get(document);
  }

  get(document: object, source: () => string): SemanticSnapshot {
    let snapshot = this.documents.get(document);
    if (snapshot == null) {
      snapshot = createSemanticSnapshot(source());
      this.documents.set(document, snapshot);
    }
    return snapshot;
  }
}
