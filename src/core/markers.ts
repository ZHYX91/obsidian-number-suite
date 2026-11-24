export const WORD_JOINER = "\u2060";

export function wrapPluginNumber(label: string): string {
  return `${WORD_JOINER}${label}${WORD_JOINER}`;
}

export function hasMalformedPluginMarker(text: string): boolean {
  let opening = text.indexOf(WORD_JOINER);
  if (opening < 0) return false;
  if (opening !== 0) return text.indexOf(WORD_JOINER, opening + 1) < 0;

  // Inspect only the consecutive marked prefixes. Word joiners in the title
  // beyond them are ordinary authored text and do not belong to this number.
  do {
    const closing = text.indexOf(WORD_JOINER, opening + 1);
    if (closing < 0) return true;
    const core = text.slice(opening + 1, closing);
    if (!core.trim() || /[\r\n]/u.test(core)) return true;
    const after = closing + 1;
    const gap = /^[ \t\u00a0\u3000]*/u.exec(text.slice(after))![0];
    opening = after + gap.length;
  } while (text[opening] === WORD_JOINER);
  return false;
}
