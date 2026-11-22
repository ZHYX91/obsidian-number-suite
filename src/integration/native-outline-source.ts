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
    frontmatterEnd, lastStructuralOffset, native, captionByLine };
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
