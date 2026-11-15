import type { MarkdownConfig } from "@lezer/markdown";

export const NOTE_REFERENCE = /\[\^([^\]\r\n]+)\]/gu;
export const SEMANTIC_REFERENCE = /@\[\[#(\^?[^\]|\r\n]+)(?:\|([^\]\r\n]+))?\]\]/gu;

/** Keep supported markers in visible link text from becoming nested shortcut links. */
export function inlineSemanticMarkers(): MarkdownConfig {
  const node = "NumberSuiteSemanticMarker";
  const note = new RegExp(NOTE_REFERENCE.source, "uy");
  const reference = new RegExp(SEMANTIC_REFERENCE.source, "uy");
  return {
    defineNodes: [node],
    parseInline: [{
      name: node, before: "Link",
      parse(cx, next, from) {
        if ((next !== 91 && next !== 64) || !cx.hasOpenLink) return -1;
        const pattern = next === 91 ? note : reference;
        pattern.lastIndex = from - cx.offset;
        const match = pattern.exec(cx.text);
        if (match == null) return -1;
        const to = from + match[0].length;
        // An explicit Markdown link still owns its label and invalidates an
        // outer link. Only plain Number Suite markers are atomic here.
        if (next === 91 && (cx.char(to) === 40 || cx.char(to) === 91)) return -1;
        return cx.addElement(cx.elt(node, from, to));
      },
    }],
  };
}
