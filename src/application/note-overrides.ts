import type { StructuredNumberingSettings } from "../config/settings";
import { isBuiltInSchemeId } from "../core/schemes";

export const NOTE_OVERRIDE_KEYS = [
  "structured-numbering-ignore",
  "structured-numbering-show-virtual",
  "structured-numbering-conceal-stored",
  "structured-numbering-scheme",
  "structured-numbering-clean-scope",
  "structured-numbering-start",
] as const;

export type TriState = "inherit" | "on" | "off";

export type NoteOverrideChange =
  | { readonly kind: "show-virtual"; readonly value: TriState }
  | { readonly kind: "conceal-stored"; readonly value: TriState }
  | { readonly kind: "scheme"; readonly value: string | null }
  | { readonly kind: "ignore"; readonly value: boolean }
  | { readonly kind: "reset" };

export interface NoteControlSnapshot {
  readonly showVirtual: TriState;
  readonly concealStored: TriState;
  readonly schemeId: string | null;
  readonly ignore: boolean;
  readonly effectiveShowVirtual: boolean;
  readonly effectiveConcealStored: boolean;
  readonly effectiveSchemeId: string;
  readonly effectiveIgnore: boolean;
  readonly hasAnyOverride: boolean;
}

function hasOwn(values: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function explicitTriState(value: unknown): TriState | null {
  return typeof value === "boolean" ? (value ? "on" : "off") : null;
}

function stateValue(value: TriState, fallback: boolean): boolean {
  return value === "inherit" ? fallback : value === "on";
}

export function readNoteControlSnapshot(
  values: Readonly<Record<string, unknown>>,
  settings: StructuredNumberingSettings,
): NoteControlSnapshot {
  const showVirtual = explicitTriState(values["structured-numbering-show-virtual"])
    ?? "inherit";
  const concealStored = explicitTriState(values["structured-numbering-conceal-stored"])
    ?? "inherit";
  const rawScheme = values["structured-numbering-scheme"];
  const schemeId = typeof rawScheme === "string" && rawScheme.length > 0 ? rawScheme : null;
  const schemeExists = schemeId != null && (
    settings.customSchemes.some((scheme) => scheme.id === schemeId)
    || isBuiltInSchemeId(schemeId)
  );
  const ignore = values["structured-numbering-ignore"] === true;

  return {
    showVirtual,
    concealStored,
    schemeId,
    ignore,
    effectiveShowVirtual: stateValue(showVirtual, settings.showVirtualNumbers),
    effectiveConcealStored: stateValue(concealStored, settings.concealStoredNumbers),
    effectiveSchemeId: schemeExists && schemeId != null ? schemeId : settings.selectedSchemeId,
    effectiveIgnore: ignore,
    hasAnyOverride: NOTE_OVERRIDE_KEYS.some((key) => hasOwn(values, key)),
  };
}

function assign(values: Record<string, unknown>, key: string, value: unknown): boolean {
  if (hasOwn(values, key) && Object.is(values[key], value)) return false;
  values[key] = value;
  return true;
}

function remove(values: Record<string, unknown>, key: string): boolean {
  if (!hasOwn(values, key)) return false;
  delete values[key];
  return true;
}

function applyTriState(
  values: Record<string, unknown>,
  key: "structured-numbering-show-virtual" | "structured-numbering-conceal-stored",
  value: TriState,
): boolean {
  return value === "inherit"
    ? remove(values, key)
    : assign(values, key, value === "on");
}

export function applyNoteOverrideChange(
  values: Record<string, unknown>,
  change: NoteOverrideChange,
): boolean {
  switch (change.kind) {
    case "show-virtual":
      return applyTriState(values, "structured-numbering-show-virtual", change.value);
    case "conceal-stored":
      return applyTriState(values, "structured-numbering-conceal-stored", change.value);
    case "scheme":
      return change.value == null
        ? remove(values, "structured-numbering-scheme")
        : assign(values, "structured-numbering-scheme", change.value);
    case "ignore": {
      return change.value
        ? assign(values, "structured-numbering-ignore", true)
        : remove(values, "structured-numbering-ignore");
    }
    case "reset": {
      let changed = false;
      for (const key of NOTE_OVERRIDE_KEYS) changed = remove(values, key) || changed;
      return changed;
    }
  }
}
