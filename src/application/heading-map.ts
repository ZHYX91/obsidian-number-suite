import type { DisplayDecorationPlan } from "./display-plan";
import { parseAtxHeadings } from "../core/heading-parser";
import { meetsCleanupScope } from "../core/number-parser";
import { numberHeadings } from "../core/numbering-engine";
import { analyzeHeadingPrefix } from "../core/prefix-analysis";
import type {
  CleanupScope,
  CleanupTemplateSource,
  HeadingLevel,
  HeadingNumberMatch,
  NumberingOptions,
} from "../core/types";

export interface HeadingMapNode {
  readonly id: string;
  readonly line: number;
  readonly level: HeadingLevel;
  readonly title: string;
  readonly numberLabel: string | null;
  readonly numberKind?: "virtual" | "stored" | null;
  readonly storedNumberLabel?: string | null;
  readonly children: HeadingMapNode[];
}

export const HEADING_MAP_DOCUMENT_ID = "document-root";

export interface HeadingMapDocumentNode {
  readonly id: typeof HEADING_MAP_DOCUMENT_ID;
  readonly line: 0;
  readonly level: 0;
  readonly title: string;
  readonly numberLabel: null;
  readonly numberKind?: null;
  readonly storedNumberLabel?: null;
  readonly children: HeadingMapNode[];
}

export type HeadingMapTreeNode = HeadingMapNode | HeadingMapDocumentNode;

/** The document is a view-only root, including when it has no headings. */
export function createHeadingMapDocument(title: string, children: HeadingMapNode[]): HeadingMapDocumentNode {
  return { id: HEADING_MAP_DOCUMENT_ID, line: 0, level: 0, title, numberLabel: null, children };
}

/** Initial overview follows structural depth, including notes that skip heading levels. */
export function headingMapOverview(roots: readonly HeadingMapNode[]): Set<string> {
  const collapsed = new Set<string>();
  const visit = (node: HeadingMapNode, depth: number): void => {
    if (depth >= 2 && node.children.length > 0) collapsed.add(node.id);
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 1);
  return collapsed;
}

export interface HeadingMapOptions {
  readonly nodeIds?: ReadonlyMap<number, string>;
  readonly headingDisplayPlan: readonly DisplayDecorationPlan[];
  readonly numbering: NumberingOptions;
  readonly cleanupScope: CleanupScope;
  readonly templateSources: readonly CleanupTemplateSource[];
  readonly concealStoredNumbers: boolean;
  readonly recognizeStoredNumbers: boolean;
  readonly styleStoredNumbers?: boolean;
}

const TRAILING_BLOCK_ID = /(?:^|[ \t])\^[A-Za-z0-9-]{1,128}[ \t]*$/u;

function withoutBlockId(value: string): string {
  return value.replace(TRAILING_BLOCK_ID, "").trim();
}

function visibleStoredPrefix(
  content: string,
  level: HeadingLevel,
  expectedLabel: string | null,
  options: HeadingMapOptions,
): HeadingNumberMatch | null {
  if (!options.recognizeStoredNumbers || options.concealStoredNumbers || options.styleStoredNumbers === false) return null;
  const analysis = analyzeHeadingPrefix({ content, level }, expectedLabel, options.templateSources);
  const first = analysis.first;
  if (first == null || first.from !== 0
    || (first.confidence !== "high" && first.confidence !== "certain")
    || analysis.suspicious
    || (options.styleStoredNumbers !== true && !meetsCleanupScope(first, options.cleanupScope))) return null;
  return first;
}

/** Build the heading-only structure used by the read-only heading mind map. */
export function createHeadingMap(
  source: string,
  options: HeadingMapOptions,
): HeadingMapNode[] {
  const planByLine = new Map<number, DisplayDecorationPlan[]>();
  for (const item of options.headingDisplayPlan) {
    const linePlan = planByLine.get(item.line) ?? [];
    linePlan.push(item);
    planByLine.set(item.line, linePlan);
  }

  const headings = parseAtxHeadings(source);
  const numbered = numberHeadings(headings, options.numbering);
  const nodes = headings.map((heading, index): HeadingMapNode => {
    const linePlan = planByLine.get(heading.line) ?? [];
    const conceal = linePlan.find((item) => item.kind === "conceal");
    const virtual = linePlan.find((item) => item.kind === "virtual");
    const expectedLabel = numbered[index]?.label ?? null;
    const stored = visibleStoredPrefix(heading.content, heading.level, expectedLabel, options);
    const storedBadge = stored?.fullPrefix
      .replace(/[ \t\u00a0\u3000]+$/u, "").replace(/\u2060/gu, "") ?? null;
    const prefix = conceal?.sourceText ?? stored?.fullPrefix ?? "";
    const visible = prefix.length > 0 && heading.content.startsWith(prefix)
      ? heading.content.slice(prefix.length).trimStart()
      : heading.content;
    const title = withoutBlockId(visible);
    return {
      id: options.nodeIds?.get(heading.line) ?? `heading-${index + 1}`,
      line: heading.line,
      level: heading.level,
      title,
      numberLabel: virtual?.label ?? storedBadge,
      numberKind: virtual != null ? "virtual" : stored != null ? "stored" : null,
      storedNumberLabel: virtual != null ? storedBadge : null,
      children: [],
    };
  });

  const roots: HeadingMapNode[] = [];
  const stack: HeadingMapNode[] = [];
  for (const node of nodes) {
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= node.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent == null) roots.push(node);
    else parent.children.push(node);
    stack.push(node);
  }
  return roots;
}

/**
 * The neighbor of a heading within its actual parent, not its visual
 * search-filter/zoom layout. A differing heading level is not a valid move.
 */
export function adjacentHeadingMapSibling(
  roots: readonly HeadingMapNode[],
  id: string,
  direction: "up" | "down",
): HeadingMapNode | null {
  const search = (nodes: readonly HeadingMapNode[]): HeadingMapNode | null => {
    const index = nodes.findIndex((node) => node.id === id);
    if (index >= 0) {
      const current = nodes[index];
      const sibling = nodes[index + (direction === "up" ? -1 : 1)];
      return current != null && sibling?.level === current.level ? sibling : null;
    }
    for (const node of nodes) {
      const match = search(node.children);
      if (match != null) return match;
    }
    return null;
  };
  return search(roots);
}

export function findHeadingMapNode(
  roots: readonly HeadingMapNode[],
  id: string,
): HeadingMapNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const child = findHeadingMapNode(root.children, id);
    if (child != null) return child;
  }
  return null;
}
