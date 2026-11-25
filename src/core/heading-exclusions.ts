import { withoutTrailingBlockId } from "./document-semantics";
import { meetsCleanupScope, parseHeadingNumberPrefixes } from "./number-parser";
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
  const title = withoutTrailingBlockId(heading.content);
  const logicalTitle = normalizeExclusionTitle(title);
  if (logicalTitle.length > 0 && logicalTitle !== raw) candidates.push(logicalTitle);
  const [prefix] = parseHeadingNumberPrefixes(heading.content, 1, {
    headingLevel: heading.level,
    templateSources: [{
      schemeId: scheme.id,
      schemeName: scheme.id,
      revision: 1,
      templates: scheme.templates,
    }],
  });
  if (prefix != null && meetsCleanupScope(prefix, "common")) {
    for (const content of [heading.content, title]) {
      const withoutPrefix = normalizeExclusionTitle(content.slice(prefix.to));
      if (withoutPrefix.length > 0 && !candidates.includes(withoutPrefix)) candidates.push(withoutPrefix);
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
