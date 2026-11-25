import type { HeadingCache } from "obsidian";
import { parseDocumentSemantics, scanSemanticSourceLines } from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";
import { scanMarkdownProtectedLines } from "../core/markdown-protection";
import { sameOutlineTitle, type ExtraOutlineHeading } from "./native-outline-projection";

/** Only source that can affect an Outline row, its numbering, or its navigation position. */
export function readOutlineStructure(source: string) {
  const lines = scanMarkdownProtectedLines(source);
  const headings = parseAtxHeadings(source, lines);
  const captions = parseDocumentSemantics(source, scanSemanticSourceLines(source, lines)).captions;
  const frontmatter = lines.filter((line) => line.frontmatter).map((line) => line.text);
  const setext = lines.filter((line) => line.setextLevel != null);
  const content = [
    frontmatter,
    headings.map((row) => source.slice(row.lineFrom, row.lineTo)),
    setext.map((line) => [line.setextLevel, line.text]),
    captions.map((row) => [row.kind, row.content]),
  ];
  const native = new Map(headings.map((row) => [row.line, {
    title: row.content, level: Number(row.level), offset: row.lineFrom, end: row.lineTo,
  }]));
  for (const line of setext) native.set(line.number, { title: line.text, level: line.setextLevel!, offset: line.from, end: line.to });
  const captionByLine = new Map(captions.map((row) => [row.line, {
    kind: row.kind, title: row.title, offset: row.lineFrom, end: row.lineTo,
  }]));
  const frontmatterEnd = frontmatter.length ? lines[frontmatter.length - 1]!.to : 0;
  const lastStructuralOffset = Math.max(
    headings[headings.length - 1]?.lineTo ?? 0, setext[setext.length - 1]?.to ?? 0,
    captions[captions.length - 1]?.lineTo ?? 0, frontmatterEnd,
  );
  const lineKey = JSON.stringify([[...native.keys()], [...captionByLine.keys()]]);
  return { contentKey: JSON.stringify(content), lineKey, positionKey: positionsKey(native, captionByLine),
    hasCarriageReturns: source.includes("\r"), frontmatterEnd, lastStructuralOffset, native, captionByLine };
}

export type OutlineStructure = ReturnType<typeof readOutlineStructure>;

type Positions = ReadonlyMap<number, { offset: number; end: number }>;

function positionsKey(...groups: Positions[]): string {
  return JSON.stringify(groups.map((rows) => [...rows].map(([line, row]) => [line, row.offset, row.end])));
}

function shiftAfter<R extends { offset: number; end: number }>(rows: Map<number, R>, after: number, delta: number): Map<number, R> {
  return new Map([...rows].map(([line, row]) => [line, row.offset < after ? row
    : { ...row, offset: row.offset + delta, end: row.end + delta }]));
}

/** Editing ordinary words within one prose line preserves structure. Validate the
 * entire changed line and suffix before rebasing offsets; Markdown punctuation,
 * headings, Setext titles, captions, frontmatter and multiline edits take the full parser. */
export function updateOutlineStructure(previous: string | undefined, next: string, prior: OutlineStructure | undefined): OutlineStructure {
  if (prior == null || previous == null) return readOutlineStructure(next);
  let at = 0;
  const shared = Math.min(previous.length, next.length);
  while (at < shared && previous.charCodeAt(at) === next.charCodeAt(at)) at++;
  if (at < prior.frontmatterEnd) return readOutlineStructure(next);
  const delta = next.length - previous.length;
  const tail = previous.slice(prior.lastStructuralOffset);
  if (at === previous.length && /^[\r\n][\p{L}\p{M}\p{N} .,，。\r\n]*$/u.test(tail)
    && /^[\p{L}\p{M}\p{N} ,，。]+$/u.test(next.slice(at))) return prior;
  const start = Math.max(previous.lastIndexOf("\n", at - 1), previous.lastIndexOf("\r", at - 1)) + 1;
  let end = at;
  while (end < previous.length && previous[end] !== "\n" && previous[end] !== "\r") end++;
  const nextEnd = end + delta;
  const plain = /^[\p{L}][\p{L}\p{M}\p{N} ,，。]*$/u;
  if (nextEnd < at || !plain.test(previous.slice(start, end)) || !plain.test(next.slice(start, nextEnd))
    || previous.slice(end) !== next.slice(nextEnd)) return readOutlineStructure(next);
  for (const heading of prior.native.values()) {
    if (heading.offset === start) return readOutlineStructure(next);
  }
  if (!delta || at > prior.lastStructuralOffset) return prior;
  const native = shiftAfter(prior.native, end, delta);
  const captionByLine = shiftAfter(prior.captionByLine, end, delta);
  return { ...prior, native, captionByLine, lastStructuralOffset: prior.lastStructuralOffset + delta,
    positionKey: positionsKey(native, captionByLine) };
}

