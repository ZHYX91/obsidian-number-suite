import type { NumberSuiteSettings } from "./settings";
import {
  type CleanupScope,
  HEADING_LEVEL_COUNT,
  type HeadingLevel,
} from "../core/types";
import { isBuiltInSchemeId } from "../core/schemes";

export const NUMBER_SUITE_PROPERTY = "number-suite";
export const LEGACY_NOTE_OVERRIDE_KEYS = [
  "number-suite-ignore",
  "number-suite-show-virtual",
  "number-suite-conceal-stored",
  "number-suite-scheme",
  "number-suite-clean-scope",
  "number-suite-start",
] as const;

export type NotePropertyField =
  | "all"
  | "disabled"
  | "heading.virtual"
  | "heading.hide-stored"
  | "heading.scheme"
  | "heading.first-number"
  | "heading.skip-first";

export interface NotePropertyIssue {
  readonly code:
    | "canonical-type"
    | "conflict"
    | "duplicate-directive"
    | "invalid-value"
    | "legacy-type"
    | "malformed-directive"
    | "source-ambiguous"
    | "unknown-directive"
    | "unavailable-scheme";
  readonly field: NotePropertyField;
  readonly message: string;
}

export interface NoteOverrides {
  readonly disabled: boolean;
  readonly showVirtualNumbers: boolean | null;
  readonly concealStoredNumbers: boolean | null;
  readonly schemeId: string | null;
  readonly starts: Partial<Record<HeadingLevel, number>>;
  readonly skipFirst: Partial<Record<HeadingLevel, number>>;
  readonly issues: readonly NotePropertyIssue[];
  readonly canonicalEntries: readonly string[];
  readonly canonicalPresent: boolean;
  readonly legacyKeysPresent: readonly string[];
  readonly redundantLegacyKeys: readonly string[];
  readonly unknownEntries: readonly string[];
}

export interface EffectiveNoteSettings {
  readonly valid: boolean;
  readonly issues: readonly NotePropertyIssue[];
  readonly disabled: boolean;
  readonly showVirtualNumbers: boolean;
  readonly concealStoredNumbers: boolean;
  readonly schemeId: string;
  readonly cleanupScope: CleanupScope;
  readonly starts: Partial<Record<HeadingLevel, number>>;
  readonly skipFirst: Partial<Record<HeadingLevel, number>>;
}

interface ParsedValues {
  disabled?: boolean;
  showVirtualNumbers?: boolean;
  concealStoredNumbers?: boolean;
  schemeId?: string;
  starts: Partial<Record<HeadingLevel, number>>;
  skipFirst: Partial<Record<HeadingLevel, number>>;
}

