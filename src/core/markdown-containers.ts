import { parser, type BlockContext, type BlockParser, type LeafBlockParser, type Line } from "@lezer/markdown";

import { scanInlineComments, type CommentKind } from "./markdown-comments";
import { blockHtmlStart, completeCustomHtmlTag, rawHtmlStart } from "./markdown-html-blocks";
import { INLINE_MATH_NODE, inlineMath } from "./markdown-inline-math";
import type { PhysicalSourceLine } from "./source-lines";

interface SourceRange {
  readonly from: number;
  readonly to: number;
}

type LiteralKind = "FencedCode" | "CodeBlock" | "HTMLBlock" | "NumberSuiteEquation" | "NumberSuiteUnclosedEquation";

interface LiteralRange extends SourceRange {
  readonly kind: LiteralKind;
}

export interface MarkdownContainerLine {
  readonly nested: boolean;
  readonly literal: boolean;
  readonly literalKind: LiteralKind | null;
  /** Exact code/math offsets within this physical line, including cross-line spans. */
  readonly inlineLiterals: readonly SourceRange[];
  readonly equationLastLine?: number;
}

const CONTAINERS = new Set(["BulletList", "OrderedList", "Blockquote"]);
const LITERALS = new Set<string>(["FencedCode", "CodeBlock", "HTMLBlock", "NumberSuiteEquation", "NumberSuiteUnclosedEquation"]);

function inAcceptedInline(spans: readonly SourceRange[], accepted: ReadonlySet<number>, offset: number): boolean {
  let low = 0, high = spans.length;
  while (low < high) { const mid = (low + high) >>> 1; if (spans[mid]!.to <= offset) low = mid + 1; else high = mid; }
  const span = spans[low];
  return span != null && span.from <= offset && accepted.has(span.from);
}

