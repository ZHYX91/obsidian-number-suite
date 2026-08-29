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
}

function adjacentCaptionLine(
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
    if (line == null || !line.available) return null;
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
    return {
      line,
      kind,
      exact: matchedKeyword === kind,
      title: (match?.[3] ?? "").replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/u, ""),
      placement,
    };
  }
  return null;
}

function targetForObject(
  lines: readonly SemanticSourceLine[],
  object: CaptionObject,
): CaptionInsertionTarget | null {
  const above = adjacentCaptionLine(lines, object, "above");
  const below = adjacentCaptionLine(lines, object, "below");
  if (above != null && below != null) return null;
  const existing = above ?? below;
  if (existing?.exact === true && existing.placement === "above") return null;
  if (existing != null) {
    return {
      kind: existing.kind,
      action: existing.placement === "below" ? "relocate" : "normalize",
      line: existing.line.number,
      from: existing.line.from,
      to: existing.line.to,
      suggestedTitle: existing.title,
      objectFrom: object.from,
      objectTo: object.to,
      objectFirstLine: object.firstLine,
      objectLastLine: object.lastLine,
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
  };
}

function validatedTargetForObject(
  source: string,
  lines: readonly SemanticSourceLine[],
  object: CaptionObject,
): CaptionInsertionTarget | null {
  const target = targetForObject(lines, object);
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

export function findCaptionInsertionTargetForTable(
  source: string,
  sourceTableIndex: number,
): CaptionInsertionTarget | null {
  if (!Number.isInteger(sourceTableIndex) || sourceTableIndex < 0) return null;
  const object = scanCaptionObjects(source).find((candidate) => (
    candidate.kind === "Table" && candidate.sourceTableIndex === sourceTableIndex
  ));
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

export function createCaptionInsertionPlanForTarget(
  source: string,
  target: CaptionInsertionTarget,
  title: string,
): CaptionInsertionPlan | null {
  if (/[\r\n]/u.test(title)) return null;
  const normalizedTitle = title.trim();
  if (normalizedTitle.length === 0) return null;
  const caption = `${target.kind}: ${normalizedTitle}`;
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
    const replacement = `${caption}${newline}${newline}${objectSource}`;
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
