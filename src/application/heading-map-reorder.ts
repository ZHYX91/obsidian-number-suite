import { parseAtxHeadings } from "../core/heading-parser";
import { scanMarkdownProtectedLines } from "../core/markdown-protection";

/** A single bounded editor change; the caller must compare expectedSource again before committing. */
export type HeadingMovePlacement = "before" | "after" | "inside";

export interface SameParentHeadingMove {
  readonly expectedSource: string;
  readonly from: number;
  readonly to: number;
  readonly original: string;
  readonly replacement: string;
  readonly resultSource: string;
  readonly nextHeadingLines: ReadonlyMap<number, number>;
}

/**
 * Relocate a complete heading section among siblings under the same parent.
 * This never promotes/demotes headings or regenerates Markdown. A single
 * contiguous change keeps the entire move as one editor undo transaction.
 */
export function planSameParentHeadingMove(
  source: string,
  movingLine: number,
  targetLine: number,
  placement: "before" | "after",
): SameParentHeadingMove | null {
  const move = assessSameParentHeadingMove(source, movingLine, targetLine, placement);
  return move === "unchanged" ? null : move;
}

/** A refused structural change needs feedback; an unchanged drop can stay quiet. */
export function assessSameParentHeadingMove(
  source: string,
  movingLine: number,
  targetLine: number,
  placement: "before" | "after",
): SameParentHeadingMove | "unchanged" | null {
  return assessHeadingMove(source, movingLine, targetLine, placement, false);
}

