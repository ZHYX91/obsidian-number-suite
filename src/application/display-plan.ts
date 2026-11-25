import type { StoredHeadingNumberStyleScope, VirtualHeadingNumberFormat } from "../config/settings";
import { WORD_JOINER } from "../core/markers";
import { meetsCleanupScope } from "../core/number-parser";
import { sourceOffsetForHeadingContent } from "../core/heading-parser";
import { compileTemplate, renderCurrentLevel } from "../core/template-compiler";
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

export type HeadingNumberPillKind = "virtual" | "stored" | "manual";
export type StoredHeadingNumberPillKind = Exclude<HeadingNumberPillKind, "virtual">;

interface DisplayDecorationBase {
  from: number;
  to: number;
  label: string;
  line: number;
}

export type DisplayDecorationPlan = DisplayDecorationBase & (
  | { kind: "virtual"; referenceLabel?: string }
  | { kind: "conceal"; sourceText?: string }
  | { kind: "stored"; pillKind: StoredHeadingNumberPillKind; sourceText: string; outlineText: string }
);

export interface DisplayPlanOptions {
  showVirtualNumbers: boolean;
  virtualNumberFormat?: VirtualHeadingNumberFormat;
  referenceNumberFormat?: VirtualHeadingNumberFormat;
  concealStoredNumbers: boolean;
  /** Cosmetic source-prefix highlight, never a Markdown write. */
  storedHeadingNumberStyleScope?: StoredHeadingNumberStyleScope;
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
  const styleScope = options.storedHeadingNumberStyleScope ?? "off";
  if (!options.showVirtualNumbers && !options.concealStoredNumbers && styleScope === "off") {
    return [];
  }
  const numbered = numberHeadings(headings, options.numbering);
  const currentLevelTemplates = options.virtualNumberFormat === "current-only" || options.referenceNumberFormat === "current-only"
    ? options.numbering.scheme.templates.map(compileTemplate) : [];
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
    const analysis = analyzeHeadingPrefix(heading, item.label, options.templateSources, "display");
    const { matches } = analysis;
    const first = matches[0];
    const concealStored = options.concealStoredNumbers && !(options.revealOnActiveLine && active);
    let concealTo = 0;
    if (concealStored && item.exclusion != null) {
      if (first != null && first.from === 0 && meetsCleanupScope(first, options.cleanupScope)) {
        concealTo = first.to;
      }
    } else if (concealStored && item.label != null) {
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
    if (concealTo === 0 && !active && styleScope !== "off" && first != null
      && first.from === 0 && !analysis.suspicious && meetsCleanupScope(first, styleScope)) {
      // Leave separating whitespace outside the outlined pill.
      const label = first.numberCore.trimEnd();
      // Older writers could place an explicit separator inside the closing marker.
      const outlineText = first.provenance === "plugin" && label.length < first.numberCore.length
        ? WORD_JOINER + label : first.fullPrefix.slice(0, first.fullPrefix.length - first.separator.length);
      const from = sourceOffsetForHeadingContent(heading, first.from);
      const to = sourceOffsetForHeadingContent(heading, first.from + outlineText.length);
      if (label.length > 0 && to > from) {
        decorations.push({
          kind: "stored",
          pillKind: first.provenance === "manual" ? "manual" : "stored",
          from,
          to,
          label,
          line: heading.line,
          sourceText: first.fullPrefix,
          outlineText,
        });
      }
    }
    if (options.showVirtualNumbers && item.exclusion == null && item.label != null) {
      const template = currentLevelTemplates[heading.level - 1];
      const currentLevel = template == null ? item.label : renderCurrentLevel(template, heading.level, item.counters);
      const label = options.virtualNumberFormat === "current-only" ? currentLevel : item.label;
      const referenceLabel = options.referenceNumberFormat === "current-only" ? currentLevel : item.label;
      const virtualFrom = sourceOffsetForHeadingContent(heading, concealTo);
      decorations.push({
        kind: "virtual",
        from: virtualFrom,
        to: virtualFrom,
        label,
        ...(referenceLabel === label ? {} : { referenceLabel }),
        line: heading.line,
      });
    }
  }
  return decorations;
}
