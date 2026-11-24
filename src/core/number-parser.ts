import { hasMalformedPluginMarker, WORD_JOINER } from "./markers";
import type {
  CleanupScope,
  CleanupTemplateSource,
  Confidence,
  HeadingLevel,
  HeadingNumberMatch,
  NumberStyle,
} from "./types";
import { HEADING_LEVELS } from "./types";
import { isAmbiguousCompactJoin, templatePrefixPattern } from "./template-compiler";

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  certain: 3,
};

const CHINESE_DIGITS = "零〇一二三四五六七八九十百千万亿萬億壹贰貳叁參肆伍陆陸柒捌玖拾佰仟";
const CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const MEASUREMENT_START = /^(?:倍|版(?:本)?|年|月|日|种|个|项|条|米|厘米|毫米|千米|克|千克|kg|g|mm|cm|m|%)/iu;
// A complete ordinal delimiter before an adjacent title provides an extra boundary.
// An isolated unit is still ambiguous; words such as “项目管理” and “Goals” are titles.
const COMPACT_MEASUREMENT_START = /^(?:%|(?:kg|g|mm|cm|m)(?![a-z])|版本|版次|(?:倍|年|月|日|种|个|项|条|米|厘米|毫米|千米|克|千克)(?=$|[\s\p{Nd}\p{P}]))/iu;
const VERSION_START = /^(?:v(?:ersion)?|version|release|build|版本|版次)(?:\b|\s|：|:)/iu;
const YEAR = /^(?:19|20)\d{2}$/;

interface Candidate {
  core: string;
  matched: string;
  separator: string;
  style: NumberStyle;
  confidence: Confidence;
  ruleId: string;
}

function numericRiskText(text: string): string {
  return text.replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[０-９]/gu, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/[٫．]/gu, ".");
}

function meaningfulRemainder(text: string, to: number): boolean {
  return /^[^\S\r\n]*[^\s]/u.test(text.slice(to));
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
  const whitespace = /^[ \t\u00a0\u3000]*/u.exec(text.slice(closing + WORD_JOINER.length))?.[0] ?? "";
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
    /^(\d+(?:\.\d+){1,5}[.)、]?)([ \t\u00a0\u3000]+)/u,
    "hierarchical",
    "high",
    "manual-hierarchical",
  );
  if (candidate == null) {
    return null;
  }
  const numeric = candidate.core.replace(/[.)、]$/u, "");
  const remainder = text.slice(candidate.matched.length).trimStart();
  if (riskyHierarchy(numeric, remainder)) {
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

interface TemplateRule {
  readonly source: CleanupTemplateSource;
  readonly level: HeadingLevel;
  readonly pattern: RegExp;
}

// Settings and document plans supply immutable source lists. A new list gets a
// new index on disable/restore or revision changes; retired indexes can be collected.
const patternsByTemplates = new WeakMap<readonly string[], readonly (RegExp | null)[]>();
const templateIndexes = new WeakMap<readonly CleanupTemplateSource[], readonly TemplateRule[]>();

function templateIndex(sources: readonly CleanupTemplateSource[]): readonly TemplateRule[] {
  const cached = templateIndexes.get(sources);
  if (cached != null) return cached;
  const rules: TemplateRule[] = [];
  for (const level of HEADING_LEVELS) {
    const seen = new Set<string>();
    for (const source of sources) {
      const template = source.templates[level - 1];
      if (!template || seen.has(template)) continue;
      seen.add(template);
      let patterns = patternsByTemplates.get(source.templates);
      if (patterns == null) {
        patterns = source.templates.map(templatePrefixPattern);
        patternsByTemplates.set(source.templates, patterns);
      }
      const pattern = patterns[level - 1];
      if (pattern != null) rules.push({ source, level, pattern });
    }
  }
  templateIndexes.set(sources, rules);
  return rules;
}

function riskyHierarchy(numeric: string, remainder: string): boolean {
  const parts = numeric.split(".").map(Number);
  return parts.some((part) => part === 0)
    || YEAR.test(String(parts[0]))
    || (parts.length === 2 && (parts[1] ?? 0) >= 10)
    || MEASUREMENT_START.test(remainder)
    || VERSION_START.test(remainder);
}

function numericTemplateRisk(core: string, separator: string, remainder: string): boolean {
  const label = /^(\d+(?:\.\d+)*)([.)、]?)$/u.exec(numericRiskText(core));
  if (label == null) return false;
  const numeric = label[1]!;
  if (numeric.includes(".")) return riskyHierarchy(numeric, remainder);
  const quantity = separator === "" && label[2] ? COMPACT_MEASUREMENT_START : MEASUREMENT_START;
  return YEAR.test(numeric) || quantity.test(remainder) || VERSION_START.test(remainder);
}

