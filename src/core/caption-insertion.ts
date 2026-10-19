import {
  bindCaptionObjects,
  scanCaptionObjects,
  type CaptionObject,
} from "./caption-objects";
import {
  CAPTION_KINDS,
  parseDocumentSemantics,
  scanSemanticSourceLines,
  type CaptionKind,
  type SemanticSourceLine,
} from "./document-semantics";
import { maskInlineProtectedSyntax } from "./markdown-protection";

export type InsertableCaptionKind = CaptionKind;
export type CaptionInsertionAction = "insert" | "normalize" | "relocate";

export interface CaptionInsertionTarget {
  readonly kind: InsertableCaptionKind;
  readonly action: CaptionInsertionAction;
  readonly line: number;
  readonly from: number;
  readonly to: number;
  readonly suggestedTitle: string;
  readonly objectFrom: number;
  readonly objectTo: number;
  readonly objectFirstLine: number;
  readonly objectLastLine: number;
  readonly captionIndent: string;
  readonly captionSuffix: string;
}

export interface CaptionInsertionChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly line: number;
  readonly before: string;
  readonly after: string;
}

export interface CaptionInsertionPlan {
  readonly source: string;
  readonly target: CaptionInsertionTarget;
  readonly changes: readonly CaptionInsertionChange[];
  readonly result: string;
}

const STANDALONE_BLOCK_ID = /^ {0,3}\^[A-Za-z0-9-]+[ \t]*$/u;

interface CaptionLineMatch {
  readonly line: SemanticSourceLine;
  readonly kind: CaptionKind;
  readonly exact: boolean;
  readonly title: string;
  readonly placement: "above" | "below";
  readonly sourceTo: number;
  readonly indent: string;
  readonly suffix: string;
  readonly canRelocateIds: boolean;
}

function adjacentCaptionLine(
  source: string,
  lines: readonly SemanticSourceLine[],
  object: CaptionObject,
  placement: "above" | "below",
): CaptionLineMatch | null {
  const direction = placement === "above" ? -1 : 1;
  const start = placement === "above" ? object.firstLine - 1 : object.lastLine + 1;
  let blanks = 0;
  for (let index = start, distance = 0;
    index >= 0 && index < lines.length && distance < 4;
    index += direction, distance += 1) {
    const line = lines[index];
    if (line == null || !line.available || !line.topLevel) return null;
    if (line.text.trim().length === 0) {
      blanks += 1;
      if (blanks > 1) return null;
      continue;
    }
    if (STANDALONE_BLOCK_ID.test(line.text)) continue;
    const match = /^( {0,3})(Figure|Table|Equation|Code):[ \t]+(.*\S|\S)[ \t]*$/iu.exec(line.text);
    const matchedKeyword = match?.[2] ?? "";
    const kind = CAPTION_KINDS.find((candidate) => (
      candidate.toLowerCase() === matchedKeyword.toLowerCase()
    ));
    if (kind == null) return null;
    const idSuffix = /[ \t]+\^[A-Za-z0-9-]+[ \t]*$/u.exec(maskInlineProtectedSyntax(line.commentMaskedText));
    let lastIdLine = line;
    let idBlanks = 0;
    let standaloneIds = 0;
    let canRelocateIds = true;
    for (let next = line.number + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (candidate == null || !candidate.available || !candidate.topLevel) break;
      if (candidate.text.trim().length === 0 && idBlanks === 0) {
        idBlanks += 1;
      } else if (STANDALONE_BLOCK_ID.test(maskInlineProtectedSyntax(candidate.commentMaskedText))) {
        // Multiple or comment-decorated ID lines cannot be moved through the
        // current one-ID object-binding grammar without changing ownership.
        standaloneIds += 1;
        canRelocateIds = canRelocateIds && standaloneIds <= 1 && STANDALONE_BLOCK_ID.test(candidate.text);
        lastIdLine = candidate;
      } else {
        break;
      }
    }
    return {
      line,
      kind,
      exact: matchedKeyword === kind,
      title: idSuffix == null ? match?.[3] ?? ""
        : line.text.slice((match?.[1]?.length ?? 0) + matchedKeyword.length + 1, idSuffix.index).trim(),
      placement,
      canRelocateIds,
      sourceTo: lastIdLine.to,
      indent: match?.[1] ?? "",
      suffix: `${idSuffix == null ? "" : line.text.slice(idSuffix.index)}${source.slice(line.to, lastIdLine.to)}`,
    };
  }
  return null;
}

function targetForObject(
  source: string,
  lines: readonly SemanticSourceLine[],
  object: CaptionObject,
): CaptionInsertionTarget | null {
  const above = adjacentCaptionLine(source, lines, object, "above");
  const below = adjacentCaptionLine(source, lines, object, "below");
  if (above != null && below != null) return null;
  const existing = above ?? below;
  if (existing?.exact === true && existing.placement === "above") return null;
  if (existing?.placement === "below" && !existing.canRelocateIds) return null;
  if (existing != null) {
    return {
      kind: existing.kind,
      action: existing.placement === "below" ? "relocate" : "normalize",
      line: existing.line.number,
      from: existing.line.from,
      to: existing.sourceTo,
      suggestedTitle: existing.title,
      objectFrom: object.from,
      objectTo: object.to,
      objectFirstLine: object.firstLine,
      objectLastLine: object.lastLine,
      captionIndent: existing.indent,
      captionSuffix: existing.suffix,
    };
  }
  return {
    kind: object.kind,
    action: "insert",
    line: object.firstLine,
    from: object.from,
    to: object.from,
    suggestedTitle: object.suggestedTitle,
    objectFrom: object.from,
    objectTo: object.to,
    objectFirstLine: object.firstLine,
    objectLastLine: object.lastLine,
    captionIndent: "",
    captionSuffix: "",
  };
}

