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
  readonly children: HeadingMapNode[];
}

export interface HeadingMapOptions {
  readonly headingDisplayPlan: readonly DisplayDecorationPlan[];
  readonly numbering: NumberingOptions;
  readonly cleanupScope: CleanupScope;
  readonly templateSources: readonly CleanupTemplateSource[];
  readonly concealStoredNumbers: boolean;
  readonly recognizeStoredNumbers: boolean;
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
  if (!options.recognizeStoredNumbers || options.concealStoredNumbers) return null;
  const analysis = analyzeHeadingPrefix({ content, level }, expectedLabel, options.templateSources);
  const first = analysis.first;
  if (first == null || first.from !== 0 || !meetsCleanupScope(first, options.cleanupScope)) return null;
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
  const identities = new Map<string, number>();
  const nodes = headings.map((heading, index): HeadingMapNode => {
    const linePlan = planByLine.get(heading.line) ?? [];
    const conceal = linePlan.find((item) => item.kind === "conceal");
    const virtual = linePlan.find((item) => item.kind === "virtual");
    const expectedLabel = numbered[index]?.label ?? null;
    const stored = visibleStoredPrefix(heading.content, heading.level, expectedLabel, options);
    const prefix = conceal?.sourceText ?? stored?.fullPrefix ?? "";
    const visible = prefix.length > 0 && heading.content.startsWith(prefix)
      ? heading.content.slice(prefix.length).trimStart()
      : heading.content;
    const title = withoutBlockId(visible);
    const identity = `${heading.level}:${encodeURIComponent(title)}`;
    const occurrence = (identities.get(identity) ?? 0) + 1;
    identities.set(identity, occurrence);
    return {
      id: `${identity}:${occurrence}`,
      line: heading.line,
      level: heading.level,
      title,
      numberLabel: virtual?.label ?? stored?.numberCore ?? null,
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
