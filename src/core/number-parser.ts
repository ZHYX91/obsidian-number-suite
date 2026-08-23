import { hasMalformedPluginMarker, WORD_JOINER } from "./markers";
import type {
  CleanupScope,
  CleanupTemplateSource,
  Confidence,
  HeadingNumberMatch,
  NumberStyle,
} from "./types";
import { templatePrefixPattern } from "./template-compiler";

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  certain: 3,
};

const CHINESE_DIGITS = "零〇一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟";
const CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const MEASUREMENT_START = /^(?:倍|版(?:本)?|年|月|日|种|个|项|条|米|厘米|毫米|千米|克|千克|kg|g|mm|cm|m|%)/iu;
const YEAR = /^(?:19|20)\d{2}$/;

interface Candidate {
  core: string;
  matched: string;
  separator: string;
  style: NumberStyle;
  confidence: Confidence;
  ruleId: string;
}

function meaningfulRemainder(text: string, to: number): boolean {
  const remainder = text.slice(to).trim();
  return remainder.length > 0 && /[\p{L}\p{N}\p{S}]/u.test(remainder);
}

function candidateFromRegex(
  text: string,
  regex: RegExp,
  style: NumberStyle,
  confidence: Confidence,
  ruleId: string,
): Candidate | null {
  const match = regex.exec(text);
  if (match == null || match[0].length === 0) {
    return null;
  }
  return {
    core: match[1] ?? match[0].trim(),
    matched: match[0],
    separator: match[2] ?? "",
    style,
    confidence,
    ruleId,
  };
}

function parsePluginPrefix(text: string): HeadingNumberMatch | null {
  if (!text.startsWith(WORD_JOINER)) {
    return null;
  }
  const closing = text.indexOf(WORD_JOINER, WORD_JOINER.length);
  if (closing < 0) {
    return null;
  }
  const core = text.slice(WORD_JOINER.length, closing);
  if (core.trim().length === 0 || core.includes("\n") || core.includes("\r")) {
    return null;
  }
  const whitespace = /^[ \t]*/.exec(text.slice(closing + WORD_JOINER.length))?.[0] ?? "";
  const to = closing + WORD_JOINER.length + whitespace.length;
  if (!meaningfulRemainder(text, to)) {
    return null;
  }
  return {
    fullPrefix: text.slice(0, to),
    numberCore: core,
    separator: whitespace,
    from: 0,
    to,
    style: inferStyle(core),
    confidence: "certain",
    provenance: "plugin",
    ruleId: "plugin-marker",
  };
}

function inferStyle(core: string): NumberStyle {
  if (/^第.+[编章节条款项]$/u.test(core)) {
    return "legal";
  }
  if (new RegExp(`^[${CIRCLED_NUMBERS}]$`, "u").test(core)) {
    return "circled";
  }
  if (/^\d+(?:\.\d+)+[.)、]?$/u.test(core)) {
    return "hierarchical";
  }
  if (/^[（(].+[）)]$/u.test(core)) {
    return "bracketed";
  }
  if (new RegExp(`^[${CHINESE_DIGITS}]+、?$`, "u").test(core)) {
    return "chinese";
  }
  if (/^[IVXLCDM]+[.)]?$/iu.test(core)) {
    return "roman";
  }
  if (/^[A-Z][.)]?$/iu.test(core)) {
    return "letter";
  }
  return "arabic";
}

function parseHierarchical(text: string): HeadingNumberMatch | null {
  const candidate = candidateFromRegex(
    text,
    /^(\d+(?:\.\d+){1,5})([.)、]?)[ \t]+/u,
    "hierarchical",
    "high",
    "manual-hierarchical",
  );
  if (candidate == null) {
    return null;
  }
  const parts = candidate.core.split(".").map(Number);
  const remainder = text.slice(candidate.matched.length).trimStart();
  if (
    parts.some((part) => part === 0)
    || (parts.length === 2 && (parts[1] ?? 0) >= 10)
    || MEASUREMENT_START.test(remainder)
  ) {
    candidate.confidence = "low";
    candidate.ruleId = "suspicious-decimal-or-version";
  }
  return makeCandidateMatch(text, candidate);
}

function makeCandidateMatch(text: string, candidate: Candidate): HeadingNumberMatch | null {
  if (!meaningfulRemainder(text, candidate.matched.length)) {
    return null;
  }
  return {
    fullPrefix: candidate.matched,
    numberCore: candidate.core,
    separator: candidate.separator,
    from: 0,
    to: candidate.matched.length,
    style: candidate.style,
    confidence: candidate.confidence,
    provenance: "manual",
    ruleId: candidate.ruleId,
  };
}

function parseTemplatePrefix(
  text: string,
  headingLevel: number,
  sources: readonly CleanupTemplateSource[],
): HeadingNumberMatch | null {
  for (const source of sources) {
    const template = source.templates[headingLevel - 1];
    if (template == null || template.length === 0) continue;
    const pattern = templatePrefixPattern(template);
    const match = pattern?.exec(text);
    if (match == null || match[0].length === 0 || !meaningfulRemainder(text, match[0].length)) continue;
    const core = match[1] ?? match[0].trimEnd();
    return {
      fullPrefix: match[0],
      numberCore: core,
      separator: match[2] ?? "",
      from: 0,
      to: match[0].length,
      style: inferStyle(core),
      confidence: "high",
      provenance: "template",
      ruleId: `template:${source.schemeId}@${source.revision}`,
      schemeId: source.schemeId,
      schemeRevision: source.revision,
    };
  }
  return null;
}

