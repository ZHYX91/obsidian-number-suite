import { hasMalformedPluginMarker } from "./markers";
import {
  isExpectedUnmarkedNumber,
  isSuspiciousNumericPrefix,
  parseHeadingNumber,
  parseHeadingNumberPrefixes,
} from "./number-parser";
import type {
  CleanupTemplateSource,
  HeadingNumberMatch,
  ParsedHeading,
} from "./types";

export interface HeadingPrefixAnalysis {
  readonly matches: readonly HeadingNumberMatch[];
  readonly first: HeadingNumberMatch | null;
  readonly expectedUnmarked: boolean;
  readonly suspicious: boolean;
  readonly malformedMarker: boolean;
}

/** Shared, pure prefix analysis used by writes and both display surfaces. */
export function analyzeHeadingPrefix(
  heading: Pick<ParsedHeading, "content" | "level">,
  expectedLabel: string | null,
  templateSources: readonly CleanupTemplateSource[],
  purpose: "display" | "transform" = "transform",
): HeadingPrefixAnalysis {
  const context = {
    headingLevel: heading.level,
    templateSources,
    matchOtherLevels: purpose === "display",
  };
  const matches = parseHeadingNumberPrefixes(heading.content, 8, context);
  const first = matches[0] ?? null;
  const malformedMarker = hasMalformedPluginMarker(heading.content);
  // A different level can explain a visible prefix. During a transform it can
  // prevent a duplicate insertion, but cannot authorize removing source text.
  const suspicious = first == null
    ? isSuspiciousNumericPrefix(heading.content)
      || (purpose === "transform" && templateSources.length > 0
        && parseHeadingNumber(heading.content, { ...context, matchOtherLevels: true })?.provenance === "template")
    : first.confidence === "low";
  return {
    matches,
    first,
    expectedUnmarked: isExpectedUnmarkedNumber(first, expectedLabel),
    suspicious: malformedMarker || suspicious,
    malformedMarker,
  };
}
