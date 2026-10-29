import type { SemanticSourceLine } from "./document-semantics";

function tableCells(text: string): string[] | null {
  if (!text.includes("|")) return null;
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let codeTicks = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === "`") {
      let run = 1;
      while (text[index + run] === "`") run += 1;
      current += "`".repeat(run);
      if (codeTicks === 0) codeTicks = run;
      else if (codeTicks === run) codeTicks = 0;
      index += run - 1;
      continue;
    }
    if (character === "|" && codeTicks === 0) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  if ((cells[0] ?? "").trim() === "") cells.shift();
  if ((cells[cells.length - 1] ?? "").trim() === "") cells.pop();
  return cells.length === 0 ? null : cells;
}

export function tableDelimiterColumnCount(line: SemanticSourceLine): number | null {
  if (!line.available || !line.topLevel) return null;
  const cells = tableCells(line.text);
  if (cells == null) return null;
  const delimiterCells = cells.filter((cell) => cell.trim().length > 0);
  if (delimiterCells.length === 0) return null;
  return delimiterCells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()))
    ? delimiterCells.length
    : null;
}

function tableRowColumnCount(line: SemanticSourceLine | undefined): number | null {
  if (line == null || !line.available || !line.topLevel || line.text.trim().length === 0) return null;
  // A standalone heading ends a table even when its title contains pipes.
  // Use Number Suite's H1-H9 boundary for both body rows and multi-row headers.
  if (/^ {0,3}#{1,9}(?:[ \t]|$)/u.test(line.text)) return null;
  return tableCells(line.text)?.length ?? null;
}


export function scanTableBlocks(lines: readonly SemanticSourceLine[]) {
  const blocks: Array<{ first: number; last: number; delimiter: number }> = [];
  const consumed = new Set<number>();
  for (let delimiter = 1; delimiter < lines.length; delimiter += 1) {
    if (consumed.has(delimiter)) continue;
    const line = lines[delimiter];
    if (line == null) continue;
    const columns = tableDelimiterColumnCount(line);
    if (columns == null || tableRowColumnCount(lines[delimiter - 1]) !== columns) continue;
    let first = delimiter - 1;
    // A preceding caption may contain pipes without a separating blank line.
    // Only extension-header expansion yields to that declaration; the immediate
    // GFM header and every body row retain their table ownership.
    while (first > 0 && !/^ {0,3}(?:Figure|Table|Equation|Code):[ \t]+/iu.test(lines[first - 1]!.text)
      && tableRowColumnCount(lines[first - 1]) === columns) first -= 1;
    let last = delimiter;
    while (last + 1 < lines.length && tableRowColumnCount(lines[last + 1]) != null) last += 1;
    for (let index = first; index <= last; index += 1) consumed.add(index);
    blocks.push({ first, last, delimiter });
  }
  return blocks;
}
