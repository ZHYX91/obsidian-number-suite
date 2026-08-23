export const WORD_JOINER = "\u2060";

export function wrapPluginNumber(label: string): string {
  return `${WORD_JOINER}${label}${WORD_JOINER}`;
}

export function hasMalformedPluginMarker(text: string): boolean {
  const first = text.indexOf(WORD_JOINER);
  if (first < 0) {
    return false;
  }
  return text.indexOf(WORD_JOINER, first + WORD_JOINER.length) < 0;
}
