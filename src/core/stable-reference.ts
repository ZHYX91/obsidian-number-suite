import { parseDocumentSemantics, scanSemanticSourceLines, withoutTrailingBlockId } from "./document-semantics";
import { parseAtxHeadings } from "./heading-parser";

export interface StableReferenceTarget {
  readonly kind: "heading" | "caption";
  readonly line: number;
  readonly lineFrom: number;
  readonly lineTo: number;
  readonly title: string;
  readonly blockId: string | null;
}

export interface StableReferenceChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly before: string;
  readonly after: string;
}

export interface StableReferencePlan {
  readonly source: string;
  readonly target: StableReferenceTarget;
  readonly blockId: string;
  readonly link: string;
  readonly change: StableReferenceChange | null;
}

const INLINE_BLOCK_ID = /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*$/u;
const STANDALONE_BLOCK_ID = /^ {0,3}\^([A-Za-z0-9-]+)[ \t]*$/u;
const ANY_BLOCK_ID = /(?:^|[ \t])\^([A-Za-z0-9-]+)/gmu;

function sourceLineAtOffset(source: string, offset: number): number | null {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length) return null;
  const lines = scanSemanticSourceLines(source);
  return lines.find((line) => offset >= line.from && offset <= line.to)?.number ?? null;
}

function existingBlockId(source: string, line: number, inlineContent: string): string | null {
  const inline = INLINE_BLOCK_ID.exec(inlineContent)?.[1];
  if (inline != null) return inline;
  const next = scanSemanticSourceLines(source).find((candidate) => candidate.number === line + 1);
  return next == null ? null : STANDALONE_BLOCK_ID.exec(next.text)?.[1] ?? null;
}

function safeAlias(value: string): string {
  return value.trim().replace(/\|/gu, "｜").replace(/\]/gu, "］");
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function slug(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32)
    .replace(/-+$/u, "");
}

function generatedBlockId(
  source: string,
  target: Pick<StableReferenceTarget, "kind" | "title">,
): string {
  const used = new Set<string>();
  for (const match of source.matchAll(ANY_BLOCK_ID)) {
    if (match[1] != null) used.add(match[1].normalize("NFC").toLowerCase());
  }
  const readable = slug(target.title);
  const type = target.kind === "heading" ? "h" : "caption";
  const base = `ns-${type}-${readable || fnv1a(`${target.kind}:${target.title}`)}`;
  let candidate = base;
  for (let suffix = 2; used.has(candidate.toLowerCase()); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function targetAtOffset(source: string, cursorOffset: number): StableReferenceTarget | null {
  const line = sourceLineAtOffset(source, cursorOffset);
  if (line == null) return null;
  const heading = parseAtxHeadings(source).find((candidate) => candidate.line === line);
  if (heading != null) {
    const title = withoutTrailingBlockId(heading.content);
    if (title.length === 0) return null;
    return {
      kind: "heading",
      line,
      lineFrom: heading.lineFrom,
      lineTo: heading.lineTo,
      title,
      blockId: existingBlockId(source, line, heading.content),
    };
  }
  const caption = parseDocumentSemantics(source).captions.find((candidate) => candidate.line === line);
  if (caption == null || caption.title.length === 0) return null;
  return {
    kind: "caption",
    line,
    lineFrom: caption.lineFrom,
    lineTo: caption.lineTo,
    title: caption.title,
    blockId: existingBlockId(source, line, caption.content),
  };
}

function newlineFor(source: string): "\r\n" | "\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

export function createStableReferencePlan(
  source: string,
  cursorOffset: number,
): StableReferencePlan | null {
  const target = targetAtOffset(source, cursorOffset);
  if (target == null) return null;
  if (target.blockId != null) {
    const normalized = target.blockId.normalize("NFC").toLowerCase();
    const occurrences = [...source.matchAll(ANY_BLOCK_ID)].filter((match) => (
      match[1]?.normalize("NFC").toLowerCase() === normalized
    )).length;
    if (occurrences !== 1) return null;
  }
  const blockId = target.blockId ?? generatedBlockId(source, target);
  const alias = safeAlias(target.title);
  const link = `@[[#^${blockId}|${alias}]]`;
  if (target.blockId != null) return { source, target, blockId, link, change: null };
  const insertion = target.kind === "caption"
    ? ` ^${blockId}`
    : `${newlineFor(source)}^${blockId}`;
  const before = source.slice(target.lineFrom, target.lineTo);
  return {
    source,
    target,
    blockId,
    link,
    change: {
      from: target.lineTo,
      to: target.lineTo,
      insert: insertion,
      before,
      after: `${before}${insertion}`,
    },
  };
}