/** Project comments only where the block parser is reading actual Markdown. */
function commentProjection(input: string, inlineSpans: readonly SourceRange[], acceptedInline: Set<number>): BlockParser {
  let state: CommentKind | null = null;
  let inlineFlow = false;
  let previousEnd = 0;
  const processed = new Map<number, string>();
  let inlineIndex = 0;
  const apply = (cx: BlockContext, line: Line, continuation = false): void => {
    let masked = processed.get(cx.lineStart);
    if (masked == null) {
      // Native nested literals consume their own lines. End an already pending
      // comment there without activating literal examples of new comments.
      if (state != null && input.slice(previousEnd, cx.lineStart).includes(state === "html" ? "-->" : "%%")) {
        state = null;
        inlineFlow = false;
      }
      const text = line.text.slice(line.pos);
      const fence = /^(`{3,}|~{3,})(.*)$/u.exec(text);
      const validFence = line.indent < line.baseIndent + 4 && fence != null
        && !(fence[1]!.startsWith("`") && fence[2]!.includes("`"));
      // Obsidian's native nested code blocks retain their comment delimiters.
      if (state != null && cx.depth > 1 && validFence) return;
      if (state == null) {
        if (!continuation && line.indent >= line.baseIndent + 4) return;
        // Composite parsers run again at their adjusted base; defer until then.
        const marker = continuation
          ? /^(?:>|[-+*][ \t]+\S|1[.)][ \t]+\S)/u
          : /^(?:>|[-+*](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$))/u;
        if (marker.test(text)) return;
        if (validFence) return;
        // A math opening owns its literal first line too. Do not consume TeX
        // comment/HTML-looking text before the equation block parser sees it.
        if (cx.depth === 1 && line.pos <= 3 && text.startsWith("$$")
          && !inAcceptedInline(inlineSpans, acceptedInline, cx.lineStart + line.pos)) return;
        if (line.indent < line.baseIndent + 4 && (
          text.startsWith("<!--") || text.startsWith("<?") || text.startsWith("<![CDATA[")
          || /^<![A-Z]/u.test(text) || rawHtmlStart(text) != null || blockHtmlStart(text)
          || (!continuation && completeCustomHtmlTag(text))
        )) return;
      }
      const body = line.text.slice(line.basePos);
      const initial = state;
      const bodyFrom = cx.lineStart + line.basePos;
      while (inlineSpans[inlineIndex] != null && inlineSpans[inlineIndex]!.to <= bodyFrom) inlineIndex += 1;
      const spans: SourceRange[] = [];
      for (let cursor = inlineIndex; inlineSpans[cursor] != null && inlineSpans[cursor]!.from < bodyFrom + body.length; cursor += 1) {
        spans.push(inlineSpans[cursor]!);
      }
      const protectedRanges = spans.filter((range) => range.from >= bodyFrom || acceptedInline.has(range.from))
        .map((range) => ({ from: Math.max(0, range.from - bodyFrom), to: Math.min(body.length, range.to - bodyFrom) }));
      const comments = scanInlineComments(body, initial, protectedRanges);
      for (const span of spans) {
        const from = span.from - bodyFrom;
        if (from >= 0 && !comments.ranges.some((range) => from >= range.from && from < range.to)) acceptedInline.add(span.from);
      }
      const projected = comments.masked.split("");
      let keepParagraph = inlineFlow;
      for (const range of comments.ranges) {
        if (!(initial != null && range.from === 0)) {
          inlineFlow = comments.masked.slice(0, range.from).trim().length > 0;
        }
        keepParagraph ||= inlineFlow;
        if (comments.unclosedFrom !== range.from) inlineFlow = false;
      }
      const first = comments.ranges[0];
      // Removing an inline comment must not invent blank lines or an indented
      // code block. The anchor exists only in parser input, never source output.
      if (first != null && (keepParagraph || comments.masked.trim().length > 0)) projected[first.from] = "x";
      masked = line.text.slice(0, line.basePos) + projected.join("");
      state = comments.state;
      previousEnd = cx.lineStart + line.text.length;
      processed.set(cx.lineStart, masked);
    }
    line.text = masked;
    line.pos = line.skipSpace(line.basePos);
    line.indent = line.countIndent(line.pos, line.basePos, line.baseIndent);
    line.next = line.pos === line.text.length ? -1 : line.text.charCodeAt(line.pos);
  };
  return {
    name: "NumberSuiteComments",
    before: "IndentedCode",
    parse(cx, line) {
      apply(cx, line);
      if (line.pos === line.text.length) { cx.nextLine(); return true; }
      return false;
    },
    endLeaf(cx, line) {
      apply(cx, line, true);
      return line.pos === line.text.length;
    },
    leaf() {
      const observer: LeafBlockParser = {
        nextLine(cx, line, leaf) {
          apply(cx, line, true);
          if (line.pos !== line.text.length) return false;
          for (const other of leaf.parsers) {
            if (other !== observer && other.finish(cx, leaf)) return true;
          }
          cx.addLeafElement(leaf, cx.elt(
            "Paragraph", leaf.start, leaf.start + leaf.content.length,
            cx.parser.parseInline(leaf.content, leaf.start),
          ));
          return true;
        },
        finish() { return false; },
      };
      return observer;
    },
  };
}

/** Equations own their contents before Markdown-looking TeX can create containers. */
function equationBlock(inlineSpans: readonly SourceRange[], acceptedInline: ReadonlySet<number>): BlockParser {
  const starts = (cx: BlockContext, line: Line): boolean => {
    if (cx.depth !== 1 || line.pos > 3 || !line.text.slice(line.pos).startsWith("$$")) return false;
    return !inAcceptedInline(inlineSpans, acceptedInline, cx.lineStart + line.pos);
  };
  return {
    name: "NumberSuiteEquation", before: "FencedCode",
    endLeaf: starts,
    parse(cx, line) {
      if (!starts(cx, line)) return false;
      const from = cx.lineStart;
      const opening = line.text.replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/u, "").trim();
      let closed = opening.length > 4 && opening.endsWith("$$");
      if (closed) cx.nextLine();
      else while (cx.nextLine()) {
        if (/^ {0,3}\$\$[ \t]*(?:\^[A-Za-z0-9-]+)?[ \t]*$/u.test(line.text)) {
          closed = true; cx.nextLine(); break;
        }
      }
      cx.addElement(cx.elt(closed ? "NumberSuiteEquation" : "NumberSuiteUnclosedEquation", from, cx.prevLineEnd()));
      return true;
    },
  };
}

/**
 * Parse block structure once and project disjoint container/literal ranges to lines.
 * Physical offsets and source text stay with the caller. Normalizing only this
 * parser input lets LF, CRLF and CR share the same Markdown block rules.
 */
export function scanMarkdownContainerLines(
  lines: readonly PhysicalSourceLine[],
): readonly MarkdownContainerLine[] {
  const starts: number[] = [];
  let offset = 0;
  const input = lines.map((line) => {
    starts.push(offset);
    // Number Suite H7-H9 terminate a lazy list paragraph just like native ATX
    // headings. Their original marker/content is parsed later from physical lines.
    const text = line.frontmatter ? " ".repeat(line.text.length) : line.text.replace(
      /^( {0,3})(#{7,9})(?=[ \t])/u,
      (_match, indent: string, marks: string) => `${indent}######${" ".repeat(marks.length - 6)}`,
    );
    offset += text.length + 1;
    return text;
  }).join("\n");
  const containers: SourceRange[] = [];
  const literals: LiteralRange[] = [];
  const inlineLiterals: SourceRange[] = [];
  const rawInline: SourceRange[] = [];
  const markdown = parser.configure(inlineMath());
  markdown.parse(input).iterate({ enter(node) {
    if (node.name === "InlineCode" || node.name === INLINE_MATH_NODE) {
      rawInline.push({ from: node.from, to: node.to }); return false;
    }
    return undefined;
  } });
  let depth = 0;
  const acceptedInline = new Set<number>();
  markdown.configure({ defineNodes: ["NumberSuiteEquation", "NumberSuiteUnclosedEquation"],
    parseBlock: [commentProjection(input, rawInline, acceptedInline), equationBlock(rawInline, acceptedInline)] }).parse(input).iterate({
    enter(node) {
      if (CONTAINERS.has(node.name)) {
        if (depth === 0) containers.push({ from: node.from, to: node.to });
        depth += 1;
      } else if (LITERALS.has(node.name)) {
        literals.push({ from: node.from, to: node.to, kind: node.name as LiteralKind });
        return false;
      } else if (node.name === "InlineCode" || node.name === INLINE_MATH_NODE) {
        inlineLiterals.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
    leave(node) {
      if (CONTAINERS.has(node.name)) depth -= 1;
    },
  });

  let containerIndex = 0;
  let literalIndex = 0;
  let inlineIndex = 0;
  return starts.map((from, index) => {
    const to = (starts[index + 1] ?? offset) - 1;
    while (containers[containerIndex] != null && containers[containerIndex]!.to <= from) containerIndex += 1;
    while (literals[literalIndex] != null && literals[literalIndex]!.to <= from) literalIndex += 1;
    const literal = (literals[literalIndex]?.from ?? Infinity) <= to ? literals[literalIndex] : null;
    while (inlineLiterals[inlineIndex] != null && inlineLiterals[inlineIndex]!.to <= from) inlineIndex += 1;
    const protectedRanges: SourceRange[] = [];
    for (let cursor = inlineIndex; inlineLiterals[cursor] != null && inlineLiterals[cursor]!.from < to; cursor += 1) {
      const range = inlineLiterals[cursor]!;
      protectedRanges.push({ from: Math.max(0, range.from - from), to: Math.min(to - from, range.to - from) });
    }
    let equationLastLine: number | undefined;
    if (literal?.kind === "NumberSuiteEquation" && literal.from === from) {
      equationLastLine = index;
      while (starts[equationLastLine + 1] != null && starts[equationLastLine + 1]! < literal.to) equationLastLine += 1;
    }
    return {
      ...(equationLastLine == null ? {} : { equationLastLine }),
      nested: (containers[containerIndex]?.from ?? Infinity) <= to,
      literal: literal != null,
      literalKind: literal?.kind ?? null,
      inlineLiterals: protectedRanges,
    };
  });
}
