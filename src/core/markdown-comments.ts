export type CommentKind = "html" | "obsidian";

export function codeSpanEnd(text: string, from: number): number | null {
  let length = 1;
  while (text[from + length] === "`") length += 1;
  for (let cursor = from + length; cursor < text.length;) {
    if (text[cursor] !== "`") { cursor += 1; continue; }
    let closingLength = 1;
    while (text[cursor + closingLength] === "`") closingLength += 1;
    if (closingLength === length) return cursor + length;
    cursor += closingLength;
  }
  return null;
}

export function scanInlineComments(text: string, initial: CommentKind | null = null,
  codeRanges: readonly { from: number; to: number }[] = []) {
  const characters = text.split("");
  const ranges: Array<{ from: number; to: number; kind: CommentKind }> = [];
  let state = initial;
  let unclosedFrom: number | null = null;
  let codeIndex = 0;
  for (let cursor = 0; cursor < text.length;) {
    if (state == null) {
      while (codeRanges[codeIndex] != null && codeRanges[codeIndex]!.to <= cursor) codeIndex += 1;
      const candidate = codeRanges[codeIndex];
      const code = candidate != null && cursor >= candidate.from ? candidate : null;
      if (code != null) { cursor = code.to; continue; }
      if (text[cursor] === "\\") { cursor += 2; continue; }
      if (text[cursor] === "`") {
        const end = codeSpanEnd(text, cursor);
        if (end != null) { cursor = end; continue; }
        while (text[cursor] === "`") cursor += 1;
        continue;
      }
      if (text.startsWith("<!--", cursor)) state = "html";
      else if (text.startsWith("%%", cursor)) state = "obsidian";
      else { cursor += 1; continue; }
    }
    const from = cursor;
    const ending = state === "html" ? "-->" : "%%";
    const openingLength = initial != null && cursor === 0 ? 0 : state === "html" ? 4 : 2;
    const closing = text.indexOf(ending, cursor + openingLength);
    const to = closing < 0 ? text.length : closing + ending.length;
    ranges.push({ from, to, kind: state });
    blankRange(characters, from, to);
    if (closing < 0) { unclosedFrom = from; break; }
    state = null;
    cursor = to;
  }
  return { masked: characters.join(""), ranges, state, unclosedFrom };
}

export function blankRange(characters: string[], from: number, to: number): void {
  for (let index = from; index < to; index += 1) characters[index] = " ";
}
