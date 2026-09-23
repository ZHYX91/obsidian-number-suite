import type { HeadingMapTreeNode } from "./heading-map";

export const HEADING_MAP_CARD_WIDTH = 264;
export const HEADING_MAP_CARD_HEIGHT = 48;
const COLUMN_GAP = 92;
const ROW_GAP = 20;
const VERTICAL_COLUMN_GAP = 32;
const VERTICAL_ROW_GAP = 64;
const ROOT_GAP = 30;
const PADDING = 36;

export type HeadingMapLayoutDirection = "left-to-right" | "top-to-bottom";

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

/** Deterministic tree layout whose DOM order always follows document order. */
export function layoutHeadingMap(
  roots: readonly HeadingMapTreeNode[],
  collapsed: ReadonlySet<string>,
  direction: HeadingMapLayoutDirection = "left-to-right",
): HeadingMapLayout {
  return direction === "top-to-bottom"
    ? layoutTopToBottom(roots, collapsed)
    : layoutLeftToRight(roots, collapsed);
}

function layoutLeftToRight(
  roots: readonly HeadingMapTreeNode[],
  collapsed: ReadonlySet<string>,
): HeadingMapLayout {
  const positioned: PositionedNode[] = [];
  let cursorY = PADDING;
  let maxDepth = 0;

  const visit = (node: HeadingMapTreeNode, depth: number, parentId: string | null): number => {
    maxDepth = Math.max(maxDepth, depth);
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
      item: { node, x, y: centerY - HEADING_MAP_CARD_HEIGHT / 2 },
      parentId,
    };
    return centerY;
  };

  for (const root of roots) {
    visit(root, 0, null);
    cursorY += ROOT_GAP;
  }

  const nodes = positioned.map(({ item }) => item);
  return {
    width: roots.length === 0
      ? 0
      : PADDING * 2 + (maxDepth + 1) * HEADING_MAP_CARD_WIDTH + maxDepth * COLUMN_GAP,
    height: roots.length === 0
      ? 0
      : Math.max(PADDING * 2 + HEADING_MAP_CARD_HEIGHT, cursorY - ROW_GAP - ROOT_GAP + PADDING),
    nodes,
    edges: layoutEdges(positioned, "left-to-right"),
  };
}

function layoutTopToBottom(
  roots: readonly HeadingMapTreeNode[],
  collapsed: ReadonlySet<string>,
): HeadingMapLayout {
  const positioned: PositionedNode[] = [];
  let cursorX = PADDING;
  let maxDepth = 0;

  const visit = (node: HeadingMapTreeNode, depth: number, parentId: string | null): number => {
    maxDepth = Math.max(maxDepth, depth);
    const index = positioned.length;
    const y = PADDING + depth * (HEADING_MAP_CARD_HEIGHT + VERTICAL_ROW_GAP);
    positioned.push({ item: { node, x: 0, y }, parentId });
    const children = collapsed.has(node.id) ? [] : node.children;
    let centerX: number;
    if (children.length === 0) {
      centerX = cursorX + HEADING_MAP_CARD_WIDTH / 2;
      cursorX += HEADING_MAP_CARD_WIDTH + VERTICAL_COLUMN_GAP;
    } else {
      const centers = children.map((child) => visit(child, depth + 1, node.id));
      centerX = ((centers[0] ?? cursorX) + (centers[centers.length - 1] ?? cursorX)) / 2;
    }
    positioned[index] = {
      item: { node, x: centerX - HEADING_MAP_CARD_WIDTH / 2, y },
      parentId,
    };
    return centerX;
  };

  for (const root of roots) {
    visit(root, 0, null);
    cursorX += ROOT_GAP;
  }

  const nodes = positioned.map(({ item }) => item);
  return {
    width: roots.length === 0
      ? 0
      : Math.max(PADDING * 2 + HEADING_MAP_CARD_WIDTH, cursorX - VERTICAL_COLUMN_GAP - ROOT_GAP + PADDING),
    height: roots.length === 0
      ? 0
      : PADDING * 2 + (maxDepth + 1) * HEADING_MAP_CARD_HEIGHT + maxDepth * VERTICAL_ROW_GAP,
    nodes,
    edges: layoutEdges(positioned, "top-to-bottom"),
  };
}

function layoutEdges(
  positioned: readonly PositionedNode[],
  direction: HeadingMapLayoutDirection,
): HeadingMapLayoutEdge[] {
  const byId = new Map(positioned.map(({ item }) => [item.node.id, item]));
  const edges: HeadingMapLayoutEdge[] = [];
  for (const { item, parentId } of positioned) {
    if (parentId == null) continue;
    const parent = byId.get(parentId);
    if (parent == null) continue;
    edges.push(direction === "top-to-bottom"
      ? {
        parentId,
        childId: item.node.id,
        fromX: parent.x + HEADING_MAP_CARD_WIDTH / 2,
        fromY: parent.y + HEADING_MAP_CARD_HEIGHT,
        toX: item.x + HEADING_MAP_CARD_WIDTH / 2,
        toY: item.y,
      }
      : {
        parentId,
        childId: item.node.id,
        fromX: parent.x + HEADING_MAP_CARD_WIDTH,
        fromY: parent.y + HEADING_MAP_CARD_HEIGHT / 2,
        toX: item.x,
        toY: item.y + HEADING_MAP_CARD_HEIGHT / 2,
      });
  }
  return edges;
}
