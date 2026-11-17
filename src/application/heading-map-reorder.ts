import { parseAtxHeadings } from "../core/heading-parser";

/** A single bounded editor change; the caller must compare expectedSource again before committing. */
export interface SameParentHeadingMove {
  readonly expectedSource: string;
  readonly from: number;
  readonly to: number;
  readonly original: string;
  readonly replacement: string;
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
  if (movingLine === targetLine) return null;
  const headings = parseAtxHeadings(source);
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
  if (targetAt >= movingFrom && targetAt <= movingTo) return null;

  const from = Math.min(movingFrom, targetAt);
  const to = Math.max(movingTo, targetAt);
  // Rotate two whole contiguous source intervals without touching surrounding text.
  const pivot = movingFrom < targetAt ? movingTo : movingFrom;
  const before = source.slice(from, pivot);
  const after = source.slice(pivot, to);
  if (!before || !after) return null;
  let replacement = after + before;
  // At EOF, the final section may lack an EOL. Move its predecessor's
  // line-ending to the new boundary, so headings never concatenate and the
  // document retains its original final-newline state (also for CRLF).
  if (!/[\r\n]$/u.test(after)) {
    const terminal = /(\r\n|\r|\n)$/u.exec(before)?.[0];
    if (terminal == null) return null;
    replacement = after + terminal + before.slice(0, -terminal.length);
  }
  const original = source.slice(from, to);
  if (replacement === original) return null;
  return Object.freeze({ expectedSource: source, from, to, original, replacement });
}
