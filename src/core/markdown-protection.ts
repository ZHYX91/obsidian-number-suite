import { blockHtmlStart, completeCustomHtmlTag, endsRawHtmlBlock, leadingMarkup, startsRawHtmlBlock } from "./markdown-html-blocks";
import { blankRange, codeSpanEnd, scanInlineComments, type CommentKind } from "./markdown-comments";
import { scanPhysicalLines, type PhysicalSourceLine } from "./source-lines";
import { scanMarkdownContainerLines } from "./markdown-containers";

export interface MarkdownProtectedLine extends PhysicalSourceLine {
  readonly available: boolean;
  readonly commentMaskedText: string;
  readonly headingAvailable: boolean;
  /** True only for an actual top-level fenced-code opening, never a protected lookalike. */
  readonly fenceOpening: boolean;
  readonly topLevel: boolean;
  readonly listItemId?: boolean;
  readonly blockIdCarrier?: boolean;
  readonly inlineMaskedText: string;
  /** Closed top-level equation carrier; its interior is never semantic prose. */
  readonly equationLastLine?: number;
  readonly setextLevel?: 1 | 2;
}

type ProtectedBlockState =
  | Readonly<{ kind: "fence"; character: "`" | "~"; length: number }>
  | Readonly<{ kind: "until"; ending: string }>
  | Readonly<{ kind: "raw-html" }>
  | Readonly<{ kind: "blank-html" }>;

/**
 * Marks physical lines that are safe for Number Suite's top-level Markdown scanners.
 * The state machine covers frontmatter, fenced/indented code, CommonMark HTML block
 * families, and Obsidian block comments. Shared inline code, math and link-metadata
 * ranges mask only their exact spans, preserving prose and visible link text.
 */
export function scanMarkdownProtectedLines(
  source: string,
): MarkdownProtectedLine[] {
  const lines = scanPhysicalLines(source);
  const containers = scanMarkdownContainerLines(lines);
  const output: MarkdownProtectedLine[] = [];
  let state: ProtectedBlockState | null = null;
  let inlineComment: CommentKind | null = null;

  for (const line of lines) {
    const container = containers[line.number];
    const blank = /^[ \t]*$/u.test(line.text);
    let available = true;
    let commentMaskedText = line.text;
    let headingAvailable = true;
    let fenceOpening = false;

    if (line.frontmatter) {
      available = false;
    } else if (state?.kind === "fence") {
      available = false;
      const escaped = state.character === "`" ? "`" : "~";
      if (new RegExp(`^ {0,3}${escaped}{${state.length},}[ \\t]*$`, "u").test(line.text)) {
        state = null;
      }
    } else if (state?.kind === "until") {
      available = false;
      if (line.text.includes(state.ending)) state = null;
    } else if (state?.kind === "raw-html") {
      available = false;
      if (endsRawHtmlBlock(line.text)) state = null;
    } else if (state?.kind === "blank-html") {
      if (blank) {
        state = null;
        available = true;
      } else {
        available = false;
      }
    } else if (container?.literalKind === "CodeBlock" || container?.literalKind === "NumberSuiteEquation"
      || container?.literalKind === "NumberSuiteUnclosedEquation" || (container?.nested === true && container.literal)) {
      available = false;
      // Indented code follows the parser's actual block boundary: indentation
      // alone cannot interrupt a paragraph. Root fences/HTML retain the state
      // machine below so Obsidian comments and caption fence openings still work.
      // A pending comment must still end while these lines are skipped. Do
      // not scan the literal tail: code may contain unrelated comment openers.
      if (inlineComment != null) {
        const ending = inlineComment === "html" ? "-->" : "%%";
        if (line.text.includes(ending)) inlineComment = null;
      }
    } else if (inlineComment != null) {
      const comments = scanInlineComments(line.text, inlineComment, container?.inlineLiterals);
      commentMaskedText = comments.masked;
      inlineComment = comments.state;
      headingAvailable = false;
    } else if (container?.nested === true) {
      // Ordinary list/quote references remain meaningful. Nested fences and
      // HTML must not start a document-level protection state after they end.
      const comments = scanInlineComments(line.text, null, container?.inlineLiterals);
      commentMaskedText = comments.masked;
      inlineComment = comments.state;
      headingAvailable = false;
    } else {
      const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/su.exec(line.text);
      const fence = fenceMatch?.[1]?.startsWith("`") && fenceMatch[2]?.includes("`")
        ? null : fenceMatch?.[1];
      if (fence != null) {
        available = false;
        fenceOpening = true;
        state = {
          kind: "fence",
          character: fence[0] as "`" | "~",
          length: fence.length,
        };
      } else {
        const markup = leadingMarkup(line.text);
        if (markup != null && markup.startsWith("<!--")) {
          available = false;
          if (!markup.includes("-->", 4)) state = { kind: "until", ending: "-->" };
        } else if (markup != null && markup.startsWith("<?")) {
          available = false;
          if (!markup.includes("?>", 2)) state = { kind: "until", ending: "?>" };
        } else if (markup != null && markup.startsWith("<![CDATA[")) {
          available = false;
          if (!markup.includes("]]>", 9)) state = { kind: "until", ending: "]]>" };
        } else if (markup != null && /^<![A-Z]/u.test(markup)) {
          available = false;
          if (!markup.includes(">", 2)) state = { kind: "until", ending: ">" };
        } else if (markup != null) {
          if (startsRawHtmlBlock(markup)) {
            available = false;
            if (!endsRawHtmlBlock(markup)) state = { kind: "raw-html" };
          } else if (blockHtmlStart(markup)) {
            available = false;
            state = { kind: "blank-html" };
          } else if (!container?.continuesParagraph && completeCustomHtmlTag(markup)) {
            available = false;
            state = { kind: "blank-html" };
          }
        }
        if (available) {
          const comments = scanInlineComments(line.text, null, container?.inlineLiterals);
          commentMaskedText = comments.masked;
          inlineComment = comments.state;
          headingAvailable = inlineComment == null;
        }
      }
    }

    const topLevel = container?.nested !== true;
    const inline = commentMaskedText.split("");
    for (const range of container?.inlineLiterals ?? []) blankRange(inline, range.from, range.to);
    output.push({ ...line, available, commentMaskedText, inlineMaskedText: inline.join(""), topLevel,
      ...(container?.listItemId === true ? { listItemId: true } : {}),
      ...(container?.literalKind === "FencedCode" || container?.literalKind === "NumberSuiteEquation"
        || container?.nested === true ? { blockIdCarrier: true } : {}),
      ...(available && headingAvailable && topLevel && container?.setextLevel != null ? { setextLevel: container.setextLevel } : {}),
      ...(container?.equationLastLine == null ? {} : { equationLastLine: container.equationLastLine }),
      fenceOpening, headingAvailable: available && headingAvailable && topLevel });
  }

  return output;
}

