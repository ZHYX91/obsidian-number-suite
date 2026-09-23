import type { ParsedHeading } from "../core/types";

/** Match source lines, including surrounding body text, instead of matching displayed titles. */
function sourceLineMatches(before: readonly string[], after: readonly string[]): Map<number, number> {
  const matches = new Map<number, number>();
  const unique = (lines: readonly string[], from: number, to: number): Map<string, number> => {
    const positions = new Map<string, number>();
    for (let index = from; index < to; index += 1) {
      const line = lines[index] ?? "";
      positions.set(line, positions.has(line) ? -1 : index);
    }
    return positions;
  };
  const align = (oldFrom: number, oldTo: number, newFrom: number, newTo: number): void => {
    while (oldFrom < oldTo && newFrom < newTo && before[oldFrom] === after[newFrom]) {
      matches.set(newFrom++, oldFrom++);
    }
    while (oldFrom < oldTo && newFrom < newTo && before[oldTo - 1] === after[newTo - 1]) {
      matches.set(--newTo, --oldTo);
    }
    if (oldFrom === oldTo || newFrom === newTo) return;

    // Patience anchors keep duplicate headings attached to their surrounding source sections.
    const oldUnique = unique(before, oldFrom, oldTo);
    const newUnique = unique(after, newFrom, newTo);
    const pairs: Array<{ old: number; next: number; previous: number }> = [];
    const tails: number[] = [];
    for (let next = newFrom; next < newTo; next += 1) {
      const line = after[next] ?? "";
      const old = oldUnique.get(line);
      if (old == null || old < 0 || newUnique.get(line) !== next) continue;
      let low = 0;
      let high = tails.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (pairs[tails[middle]!]!.old < old) low = middle + 1;
        else high = middle;
      }
      pairs.push({ old, next, previous: low === 0 ? -1 : tails[low - 1]! });
      tails[low] = pairs.length - 1;
    }
    if (tails.length === 0) {
      // An equal-length replacement is a line edit (rename, level or number change).
      // For ambiguous insertions/deletions, allocate new identities rather than aliasing nodes.
      if (oldTo - oldFrom === newTo - newFrom) {
        while (newFrom < newTo) matches.set(newFrom++, oldFrom++);
      }
      return;
    }
    const anchors: Array<{ old: number; next: number }> = [];
    for (let index = tails[tails.length - 1]!; index >= 0; index = pairs[index]!.previous) {
      anchors.push(pairs[index]!);
    }
    for (const anchor of anchors.reverse()) {
      align(oldFrom, anchor.old, newFrom, anchor.next);
      matches.set(anchor.next, anchor.old);
      oldFrom = anchor.old + 1;
      newFrom = anchor.next + 1;
    }
    align(oldFrom, oldTo, newFrom, newTo);
  };
  align(0, before.length, 0, after.length);
  return matches;
}

/** One document session owns monotonically allocated IDs, reconciled across source snapshots. */
export class HeadingMapIdentity {
  private lines: readonly string[] = [];
  private ids = new Map<number, string>();
  private nextId = 1;

  update(source: string, headings: readonly ParsedHeading[]): ReadonlyMap<number, string> {
    const lines = source.split(/\r\n|\r|\n/u);
    if (lines[lines.length - 1] === "") lines.pop();
    const matches = sourceLineMatches(this.lines, lines);
    const ids = new Map<number, string>();
    for (const heading of headings) {
      const previousLine = matches.get(heading.line);
      const previousId = previousLine == null ? undefined : this.ids.get(previousLine);
      ids.set(heading.line, previousId ?? `heading-${this.nextId++}`);
    }
    this.lines = lines;
    this.ids = ids;
    return ids;
  }
}
