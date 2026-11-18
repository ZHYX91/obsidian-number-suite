/**
 * Visual-only native Wiki label concealment. The anchor, href, listeners,
 * attributes, and exact text nodes are retained; unwrapping restores the
 * source-derived label without changing Markdown.
 */
const CLASS_NAME = "number-suite-native-wiki-hidden-prefix";

export function hideNativeWikiHeadingPrefix(anchor: HTMLElement, prefix: string): boolean {
  if (!prefix || anchor.querySelector("." + CLASS_NAME) != null) return false;
  const visiblePrefix = prefix.replace(/\u2060/gu, "");
  if (!visiblePrefix) return false;
  const filter = anchor.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = anchor.ownerDocument.createTreeWalker(anchor, filter);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current != null) {
    const parent = current.parentElement;
    if (parent == null || parent.closest(".number-suite-native-wiki-number") == null) {
      nodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  if (!nodes.map((node) => node.data).join("").startsWith(visiblePrefix)) return false;
  let remaining = visiblePrefix.length;
  for (const node of nodes) {
    if (remaining <= 0) break;
    if (!node.data.length) continue;
    const take = Math.min(node.data.length, remaining);
    if (take < node.data.length) node.splitText(take);
    const parent = node.parentElement;
    if (parent == null) return false;
    const span = parent.createSpan();
    span.className = CLASS_NAME;
    span.setAttribute("aria-hidden", "true");
    parent.insertBefore(span, node);
    span.appendChild(node);
    remaining -= take;
  }
  return remaining === 0;
}

export function restoreNativeWikiHeadingPrefix(anchor: HTMLElement): void {
  for (const part of anchor.querySelectorAll<HTMLElement>("." + CLASS_NAME)) {
    part.replaceWith(...part.childNodes);
  }
  anchor.normalize();
}