export function nativeHeadingIsCurrent(structure: OutlineStructure, item: HeadingCache): boolean {
  const { line, col, offset } = item.position.start;
  const row = structure.native.get(line);
  return row != null && row.level === item.level && row.offset + col === offset && sameOutlineTitle(row.title, item.heading);
}

/** Cached offsets can count an extra CR at any line break normalized by the editor.
 * Accept a single consistent newline history for all verified heading endpoints. */
export function nativeHeadingsInSource(headings: HeadingCache[], structure: OutlineStructure, source: string): HeadingCache[] | null {
  if (headings.every((item) => {
    const { start, end } = item.position;
    const row = structure.native.get(start.line);
    return row != null && start.line === end.line && start.col >= 0 && end.col >= start.col
      && end.col <= row.end - row.offset && end.offset === row.offset + end.col && nativeHeadingIsCurrent(structure, item);
  })) return headings;
  const extras = new Map<number, number>([[0, 0]]);
  const aligned: HeadingCache[] = [];
  const record = (line: number, extra: number): boolean => {
    const known = extras.get(line);
    if (!Number.isSafeInteger(extra) || extra < 0 || extra > line || (known !== undefined && known !== extra)) return false;
    extras.set(line, extra);
    return true;
  };
  for (const item of headings) {
    const { start, end } = item.position;
    const row = structure.native.get(start.line);
    if (row == null || row.level !== item.level || !sameOutlineTitle(row.title, item.heading)
      || start.col < 0 || start.col > row.end - row.offset || end.line < start.line) return null;
    const from = row.offset + start.col;
    let endLineStart = row.offset;
    let lineEnd = row.end;
    if (end.line > start.line) {
      const breaks = /\r\n?|\n/gu;
      breaks.lastIndex = endLineStart;
      for (let line = start.line; line < end.line; line++) {
        if (!breaks.exec(source)) return null;
        endLineStart = breaks.lastIndex;
      }
      lineEnd = breaks.exec(source)?.index ?? source.length;
    }
    const to = endLineStart + end.col;
    const startExtra = start.offset - from;
    const endExtra = end.offset - to;
    if (end.col < 0 || to < from || to > lineEnd || (structure.hasCarriageReturns && (startExtra !== 0 || endExtra !== 0))
      || !record(start.line, startExtra) || !record(end.line, endExtra)) return null;
    aligned.push(start.offset === from && end.offset === to ? item
      : { ...item, position: { start: { ...start, offset: from }, end: { ...end, offset: to } } });
  }
  let previousLine = 0;
  let previousExtra = 0;
  for (const [line, extra] of [...extras].sort(([left], [right]) => left - right)) {
    const additional = extra - previousExtra;
    if (additional < 0 || additional > line - previousLine) return null;
    previousLine = line;
    previousExtra = extra;
  }
  return aligned.every((item, index) => item === headings[index]) ? headings : aligned;
}

export function syntheticRowIsCurrent(structure: OutlineStructure, item: ExtraOutlineHeading): boolean {
  if (item.__numberSuiteExtra !== "caption") return nativeHeadingIsCurrent(structure, item);
  const row = structure.captionByLine.get(item.position.start.line);
  return row != null && row.offset === item.position.start.offset && row.kind === item.__numberSuiteCaption?.kind
    && row.title === item.__numberSuiteCaption.title;
}

/** Preserve the core heading objects when their positions are current. While
 * metadata lags a prose edit, project new, private positions for verified rows. */
export function rebaseNativeHeadings(
  headings: HeadingCache[], previous: OutlineStructure, next: OutlineStructure,
): HeadingCache[] | null {
  if (previous.contentKey !== next.contentKey || !headings.every((item) => nativeHeadingIsCurrent(previous, item))) return null;
  const destinations = [...next.native];
  const lines = new Map([...previous.native.keys()].map((line, index) => [line, destinations[index]!]));
  return headings.map((item) => {
    const start = item.position.start;
    const end = item.position.end;
    const [line, row] = lines.get(start.line)!;
    const lineDelta = line - start.line;
    const offsetDelta = row.offset + start.col - start.offset;
    if (!lineDelta && !offsetDelta) return item;
    return { ...item, position: {
      start: { line, col: start.col, offset: start.offset + offsetDelta },
      end: { line: end.line + lineDelta, col: end.col, offset: end.offset + offsetDelta },
    } };
  });
}
