import { renderCurrentLevel, renderTemplate } from "./schemes";
import { matchHeadingExclusion } from "./heading-exclusions";
import { inspectSchemeTemplates } from "./scheme-template-validation";
import { HEADING_LEVEL_COUNT } from "./types";
import type {
  Counters,
  HeadingLevel,
  NumberedHeading,
  NumberingOptions,
  ParsedHeading,
} from "./types";

function normalizedStart(options: NumberingOptions, level: number): number {
  const key = level as HeadingLevel;
  const value = options.starts[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function cloneCounters(counters: Counters): Counters {
  return [...counters] as Counters;
}

export function numberHeadings(
  headings: readonly ParsedHeading[],
  options: NumberingOptions,
): NumberedHeading[] {
  const scheme = options.scheme;
  if (inspectSchemeTemplates(scheme.templates).length > 0) {
    return headings.map((heading) => ({
      heading,
      label: null,
      counters: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      warning: null,
      exclusion: null,
    }));
  }
  const starts = Array.from({ length: HEADING_LEVEL_COUNT }, (_unused, index) => normalizedStart(options, index + 1));
  const counters = starts.map((start) => start - 1) as Counters;
  const initialized = Array.from({ length: HEADING_LEVEL_COUNT }, () => false);
  const active = Array.from({ length: HEADING_LEVEL_COUNT }, () => false);
  const output: NumberedHeading[] = [];
  let excludedSubtreeLevel: number | null = null;

  for (const heading of headings) {
    if (heading.content.trim().length === 0) {
      output.push({
        heading,
        label: null,
        counters: cloneCounters(counters),
        warning: null,
        exclusion: null,
      });
      continue;
    }
    const index = heading.level - 1;
    if (excludedSubtreeLevel != null && heading.level > excludedSubtreeLevel) {
      output.push({
        heading,
        label: null,
        counters: cloneCounters(counters),
        warning: null,
        exclusion: "subtree",
      });
      continue;
    }
    if (excludedSubtreeLevel != null) excludedSubtreeLevel = null;

    const exclusion = matchHeadingExclusion(heading, scheme);
    if (exclusion != null) {
      active[index] = false;
      for (let lower = index + 1; lower < HEADING_LEVEL_COUNT; lower += 1) {
        counters[lower] = (starts[lower] ?? 1) - 1;
        initialized[lower] = false;
        active[lower] = false;
      }
      if (exclusion.scope === "subtree") excludedSubtreeLevel = heading.level;
      output.push({
        heading,
        label: null,
        counters: cloneCounters(counters),
        warning: null,
        exclusion: exclusion.scope,
      });
      continue;
    }

    const currentCounter = initialized[index] ? (counters[index] ?? 0) : (starts[index] ?? 1) - 1;
    counters[index] = currentCounter + 1;
    initialized[index] = true;
    active[index] = true;
    for (let lower = index + 1; lower < HEADING_LEVEL_COUNT; lower += 1) {
      counters[lower] = (starts[lower] ?? 1) - 1;
      initialized[lower] = false;
      active[lower] = false;
    }

    if (heading.level < scheme.baseLevel) {
      output.push({ heading, label: null, counters: cloneCounters(counters), warning: null, exclusion: null });
      continue;
    }

    const template = scheme.templates[index] ?? "";
    if (template.trim().length === 0) {
      output.push({ heading, label: null, counters: cloneCounters(counters), warning: null, exclusion: null });
      continue;
    }

    const missing: number[] = [];
    for (let parent = scheme.baseLevel - 1; parent < index; parent += 1) {
      if (!active[parent]) {
        missing.push(parent);
      }
    }
    if (missing.length > 0 && options.missingLevelStrategy === "skip") {
      output.push({
        heading,
        label: null,
        counters: cloneCounters(counters),
        warning: "missing-parent",
        exclusion: null,
      });
      continue;
    }
    if (missing.length > 0 && options.missingLevelStrategy === "fill-one") {
      for (const parent of missing) {
        counters[parent] = starts[parent] ?? 1;
        initialized[parent] = true;
        active[parent] = true;
      }
    }

    const currentCounters = cloneCounters(counters);
    const rendered = missing.length > 0 && options.missingLevelStrategy === "current-only"
      ? renderCurrentLevel(template, heading.level, currentCounters)
      : renderTemplate(template, currentCounters);
    const label = /^[A-Za-z]+$/u.test(rendered.trim()) ? null : rendered;
    output.push({
      heading,
      label: label == null || label.trim().length === 0 ? null : label,
      counters: currentCounters,
      warning: null,
      exclusion: null,
    });
  }

  return output;
}