function parseTemplatePrefix(text: string, context: HeadingNumberContext): HeadingNumberMatch | null {
  let best: HeadingNumberMatch | null = null;
  let ambiguous = false;
  for (const { source, level, pattern } of templateIndex(context.templateSources)) {
    if (!context.matchOtherLevels && level !== context.headingLevel) continue;
    const match = pattern.exec(text);
    if (match == null || !meaningfulRemainder(text, match[0].length)) continue;
    const core = match[1] ?? "";
    const separator = match[2] ?? "";
    const remainder = text.slice(match[0].length);
    if (!separator && isAmbiguousCompactJoin(core, remainder)) continue;
    if (best != null) {
      // Competing complete boundaries can include different parts of the
      // title. Do not promote either interpretation to a reliable match.
      if (best.to !== match[0].length || best.numberCore !== core) ambiguous = true;
      if (best.templateLevel === context.headingLevel || level !== context.headingLevel) continue;
    }
    best = {
      fullPrefix: match[0],
      numberCore: core,
      separator,
      from: 0,
      to: match[0].length,
      style: inferStyle(core),
      confidence: numericTemplateRisk(core, separator, remainder) ? "low" : "high",
      provenance: "template",
      ruleId: `template:${source.schemeId}@${source.revision}`,
      schemeId: source.schemeId,
      schemeRevision: source.revision,
      templateLevel: level,
    };
  }
  return ambiguous && best != null ? { ...best, confidence: "low" } : best;
}

function parseManualPrefix(text: string): HeadingNumberMatch | null {
  const legal = candidateFromRegex(
    text,
    new RegExp(`^(第[${CHINESE_DIGITS}\\d]+[编章节条款项])([ \\t\\u00a0\\u3000]*)`, "u"),
    "legal",
    "high",
    "manual-legal",
  );
  if (legal != null) {
    return makeCandidateMatch(text, legal);
  }

  const bracketed = candidateFromRegex(
    text,
    new RegExp(`^([（(][${CHINESE_DIGITS}\\d]+[）)])([ \\t\\u00a0\\u3000]*)`, "u"),
    "bracketed",
    "high",
    "manual-bracketed",
  );
  if (bracketed != null) {
    return makeCandidateMatch(text, bracketed);
  }

  const circled = candidateFromRegex(
    text,
    new RegExp(`^([${CIRCLED_NUMBERS}])([ \\t\\u00a0\\u3000]*)`, "u"),
    "circled",
    "high",
    "manual-circled",
  );
  if (circled != null) {
    return makeCandidateMatch(text, circled);
  }

  const chinese = candidateFromRegex(
    text,
    new RegExp(`^([${CHINESE_DIGITS}]+、)([ \\t\\u00a0\\u3000]*)`, "u"),
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
    /^(\d+[.)、])([ \t\u00a0\u3000]+)/u,
    "arabic",
    "medium",
    "manual-arabic",
  );
  if (arabic != null) {
    const remainder = text.slice(arabic.matched.length).trimStart();
    if (YEAR.test(arabic.core.slice(0, -1)) || MEASUREMENT_START.test(remainder)) {
      arabic.confidence = "low";
      arabic.ruleId = "suspicious-year-or-measurement";
    }
    return makeCandidateMatch(text, arabic);
  }

  const bareArabic = candidateFromRegex(
    text,
    /^(\d+)([ \t\u00a0\u3000]+)/u,
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
    /^([IVXLCDM]+[.)])([ \t\u00a0\u3000]+)/u,
    "roman",
    "medium",
    "manual-roman",
  );
  if (roman != null) {
    return makeCandidateMatch(text, roman);
  }

  const letter = candidateFromRegex(
    text,
    /^([A-Za-z][.)])([ \t\u00a0\u3000]+)/u,
    "letter",
    "medium",
    "manual-letter",
  );
  return letter == null ? null : makeCandidateMatch(text, letter);
}

export interface HeadingNumberContext {
  readonly headingLevel: number;
  /** Display may recognize a stored style from another level. Writes use the actual level. */
  readonly matchOtherLevels?: boolean;
  readonly templateSources: readonly CleanupTemplateSource[];
}

export function parseHeadingNumber(
  text: string,
  context?: HeadingNumberContext,
): HeadingNumberMatch | null {
  if (hasMalformedPluginMarker(text)) return null;
  const plugin = parsePluginPrefix(text);
  if (plugin != null) return plugin;
  if (context != null) {
    const template = parseTemplatePrefix(text, context);
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
  if (match.provenance === "template") return match.confidence !== "low";
  return scope === "common" && CONFIDENCE_RANK[match.confidence] >= CONFIDENCE_RANK.medium;
}

export function isSuspiciousNumericPrefix(text: string): boolean {
  if (hasMalformedPluginMarker(text)) {
    return true;
  }
  const match = parseHeadingNumber(numericRiskText(text));
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
    && match.numberCore === expectedLabel;
}
