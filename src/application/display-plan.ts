import { meetsCleanupScope } from "../core/number-parser";
import { sourceOffsetForHeadingContent } from "../core/heading-parser";
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
  kind: "virtual" | "conceal" | "stored";
  from: number;
  to: number;
  label: string;
  line: number;
  sourceText?: string;
}

export interface DisplayPlanOptions {
  showVirtualNumbers: boolean;
  concealStoredNumbers: boolean;
  /** Cosmetic source-prefix highlight, never a Markdown write. */
  styleStoredNumbers?: boolean;
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
  if (!options.showVirtualNumbers && !options.concealStoredNumbers && !options.styleStoredNumbers) {
    return [];
  }
  const numbered = numberHeadings(headings, options.numbering);
  const decorations: DisplayDecorationPlan[] = [];
  for (const item of numbered) {
    const { heading } = item;
    const active = selectionTouchesHeading(heading, options.selections);
    if (options.composing && active) {
      continue;
    }
    if (heading.content.trim().length === 0) {
      continue;
    }
    const analysis = analyzeHeadingPrefix(heading, item.label, options.templateSources);
    const { matches } = analysis;
    const first = matches[0];
    const reliablyStored = first != null && first.from === 0
      && (first.confidence === "high" || first.confidence === "certain")
      && !analysis.suspicious;
    const concealStored = options.concealStoredNumbers && !(options.revealOnActiveLine && active);
    if (options.styleStoredNumbers && !options.concealStoredNumbers && reliablyStored
      && !active && first != null) {
      // Keep punctuation such as "一、", "1." or "（一）" inside the
      // outlined badge, but leave the separating whitespace with the title.
      const authored = first.fullPrefix.replace(/[ \t\u00a0\u3000]+$/u, "");
      const label = authored.replace(/\u2060/gu, "");
      if (label.length > 0) {
        const from = sourceOffsetForHeadingContent(heading, first.from);
        const to = sourceOffsetForHeadingContent(heading, first.from + authored.length);
        if (to > from) decorations.push({ kind: "stored", from, to, label, line: heading.line });
      }
    }
    if (item.exclusion != null) {
      if (concealStored) {
        if (first != null && first.from === 0 && meetsCleanupScope(first, options.cleanupScope)) {
          decorations.push({
            kind: "conceal",
            from: heading.contentFrom,
            to: sourceOffsetForHeadingContent(heading, first.to),
            label: "",
            line: heading.line,
            sourceText: heading.content.slice(0, first.to),
          });
        }
      }
      continue;
    }
    if (item.label == null) continue;
    let concealTo = 0;
    if (concealStored) {
      for (const match of matches) {
        if (
          match.from !== concealTo
          || !meetsCleanupScope(match, options.cleanupScope)
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
        to: sourceOffsetForHeadingContent(heading, concealTo),
        label: "",
        line: heading.line,
        sourceText: heading.content.slice(0, concealTo),
      });
    }
    if (options.showVirtualNumbers) {
      const virtualFrom = sourceOffsetForHeadingContent(heading, concealTo);
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
