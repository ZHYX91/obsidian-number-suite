import { parseAtxHeadings } from "../core/heading-parser";
import { scanMarkdownProtectedLines } from "../core/markdown-protection";

/** A single bounded editor change; the caller must compare expectedSource again before committing. */
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
  const parents: number[] = [];
  const stack: number[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    while (stack.length > 0 && headings[stack[stack.length - 1]!]!.level >= heading.level) {
      stack.pop();
    }
    parents.push(stack[stack.length - 1] ?? -1);
    stack.push(index);
  }
  const movingIndex = headings.findIndex((heading) => heading.line === movingLine);
  const targetIndex = headings.findIndex((heading) => heading.line === targetLine);
  if (movingIndex < 0 || targetIndex < 0
    || parents[movingIndex] !== parents[targetIndex]
    || headings[movingIndex]!.level !== headings[targetIndex]!.level) return null;

  const sectionEnd = (index: number): number => {
    const level = headings[index]!.level;
    for (let next = index + 1; next < headings.length; next += 1) {
      if (headings[next]!.level <= level) return headings[next]!.lineFrom;
    }
    return source.length;
  };
  const movingFrom = headings[movingIndex]!.lineFrom;
  const movingTo = sectionEnd(movingIndex);
  const targetAt = placement === "before"
    ? headings[targetIndex]!.lineFrom
    : sectionEnd(targetIndex);
  // Adjacent no-ops and destinations inside the moved subtree are not writes.
  if (targetAt >= movingFrom && targetAt <= movingTo) return "unchanged";

  const from = Math.min(movingFrom, targetAt);
  const to = Math.max(movingTo, targetAt);
  // Rotate two whole contiguous source intervals without touching surrounding text.
  const pivot = movingFrom < targetAt ? movingTo : movingFrom;
  const before = source.slice(from, pivot);
  const after = source.slice(pivot, to);
  if (!before || !after) return null;
  let replacement = after + before;
  let transferredEolLength = 0;
  // At EOF, the final section may lack an EOL. Move its predecessor's
  // line-ending to the new boundary, so headings never concatenate and the
  // document retains its original final-newline state (also for CRLF).
  if (!/[\r\n]$/u.test(after)) {
    const terminal = /(\r\n|\r|\n)$/u.exec(before)?.[0];
    if (terminal == null) return null;
    transferredEolLength = terminal.length;
    replacement = after + terminal + before.slice(0, -terminal.length);
  }
  const original = source.slice(from, to);
  if (replacement === original) return "unchanged";
  // Reparse both joins. A fence, HTML block, comment or paragraph may now
  // consume a heading, or expose a previously protected heading with the same title.
  const result = source.slice(0, from) + replacement + source.slice(to);
  const resultLines = scanMarkdownProtectedLines(result);
  const resultAtx = new Map(parseAtxHeadings(result, resultLines).map((heading) => [heading.lineFrom, heading]));
  const resultSetext = new Map(resultLines.flatMap((line) =>
    line.setextLevel == null ? [] : [[line.from, line.setextLevel] as const]));
  if (resultAtx.size !== atx.length || resultSetext.size !== setext.length) return null;

  const relocatedOffset = (offset: number): number => {
    if (offset < from || offset >= to) return offset;
    if (offset >= pivot) return offset - before.length;
    return offset + after.length + transferredEolLength;
  };
  const nextHeadingLines = new Map<number, number>();
  for (const heading of atx) {
    const current = resultAtx.get(relocatedOffset(heading.lineFrom));
    if (current?.level !== heading.level || current.content !== heading.content) return null;
    nextHeadingLines.set(heading.line, current.line);
  }
  for (const heading of setext) {
    // lineFrom may include a preceding blank line; verify the actual title.
    if (resultSetext.get(relocatedOffset(lines[heading.line]!.from)) !== heading.level) return null;
  }
  return Object.freeze({ expectedSource: source, from, to, original, replacement, resultSource: result, nextHeadingLines });
}
