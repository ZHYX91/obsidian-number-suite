import { parser } from "@lezer/markdown";

import type { PhysicalSourceLine } from "./source-lines";

interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface MarkdownContainerLine {
  readonly nested: boolean;
  readonly literal: boolean;
}

const CONTAINERS = new Set(["BulletList", "OrderedList", "Blockquote"]);
const LITERALS = new Set(["FencedCode", "CodeBlock", "HTMLBlock"]);

/**
 * Parse block structure once and project disjoint container/literal ranges to lines.
 * Physical offsets and source text stay with the caller. Normalizing only this
 * parser input lets LF, CRLF and CR share the same Markdown block rules.
 */
export function scanMarkdownContainerLines(
  lines: readonly PhysicalSourceLine[],
): readonly MarkdownContainerLine[] {
  const starts: number[] = [];
  let offset = 0;
  const input = lines.map((line) => {
    starts.push(offset);
    // Number Suite H7-H9 terminate a lazy list paragraph just like native ATX
    // headings. Their original marker/content is parsed later from physical lines.
    const text = line.frontmatter ? "" : line.text.replace(/^( {0,3})#{7,9}(?=[ \t])/u, "$1######");
    offset += text.length + 1;
    return text;
  }).join("\n");
  const containers: SourceRange[] = [];
  const literals: SourceRange[] = [];
  let depth = 0;
  parser.parse(input).iterate({
    enter(node) {
      if (CONTAINERS.has(node.name)) {
        if (depth === 0) containers.push({ from: node.from, to: node.to });
        depth += 1;
      } else if (depth > 0 && LITERALS.has(node.name)) {
        literals.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
    leave(node) {
      if (CONTAINERS.has(node.name)) depth -= 1;
    },
  });

  let containerIndex = 0;
  let literalIndex = 0;
  return starts.map((from, index) => {
    const to = (starts[index + 1] ?? offset) - 1;
    while (containers[containerIndex] != null && containers[containerIndex]!.to <= from) containerIndex += 1;
    while (literals[literalIndex] != null && literals[literalIndex]!.to <= from) literalIndex += 1;
    return {
      nested: (containers[containerIndex]?.from ?? Infinity) <= to,
      literal: (literals[literalIndex]?.from ?? Infinity) <= to,
    };
  });
}
