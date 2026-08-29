import { WORD_JOINER } from "./markers";
import { noteContainerLines } from "./note-semantics";
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
const BLOCK_HTML_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "center", "details", "dialog",
  "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "header", "html", "iframe",
  "main", "nav", "ol", "pre", "script", "section", "style", "table", "textarea", "ul",
]);

function sourceLines(source: string): SemanticSourceLine[] {
  const raw: Array<Omit<SemanticSourceLine, "available">> = [];
  let from = 0;
  let number = 0;
  while (from < source.length) {
    const newline = source.indexOf("\n", from);
    const rawTo = newline < 0 ? source.length : newline;
    const to = rawTo > from && source.charCodeAt(rawTo - 1) === 13 ? rawTo - 1 : rawTo;
    raw.push({ text: source.slice(from, to), from, to, number });
    number += 1;
    if (newline < 0) break;
    from = newline + 1;
  }
  if (source.length === 0 || source.endsWith("\n")) {
    raw.push({ text: "", from: source.length, to: source.length, number });
  }

  let inFrontmatter = false;
  let frontmatterFinished = false;
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;
  let inHtmlComment = false;
  let inObsidianComment = false;
  let rawHtmlTag: string | null = null;
  let genericHtmlBlock = false;
  return raw.map((line) => {
    const trimmed = line.text.trim();
    let available = true;
    if (line.number === 0 && line.text.replace(/^\uFEFF/u, "").trim() === "---") {
      inFrontmatter = true;
      available = false;
    } else if (inFrontmatter) {
      available = false;
      if (trimmed === "---" || trimmed === "...") {
        inFrontmatter = false;
        frontmatterFinished = true;
      }
    } else {
      if (!frontmatterFinished && line.number > 0) frontmatterFinished = true;
      if (/^(?: {4}|\t)/u.test(line.text)) {
        available = false;
      } else if (fenceCharacter != null) {
        available = false;
        const closing = new RegExp(`^ {0,3}${fenceCharacter === "`" ? "`" : "~"}{${fenceLength},}[ \\t]*$`, "u");
        if (closing.test(line.text)) {
          fenceCharacter = null;
          fenceLength = 0;
        }
      } else {
        const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line.text);
        if (fence?.[1] != null) {
          available = false;
          fenceCharacter = fence[1][0] as "`" | "~";
          fenceLength = fence[1].length;
        } else if (rawHtmlTag != null) {
          available = false;
          if (new RegExp(`</${rawHtmlTag}[ \\t]*>`, "iu").test(line.text)) rawHtmlTag = null;
        } else if (genericHtmlBlock) {
          available = false;
          if (trimmed.length === 0) genericHtmlBlock = false;
        } else if (inHtmlComment) {
          available = false;
          if (line.text.includes("-->")) inHtmlComment = false;
        } else if (inObsidianComment) {
          available = false;
          if (line.text.includes("%%")) inObsidianComment = false;
        } else {
          const htmlStart = line.text.indexOf("<!--");
          const obsidianStart = line.text.indexOf("%%");
          const htmlTag = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/>)/u.exec(line.text)?.[1]?.toLowerCase();
          if (htmlTag != null && BLOCK_HTML_TAGS.has(htmlTag)) {
            available = false;
            if (["script", "pre", "style", "textarea"].includes(htmlTag)) {
              if (!new RegExp(`</${htmlTag}[ \\t]*>`, "iu").test(line.text)) rawHtmlTag = htmlTag;
            } else {
              genericHtmlBlock = true;
            }
          } else if (htmlStart >= 0) {
            available = false;
            if (line.text.indexOf("-->", htmlStart + 4) < 0) inHtmlComment = true;
          } else if (obsidianStart >= 0) {
            available = false;
            if (line.text.indexOf("%%", obsidianStart + 2) < 0) inObsidianComment = true;
          }
        }
      }
    }
    return { ...line, available };
  });
}

export function scanSemanticSourceLines(source: string): SemanticSourceLine[] {
  const protectedNoteLines = noteContainerLines(source);
  return sourceLines(source).map((line) => ({
    ...line,
    available: line.available && !protectedNoteLines.has(line.number),
  }));
}

function maskInlineCode(text: string): string {
  const characters = text.split("");
  for (let index = 0; index < text.length;) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let ticks = 1;
    while (text[index + ticks] === "`") ticks += 1;
    const closing = text.indexOf("`".repeat(ticks), index + ticks);
    if (closing < 0) break;
    for (let cursor = index; cursor < closing + ticks; cursor += 1) characters[cursor] = " ";
    index = closing + ticks;
  }
  return characters.join("");
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
    const standalone = STANDALONE_BLOCK_ID.exec(line.text);
    if (standalone?.[1] != null) {
      if (previousSemanticLine != null) recordBlockOwner(standalone[1], previousSemanticLine);
      continue;
    }

    const captionMatch = CAPTION.exec(line.text);
    if (captionMatch?.[2] != null) {
      const kind = captionMatch[2] as CaptionKind;
      const blockId = TRAILING_BLOCK_ID.exec(line.text)?.[1] ?? null;
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
      const blockId = TRAILING_BLOCK_ID.exec(line.text)?.[1];
      if (blockId != null) recordBlockOwner(blockId, line.number);
    }

    const masked = maskInlineCode(line.text);
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
