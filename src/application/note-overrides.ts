import {
  canonicalNoteOverrideEntries,
  LEGACY_NOTE_OVERRIDE_KEYS,
  NUMBER_SUITE_PROPERTY,
  parseNoteOverrides,
  resolveNoteSettings,
  type NotePropertyIssue,
} from "../config/frontmatter";
import type { NumberSuiteSettings } from "../config/settings";
import { HEADING_LEVEL_COUNT, type HeadingLevel } from "../core/types";

export const NOTE_OVERRIDE_KEYS = [NUMBER_SUITE_PROPERTY, ...LEGACY_NOTE_OVERRIDE_KEYS] as const;

export type TriState = "inherit" | "on" | "off";

export type NoteOverrideChange =
  | { readonly kind: "show-virtual"; readonly value: TriState }
  | { readonly kind: "conceal-stored"; readonly value: TriState }
  | { readonly kind: "scheme"; readonly value: string | null }
  | { readonly kind: "ignore"; readonly value: boolean }
  | { readonly kind: "first-number"; readonly level: HeadingLevel; readonly value: number | null }
  | { readonly kind: "skip-first"; readonly level: HeadingLevel; readonly value: number | null }
  | { readonly kind: "migrate" }
  | { readonly kind: "reset" };

export interface NoteControlSnapshot {
  readonly showVirtual: TriState;
  readonly concealStored: TriState;
  readonly schemeId: string | null;
  readonly ignore: boolean;
  readonly firstNumbers: Readonly<Partial<Record<HeadingLevel, number>>>;
  readonly skipFirst: Readonly<Partial<Record<HeadingLevel, number>>>;
  readonly effectiveShowVirtual: boolean;
  readonly effectiveConcealStored: boolean;
  readonly effectiveSchemeId: string;
  readonly effectiveIgnore: boolean;
  readonly valid: boolean;
  readonly issues: readonly NotePropertyIssue[];
  readonly hasAnyOverride: boolean;
  readonly hasLegacy: boolean;
}

function hasOwn(values: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function triState(value: boolean | null): TriState {
  return value == null ? "inherit" : value ? "on" : "off";
}

export function readNoteControlSnapshot(
  values: Readonly<Record<string, unknown>>,
  settings: NumberSuiteSettings,
): NoteControlSnapshot {
  const overrides = parseNoteOverrides(values);
  const effective = resolveNoteSettings(settings, overrides);
  return {
    showVirtual: triState(overrides.showVirtualNumbers),
    concealStored: triState(overrides.concealStoredNumbers),
    schemeId: overrides.schemeId,
    ignore: overrides.disabled,
    firstNumbers: { ...overrides.starts },
    skipFirst: { ...overrides.skipFirst },
    effectiveShowVirtual: effective.showVirtualNumbers,
    effectiveConcealStored: effective.concealStoredNumbers,
    effectiveSchemeId: effective.schemeId,
    effectiveIgnore: effective.disabled,
    valid: effective.valid,
    issues: effective.issues,
    hasAnyOverride: NOTE_OVERRIDE_KEYS.some((key) => hasOwn(values, key)),
    hasLegacy: overrides.legacyKeysPresent.length > 0,
  };
}

function remove(values: Record<string, unknown>, key: string): boolean {
  if (!hasOwn(values, key)) return false;
  delete values[key];
  return true;
}

function stateValue(value: TriState): boolean | null {
  return value === "inherit" ? null : value === "on";
}

export function applyNoteOverrideChange(
  values: Record<string, unknown>,
  change: NoteOverrideChange,
): boolean {
  if (change.kind === "reset") {
    let changed = false;
    for (const key of NOTE_OVERRIDE_KEYS) changed = remove(values, key) || changed;
    return changed;
  }
  const current = parseNoteOverrides(values);
  if (current.issues.length > 0) {
    throw new Error(current.issues[0]?.message ?? "Invalid Number Suite Properties");
  }
  const next = {
    disabled: current.disabled,
    showVirtualNumbers: current.showVirtualNumbers,
    concealStoredNumbers: current.concealStoredNumbers,
    schemeId: current.schemeId,
    starts: { ...current.starts },
    skipFirst: { ...current.skipFirst },
  };
  switch (change.kind) {
    case "migrate": break;
    case "show-virtual": next.showVirtualNumbers = stateValue(change.value); break;
    case "conceal-stored": next.concealStoredNumbers = stateValue(change.value); break;
    case "scheme": next.schemeId = change.value; break;
    case "ignore": next.disabled = change.value; break;
    case "first-number":
      if (change.value == null) delete next.starts[change.level];
      else next.starts[change.level] = change.value;
      break;
    case "skip-first":
      if (change.value == null || change.value === 0) delete next.skipFirst[change.level];
      else next.skipFirst[change.level] = change.value;
      break;
  }
  const entries = canonicalNoteOverrideEntries(next);
  const before = JSON.stringify(Object.fromEntries(NOTE_OVERRIDE_KEYS
    .filter((key) => hasOwn(values, key))
    .map((key) => [key, values[key]])));
  if (entries.length === 0) delete values[NUMBER_SUITE_PROPERTY];
  else values[NUMBER_SUITE_PROPERTY] = entries;
  for (const key of LEGACY_NOTE_OVERRIDE_KEYS) delete values[key];
  const after = JSON.stringify(Object.fromEntries(NOTE_OVERRIDE_KEYS
    .filter((key) => hasOwn(values, key))
    .map((key) => [key, values[key]])));
  return before !== after;
}

export function headingLevels(): readonly HeadingLevel[] {
  return Array.from({ length: HEADING_LEVEL_COUNT }, (_unused, index) => (index + 1) as HeadingLevel);
}