const SCHEME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOwn(value: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function issue(
  issues: NotePropertyIssue[],
  code: NotePropertyIssue["code"],
  field: NotePropertyField,
  message: string,
): void {
  issues.push({ code, field, message });
}

export function withNotePropertyIssues(
  overrides: NoteOverrides,
  additional: readonly NotePropertyIssue[],
): NoteOverrides {
  return additional.length === 0 ? overrides : { ...overrides, issues: [...additional, ...overrides.issues] };
}

export function invalidNoteOverrides(message = "Invalid Properties YAML"): NoteOverrides {
  return withNotePropertyIssues(parseNoteOverrides(null), [{
    code: "source-ambiguous",
    field: "all",
    message,
  }]);
}

function fieldForDirective(key: string): NotePropertyField {
  if (key === "disabled") return "disabled";
  if (key === "heading.virtual") return "heading.virtual";
  if (key === "heading.hide-stored") return "heading.hide-stored";
  if (key === "heading.scheme") return "heading.scheme";
  if (key.startsWith("heading.first-number.")) return "heading.first-number";
  if (key.startsWith("heading.skip-first.")) return "heading.skip-first";
  return "all";
}

function parseCanonical(
  raw: unknown,
  present: boolean,
  issues: NotePropertyIssue[],
): { values: ParsedValues; entries: string[]; unknown: string[] } {
  const values: ParsedValues = { starts: {}, skipFirst: {} };
  const entries: string[] = [];
  const unknown: string[] = [];
  if (!present) return { values, entries, unknown };
  if (!Array.isArray(raw)) {
    issue(issues, "canonical-type", "all", `${NUMBER_SUITE_PROPERTY} must be a list of path=value text items`);
    return { values, entries, unknown };
  }
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || item.trim() !== item) {
      issue(issues, "malformed-directive", "all", `${NUMBER_SUITE_PROPERTY} contains a non-text or padded item`);
      continue;
    }
    entries.push(item);
    const match = /^([a-z][a-z0-9.-]*)=(.+)$/u.exec(item);
    if (match == null) {
      issue(issues, "malformed-directive", "all", `Invalid ${NUMBER_SUITE_PROPERTY} item: ${item}`);
      continue;
    }
    const key = match[1] ?? "";
    const rawValue = match[2] ?? "";
    const field = fieldForDirective(key);
    if (field === "all") {
      unknown.push(item);
      issue(issues, "unknown-directive", "all", `Unknown ${NUMBER_SUITE_PROPERTY} directive: ${key}`);
      continue;
    }
    if (seen.has(key)) {
      issue(issues, "duplicate-directive", field, `Duplicate ${NUMBER_SUITE_PROPERTY} directive: ${key}`);
      continue;
    }
    seen.add(key);
    if (key === "disabled") {
      if (rawValue === "true" || rawValue === "false") values.disabled = rawValue === "true";
      else issue(issues, "invalid-value", field, `Invalid ${NUMBER_SUITE_PROPERTY} item: ${item}`);
      continue;
    }
    if (key === "heading.virtual") {
      if (rawValue === "true" || rawValue === "false") values.showVirtualNumbers = rawValue === "true";
      else issue(issues, "invalid-value", field, `Invalid ${NUMBER_SUITE_PROPERTY} item: ${item}`);
      continue;
    }
    if (key === "heading.hide-stored") {
      if (rawValue === "true" || rawValue === "false") values.concealStoredNumbers = rawValue === "true";
      else issue(issues, "invalid-value", field, `Invalid ${NUMBER_SUITE_PROPERTY} item: ${item}`);
      continue;
    }
    if (key === "heading.scheme") {
      if (SCHEME_ID.test(rawValue)) values.schemeId = rawValue;
      else issue(issues, "invalid-value", field, `Invalid ${NUMBER_SUITE_PROPERTY} item: ${item}`);
      continue;
    }
    const levelMatch = /^heading\.(first-number|skip-first)\.h([1-9])$/u.exec(key);
    const level = Number(levelMatch?.[2]) as HeadingLevel;
    const parsed = levelMatch?.[1] === "first-number"
      ? (/^[1-9]\d*$/u.test(rawValue) ? positiveInteger(Number(rawValue)) : null)
      : (/^(?:0|[1-9]\d*)$/u.test(rawValue) ? nonNegativeInteger(Number(rawValue)) : null);
    if (parsed == null) {
      issue(issues, "invalid-value", field, `Invalid ${NUMBER_SUITE_PROPERTY} item: ${item}`);
    } else if (levelMatch?.[1] === "first-number") {
      values.starts[level] = parsed;
    } else {
      values.skipFirst[level] = parsed;
    }
  }
  return { values, entries, unknown };
}

function parseLegacy(
  data: Readonly<Record<string, unknown>>,
  issues: NotePropertyIssue[],
): { values: ParsedValues; present: string[] } {
  const values: ParsedValues = { starts: {}, skipFirst: {} };
  const present = LEGACY_NOTE_OVERRIDE_KEYS.filter((key) => hasOwn(data, key));
  const readBoolean = (key: typeof LEGACY_NOTE_OVERRIDE_KEYS[number], field: NotePropertyField): boolean | undefined => {
    if (!hasOwn(data, key)) return undefined;
    const raw = data[key];
    if (typeof raw === "boolean") return raw;
    issue(issues, "legacy-type", field, `Invalid legacy property ${key}`);
    return undefined;
  };
  const disabled = readBoolean("number-suite-ignore", "disabled");
  const showVirtualNumbers = readBoolean("number-suite-show-virtual", "heading.virtual");
  const concealStoredNumbers = readBoolean("number-suite-conceal-stored", "heading.hide-stored");
  if (disabled !== undefined) values.disabled = disabled;
  if (showVirtualNumbers !== undefined) values.showVirtualNumbers = showVirtualNumbers;
  if (concealStoredNumbers !== undefined) values.concealStoredNumbers = concealStoredNumbers;
  if (hasOwn(data, "number-suite-scheme")) {
    const raw = data["number-suite-scheme"];
    if (typeof raw === "string" && SCHEME_ID.test(raw)) values.schemeId = raw;
    else issue(issues, "legacy-type", "heading.scheme", "Invalid legacy property number-suite-scheme");
  }
  if (hasOwn(data, "number-suite-start")) {
    const starts = record(data["number-suite-start"]);
    if (starts == null) {
      issue(issues, "legacy-type", "heading.first-number", "Invalid legacy property number-suite-start");
    } else {
      for (let level = 1; level <= HEADING_LEVEL_COUNT; level += 1) {
        const key = `h${level}`;
        if (!hasOwn(starts, key)) continue;
        const parsed = positiveInteger(starts[key]);
        if (parsed == null) issue(issues, "legacy-type", "heading.first-number", `Invalid legacy property number-suite-start.${key}`);
        else values.starts[level as HeadingLevel] = parsed;
      }
    }
  }
  return { values, present };
}

function compareScalar<T>(
  field: NotePropertyField,
  canonical: T | undefined,
  legacy: T | undefined,
  legacyKey: string,
  redundant: string[],
  issues: NotePropertyIssue[],
): void {
  if (canonical === undefined || legacy === undefined) return;
  if (canonical === legacy) redundant.push(legacyKey);
  else issue(issues, "conflict", field, `Conflicting ${field} values in ${NUMBER_SUITE_PROPERTY} and ${legacyKey}`);
}

