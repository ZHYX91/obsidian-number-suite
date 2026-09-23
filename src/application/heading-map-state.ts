import type { HeadingMapNode } from "./heading-map";

export type HeadingMapExpandRange = 1 | 2 | 3 | "all";

/** Build a deterministic collapse set for a structural depth range. Root headings start at depth 1. */
export function headingMapCollapsedForRange(
  roots: readonly HeadingMapNode[],
  range: HeadingMapExpandRange,
): Set<string> {
  const collapsed = new Set<string>();
  const maximumDepth = range === "all" ? Number.POSITIVE_INFINITY : range;
  const visit = (node: HeadingMapNode, depth: number): void => {
    if (node.children.length === 0) return;
    if (depth >= maximumDepth) {
      collapsed.add(node.id);
      return;
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 1);
  return collapsed;
}
