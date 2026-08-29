import type { DisplayDecorationPlan, SelectionSpan } from "./display-plan";
import { analyzeHeadingPrefix } from "../core/prefix-analysis";
import { numberHeadings } from "../core/numbering-engine";
import {
  blockTargetKey,
  numberCaptions,
  parseDocumentSemantics,
  resolveUniqueSemanticTitleTarget,
  withoutTrailingBlockId,
} from "../core/document-semantics";
import type { CaptionKind, NumberedCaption } from "../core/document-semantics";
import {
  bindCaptionObjects,
  imageTextAtOffset,
  scanCaptionObjects,
  type CaptionSourcePlacement,
} from "../core/caption-objects";
import type { CaptionPlacement } from "../config/settings";
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
  readonly targetLine?: number;
  readonly targetKind?: "heading" | "caption";
  readonly pillFrom?: number;
  readonly pillTo?: number;
  readonly noteKind?: NoteKind;
  readonly noteId?: string;
  readonly noteNumber?: number;
  readonly displayLabel?: string;
  readonly sourcePlacement?: CaptionSourcePlacement;
  readonly displayPlacement?: CaptionPlacement;
  readonly objectFrom?: number;
  readonly objectTo?: number;
  readonly objectKind?: CaptionKind;
  readonly tooltipTitle?: string;
  readonly tooltipBody?: string;
  readonly captionCentered?: boolean;
}

