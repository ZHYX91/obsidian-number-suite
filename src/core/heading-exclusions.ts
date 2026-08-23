import { parseHeadingNumberPrefixes } from "./number-parser";
import type {
  HeadingExclusionRule,
  NumberingScheme,
  ParsedHeading,
} from "./types";

export function normalizeExclusionTitle(value: string): string {
  return value.normalize("NFC").trim().replace(/[ \t]+/gu, " ");
}

function titleCandidates(
  heading: Pick<ParsedHeading, "content" | "level">,
  scheme: NumberingScheme,
): string[] {
  const raw = normalizeExclusionTitle(heading.content);
  const candidates = raw.length === 0 ? [] : [raw];
  const [prefix] = parseHeadingNumberPrefixes(heading.content, 1, {
    headingLevel: heading.level,
    templateSources: [{
      schemeId: scheme.id,
      schemeName: scheme.id,
      revision: 1,
      templates: scheme.templates,
    }],
  });
  if (
    prefix != null
    && (prefix.provenance === "plugin"
      || prefix.provenance === "template"
      || prefix.confidence === "medium"
      || prefix.confidence === "high"
      || prefix.confidence === "certain")
  ) {
    const withoutPrefix = normalizeExclusionTitle(heading.content.slice(prefix.to));
    if (withoutPrefix.length > 0 && !candidates.includes(withoutPrefix)) {
      candidates.push(withoutPrefix);
    }
  }
  return candidates;
}

export function matchHeadingExclusion(
  heading: Pick<ParsedHeading, "content" | "level">,
  scheme: NumberingScheme,
): HeadingExclusionRule | null {
  if (scheme.exclusions.length === 0) return null;
  const candidates = titleCandidates(heading, scheme);
  return scheme.exclusions.find((rule) => {
    const title = normalizeExclusionTitle(rule.title);
    return title.length > 0 && candidates.includes(title);
  }) ?? null;
}
