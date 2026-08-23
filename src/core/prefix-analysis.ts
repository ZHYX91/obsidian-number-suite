import { hasMalformedPluginMarker } from "./markers";
import {
  isExpectedUnmarkedNumber,
  isSuspiciousNumericPrefix,
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
): HeadingPrefixAnalysis {
  const matches = parseHeadingNumberPrefixes(heading.content, 8, {
    headingLevel: heading.level,
    templateSources,
  });
  const first = matches[0] ?? null;
  const malformedMarker = hasMalformedPluginMarker(heading.content);
  return {
    matches,
    first,
    expectedUnmarked: isExpectedUnmarkedNumber(first, expectedLabel),
    suspicious: malformedMarker || isSuspiciousNumericPrefix(heading.content),
    malformedMarker,
  };
}
