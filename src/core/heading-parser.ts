import type { HeadingContentSpan, HeadingLevel, ParsedHeading } from "./types";
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
  const characters: Array<{ value: string; source: number }> = [];
  let rangeIndex = 0;
  for (let index = 0; index < source.length;) {
    const range = hidden[rangeIndex];
    if (range != null && index >= range.from && index < range.to) {
      index = range.to;
      rangeIndex += 1;
      continue;
    }
    characters.push({ value: source[index] ?? "", source: sourceFrom + index });
    index += 1;
  }

  let visibleFrom = 0;
  let visibleTo = characters.length;
  while (visibleFrom < visibleTo && /^[ \t]$/u.test(characters[visibleFrom]?.value ?? "")) {
    visibleFrom += 1;
  }
  while (visibleTo > visibleFrom && /^[ \t]$/u.test(characters[visibleTo - 1]?.value ?? "")) {
    visibleTo -= 1;
  }

  const visible = characters.slice(visibleFrom, visibleTo);
  const spans: HeadingContentSpan[] = [];
  for (let index = 0; index < visible.length; index += 1) {
    const character = visible[index];
    if (character == null) continue;
    const previous = spans[spans.length - 1];
    if (previous != null && previous.sourceTo === character.source) {
      spans[spans.length - 1] = {
        ...previous,
        visibleTo: index + 1,
        sourceTo: character.source + 1,
      };
    } else {
      spans.push({
        visibleFrom: index,
        visibleTo: index + 1,
        sourceFrom: character.source,
        sourceTo: character.source + 1,
      });
    }
  }

  return {
    content: visible.map((character) => character.value).join(""),
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

export function parseAtxHeadings(source: string): ParsedHeading[] {
  const headings: ParsedHeading[] = [];
  const lines = scanMarkdownProtectedLines(source);
  const noteLines = noteContainerLines(source);
  let inInlineHtmlComment = false;

  for (const line of lines) {
    if (noteLines.has(line.number)) continue;

    if (inInlineHtmlComment) {
      if (line.text.includes("-->")) inInlineHtmlComment = false;
      continue;
    }
    if (!line.available) continue;

    const comments = analyzeInlineHtmlComments(line.text);
    if (comments.unclosedFrom != null) {
      inInlineHtmlComment = true;
      continue;
    }

    const heading = parseAtxLine(line);
    if (heading != null) headings.push(heading);
  }

  return headings;
}
