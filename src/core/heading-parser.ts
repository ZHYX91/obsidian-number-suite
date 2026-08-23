import type { ParsedHeading } from "./types";
import { noteContainerLines } from "./note-semantics";

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "base", "basefont", "blockquote", "body",
  "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu",
  "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param",
  "search", "section", "summary", "table", "tbody", "td", "tfoot", "th",
  "thead", "title", "tr", "track", "ul",
]);

interface SourceLine {
  text: string;
  from: number;
  to: number;
  number: number;
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  let number = 0;
  while (from < source.length) {
    const newline = source.indexOf("\n", from);
    const rawTo = newline < 0 ? source.length : newline;
    const to = rawTo > from && source.charCodeAt(rawTo - 1) === 13 ? rawTo - 1 : rawTo;
    lines.push({ text: source.slice(from, to), from, to, number });
    number += 1;
    if (newline < 0) {
      return lines;
    }
    from = newline + 1;
  }
  if (source.length === 0 || source.endsWith("\n")) {
    lines.push({ text: "", from: source.length, to: source.length, number });
  }
  return lines;
}

function rawHtmlTag(line: string): string | null {
  const match = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/>)/.exec(line);
  return match?.[1]?.toLowerCase() ?? null;
}

export function parseAtxHeadings(source: string): ParsedHeading[] {
  const headings: ParsedHeading[] = [];
  const lines = sourceLines(source);
  const noteLines = noteContainerLines(source);
  let inFrontmatter = false;
  let frontmatterFinished = false;
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;
  let inComment = false;
  let inObsidianComment = false;
  let rawTag: string | null = null;
  let genericHtmlBlock = false;

  for (const line of lines) {
    const trimmed = line.text.trim();

    if (noteLines.has(line.number)) {
      continue;
    }

    if (line.number === 0 && line.text.replace(/^\uFEFF/, "").trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.number > 0 && (trimmed === "---" || trimmed === "...")) {
        inFrontmatter = false;
        frontmatterFinished = true;
      }
      continue;
    }
    if (!frontmatterFinished && line.number > 0) {
      frontmatterFinished = true;
    }

    if (fenceCharacter != null) {
      const escaped = fenceCharacter === "`" ? "`" : "~";
      const closing = new RegExp(`^ {0,3}${escaped}{${fenceLength},}[ \\t]*$`);
      if (closing.test(line.text)) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line.text);
    if (fence?.[1] != null) {
      fenceCharacter = fence[1][0] as "`" | "~";
      fenceLength = fence[1].length;
      continue;
    }

    if (inComment) {
      const end = line.text.indexOf("-->");
      if (end >= 0) {
        inComment = false;
      }
      continue;
    }
    if (inObsidianComment) {
      if (line.text.includes("%%")) inObsidianComment = false;
      continue;
    }
    const obsidianComment = /^ {0,3}%%/u.exec(line.text);
    if (obsidianComment != null) {
      const closing = line.text.indexOf("%%", obsidianComment[0].length);
      if (closing < 0) inObsidianComment = true;
      continue;
    }
    const commentStart = line.text.indexOf("<!--");
    if (commentStart >= 0) {
      if (line.text.indexOf("-->", commentStart + 4) < 0) {
        inComment = true;
      }
      continue;
    }

    if (rawTag != null) {
      if (new RegExp(`</${rawTag}[ \\t]*>`, "i").test(line.text)) {
        rawTag = null;
      }
      continue;
    }
    if (genericHtmlBlock) {
      if (trimmed.length === 0) {
        genericHtmlBlock = false;
      }
      continue;
    }
    const htmlTag = rawHtmlTag(line.text);
    if (htmlTag != null) {
      if (["script", "pre", "style", "textarea"].includes(htmlTag)) {
        if (!new RegExp(`</${htmlTag}[ \\t]*>`, "i").test(line.text)) {
          rawTag = htmlTag;
        }
      } else if (BLOCK_TAGS.has(htmlTag)) {
        genericHtmlBlock = true;
      }
      continue;
    }

    const match = /^( {0,3})(#{1,6})(?:([ \t]+)(.*)|[ \t]*)$/.exec(line.text);
    if (match == null) {
      continue;
    }
    const indent = match[1] ?? "";
    const hashes = match[2] ?? "";
    const spacing = match[3] ?? "";
    const rawContent = match[4] ?? "";
    const closing = /^(.*?)(?:[ \t]+#+[ \t]*)$/.exec(rawContent);
    const content = closing?.[1] ?? rawContent;
    const contentFrom = line.from + indent.length + hashes.length + spacing.length;
    headings.push({
      line: line.number,
      level: hashes.length,
      lineFrom: line.from,
      lineTo: line.to,
      markerFrom: line.from + indent.length,
      contentFrom,
      contentTo: contentFrom + content.length,
      content,
    });
  }

  return headings;
}
