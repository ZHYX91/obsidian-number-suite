import type { DisplayDecorationPlan } from "./display-plan";
import {
  numberCaptions,
  parseDocumentSemantics,
  type CaptionKind,
} from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";

export type DocumentOutlineNode = HeadingOutlineNode | CaptionOutlineNode;

interface OutlineNodeBase {
  readonly line: number;
  readonly title: string;
  readonly numberLabel: string | null;
  readonly children: DocumentOutlineNode[];
}

export interface HeadingOutlineNode extends OutlineNodeBase {
  readonly kind: "heading";
  readonly level: number;
}

export interface CaptionOutlineNode extends OutlineNodeBase {
  readonly kind: "caption";
  readonly captionKind: CaptionKind;
}

export interface DocumentOutlineOptions {
  readonly headingDisplayPlan: readonly DisplayDecorationPlan[];
  readonly showCaptionNumbers: boolean;
}

const TRAILING_BLOCK_ID = /(?:^|[ \t])\^[A-Za-z0-9-]{1,128}[ \t]*$/u;

function withoutBlockId(value: string): string {
  return value.replace(TRAILING_BLOCK_ID, "").trim();
}

export function createDocumentOutline(
  source: string,
  options: DocumentOutlineOptions,
): DocumentOutlineNode[] {
  const planByLine = new Map<number, DisplayDecorationPlan[]>();
  for (const item of options.headingDisplayPlan) {
    const linePlan = planByLine.get(item.line) ?? [];
    linePlan.push(item);
    planByLine.set(item.line, linePlan);
  }
  const headingNodes = parseAtxHeadings(source).map((heading): HeadingOutlineNode => {
    const plan = planByLine.get(heading.line) ?? [];
    const conceal = plan.find((item) => item.kind === "conceal");
    const virtual = plan.find((item) => item.kind === "virtual");
    const visible = conceal?.sourceText != null && heading.content.startsWith(conceal.sourceText)
      ? heading.content.slice(conceal.sourceText.length).trimStart()
      : heading.content;
    return {
      kind: "heading",
      line: heading.line,
      level: heading.level,
      title: withoutBlockId(visible),
      numberLabel: virtual?.label ?? null,
      children: [],
    };
  });
  const captionNodes = numberCaptions(parseDocumentSemantics(source).captions).map((caption): CaptionOutlineNode => ({
    kind: "caption",
    line: caption.line,
    captionKind: caption.kind,
    title: withoutBlockId(caption.content),
    numberLabel: options.showCaptionNumbers ? caption.label : caption.kind,
    children: [],
  }));
  const events = [
    ...headingNodes.map((node) => ({ node, rank: 0 } as const)),
    ...captionNodes.map((node) => ({ node, rank: 1 } as const)),
  ].sort((left, right) => left.node.line - right.node.line || left.rank - right.rank);
  const roots: DocumentOutlineNode[] = [];
  const headingStack: HeadingOutlineNode[] = [];
  for (const { node } of events) {
    if (node.kind === "heading") {
      while (
        headingStack.length > 0
        && (headingStack[headingStack.length - 1]?.level ?? 0) >= node.level
      ) {
        headingStack.pop();
      }
      const parent = headingStack[headingStack.length - 1];
      if (parent == null) roots.push(node);
      else parent.children.push(node);
      headingStack.push(node);
    } else {
      const parent = headingStack[headingStack.length - 1];
      if (parent == null) roots.push(node);
      else parent.children.push(node);
    }
  }
  return roots;
}
