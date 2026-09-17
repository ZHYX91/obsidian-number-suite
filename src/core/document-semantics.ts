import { WORD_JOINER } from "./markers";
import { noteContainerLines } from "./note-semantics";
import {
  maskInlineProtectedSyntax,
  scanMarkdownProtectedLines,
} from "./markdown-protection";
import type { ParsedHeading } from "./types";

export const CAPTION_KINDS = ["Figure", "Table", "Equation", "Code"] as const;
export type CaptionKind = (typeof CAPTION_KINDS)[number];

export interface ParsedCaption {
  readonly kind: CaptionKind;
  readonly line: number;
  readonly lineFrom: number;
  readonly lineTo: number;
  readonly colonFrom: number;
  readonly content: string;
  readonly title: string;
  readonly blockId: string | null;
}

export interface NumberedCaption extends ParsedCaption {
  readonly number: number;
  readonly label: string;
}

export interface ParsedSemanticReference {
  readonly line: number;
  readonly from: number;
  readonly to: number;
  readonly target: string;
  readonly alias: string | null;
  readonly kind: "title" | "block";
}

export interface ResolvedSemanticTitleTarget {
  readonly kind: "heading" | "caption";
  readonly line: number;
}

export interface SemanticDocument {
  readonly captions: readonly ParsedCaption[];
  readonly references: readonly ParsedSemanticReference[];
  readonly blockOwners: ReadonlyMap<string, number>;
}

export interface SemanticSourceLine {
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly number: number;
  readonly available: boolean;
}

const CAPTION = /^( {0,3})(Figure|Table|Equation|Code):(?:[ \t]+)(.*\S|\S)[ \t]*$/u;
export const TRAILING_BLOCK_ID = /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*$/u;
const STANDALONE_BLOCK_ID = /^ {0,3}\^([A-Za-z0-9-]+)[ \t]*$/u;
const SEMANTIC_REFERENCE = /@\[\[#(\^?[^\]|\r\n]+)(?:\|([^\]\r\n]+))?\]\]/gu;

export function scanSemanticSourceLines(source: string): SemanticSourceLine[] {
  const protectedNoteLines = noteContainerLines(source);
  return scanMarkdownProtectedLines(source, { indentedCode: true }).map((line) => ({
    text: line.text,
    from: line.from,
    to: line.to,
    number: line.number,
    available: line.available && !protectedNoteLines.has(line.number),
  }));
}

export function withoutTrailingBlockId(value: string): string {
  return value.replace(TRAILING_BLOCK_ID, "").trim();
}

export function normalizeSemanticTarget(value: string): string {
  return value.replace(new RegExp(WORD_JOINER, "gu"), "").normalize("NFC").trim().replace(/[ \t]+/gu, " ").toLowerCase();
}

export function headingTargetKey(content: string): string {
  return `heading:${normalizeSemanticTarget(withoutTrailingBlockId(content))}`;
}

export function captionTargetKey(kind: CaptionKind, title: string): string {
  return `caption:${normalizeSemanticTarget(`${kind}: ${withoutTrailingBlockId(title)}`)}`;
}

export function blockTargetKey(id: string): string {
  return `block:${id.normalize("NFC").toLowerCase()}`;
}

export function parseDocumentSemantics(source: string): SemanticDocument {
  const lines = scanSemanticSourceLines(source);
  const captions: ParsedCaption[] = [];
  const references: ParsedSemanticReference[] = [];
  const blockOwners = new Map<string, number>();
  const ambiguousBlockIds = new Set<string>();
  let previousSemanticLine: number | null = null;
  let interveningBlankLines = 0;
  const recordBlockOwner = (id: string, line: number): void => {
    const key = blockTargetKey(id);
    if (blockOwners.has(key)) {
      blockOwners.delete(key);
      ambiguousBlockIds.add(key);
    } else if (!ambiguousBlockIds.has(key)) {
      blockOwners.set(key, line);
    }
  };

  for (const line of lines) {
    if (!line.available) {
      previousSemanticLine = null;
      interveningBlankLines = 0;
      continue;
    }
    const masked = maskInlineProtectedSyntax(line.text);
    const standalone = STANDALONE_BLOCK_ID.exec(masked);
    if (standalone?.[1] != null) {
      if (previousSemanticLine != null) recordBlockOwner(standalone[1], previousSemanticLine);
      continue;
    }

    const captionMatch = CAPTION.exec(masked);
    if (captionMatch?.[2] != null) {
      const kind = captionMatch[2] as CaptionKind;
      const blockId = TRAILING_BLOCK_ID.exec(masked)?.[1] ?? null;
      const content = captionMatch[3] ?? "";
      const caption: ParsedCaption = {
        kind,
        line: line.number,
        lineFrom: line.from,
        lineTo: line.to,
        colonFrom: line.from + (captionMatch[1]?.length ?? 0) + kind.length,
        content,
        title: withoutTrailingBlockId(content),
        blockId,
      };
      captions.push(caption);
      previousSemanticLine = line.number;
      interveningBlankLines = 0;
      if (blockId != null) recordBlockOwner(blockId, line.number);
    } else if (line.text.trim().length === 0) {
      interveningBlankLines += 1;
      if (interveningBlankLines > 1) previousSemanticLine = null;
    } else {
      previousSemanticLine = line.number;
      interveningBlankLines = 0;
      const blockId = TRAILING_BLOCK_ID.exec(masked)?.[1];
      if (blockId != null) recordBlockOwner(blockId, line.number);
    }

    for (const match of masked.matchAll(SEMANTIC_REFERENCE)) {
      if (match.index == null || (match.index > 0 && line.text[match.index - 1] === "\\")) continue;
      const rawTarget = match[1]?.trim();
      if (rawTarget == null || rawTarget.length === 0) continue;
      const block = rawTarget.startsWith("^");
      const target = block ? rawTarget.slice(1) : rawTarget;
      if (target.length === 0) continue;
      references.push({
        line: line.number,
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
        target,
        alias: match[2]?.trim() || null,
        kind: block ? "block" : "title",
      });
    }
  }
  return { captions, references, blockOwners };
}

export function numberCaptions(captions: readonly ParsedCaption[]): NumberedCaption[] {
  const counters: Record<CaptionKind, number> = { Figure: 0, Table: 0, Equation: 0, Code: 0 };
  return captions.map((caption) => {
    const number = counters[caption.kind] + 1;
    counters[caption.kind] = number;
    return { ...caption, number, label: `${caption.kind} ${number}` };
  });
}

export function uniqueHeadingTargets(headings: readonly ParsedHeading[]): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const heading of headings) {
    const key = headingTargetKey(heading.content);
    if (result.has(key)) {
      result.delete(key);
      ambiguous.add(key);
    } else if (!ambiguous.has(key)) {
      result.set(key, heading.line);
    }
  }
  return result;
}

export function resolveUniqueSemanticTitleTarget(
  target: string,
  headings: readonly ParsedHeading[],
  captions: readonly ParsedCaption[],
): ResolvedSemanticTitleTarget | null {
  const normalized = normalizeSemanticTarget(target);
  const candidates: ResolvedSemanticTitleTarget[] = [];
  for (const heading of headings) {
    if (normalizeSemanticTarget(withoutTrailingBlockId(heading.content)) === normalized) {
      candidates.push({ kind: "heading", line: heading.line });
    }
  }
  for (const caption of captions) {
    if (normalizeSemanticTarget(`${caption.kind}: ${caption.title}`) === normalized) {
      candidates.push({ kind: "caption", line: caption.line });
    }
  }
  return candidates.length === 1 ? candidates[0] ?? null : null;
}
