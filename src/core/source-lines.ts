export interface PhysicalSourceLine {
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly number: number;
  readonly frontmatter: boolean;
}

/** Physical offsets retain the original LF, CRLF or CR bytes. */
export function scanPhysicalLines(source: string): PhysicalSourceLine[] {
  const lines: PhysicalSourceLine[] = [];
  const newline = /\r\n|\r|\n/gu;
  let from = 0;
  let inFrontmatter = false;
  for (;;) {
    const match = newline.exec(source);
    const to = match?.index ?? source.length;
    const text = source.slice(from, to);
    const number = lines.length;
    if (number === 0) inFrontmatter = /^\uFEFF?---[ \t]*$/u.test(text);
    lines.push({ text, from, to, number, frontmatter: inFrontmatter });
    if (number > 0 && inFrontmatter && /^(?:---|\.\.\.)[ \t]*$/u.test(text)) {
      inFrontmatter = false;
    }
    if (match == null) return lines;
    from = to + match[0].length;
  }
}
