import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

export const INLINE_MATH_NODE = "NumberSuiteInlineMath";

/** One dollar rule for semantic protection and stable-ID insertion boundaries. */
export function inlineMath(): MarkdownConfig {
  let context: InlineContext | null = null;
  const unclosed = new Set<number>();
  return {
    defineNodes: [INLINE_MATH_NODE],
    parseInline: [{
      name: INLINE_MATH_NODE,
      parse(cx, next, from) {
        if (next !== 36 || cx.char(from - 1) === 36) return -1;
        let openingEnd = from + 1;
        while (cx.char(openingEnd) === 36) openingEnd += 1;
        const length = openingEnd - from;
        if (length > 2 || openingEnd === cx.end || /\s/u.test(cx.slice(openingEnd, openingEnd + 1))) return -1;
        if (context !== cx) { context = cx; unclosed.clear(); }
        // A failed search found no matching closer in this inline block. Reuse
        // that fact for later openings instead of rescanning a currency-heavy line.
        if (unclosed.has(length)) return -1;
        for (let cursor = openingEnd; cursor < cx.end;) {
          if (cx.char(cursor) === 92) { cursor += 2; continue; }
          if (cx.char(cursor) !== 36) { cursor += 1; continue; }
          let closingEnd = cursor + 1;
          while (cx.char(closingEnd) === 36) closingEnd += 1;
          if (closingEnd - cursor === length && cursor > openingEnd
            && !/\s/u.test(cx.slice(cursor - 1, cursor))) {
            return cx.addElement(cx.elt(INLINE_MATH_NODE, from, closingEnd));
          }
          cursor = closingEnd;
        }
        unclosed.add(length);
        return -1;
      },
    }],
  };
}