export function assessHeadingMove(
  source: string,
  movingLine: number,
  targetLine: number,
  placement: HeadingMovePlacement,
  allowReparenting: boolean,
): SameParentHeadingMove | "unchanged" | null {
  if (placement === "inside" && !allowReparenting) return null;
  if (movingLine === targetLine) return "unchanged";
  const lines = scanMarkdownProtectedLines(source);
  const atx = parseAtxHeadings(source, lines);
  if (!atx.some((heading) => heading.line === movingLine) || !atx.some((heading) => heading.line === targetLine)) return null;
  // Setext headings are not movable cards. They still define parents and the
  // end of the preceding section, including the blank line that starts the title.
  const setext = lines.flatMap((line) => {
    if (line.setextLevel == null) return [];
    let boundary = line.number;
    while (boundary > 0 && lines[boundary - 1]!.text.trim() === "") boundary -= 1;
    return [{ level: line.setextLevel, line: line.number, lineFrom: lines[boundary]!.from }];
  });
  const headings = [...atx, ...setext].sort((a, b) => a.line - b.line);
  const parents = headingParents(headings);
  const movingIndex = headings.findIndex((heading) => heading.line === movingLine);
  const targetIndex = headings.findIndex((heading) => heading.line === targetLine);
  const moving = headings[movingIndex]!;
  const target = headings[targetIndex]!;
  const destinationParent = placement === "inside" ? targetIndex : parents[targetIndex]!;
  const changesParent = parents[movingIndex] !== destinationParent;
  if (changesParent && !allowReparenting) return null;
  const level = placement === "inside" ? target.level + 1 : target.level;
  if (!changesParent && placement !== "inside" && moving.level !== level) return null;
  const levelDelta = changesParent ? level - moving.level : 0;

  const sectionEnd = (index: number): number => {
    const level = headings[index]!.level;
    for (let next = index + 1; next < headings.length; next += 1) {
      if (headings[next]!.level <= level) return headings[next]!.lineFrom;
    }
    return source.length;
  };
  const movingFrom = moving.lineFrom;
  const movingTo = sectionEnd(movingIndex);
  const targetAt = placement === "before"
    ? headings[targetIndex]!.lineFrom
    : sectionEnd(targetIndex);
  if (target.lineFrom > movingFrom && target.lineFrom < movingTo) return null;
  if (targetAt > movingFrom && targetAt < movingTo) return null;
  if (levelDelta !== 0 && setext.some((heading) => heading.lineFrom >= movingFrom && heading.lineFrom < movingTo)) return null;
  const edits = atx.flatMap((heading) => {
    if (levelDelta === 0 || heading.lineFrom < movingFrom || heading.lineFrom >= movingTo) return [];
    return [{ from: heading.markerFrom, length: heading.level, level: heading.level + levelDelta }];
  });
  if (edits.some((edit) => edit.level < 1 || edit.level > 9)) return null;
  if (!changesParent && (targetAt === movingFrom || targetAt === movingTo)) return "unchanged";

  const from = Math.min(movingFrom, targetAt);
  const to = Math.max(movingTo, targetAt);
  // Rotate two whole contiguous source intervals without touching surrounding text.
  const pivot = movingFrom < targetAt ? movingTo : movingFrom;
  const before = source.slice(from, pivot);
  const after = source.slice(pivot, to);
  const rotates = targetAt !== movingFrom && targetAt !== movingTo;
  let replacement = rotates ? after + before : source.slice(from, to);
  let transferredEolLength = 0;
  // At EOF, the final section may lack an EOL. Move its predecessor's
  // line-ending to the new boundary, so headings never concatenate and the
  // document retains its original final-newline state (also for CRLF).
  if (rotates && !/[\r\n]$/u.test(after)) {
    const terminal = /(\r\n|\r|\n)$/u.exec(before)?.[0];
    if (terminal == null) return null;
    transferredEolLength = terminal.length;
    replacement = after + terminal + before.slice(0, -terminal.length);
  }
  const rotatedOffset = (offset: number): number => {
    if (!rotates || offset < from || offset >= to) return offset;
    if (offset >= pivot) return offset - before.length;
    return offset + after.length + transferredEolLength;
  };
  // All marker edits belong to one moved interval and keep their relative order.
  const updatedMarkers = edits.map((edit) => ({ ...edit, from: rotatedOffset(edit.from) }));
  if (updatedMarkers.length > 0) {
    const chunks: string[] = [];
    let cursor = 0;
    for (const marker of updatedMarkers) {
      const offset = marker.from - from;
      chunks.push(replacement.slice(cursor, offset), "#".repeat(marker.level));
      cursor = offset + marker.length;
    }
    chunks.push(replacement.slice(cursor));
    replacement = chunks.join("");
  }
  const original = source.slice(from, to);
  if (replacement === original) return "unchanged";
  // Reparse both joins and verify identity, heading levels, and parentage.
  const result = source.slice(0, from) + replacement + source.slice(to);
  const resultLines = scanMarkdownProtectedLines(result);
  const resultAtx = new Map(parseAtxHeadings(result, resultLines).map((heading) => [heading.lineFrom, heading]));
  const resultSetext = new Map(resultLines.flatMap((line) =>
    line.setextLevel == null ? [] : [[line.from, line.setextLevel] as const]));
  if (resultAtx.size !== atx.length || resultSetext.size !== setext.length) return null;

  const resultHeadings = [
    ...resultAtx.values(),
    ...[...resultSetext].map(([lineFrom, level]) => ({ lineFrom, level })),
  ].sort((a, b) => a.lineFrom - b.lineFrom);
  const resultParents = headingParents(resultHeadings);
  const resultIndexes = new Map(resultHeadings.map((heading, index) => [heading.lineFrom, index]));
  const firstMarker = updatedMarkers[0]?.from ?? Infinity;
  const lastMarker = updatedMarkers[updatedMarkers.length - 1]?.from ?? Infinity;
  const relocatedOffset = (offset: number): number => {
    const rotated = rotatedOffset(offset);
    if (rotated <= firstMarker) return rotated;
    if (rotated > lastMarker) return rotated + updatedMarkers.length * levelDelta;
    // Count preceding marker starts in O(log n), including documents with large subtrees.
    let low = 0;
    let high = updatedMarkers.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (updatedMarkers[middle]!.from < rotated) low = middle + 1;
      else high = middle;
    }
    return rotated + low * levelDelta;
  };
  const sourceOffsets = headings.map((heading) => lines[heading.line]!.from);
  for (const [index, offset] of sourceOffsets.entries()) {
    const resultIndex = resultIndexes.get(relocatedOffset(offset));
    const parent = index === movingIndex ? destinationParent : parents[index]!;
    const expected = parent < 0 ? -1 : resultIndexes.get(relocatedOffset(sourceOffsets[parent]!));
    if (resultIndex == null || expected == null || resultParents[resultIndex] !== expected) return null;
  }
  const nextHeadingLines = new Map<number, number>();
  for (const heading of atx) {
    const current = resultAtx.get(relocatedOffset(heading.lineFrom));
    const delta = heading.lineFrom >= movingFrom && heading.lineFrom < movingTo ? levelDelta : 0;
    if (current?.level !== heading.level + delta || current.content !== heading.content) return null;
    nextHeadingLines.set(heading.line, current.line);
  }
  for (const heading of setext) {
    // lineFrom may include a preceding blank line; verify the actual title.
    if (resultSetext.get(relocatedOffset(lines[heading.line]!.from)) !== heading.level) return null;
  }
  return Object.freeze({ expectedSource: source, from, to, original, replacement, resultSource: result, nextHeadingLines });
}


function headingParents(headings: readonly { level: number }[]): number[] {
  const parents: number[] = [];
  const stack: number[] = [];
  for (const [index, heading] of headings.entries()) {
    while (stack.length > 0 && headings[stack[stack.length - 1]!]!.level >= heading.level) {
      stack.pop();
    }
    parents.push(stack[stack.length - 1] ?? -1);
    stack.push(index);
  }
  return parents;
}
