import type { HeadingLevel, ParsedHeading } from "./types";
import { noteContainerLines } from "./note-semantics";
import {
  analyzeInlineHtmlComments,
  scanMarkdownProtectedLines,
} from "./markdown-protection";

function projectVisibleContent(
  source: string,
  sourceFrom: number,
): Pick<ParsedHeading, "content" | "contentFrom" | "contentTo" | "contentSpans"> {
  const hidden = analyzeInlineHtmlComments(source).ranges;
  const visible: { from: number; to: number }[] = [];
  const padding = (offset: number): boolean => source[offset] === " " || source[offset] === "\t";
  for (let index = 0; index <= hidden.length; index += 1) {
    let from = hidden[index - 1]?.to ?? 0;
    const to = hidden[index]?.from ?? source.length;
    if (visible.length === 0) {
      while (from < to && padding(from)) from += 1;
    }
    if (from < to) visible.push({ from, to });
  }
  // Trailing padding can span multiple fragments separated by comments.
  while (visible.length > 0) {
    const last = visible[visible.length - 1]!;
    while (last.to > last.from && padding(last.to - 1)) last.to -= 1;
    if (last.to > last.from) break;
    visible.pop();
  }
  let content = "";
  const spans = visible.map(({ from, to }) => {
    const visibleFrom = content.length;
    content += source.slice(from, to);
    return { visibleFrom, visibleTo: content.length, sourceFrom: sourceFrom + from, sourceTo: sourceFrom + to };
  });
  return {
    content,
    contentFrom: spans[0]?.sourceFrom ?? sourceFrom,
    contentTo: spans[spans.length - 1]?.sourceTo ?? sourceFrom,
    contentSpans: spans,
  };
}

function parseAtxLine(
  line: ReturnType<typeof scanMarkdownProtectedLines>[number],
): ParsedHeading | null {
  const match = /^( {0,3})(#{1,9})(?:([ \t]+)(.*)|[ \t]*)$/.exec(line.text);
  if (match == null) return null;
  const indent = match[1] ?? "";
  const hashes = match[2] ?? "";
  const spacing = match[3] ?? "";
  if (hashes.length >= 7 && spacing.length === 0) return null;
  const rawContent = match[4] ?? "";
  const closing = /^(.*?)(?:[ \t]+#+[ \t]*)$/.exec(rawContent);
  const sourceContent = closing?.[1] ?? (/^#+[ \t]*$/u.test(rawContent) ? "" : rawContent);
  const rawContentFrom = line.from + indent.length + hashes.length + spacing.length;
  return {
    line: line.number,
    level: hashes.length as HeadingLevel,
    lineFrom: line.from,
    lineTo: line.to,
    markerFrom: line.from + indent.length,
    ...projectVisibleContent(sourceContent, rawContentFrom),
  };
}

export function sourceOffsetForHeadingContent(
  heading: ParsedHeading,
  visibleOffset: number,
): number {
  if (!Number.isSafeInteger(visibleOffset) || visibleOffset < 0 || visibleOffset > heading.content.length) {
    throw new RangeError(`Invalid visible heading offset: ${visibleOffset}`);
  }
  if (visibleOffset === 0) return heading.contentSpans[0]?.sourceFrom ?? heading.contentFrom;
  for (const span of heading.contentSpans) {
    if (visibleOffset >= span.visibleFrom && visibleOffset <= span.visibleTo) {
      return span.sourceFrom + visibleOffset - span.visibleFrom;
    }
  }
  return heading.contentTo;
}

export function parseAtxHeadings(
  source: string,
  lines = scanMarkdownProtectedLines(source),
  noteLines = noteContainerLines(source, lines),
): ParsedHeading[] {
  const headings: ParsedHeading[] = [];

  for (const line of lines) {
    if (noteLines.has(line.number)) continue;

    if (!line.headingAvailable) continue;

    const heading = parseAtxLine(line);
    if (heading != null) headings.push(heading);
  }

  return headings;
}
