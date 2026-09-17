import { scanPhysicalLines, type PhysicalSourceLine } from "./source-lines";

export interface MarkdownProtectedLine extends PhysicalSourceLine {
  readonly available: boolean;
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
  | Readonly<{ kind: "blank-html" }>
  | Readonly<{ kind: "obsidian-comment" }>;

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
  let previousBlank = true;

  for (const line of lines) {
    const trimmed = line.text.trim();
    let available = true;

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
    } else if (state?.kind === "obsidian-comment") {
      available = false;
      if (line.text.includes("%%")) state = null;
    } else if (state?.kind === "blank-html") {
      if (trimmed.length === 0) {
        state = null;
        available = true;
      } else {
        available = false;
      }
    } else if (options.indentedCode === true && /^(?: {4}|\t)/u.test(line.text)) {
      available = false;
    } else {
      const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line.text)?.[1];
      if (fence != null) {
        available = false;
        state = {
          kind: "fence",
          character: fence[0] as "`" | "~",
          length: fence.length,
        };
      } else {
        const markup = leadingMarkup(line.text);
        if (markup != null && markup.startsWith("%%")) {
          available = false;
          if (markup.indexOf("%%", 2) < 0) state = { kind: "obsidian-comment" };
        } else if (markup != null && markup.startsWith("<!--")) {
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
          } else if (previousBlank && completeCustomHtmlTag(markup)) {
            available = false;
            state = { kind: "blank-html" };
          }
        }
        if (available) {
          const htmlComment = analyzeInlineHtmlComments(line.text);
          if (htmlComment.unclosedFrom != null) {
            available = false;
            state = { kind: "until", ending: "-->" };
          } else if (unclosedObsidianCommentFromOutsideCode(line.text) != null) {
            available = false;
            state = { kind: "obsidian-comment" };
          }
        }
      }
    }

    output.push({ ...line, available });
    previousBlank = trimmed.length === 0;
  }

  return output;
}

export interface HtmlCommentAnalysis {
  readonly ranges: ReadonlyArray<Readonly<{ from: number; to: number }>>;
  readonly unclosedFrom: number | null;
}

/** Find HTML comments that are not inside a same-line Markdown code span. */
export function analyzeInlineHtmlComments(text: string): HtmlCommentAnalysis {
  const ranges: Array<Readonly<{ from: number; to: number }>> = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] === "`") {
      let ticks = 1;
      while (text[cursor + ticks] === "`") ticks += 1;
      const marker = "`".repeat(ticks);
      const closing = text.indexOf(marker, cursor + ticks);
      if (closing >= 0) {
        cursor = closing + ticks;
        continue;
      }
      cursor += ticks;
      continue;
    }
    if (text.startsWith("<!--", cursor)) {
      const closing = text.indexOf("-->", cursor + 4);
      if (closing < 0) return { ranges, unclosedFrom: cursor };
      ranges.push({ from: cursor, to: closing + 3 });
      cursor = closing + 3;
      continue;
    }
    cursor += 1;
  }
  return { ranges, unclosedFrom: null };
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
    let ticks = 1;
    while (text[index + ticks] === "`") ticks += 1;
    const marker = "`".repeat(ticks);
    const closing = text.indexOf(marker, index + ticks);
    if (closing < 0) {
      index += ticks;
      continue;
    }
    blankRange(characters, index, closing + ticks);
    index = closing + ticks;
  }
}

function unclosedObsidianCommentFromOutsideCode(text: string): number | null {
  const characters = text.split("");
  maskCodeSpans(text, characters);
  const scan = characters.join("");
  const opening = scan.indexOf("%%");
  if (opening < 0) return null;
  return scan.indexOf("%%", opening + 2) < 0 ? opening : null;
}

function workingText(characters: readonly string[]): string {
  return characters.join("");
}

function maskDelimited(
  text: string,
  characters: string[],
  opening: string,
  closing: string,
): void {
  let scan = workingText(characters);
  for (let index = 0; index < text.length;) {
    const start = scan.indexOf(opening, index);
    if (start < 0) return;
    const end = scan.indexOf(closing, start + opening.length);
    const to = end < 0 ? text.length : end + closing.length;
    blankRange(characters, start, to);
    scan = workingText(characters);
    if (end < 0) return;
    index = to;
  }
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
  const characters = text.split("");
  maskCodeSpans(text, characters);
  maskDelimited(text, characters, "<!--", "-->");
  maskDelimited(text, characters, "%%", "%%");
  maskInlineHtml(text, characters);
  maskLinkDestinations(text, characters);
  return characters.join("");
}
