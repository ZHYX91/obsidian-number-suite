import type { DisplayDecorationPlan, SelectionSpan } from "./display-plan";
import { analyzeHeadingPrefix } from "../core/prefix-analysis";
import { numberHeadings } from "../core/numbering-engine";
import {
  blockTargetKey,
  headingTargetKey,
  numberCaptions,
  parseDocumentSemantics,
  uniqueHeadingTargets,
} from "../core/document-semantics";
import type { CaptionKind } from "../core/document-semantics";
import {
  numberDocumentNotes,
  parseDocumentNotes,
  type NoteKind,
} from "../core/note-semantics";
import type {
  CleanupTemplateSource,
  NumberingOptions,
  ParsedHeading,
} from "../core/types";

export interface SemanticDisplayDecoration {
  readonly kind: "caption" | "caption-alignment" | "reference" | "note-reference" | "note-definition";
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly label: string;
  readonly captionKind?: CaptionKind;
  readonly target?: string;
  readonly noteKind?: NoteKind;
  readonly noteId?: string;
  readonly noteNumber?: number;
}

export interface SemanticDisplayPlanOptions {
  readonly showCaptionNumbers: boolean;
  readonly centeredCaptionKinds: readonly CaptionKind[];
  readonly showCrossReferences: boolean;
  readonly showNoteNumbers: boolean;
  readonly noteSelections: readonly SelectionSpan[];
  readonly numbering: NumberingOptions;
  readonly templateSources: readonly CleanupTemplateSource[];
  readonly headingDisplayPlan: readonly DisplayDecorationPlan[];
  readonly composing: boolean;
}

export function formatNoteLabel(kind: NoteKind, number: number): string {
  return kind === "endnote" ? `E${number}` : String(number);
}

function selectionTouchesRange(
  from: number,
  to: number,
  selections: readonly SelectionSpan[],
): boolean {
  return selections.some((selection) => {
    if (selection.from === selection.to) {
      return selection.from >= from && selection.from <= to;
    }
    return selection.from <= to && selection.to >= from;
  });
}

function visibleHeadingLabels(
  headings: readonly ParsedHeading[],
  options: SemanticDisplayPlanOptions,
): ReadonlyMap<number, string> {
  const numbered = numberHeadings(headings, options.numbering);
  const labels = new Map<number, string>();
  for (const item of numbered) {
    const line = item.heading.line;
    const virtual = options.headingDisplayPlan.find((entry) => entry.line === line && entry.kind === "virtual");
    if (virtual != null) {
      labels.set(line, virtual.label);
      continue;
    }
    const conceal = options.headingDisplayPlan.find((entry) => entry.line === line && entry.kind === "conceal");
    const analysis = analyzeHeadingPrefix(item.heading, item.label, options.templateSources);
    const first = analysis.first;
    if (
      conceal == null
      && first != null
      && first.from === 0
      && first.confidence !== "low"
      && !analysis.suspicious
    ) {
      labels.set(line, first.numberCore);
    }
  }
  return labels;
}

export function createSemanticDisplayPlan(
  source: string,
  headings: readonly ParsedHeading[],
  options: SemanticDisplayPlanOptions,
): SemanticDisplayDecoration[] {
  if (
    options.composing
    || (
      !options.showCaptionNumbers
      && options.centeredCaptionKinds.length === 0
      && !options.showCrossReferences
      && !options.showNoteNumbers
    )
  ) return [];
  const semantics = parseDocumentSemantics(source);
  const numberedCaptions = numberCaptions(semantics.captions);
  const decorations: SemanticDisplayDecoration[] = [];
  const labelsByLine = new Map<number, string>();

  if (options.showCaptionNumbers) {
    for (const caption of numberedCaptions) {
      labelsByLine.set(caption.line, caption.label);
      decorations.push({
        kind: "caption",
        from: caption.colonFrom,
        to: caption.colonFrom,
        line: caption.line,
        label: String(caption.number),
        captionKind: caption.kind,
      });
    }
  }
  for (const caption of numberedCaptions) {
    if (!options.centeredCaptionKinds.includes(caption.kind)) continue;
    decorations.push({
      kind: "caption-alignment",
      from: caption.lineFrom,
      to: caption.lineFrom,
      line: caption.line,
      label: "",
      captionKind: caption.kind,
    });
  }
  if (options.showNoteNumbers) {
    const notes = numberDocumentNotes(parseDocumentNotes(source));
    for (const reference of notes.references) {
      if (selectionTouchesRange(reference.from, reference.to, options.noteSelections)) continue;
      decorations.push({
        kind: "note-reference",
        from: reference.from,
        to: reference.to,
        line: reference.line,
        label: formatNoteLabel(reference.kind, reference.number),
        noteKind: reference.kind,
        noteId: reference.id,
        noteNumber: reference.number,
      });
    }
    for (const definition of notes.definitions) {
      if (selectionTouchesRange(definition.from, definition.to, options.noteSelections)) continue;
      decorations.push({
        kind: "note-definition",
        from: definition.from,
        to: definition.to,
        line: definition.line,
        label: formatNoteLabel(definition.kind, definition.number),
        noteKind: definition.kind,
        noteId: definition.id,
        noteNumber: definition.number,
      });
    }
  }
  if (!options.showCrossReferences) return decorations;

  const visibleHeadings = visibleHeadingLabels(headings, options);
  for (const [line, label] of visibleHeadings) labelsByLine.set(line, label);
  const headingTargets = uniqueHeadingTargets(headings);

  for (const reference of semantics.references) {
    const targetLine = reference.kind === "heading"
      ? headingTargets.get(headingTargetKey(reference.target))
      : semantics.blockOwners.get(blockTargetKey(reference.target));
    const label = targetLine == null ? null : labelsByLine.get(targetLine) ?? null;
    if (label == null || label.trim().length === 0) continue;
    decorations.push({
      kind: "reference",
      from: reference.from,
      to: reference.from + 1,
      line: reference.line,
      label,
      target: reference.kind === "block" ? `^${reference.target}` : reference.target,
    });
  }
  return decorations;
}