export interface HtmlCommentAnalysis {
  readonly ranges: ReadonlyArray<Readonly<{ from: number; to: number }>>;
  readonly unclosedFrom: number | null;
}

/** Find HTML comments that are not inside a same-line Markdown code span. */
export function analyzeInlineHtmlComments(text: string): HtmlCommentAnalysis {
  const comments = scanInlineComments(text);
  return { ranges: comments.ranges, unclosedFrom: comments.unclosedFrom };
}

function maskCodeSpans(text: string, characters: string[]): void {
  for (let index = 0; index < text.length;) {
    if (text[index] !== "`" || isMarkdownSourceEscaped(text, index)) {
      index += 1;
      continue;
    }
    const end = codeSpanEnd(text, index);
    if (end == null) {
      while (text[index] === "`") index += 1;
      continue;
    }
    blankRange(characters, index, end);
    index = end;
  }
}

function workingText(characters: readonly string[]): string {
  return characters.join("");
}


function maskInlineHtml(text: string, characters: string[]): void {
  let scan = workingText(characters);
  for (let index = 0; index < text.length;) {
    const next = scan[index + 1] ?? "";
    if (scan[index] !== "<" || !/[A-Za-z/!?]/u.test(next)) {
      index += 1;
      continue;
    }
    let quote: "\"" | "'" | null = null;
    let closed = false;
    for (let cursor = index + 1; cursor < text.length; cursor += 1) {
      const character = scan[cursor] ?? "";
      if (quote !== null) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === "\"" || character === "'") {
        quote = character;
      } else if (character === ">") {
        blankRange(characters, index, cursor + 1);
        scan = workingText(characters);
        index = cursor + 1;
        closed = true;
        break;
      }
    }
    if (!closed) index += 1;
  }
}

/** A token is escaped only by an odd run of immediately preceding backslashes. */
export function isMarkdownSourceEscaped(text: string, offset: number): boolean {
  let slashes = 0;
  for (let cursor = offset - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

/** Mask remaining same-line syntax after shared snapshot literal protection. */
export function maskInlineProtectedSyntax(text: string): string {
  const characters = scanInlineComments(text).masked.split("");
  maskCodeSpans(characters.join(""), characters);
  maskInlineHtml(text, characters);
  return characters.join("");
}