export interface SemanticDisplayPlanOptions {
  readonly showCaptionNumbers: boolean;
  readonly centeredCaptionKinds: readonly CaptionKind[];
  readonly captionPlacements?: Readonly<Record<CaptionKind, CaptionPlacement>>;
  readonly showImageCaptionTooltips?: boolean;
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

function headingTitle(
  heading: ParsedHeading,
  visibleLabel: string | null,
  templateSources: readonly CleanupTemplateSource[],
): string {
  const content = withoutTrailingBlockId(heading.content);
  if (visibleLabel == null) return content;
  const first = analyzeHeadingPrefix(heading, visibleLabel, templateSources).first;
  if (first?.from === 0 && first.numberCore === visibleLabel) {
    return withoutTrailingBlockId(heading.content.slice(first.to));
  }
  return content;
}

function captionReferenceLabel(
  caption: NumberedCaption,
  alias: string | null,
  showNumber: boolean,
): string {
  const title = alias ?? caption.title;
  const prefix = showNumber ? `${caption.kind} ${caption.number}` : caption.kind;
  return `${prefix}: ${title}`;
}

function captionDisplayLabel(caption: NumberedCaption, showNumber: boolean): string {
  const prefix = showNumber ? `${caption.kind} ${caption.number}` : caption.kind;
  return `${prefix}: ${caption.title}`;
}

function normalizedTooltipPart(value: string): string {
  return value.normalize("NFC").trim().replace(/[ \t]+/gu, " ").toLowerCase();
}

export interface ImageTooltipContent {
  readonly title: string;
  readonly body: string;
}

export function imageTooltipContentAtOffset(
  source: string,
  offset: number,
  showCaptionNumbers: boolean,
): ImageTooltipContent | null {
  const semantics = parseDocumentSemantics(source);
  const numbered = numberCaptions(semantics.captions);
  const object = scanCaptionObjects(source).find((candidate) => (
    candidate.kind === "Figure" && offset >= candidate.from && offset <= candidate.to
  ));
  if (object != null) {
    const binding = bindCaptionObjects(source).find((candidate) => candidate.object.from === object.from);
    const caption = binding == null
      ? null
      : numbered.find((candidate) => candidate.line === binding.caption.line) ?? null;
    const title = caption == null ? "" : captionDisplayLabel(caption, showCaptionNumbers);
    const body = caption != null
      && normalizedTooltipPart(caption.title) === normalizedTooltipPart(object.replacementText)
      ? ""
      : object.replacementText;
    return title.length === 0 && body.length === 0 ? null : { title, body };
  }
  const image = imageTextAtOffset(source, offset);
  return image?.replacementText ? { title: "", body: image.replacementText } : null;
}

export function createSemanticDisplayPlan(
  source: string,
  headings: readonly ParsedHeading[],
  options: SemanticDisplayPlanOptions,
): SemanticDisplayDecoration[] {
  if (options.composing) return [];
  const semantics = parseDocumentSemantics(source);
  const numberedCaptions = numberCaptions(semantics.captions);
  const bindings = new Map(bindCaptionObjects(source).map((binding) => (
    [binding.caption.line, binding] as const
  )));
  const decorations: SemanticDisplayDecoration[] = [];
  for (const caption of numberedCaptions) {
    if (selectionTouchesRange(caption.lineFrom, caption.lineTo, options.noteSelections)) continue;
    const binding = bindings.get(caption.line);
    const displayLabel = captionDisplayLabel(caption, options.showCaptionNumbers);
    const replacementText = binding?.object.replacementText ?? "";
    const tooltipBody = normalizedTooltipPart(replacementText) === normalizedTooltipPart(caption.title)
      ? ""
      : replacementText;
    decorations.push({
      kind: "caption",
      from: caption.colonFrom,
      to: caption.colonFrom,
      pillFrom: caption.lineFrom,
      pillTo: caption.lineTo,
      line: caption.line,
      label: options.showCaptionNumbers ? String(caption.number) : "",
      displayLabel,
      captionKind: caption.kind,
      captionCentered: options.centeredCaptionKinds.includes(caption.kind),
      ...(binding == null ? {} : {
        sourcePlacement: binding.sourcePlacement,
        displayPlacement: options.captionPlacements?.[caption.kind] ?? "above",
        objectFrom: binding.object.visualFrom,
        objectTo: binding.object.visualTo,
        objectKind: binding.object.kind,
      }),
      ...(options.showImageCaptionTooltips === true && caption.kind === "Figure" && binding != null ? {
        tooltipTitle: displayLabel,
        tooltipBody,
      } : {}),
    });
  }
  for (const caption of numberedCaptions) {
    if (selectionTouchesRange(caption.lineFrom, caption.lineTo, options.noteSelections)) continue;
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
  const headingsByLine = new Map(headings.map((heading) => [heading.line, heading] as const));
  const captionsByLine = new Map(numberedCaptions.map((caption) => [caption.line, caption] as const));

  for (const reference of semantics.references) {
    if (selectionTouchesRange(reference.from, reference.to, options.noteSelections)) continue;
    const resolved = reference.kind === "title"
      ? resolveUniqueSemanticTitleTarget(reference.target, headings, semantics.captions)
      : null;
    const targetLine = reference.kind === "block"
      ? semantics.blockOwners.get(blockTargetKey(reference.target))
      : resolved?.line;
    if (targetLine == null) continue;
    const heading = headingsByLine.get(targetLine);
    const caption = captionsByLine.get(targetLine);
    const targetKind = resolved?.kind ?? (heading != null ? "heading" : caption != null ? "caption" : null);
    if (targetKind == null) continue;
    let label: string;
    if (targetKind === "caption" && caption != null) {
      label = captionReferenceLabel(caption, reference.alias, options.showCaptionNumbers);
    } else if (targetKind === "heading" && heading != null) {
      const number = visibleHeadings.get(targetLine) ?? null;
      const title = reference.alias ?? headingTitle(heading, number, options.templateSources);
      label = number == null || title === number || title.startsWith(`${number} `)
        ? title
        : `${number} ${title}`;
    } else {
      continue;
    }
    if (label.trim().length === 0) continue;
    decorations.push({
      kind: "reference",
      from: reference.from,
      to: reference.to,
      line: reference.line,
      label,
      target: reference.kind === "block" ? `^${reference.target}` : reference.target,
      targetLine,
      targetKind,
    });
  }
  return decorations;
}