function validatedTargetForObject(
  source: string,
  lines: readonly SemanticSourceLine[],
  object: CaptionObject,
): CaptionInsertionTarget | null {
  const target = targetForObject(source, lines, object);
  if (target?.action !== "relocate") return target;
  const exactCaption = parseDocumentSemantics(source).captions.find((caption) => (
    caption.line === target.line
  ));
  if (exactCaption == null) return target;
  return bindCaptionObjects(source).some((binding) => (
    binding.caption.line === exactCaption.line
    && binding.object.from === object.from
  )) ? target : null;
}

export function findCaptionInsertionTarget(
  source: string,
  cursorOffset: number,
): CaptionInsertionTarget | null {
  if (!Number.isInteger(cursorOffset) || cursorOffset < 0 || cursorOffset > source.length) return null;
  const object = scanCaptionObjects(source).find((candidate) => (
    cursorOffset >= candidate.from && cursorOffset <= candidate.to
  ));
  return object == null
    ? null
    : validatedTargetForObject(source, scanSemanticSourceLines(source), object);
}

export function findCaptionObjectForTableRange(
  source: string,
  from: number,
  to: number,
): CaptionObject | null {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)
    || from < 0 || to <= from || to > source.length) return null;
  return scanCaptionObjects(source).find((candidate) => (
    candidate.kind === "Table" && candidate.visualFrom === from && candidate.visualTo === to
  )) ?? null;
}

export function findCaptionInsertionTargetForTableRange(
  source: string,
  from: number,
  to: number,
): CaptionInsertionTarget | null {
  const object = findCaptionObjectForTableRange(source, from, to);
  return object == null
    ? null
    : validatedTargetForObject(source, scanSemanticSourceLines(source), object);
}

function preferredNewline(source: string): "\n" | "\r\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function precedingLineIsNonBlank(source: string, offset: number): boolean {
  if (offset <= 0) return false;
  const prefix = source.slice(0, offset).replace(/\r?\n$/u, "");
  const previous = prefix.slice(prefix.lastIndexOf("\n") + 1);
  return previous.trim().length > 0;
}

export function formatCaptionInsertionSource(
  target: CaptionInsertionTarget,
  title: string,
): string | null {
  if (/[\r\n]/u.test(title)) return null;
  const normalized = title.trim();
  return normalized.length === 0 ? null
    : `${target.captionIndent}${target.kind}: ${normalized}${target.captionSuffix}`;
}

export function createCaptionInsertionPlanForTarget(
  source: string,
  target: CaptionInsertionTarget,
  title: string,
): CaptionInsertionPlan | null {
  const caption = formatCaptionInsertionSource(target, title);
  if (caption === null) return null;
  const newline = preferredNewline(source);

  if (target.action === "normalize") {
    const change = {
      from: target.from,
      to: target.to,
      insert: caption,
      line: target.line,
      before: source.slice(target.from, target.to),
      after: caption,
    };
    return {
      source,
      target,
      changes: [change],
      result: `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`,
    };
  }

  if (target.action === "relocate") {
    if (target.objectFrom >= target.from) return null;
    const objectSource = source.slice(target.objectFrom, target.objectTo);
    // A supported standalone ID may already have the one permitted blank
    // line before it. Do not add a second blank and detach the moved caption.
    const suffixHasBlankLine = /\n[ \t]*\n/u.test(target.captionSuffix.replace(/\r\n|\r/gu, "\n"));
    const gap = suffixHasBlankLine ? newline : `${newline}${newline}`;
    const replacement = `${caption}${gap}${objectSource}`;
    const change = {
      from: target.objectFrom,
      to: target.to,
      insert: replacement,
      line: target.objectFirstLine,
      before: source.slice(target.objectFrom, target.to),
      after: replacement,
    };
    return {
      source,
      target,
      changes: [change],
      result: `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`,
    };
  }

  const leading = precedingLineIsNonBlank(source, target.objectFrom) ? newline : "";
  const insert = `${leading}${caption}${newline}${newline}`;
  const change = {
    from: target.objectFrom,
    to: target.objectFrom,
    insert,
    line: target.objectFirstLine,
    before: "",
    after: caption,
  };
  return {
    source,
    target,
    changes: [change],
    result: `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`,
  };
}

export function createCaptionInsertionPlan(
  source: string,
  cursorOffset: number,
  title: string,
): CaptionInsertionPlan | null {
  const target = findCaptionInsertionTarget(source, cursorOffset);
  return target == null ? null : createCaptionInsertionPlanForTarget(source, target, title);
}