export function parseNoteOverrides(frontmatter: unknown): NoteOverrides {
  const data = record(frontmatter) ?? {};
  const issues: NotePropertyIssue[] = [];
  const canonicalPresent = hasOwn(data, NUMBER_SUITE_PROPERTY);
  const canonical = parseCanonical(data[NUMBER_SUITE_PROPERTY], canonicalPresent, issues);
  const legacy = parseLegacy(data, issues);
  const redundantLegacyKeys: string[] = [];
  compareScalar("disabled", canonical.values.disabled, legacy.values.disabled, "number-suite-ignore", redundantLegacyKeys, issues);
  compareScalar("heading.virtual", canonical.values.showVirtualNumbers, legacy.values.showVirtualNumbers, "number-suite-show-virtual", redundantLegacyKeys, issues);
  compareScalar("heading.hide-stored", canonical.values.concealStoredNumbers, legacy.values.concealStoredNumbers, "number-suite-conceal-stored", redundantLegacyKeys, issues);
  compareScalar("heading.scheme", canonical.values.schemeId, legacy.values.schemeId, "number-suite-scheme", redundantLegacyKeys, issues);
  for (let level = 1; level <= HEADING_LEVEL_COUNT; level += 1) {
    const key = level as HeadingLevel;
    compareScalar("heading.first-number", canonical.values.starts[key], legacy.values.starts[key], "number-suite-start", redundantLegacyKeys, issues);
  }
  return {
    disabled: canonical.values.disabled ?? legacy.values.disabled ?? false,
    showVirtualNumbers: canonical.values.showVirtualNumbers ?? legacy.values.showVirtualNumbers ?? null,
    concealStoredNumbers: canonical.values.concealStoredNumbers ?? legacy.values.concealStoredNumbers ?? null,
    schemeId: canonical.values.schemeId ?? legacy.values.schemeId ?? null,
    starts: { ...legacy.values.starts, ...canonical.values.starts },
    skipFirst: { ...canonical.values.skipFirst },
    issues,
    canonicalEntries: canonical.entries,
    canonicalPresent,
    legacyKeysPresent: legacy.present,
    redundantLegacyKeys: [...new Set(redundantLegacyKeys)],
    unknownEntries: canonical.unknown,
  };
}

export function canonicalNoteOverrideEntries(values: Readonly<{
  disabled: boolean;
  showVirtualNumbers: boolean | null;
  concealStoredNumbers: boolean | null;
  schemeId: string | null;
  starts: Readonly<Partial<Record<HeadingLevel, number>>>;
  skipFirst: Readonly<Partial<Record<HeadingLevel, number>>>;
}>): string[] {
  const entries: string[] = [];
  if (values.disabled) entries.push("disabled=true");
  if (values.showVirtualNumbers != null) entries.push(`heading.virtual=${String(values.showVirtualNumbers)}`);
  if (values.concealStoredNumbers != null) entries.push(`heading.hide-stored=${String(values.concealStoredNumbers)}`);
  if (values.schemeId != null) entries.push(`heading.scheme=${values.schemeId}`);
  for (let level = 1; level <= HEADING_LEVEL_COUNT; level += 1) {
    const value = values.starts[level as HeadingLevel];
    if (value != null) entries.push(`heading.first-number.h${level}=${value}`);
  }
  for (let level = 1; level <= HEADING_LEVEL_COUNT; level += 1) {
    const value = values.skipFirst[level as HeadingLevel];
    if (value != null && value > 0) entries.push(`heading.skip-first.h${level}=${value}`);
  }
  return entries;
}

export function resolveNoteSettings(
  settings: NumberSuiteSettings,
  overrides: NoteOverrides,
): EffectiveNoteSettings {
  const requestedScheme = overrides.schemeId;
  const schemeExists = requestedScheme == null || isBuiltInSchemeId(requestedScheme)
    || settings.customSchemes.some((scheme) => scheme.id === requestedScheme);
  const issues = [...overrides.issues];
  if (!schemeExists && requestedScheme != null) {
    issue(issues, "unavailable-scheme", "heading.scheme", `Unavailable Number Suite scheme: ${requestedScheme}`);
  }
  return {
    valid: issues.length === 0,
    issues,
    disabled: overrides.disabled,
    showVirtualNumbers: overrides.showVirtualNumbers ?? settings.showVirtualNumbers,
    concealStoredNumbers: overrides.concealStoredNumbers ?? settings.concealStoredNumbers,
    schemeId: schemeExists && requestedScheme != null ? requestedScheme : settings.selectedSchemeId,
    cleanupScope: settings.cleanupScope,
    starts: { ...overrides.starts },
    skipFirst: { ...overrides.skipFirst },
  };
}
