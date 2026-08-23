import { meetsCleanupScope } from "../core/number-parser";
import { numberHeadings } from "../core/numbering-engine";
import { analyzeHeadingPrefix } from "../core/prefix-analysis";
import type {
  CleanupScope,
  CleanupTemplateSource,
  NumberingOptions,
  ParsedHeading,
} from "../core/types";

export interface SelectionSpan {
  from: number;
  to: number;
}

export interface DisplayDecorationPlan {
  kind: "virtual" | "conceal";
  from: number;
  to: number;
  label: string;
  line: number;
}

export interface DisplayPlanOptions {
  showVirtualNumbers: boolean;
  concealStoredNumbers: boolean;
  numbering: NumberingOptions;
  cleanupScope: CleanupScope;
  templateSources: readonly CleanupTemplateSource[];
  revealOnActiveLine: boolean;
  selections: readonly SelectionSpan[];
  composing: boolean;
}

function selectionTouchesHeading(
  heading: ParsedHeading,
  selections: readonly SelectionSpan[],
): boolean {
  return selections.some((selection) => {
    if (selection.from === selection.to) {
      return selection.from >= heading.lineFrom && selection.from <= heading.lineTo;
    }
    return selection.from <= heading.lineTo && selection.to >= heading.lineFrom;
  });
}

export function createDisplayPlan(
  headings: readonly ParsedHeading[],
  options: DisplayPlanOptions,
): DisplayDecorationPlan[] {
  if ((!options.showVirtualNumbers && !options.concealStoredNumbers) || options.composing) {
    return [];
  }
  const numbered = numberHeadings(headings, options.numbering);
  const decorations: DisplayDecorationPlan[] = [];
  for (const item of numbered) {
    const { heading } = item;
    if (heading.content.trim().length === 0) {
      continue;
    }
    const analysis = analyzeHeadingPrefix(heading, item.label, options.templateSources);
    const { matches, expectedUnmarked } = analysis;
    const revealStored = options.concealStoredNumbers
      && options.revealOnActiveLine
      && selectionTouchesHeading(heading, options.selections);
    if (
      revealStored
    ) {
      continue;
    }
    if (item.exclusion != null) {
      if (options.concealStoredNumbers) {
        const first = matches[0];
        if (first != null && first.from === 0 && meetsCleanupScope(first, options.cleanupScope)) {
          decorations.push({
            kind: "conceal",
            from: heading.contentFrom,
            to: heading.contentFrom + first.to,
            label: "",
            line: heading.line,
          });
        }
      }
      continue;
    }
    if (item.label == null) continue;
    let concealTo = 0;
    if (options.concealStoredNumbers) {
      for (const match of matches) {
        if (
          match.from !== concealTo
          || (!meetsCleanupScope(match, options.cleanupScope)
            && !(concealTo === 0 && expectedUnmarked))
        ) {
          break;
        }
        concealTo = match.to;
      }
    }
    if (concealTo > 0) {
      decorations.push({
        kind: "conceal",
        from: heading.contentFrom,
        to: heading.contentFrom + concealTo,
        label: "",
        line: heading.line,
      });
    }
    if (
      options.showVirtualNumbers
      && (concealTo > 0 || (matches.length === 0 && !analysis.suspicious))
    ) {
      const virtualFrom = heading.contentFrom + concealTo;
      decorations.push({
        kind: "virtual",
        from: virtualFrom,
        to: virtualFrom,
        label: item.label,
        line: heading.line,
      });
    }
  }
  return decorations;
}
