import type { NumberSuiteSettings } from "./settings";
import {
  type CleanupScope,
  HEADING_LEVEL_COUNT,
  type HeadingLevel,
} from "../core/types";
import { isBuiltInSchemeId } from "../core/schemes";

export interface NoteOverrides {
  disabled: boolean;
  showVirtualNumbers: boolean | null;
  concealStoredNumbers: boolean | null;
  schemeId: string | null;
  cleanupScope: CleanupScope | null;
  starts: Partial<Record<HeadingLevel, number>>;
}

export interface EffectiveNoteSettings {
  disabled: boolean;
  showVirtualNumbers: boolean;
  concealStoredNumbers: boolean;
  schemeId: string;
  cleanupScope: CleanupScope;
  starts: Partial<Record<HeadingLevel, number>>;
}

const EMPTY_OVERRIDES: NoteOverrides = {
  disabled: false,
  showVirtualNumbers: null,
  concealStoredNumbers: null,
  schemeId: null,
  cleanupScope: null,
  starts: {},
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

export function parseNoteOverrides(frontmatter: unknown): NoteOverrides {
  const data = record(frontmatter);
  if (data == null) {
    return { ...EMPTY_OVERRIDES, starts: {} };
  }
  const ignore = data["number-suite-ignore"] === true;
  const showValue = data["number-suite-show-virtual"];
  const concealValue = data["number-suite-conceal-stored"];
  const showVirtualNumbers = typeof showValue === "boolean" ? showValue : null;
  const concealStoredNumbers = typeof concealValue === "boolean" ? concealValue : null;
  const schemeValue = data["number-suite-scheme"];
  const schemeId = typeof schemeValue === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(schemeValue)
    ? schemeValue
    : null;
  const scopeValue = data["number-suite-clean-scope"];
  const cleanupScope = scopeValue === "plugin" || scopeValue === "templates" || scopeValue === "common"
    ? scopeValue
    : null;
  const startsData = record(data["number-suite-start"]);
  const starts: Partial<Record<HeadingLevel, number>> = {};
  if (startsData != null) {
    for (let level = 1; level <= HEADING_LEVEL_COUNT; level += 1) {
      const value = positiveInteger(startsData[`h${level}`]);
      if (value != null) {
        starts[level as HeadingLevel] = value;
      }
    }
  }
  return { disabled: ignore, showVirtualNumbers, concealStoredNumbers, schemeId, cleanupScope, starts };
}

export function resolveNoteSettings(
  settings: NumberSuiteSettings,
  overrides: NoteOverrides,
): EffectiveNoteSettings {
  const requestedScheme = overrides.schemeId;
  const schemeExists = requestedScheme != null && (
    isBuiltInSchemeId(requestedScheme)
    || settings.customSchemes.some((scheme) => scheme.id === requestedScheme)
  );
  return {
    disabled: overrides.disabled,
    showVirtualNumbers: overrides.showVirtualNumbers ?? settings.showVirtualNumbers,
    concealStoredNumbers: overrides.concealStoredNumbers ?? settings.concealStoredNumbers,
    schemeId: schemeExists && requestedScheme != null ? requestedScheme : settings.selectedSchemeId,
    cleanupScope: overrides.cleanupScope ?? settings.cleanupScope,
    starts: { ...overrides.starts },
  };
}
