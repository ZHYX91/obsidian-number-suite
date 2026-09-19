import { scanPhysicalLines, type PhysicalSourceLine } from "./source-lines";

export interface MarkdownProtectedLine extends PhysicalSourceLine {
  readonly available: boolean;
  readonly commentMaskedText: string;
  readonly headingAvailable: boolean;
}

export interface MarkdownProtectionOptions {
  readonly indentedCode?: boolean;
}

const RAW_HTML_TAGS = new Set(["pre", "script", "style", "textarea"]);
const BLOCK_HTML_TAGS = new Set([
  "address", "article", "aside", "base", "basefont", "blockquote", "body",
  "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu",
  "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param",
  "search", "section", "summary", "table", "tbody", "td", "tfoot", "th",
  "thead", "title", "tr", "track", "ul",
]);

type ProtectedBlockState =
  | Readonly<{ kind: "fence"; character: "`" | "~"; length: number }>
  | Readonly<{ kind: "until"; ending: string }>
  | Readonly<{ kind: "raw-html"; tag: string }>
  | Readonly<{ kind: "blank-html" }>;

function leadingMarkup(text: string): string | null {
  const match = /^ {0,3}(\S.*)$/u.exec(text);
  return match?.[1] ?? (text.trim().length === 0 ? "" : null);
}

function rawHtmlStart(markup: string): string | null {
  const match = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/?>)/u.exec(markup);
  const tag = match?.[1]?.toLowerCase() ?? null;
  return tag != null && RAW_HTML_TAGS.has(tag) ? tag : null;
}

function blockHtmlStart(markup: string): boolean {
  const match = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s|\/?>|$)/u.exec(markup);
  const tag = match?.[1]?.toLowerCase() ?? null;
  return tag != null && BLOCK_HTML_TAGS.has(tag);
}

function completeCustomHtmlTag(markup: string): boolean {
  return /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+(?:[^<>"']+|"[^"]*"|'[^']*')*)?\s*\/?>[ \t]*$/u.test(markup);
}

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
  options: MarkdownProtectionOptions = {},
): MarkdownProtectedLine[] {
  const lines = scanPhysicalLines(source);
  const output: MarkdownProtectedLine[] = [];
  let state: ProtectedBlockState | null = null;
  let inParagraph = false;
  let inlineComment: CommentKind | null = null;

  for (const line of lines) {
    const trimmed = line.text.trim();
    let available = true;
    let commentMaskedText = line.text;
    let headingAvailable = true;

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
    } else if (inlineComment != null) {
      const comments = scanInlineComments(line.text, inlineComment);
      commentMaskedText = comments.masked;
      inlineComment = comments.state;
      headingAvailable = false;
    } else if (options.indentedCode === true && /^(?: {4}|\t)/u.test(line.text)) {
      available = false;
    } else {
      const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.text);
      const fence = fenceMatch?.[1]?.startsWith("`") && fenceMatch[2]?.includes("`")
        ? null : fenceMatch?.[1];
      if (fence != null) {
        available = false;
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

    output.push({ ...line, available, commentMaskedText, headingAvailable: available && headingAvailable });
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

type CommentKind = "html" | "obsidian";

function codeSpanEnd(text: string, from: number): number | null {
  let length = 1;
  while (text[from + length] === "`") length += 1;
  for (let cursor = from + length; cursor < text.length;) {
    if (text[cursor] !== "`") { cursor += 1; continue; }
    let closingLength = 1;
    while (text[cursor + closingLength] === "`") closingLength += 1;
    if (closingLength === length) return cursor + length;
    cursor += closingLength;
  }
  return null;
}

function scanInlineComments(text: string, initial: CommentKind | null = null) {
  const characters = text.split("");
  const ranges: Array<{ from: number; to: number; kind: CommentKind }> = [];
  let state = initial;
  let unclosedFrom: number | null = null;
  for (let cursor = 0; cursor < text.length;) {
    if (state == null) {
      if (text[cursor] === "\\") { cursor += 2; continue; }
      if (text[cursor] === "`") {
        const end = codeSpanEnd(text, cursor);
        if (end != null) { cursor = end; continue; }
        while (text[cursor] === "`") cursor += 1;
        continue;
      }
      if (text.startsWith("<!--", cursor)) state = "html";
      else if (text.startsWith("%%", cursor)) state = "obsidian";
      else { cursor += 1; continue; }
    }
    const from = cursor;
    const ending = state === "html" ? "-->" : "%%";
    const openingLength = initial != null && cursor === 0 ? 0 : state === "html" ? 4 : 2;
    const closing = text.indexOf(ending, cursor + openingLength);
    const to = closing < 0 ? text.length : closing + ending.length;
    ranges.push({ from, to, kind: state });
    blankRange(characters, from, to);
    if (closing < 0) { unclosedFrom = from; break; }
    state = null;
    cursor = to;
  }
  return { masked: characters.join(""), ranges, state, unclosedFrom };
}

/** Find HTML comments that are not inside a same-line Markdown code span. */
export function analyzeInlineHtmlComments(text: string): HtmlCommentAnalysis {
  const comments = scanInlineComments(text);
  return { ranges: comments.ranges, unclosedFrom: comments.unclosedFrom };
}

function blankRange(characters: string[], from: number, to: number): void {
  for (let index = from; index < to; index += 1) characters[index] = " ";
}

function maskCodeSpans(text: string, characters: string[]): void {
  for (let index = 0; index < text.length;) {
    if (text[index] !== "`") {
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

/** Mask inline regions that must not contribute note/reference semantics. */
export function maskInlineProtectedSyntax(text: string): string {
  const characters = scanInlineComments(text).masked.split("");
  maskCodeSpans(characters.join(""), characters);
  maskInlineHtml(text, characters);
  maskLinkDestinations(text, characters);
  return characters.join("");
}
