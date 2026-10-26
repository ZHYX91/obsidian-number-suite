import { parser, type BlockContext, type BlockParser, type LeafBlockParser, type Line } from "@lezer/markdown";

import { scanInlineComments, type CommentKind } from "./markdown-comments";
import { blockHtmlStart, completeCustomHtmlTag, rawHtmlStart } from "./markdown-html-blocks";
import type { PhysicalSourceLine } from "./source-lines";

interface SourceRange {
  readonly from: number;
  readonly to: number;
}

type LiteralKind = "FencedCode" | "CodeBlock" | "HTMLBlock";

interface LiteralRange extends SourceRange {
  readonly kind: LiteralKind;
}

export interface MarkdownContainerLine {
  readonly nested: boolean;
  readonly literal: boolean;
  readonly literalKind: LiteralKind | null;
}

const CONTAINERS = new Set(["BulletList", "OrderedList", "Blockquote"]);
const LITERALS = new Set<string>(["FencedCode", "CodeBlock", "HTMLBlock"]);

/** Project comments only where the block parser is reading actual Markdown. */
function commentProjection(input: string): BlockParser {
  let state: CommentKind | null = null;
  let inlineFlow = false;
  let previousEnd = 0;
  const processed = new Map<number, string>();
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
        if (line.indent < line.baseIndent + 4 && (
          text.startsWith("<!--") || text.startsWith("<?") || text.startsWith("<![CDATA[")
          || /^<![A-Z]/u.test(text) || rawHtmlStart(text) != null || blockHtmlStart(text)
          || (!continuation && completeCustomHtmlTag(text))
        )) return;
      }
      const body = line.text.slice(line.basePos);
      const initial = state;
      const comments = scanInlineComments(body, initial);
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
    const text = line.frontmatter ? "" : line.text.replace(/^( {0,3})#{7,9}(?=[ \t])/u, "$1######");
    offset += text.length + 1;
    return text;
  }).join("\n");
  const containers: SourceRange[] = [];
  const literals: LiteralRange[] = [];
  let depth = 0;
  parser.configure({ parseBlock: [commentProjection(input)] }).parse(input).iterate({
    enter(node) {
      if (CONTAINERS.has(node.name)) {
        if (depth === 0) containers.push({ from: node.from, to: node.to });
        depth += 1;
      } else if (LITERALS.has(node.name)) {
        literals.push({ from: node.from, to: node.to, kind: node.name as LiteralKind });
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
  return starts.map((from, index) => {
    const to = (starts[index + 1] ?? offset) - 1;
    while (containers[containerIndex] != null && containers[containerIndex]!.to <= from) containerIndex += 1;
    while (literals[literalIndex] != null && literals[literalIndex]!.to <= from) literalIndex += 1;
    const literal = (literals[literalIndex]?.from ?? Infinity) <= to ? literals[literalIndex] : null;
    return {
      nested: (containers[containerIndex]?.from ?? Infinity) <= to,
      literal: literal != null,
      literalKind: literal?.kind ?? null,
    };
  });
}
