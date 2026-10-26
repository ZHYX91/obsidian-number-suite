import { blockHtmlStart, completeCustomHtmlTag, leadingMarkup, rawHtmlStart } from "./markdown-html-blocks";
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
}

type ProtectedBlockState =
  | Readonly<{ kind: "fence"; character: "`" | "~"; length: number }>
  | Readonly<{ kind: "until"; ending: string }>
  | Readonly<{ kind: "raw-html"; tag: string }>
  | Readonly<{ kind: "blank-html" }>;

function closesRawTag(text: string, tag: string): boolean {
  return new RegExp(`</${tag}[ \\t]*>`, "iu").test(text);
}

/**
 * Marks physical lines that are safe for Number Suite's top-level Markdown scanners.
 * The state machine covers frontmatter, fenced/indented code, CommonMark HTML block
 * families, and Obsidian block comments. Inline constructs remain available so each
 * semantic scanner can mask only the exact inline ranges it does not own.
 */
export function scanMarkdownProtectedLines(
  source: string,
): MarkdownProtectedLine[] {
  const lines = scanPhysicalLines(source);
  const containers = scanMarkdownContainerLines(lines);
  const output: MarkdownProtectedLine[] = [];
  let state: ProtectedBlockState | null = null;
  let inParagraph = false;
  let inlineComment: CommentKind | null = null;

  for (const line of lines) {
    const container = containers[line.number];
    const trimmed = line.text.trim();
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
      if (closesRawTag(line.text, state.tag)) state = null;
    } else if (state?.kind === "blank-html") {
      if (trimmed.length === 0) {
        state = null;
        available = true;
      } else {
        available = false;
      }
    } else if (container?.literalKind === "CodeBlock" || (container?.nested === true && container.literal)) {
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
      const comments = scanInlineComments(line.text, inlineComment);
      commentMaskedText = comments.masked;
      inlineComment = comments.state;
      headingAvailable = false;
    } else if (container?.nested === true) {
      // Ordinary list/quote references remain meaningful. Nested fences and
      // HTML must not start a document-level protection state after they end.
      const comments = scanInlineComments(line.text);
      commentMaskedText = comments.masked;
      inlineComment = comments.state;
      headingAvailable = false;
    } else {
      const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.text);
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
          const rawTag = rawHtmlStart(markup);
          if (rawTag != null) {
            available = false;
            if (!closesRawTag(markup, rawTag)) state = { kind: "raw-html", tag: rawTag };
          } else if (blockHtmlStart(markup)) {
            available = false;
            state = { kind: "blank-html" };
          } else if (!inParagraph && completeCustomHtmlTag(markup)) {
            available = false;
            state = { kind: "blank-html" };
          }
        }
        if (available) {
          const comments = scanInlineComments(line.text);
          commentMaskedText = comments.masked;
          inlineComment = comments.state;
          headingAvailable = inlineComment == null;
        }
      }
    }

    const topLevel = container?.nested !== true;
    output.push({ ...line, available, commentMaskedText, topLevel, fenceOpening, headingAvailable: available && headingAvailable && topLevel });
    // Type-7 HTML cannot interrupt a paragraph, but may follow a completed
    // heading, fence, thematic break or other block without a blank line.
    inParagraph = available && trimmed.length > 0
      && !/^ {0,3}(?:#{1,9}(?:[ \t]|$)|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$|(?:-[ \t]*){3,}$|[=-]+[ \t]*$|>|[-+*][ \t]|\d+[.)][ \t])/u.test(line.text);
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

function maskLinkDestinations(text: string, characters: string[]): void {
  let scan = workingText(characters);
  for (let index = 0; index < text.length - 1; index += 1) {
    if (scan[index] !== "]" || scan[index + 1] !== "(") continue;
    let depth = 1;
    let escaped = false;
    let quote: "\"" | "'" | null = null;
    for (let cursor = index + 2; cursor < text.length; cursor += 1) {
      const character = scan[cursor] ?? "";
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
      } else if (character === "\"" || character === "'") {
        if (quote === character) quote = null;
        else if (quote === null) quote = character;
      } else if (quote !== null) {
        continue;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          blankRange(characters, index + 1, cursor + 1);
          scan = workingText(characters);
          index = cursor;
          break;
        }
      }
    }
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

/** Mask inline regions that must not contribute note/reference semantics. */
export function maskInlineProtectedSyntax(text: string): string {
  const characters = scanInlineComments(text).masked.split("");
  maskCodeSpans(characters.join(""), characters);
  maskInlineHtml(text, characters);
  maskLinkDestinations(text, characters);
  return characters.join("");
}