function parseManualPrefix(text: string): HeadingNumberMatch | null {
  const legal = candidateFromRegex(
    text,
    new RegExp(`^(第[${CHINESE_DIGITS}\\d]+[编章节条款项])([ \\t]*)`, "u"),
    "legal",
    "high",
    "manual-legal",
  );
  if (legal != null) {
    return makeCandidateMatch(text, legal);
  }

  const bracketed = candidateFromRegex(
    text,
    new RegExp(`^([（(][${CHINESE_DIGITS}\\d]+[）)])([ \\t]*)`, "u"),
    "bracketed",
    "high",
    "manual-bracketed",
  );
  if (bracketed != null) {
    return makeCandidateMatch(text, bracketed);
  }

  const circled = candidateFromRegex(
    text,
    new RegExp(`^([${CIRCLED_NUMBERS}])([ \\t]*)`, "u"),
    "circled",
    "high",
    "manual-circled",
  );
  if (circled != null) {
    return makeCandidateMatch(text, circled);
  }

  const chinese = candidateFromRegex(
    text,
    new RegExp(`^([${CHINESE_DIGITS}]+)(、)[ \\t]*`, "u"),
    "chinese",
    "high",
    "manual-chinese",
  );
  if (chinese != null) {
    return makeCandidateMatch(text, chinese);
  }

  const hierarchical = parseHierarchical(text);
  if (hierarchical != null) {
    return hierarchical;
  }

  const arabic = candidateFromRegex(
    text,
    /^(\d+)([.)、])[ \t]+/u,
    "arabic",
    "medium",
    "manual-arabic",
  );
  if (arabic != null) {
    const remainder = text.slice(arabic.matched.length).trimStart();
    if (YEAR.test(arabic.core) || MEASUREMENT_START.test(remainder)) {
      arabic.confidence = "low";
      arabic.ruleId = "suspicious-year-or-measurement";
    }
    return makeCandidateMatch(text, arabic);
  }

  const bareArabic = candidateFromRegex(
    text,
    /^(\d+)([ \t]+)/u,
    "arabic",
    "medium",
    "manual-arabic-bare",
  );
  if (bareArabic != null) {
    const remainder = text.slice(bareArabic.matched.length).trimStart();
    if (YEAR.test(bareArabic.core) || MEASUREMENT_START.test(remainder)) {
      bareArabic.confidence = "low";
      bareArabic.ruleId = "suspicious-year-or-measurement";
    }
    return makeCandidateMatch(text, bareArabic);
  }

  const roman = candidateFromRegex(
    text,
    /^([IVXLCDM]+)([.)])[ \t]+/u,
    "roman",
    "medium",
    "manual-roman",
  );
  if (roman != null) {
    return makeCandidateMatch(text, roman);
  }

  const letter = candidateFromRegex(
    text,
    /^([A-Za-z])([.)])[ \t]+/u,
    "letter",
    "medium",
    "manual-letter",
  );
  return letter == null ? null : makeCandidateMatch(text, letter);
}

export interface HeadingNumberContext {
  readonly headingLevel: number;
  readonly templateSources: readonly CleanupTemplateSource[];
}

export function parseHeadingNumber(
  text: string,
  context?: HeadingNumberContext,
): HeadingNumberMatch | null {
  const plugin = parsePluginPrefix(text);
  if (plugin != null) {
    return plugin;
  }
  if (hasMalformedPluginMarker(text)) {
    return null;
  }
  if (context != null) {
    const template = parseTemplatePrefix(text, context.headingLevel, context.templateSources);
    if (template != null) return template;
  }
  return parseManualPrefix(text);
}

export function parseHeadingNumberPrefixes(
  text: string,
  maxPrefixes = 8,
  context?: HeadingNumberContext,
): HeadingNumberMatch[] {
  const matches: HeadingNumberMatch[] = [];
  let offset = 0;
  while (offset < text.length && matches.length < maxPrefixes) {
    const match = parseHeadingNumber(text.slice(offset), context);
    if (match == null || match.to <= 0) {
      break;
    }
    const confidence = matches.length > 0 && match.confidence === "medium"
      ? "high"
      : match.confidence;
    matches.push({
      ...match,
      confidence,
      from: match.from + offset,
      to: match.to + offset,
      ruleId: confidence !== match.confidence ? `${match.ruleId}-chained` : match.ruleId,
    });
    offset += match.to;
  }
  return matches;
}

export function meetsCleanupScope(
  match: HeadingNumberMatch,
  scope: CleanupScope,
): boolean {
  if (match.provenance === "plugin") return true;
  if (scope === "plugin") return false;
  if (match.provenance === "template") return true;
  return scope === "common" && CONFIDENCE_RANK[match.confidence] >= CONFIDENCE_RANK.medium;
}

export function isSuspiciousNumericPrefix(text: string): boolean {
  if (hasMalformedPluginMarker(text)) {
    return true;
  }
  const match = parseHeadingNumber(text);
  if (match != null) {
    return match.confidence === "low";
  }
  return /^\d+(?:[.、)]|[ \t])/u.test(text)
    || new RegExp(`^[${CHINESE_DIGITS}]+[、.．)]`, "u").test(text);
}

export function isExpectedUnmarkedNumber(
  match: HeadingNumberMatch | null,
  expectedLabel: string | null,
): boolean {
  return match?.provenance === "manual"
    && match.confidence === "medium"
    && expectedLabel != null
    && match.numberCore === expectedLabel
    && match.fullPrefix === `${expectedLabel} `;
}
