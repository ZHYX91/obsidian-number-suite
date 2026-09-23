import type { HeadingMapTreeNode } from "./heading-map";

export const HEADING_MAP_CARD_WIDTH = 264;
export const HEADING_MAP_CARD_HEIGHT = 48;
const COLUMN_GAP = 92;
const ROW_GAP = 20;
const ROOT_GAP = 30;
const PADDING = 36;

export interface HeadingMapLayoutNode {
  readonly node: HeadingMapTreeNode;
  readonly x: number;
  readonly y: number;
}

export interface HeadingMapLayoutEdge {
  readonly parentId: string;
  readonly childId: string;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

export interface HeadingMapLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly HeadingMapLayoutNode[];
  readonly edges: readonly HeadingMapLayoutEdge[];
}

interface PositionedNode {
  readonly item: HeadingMapLayoutNode;
  readonly parentId: string | null;
}

/** Deterministic left-to-right tree layout with parents centered over visible descendants. */
export function layoutHeadingMap(
  roots: readonly HeadingMapTreeNode[],
  collapsed: ReadonlySet<string>,
): HeadingMapLayout {
  const positioned: PositionedNode[] = [];
  let cursorY = PADDING;
  let maxDepth = 0;

  const visit = (node: HeadingMapTreeNode, depth: number, parentId: string | null): number => {
    maxDepth = Math.max(maxDepth, depth);
    // Reserve the parent first so DOM and keyboard order follow document order.
    const index = positioned.length;
    const x = PADDING + depth * (HEADING_MAP_CARD_WIDTH + COLUMN_GAP);
    positioned.push({ item: { node, x, y: 0 }, parentId });
    const children = collapsed.has(node.id) ? [] : node.children;
    let centerY: number;
    if (children.length === 0) {
      centerY = cursorY + HEADING_MAP_CARD_HEIGHT / 2;
      cursorY += HEADING_MAP_CARD_HEIGHT + ROW_GAP;
    } else {
      const centers = children.map((child) => visit(child, depth + 1, node.id));
      centerY = ((centers[0] ?? cursorY) + (centers[centers.length - 1] ?? cursorY)) / 2;
    }
    positioned[index] = {
      item: {
        node,
        x,
        y: centerY - HEADING_MAP_CARD_HEIGHT / 2,
      },
      parentId,
    };
    return centerY;
  };

  for (const root of roots) {
    visit(root, 0, null);
    cursorY += ROOT_GAP;
  }

  const byId = new Map(positioned.map(({ item }) => [item.node.id, item]));
  const edges: HeadingMapLayoutEdge[] = [];
  for (const { item, parentId } of positioned) {
    if (parentId == null) continue;
    const parent = byId.get(parentId);
    if (parent == null) continue;
    edges.push({
      parentId,
      childId: item.node.id,
      fromX: parent.x + HEADING_MAP_CARD_WIDTH,
      fromY: parent.y + HEADING_MAP_CARD_HEIGHT / 2,
      toX: item.x,
      toY: item.y + HEADING_MAP_CARD_HEIGHT / 2,
    });
  }

  const nodes = positioned.map(({ item }) => item);
  const width = roots.length === 0
    ? 0
    : PADDING * 2 + (maxDepth + 1) * HEADING_MAP_CARD_WIDTH + maxDepth * COLUMN_GAP;
  const height = roots.length === 0
    ? 0
    : Math.max(PADDING * 2 + HEADING_MAP_CARD_HEIGHT, cursorY - ROW_GAP - ROOT_GAP + PADDING);
  return { width, height, nodes, edges };
}
