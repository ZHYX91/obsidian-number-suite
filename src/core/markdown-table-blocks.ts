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

function tableDelimiter(line: SemanticSourceLine): { columnCount: number; captionSupported: boolean } | null {
  if (!line.available || !line.topLevel) return null;
  const cells = tableCells(line.text);
  if (cells == null) return null;
  const delimiterCells = cells.filter((cell) => cell.trim().length > 0);
  if (delimiterCells.length === 0) return null;
  const dashCounts = delimiterCells.map((cell) => /^:?(-+):?$/u.exec(cell.trim())?.[1]?.length ?? 0);
  if (dashCounts.some((count) => count === 0)) return null;
  return {
    columnCount: delimiterCells.length,
    // Native GFM ownership accepts short delimiters. Caption editing retains
    // its existing carrier contract, independently from literal-data protection.
    captionSupported: dashCounts.every((count) => count >= 3),
  };
}

function tableRowColumnCount(line: SemanticSourceLine | undefined): number | null {
  if (line == null || !line.available || !line.topLevel || line.text.trim().length === 0) return null;
  // A standalone heading ends a table even when its title contains pipes.
  // Use Number Suite's H1-H9 boundary for both body rows and multi-row headers.
  if (/^ {0,3}#{1,9}(?:[ \t]|$)/u.test(line.text)) return null;
  return tableCells(line.text)?.length ?? null;
}


export function scanTableBlocks(lines: readonly SemanticSourceLine[]) {
  const blocks: Array<{ first: number; last: number; delimiter: number; captionSupported: boolean }> = [];
  const consumed = new Set<number>();
  for (let delimiter = 1; delimiter < lines.length; delimiter += 1) {
    if (consumed.has(delimiter)) continue;
    const line = lines[delimiter];
    if (line == null) continue;
    const delimiterRow = tableDelimiter(line);
    if (delimiterRow == null || tableRowColumnCount(lines[delimiter - 1]) !== delimiterRow.columnCount) continue;
    const columns = delimiterRow.columnCount;
    let first = delimiter - 1;
    // A preceding caption may contain pipes without a separating blank line.
    // Only extension-header expansion yields to that declaration; the immediate
    // GFM header and every body row retain their table ownership.
    while (first > 0 && !/^ {0,3}(?:Figure|Table|Equation|Code):[ \t]+/iu.test(lines[first - 1]!.text)
      && tableRowColumnCount(lines[first - 1]) === columns) first -= 1;
    let last = delimiter;
    while (last + 1 < lines.length) {
      const body = lines[last + 1]!;
      if (!body.available || !body.topLevel || body.text.trim() === ""
        // Tables are block containers, not paragraphs: every ordered-list
        // start and four-column code indent ends a body, including forms
        // that cannot interrupt an ordinary paragraph in the source parser.
        || /^(?: {4}| {0,3}\t)/u.test(body.text)
        || /^ {0,3}(?:\d{1,9}[.)]|[-+*])(?:[ \t]|$)/u.test(body.text)
        || /^ {0,3}\^[A-Za-z0-9-]+[ \t]*$/u.test(body.text)
        || /^ {0,3}#{1,9}(?:[ \t]|$)/u.test(body.text)
        || /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u.test(body.text)) break;
      // GFM body rows may omit every pipe; missing cells are padded. They
      // remain owned by the table, including caption-looking literal text.
      last += 1;
    }
    for (let index = first; index <= last; index += 1) consumed.add(index);
    blocks.push({ first, last, delimiter, captionSupported: delimiterRow.captionSupported });
  }
  return blocks;
}
