import { cloneSettings, type StructuredNumberingSettings } from "../config/settings";
import type { SettingsImpact } from "./settings-impact";

export type SettingsControlKey =
  | "general.language"
  | "general.showVirtualNumbers"
  | "general.concealStoredNumbers"
  | "captions.showCaptionNumbers"
  | "captions.centerFigure"
  | "captions.centerTable"
  | "captions.centerEquation"
  | "captions.centerCode"
  | "references.showCrossReferences"
  | "notes.showNoteNumbers"
  | "notes.displayMode"
  | "general.missingLevelStrategy"
  | "cleanup.writeMarkers"
  | "cleanup.cleanupScope"
  | "cleanup.removeMultiplePrefixes"
  | "cleanup.normalizeManualOnRenumber"
  | "views.enableLivePreview"
  | "views.enableReadingView"
  | "views.enableSourceMode"
  | "views.revealOnActiveLine"
  | "views.virtualOpacity"
  | "views.virtualGapEm"
  | "views.excludedFolders"
  | "views.batchBackupLimitMb";

export interface SettingsControlMutation {
  readonly settings: StructuredNumberingSettings;
  readonly impact: SettingsImpact;
  readonly refreshSurface: boolean;
  readonly persistence: "immediate" | "scheduled";
}

const SETTINGS_CONTROL_KEYS = new Set<SettingsControlKey>([
  "general.language",
  "general.showVirtualNumbers",
  "general.concealStoredNumbers",
  "captions.showCaptionNumbers",
  "captions.centerFigure",
  "captions.centerTable",
  "captions.centerEquation",
  "captions.centerCode",
  "references.showCrossReferences",
  "notes.showNoteNumbers",
  "notes.displayMode",
  "general.missingLevelStrategy",
  "cleanup.writeMarkers",
  "cleanup.cleanupScope",
  "cleanup.removeMultiplePrefixes",
  "cleanup.normalizeManualOnRenumber",
  "views.enableLivePreview",
  "views.enableReadingView",
  "views.enableSourceMode",
  "views.revealOnActiveLine",
  "views.virtualOpacity",
  "views.virtualGapEm",
  "views.excludedFolders",
  "views.batchBackupLimitMb",
]);

export function isSettingsControlKey(value: string): value is SettingsControlKey {
  return SETTINGS_CONTROL_KEYS.has(value as SettingsControlKey);
}

export function getSettingsControlValue(
  settings: StructuredNumberingSettings,
  key: SettingsControlKey,
): unknown {
  switch (key) {
    case "general.language": return settings.language;
    case "general.showVirtualNumbers": return settings.showVirtualNumbers;
    case "general.concealStoredNumbers": return settings.concealStoredNumbers;
    case "captions.showCaptionNumbers": return settings.showCaptionNumbers;
    case "captions.centerFigure": return settings.centerFigureCaptions;
    case "captions.centerTable": return settings.centerTableCaptions;
    case "captions.centerEquation": return settings.centerEquationCaptions;
    case "captions.centerCode": return settings.centerCodeCaptions;
    case "references.showCrossReferences": return settings.showCrossReferences;
    case "notes.showNoteNumbers": return settings.showNoteNumbers;
    case "notes.displayMode": return settings.noteDisplayMode;
    case "general.missingLevelStrategy": return settings.missingLevelStrategy;
    case "cleanup.writeMarkers": return settings.writeMarkers;
    case "cleanup.cleanupScope": return settings.cleanupScope;
    case "cleanup.removeMultiplePrefixes": return settings.removeMultiplePrefixes;
    case "cleanup.normalizeManualOnRenumber": return settings.normalizeManualOnRenumber;
    case "views.enableLivePreview": return settings.enableLivePreview;
    case "views.enableReadingView": return settings.enableReadingView;
    case "views.enableSourceMode": return settings.enableSourceMode;
    case "views.revealOnActiveLine": return settings.revealOnActiveLine;
    case "views.virtualOpacity": return settings.virtualOpacity;
    case "views.virtualGapEm": return settings.virtualGapEm;
    case "views.excludedFolders": return settings.excludedFolders.join(", ");
    case "views.batchBackupLimitMb": return settings.batchBackupLimitMb;
  }
}

export function applySettingsControlValue(
  settings: StructuredNumberingSettings,
  key: SettingsControlKey,
  value: unknown,
): SettingsControlMutation {
  const next = cloneSettings(settings);
  let impact: SettingsImpact = "none";
  let refreshSurface = false;
  let persistence: SettingsControlMutation["persistence"] = "immediate";
  switch (key) {
    case "general.language":
      if (value !== "auto" && value !== "en" && value !== "zh") throw invalidControlValue(key);
      next.language = value;
      refreshSurface = true;
      break;
    case "general.showVirtualNumbers":
      next.showVirtualNumbers = controlBoolean(key, value);
      impact = "display";
      break;
    case "general.concealStoredNumbers":
      next.concealStoredNumbers = controlBoolean(key, value);
      impact = "display";
      break;
    case "captions.showCaptionNumbers":
      next.showCaptionNumbers = controlBoolean(key, value);
      impact = "display";
      break;
    case "captions.centerFigure":
    case "captions.centerTable":
    case "captions.centerEquation":
    case "captions.centerCode": {
      const property = {
        "captions.centerFigure": "centerFigureCaptions",
        "captions.centerTable": "centerTableCaptions",
        "captions.centerEquation": "centerEquationCaptions",
        "captions.centerCode": "centerCodeCaptions",
      }[key] as
        | "centerFigureCaptions"
        | "centerTableCaptions"
        | "centerEquationCaptions"
        | "centerCodeCaptions";
      next[property] = controlBoolean(key, value);
      impact = "display";
      break;
    }
    case "references.showCrossReferences":
      next.showCrossReferences = controlBoolean(key, value);
      impact = "display";
      break;
    case "notes.showNoteNumbers":
      next.showNoteNumbers = controlBoolean(key, value);
      impact = "display";
      break;
    case "notes.displayMode":
      if (value !== "formatted" && value !== "source") throw invalidControlValue(key);
      next.noteDisplayMode = value;
      impact = "display";
      break;
    case "general.missingLevelStrategy":
      if (value !== "fill-one" && value !== "current-only" && value !== "skip") {
        throw invalidControlValue(key);
      }
      next.missingLevelStrategy = value;
      impact = "display";
      break;
    case "cleanup.writeMarkers": next.writeMarkers = controlBoolean(key, value); break;
    case "cleanup.cleanupScope":
      if (value !== "plugin" && value !== "templates" && value !== "common") throw invalidControlValue(key);
      next.cleanupScope = value;
      impact = "display";
      break;
    case "cleanup.removeMultiplePrefixes": next.removeMultiplePrefixes = controlBoolean(key, value); break;
    case "cleanup.normalizeManualOnRenumber":
      next.normalizeManualOnRenumber = controlBoolean(key, value);
      break;
    case "views.enableLivePreview":
    case "views.enableReadingView":
    case "views.enableSourceMode":
    case "views.revealOnActiveLine": {
      const property = key.slice("views.".length) as
        | "enableLivePreview" | "enableReadingView" | "enableSourceMode" | "revealOnActiveLine";
      next[property] = controlBoolean(key, value);
      impact = "display";
      break;
    }
    case "views.virtualOpacity":
      next.virtualOpacity = boundedControlNumber(key, value, 0.15, 1);
      impact = "appearance";
      persistence = "scheduled";
      break;
    case "views.virtualGapEm":
      next.virtualGapEm = boundedControlNumber(key, value, 0, 2);
      impact = "appearance";
      persistence = "scheduled";
      break;
    case "views.excludedFolders":
      if (typeof value !== "string") throw invalidControlValue(key);
      next.excludedFolders = parseExcludedFolders(value);
      persistence = "scheduled";
      break;
    case "views.batchBackupLimitMb":
      next.batchBackupLimitMb = boundedControlNumber(key, value, 1, 100, true);
      persistence = "scheduled";
      break;
  }
  return { settings: next, impact, refreshSurface, persistence };
}

function invalidControlValue(key: string): Error {
  return new Error(`Invalid value for Structured Numbering setting: ${key}`);
}

function controlBoolean(key: string, value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidControlValue(key);
  return value;
}

function boundedControlNumber(
  key: string,
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
    || (integer && !Number.isInteger(value))
  ) {
    throw invalidControlValue(key);
  }
  return value;
}

function parseExcludedFolders(value: string): string[] {
  return value.split(",")
    .map((entry) => entry.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, ""))
    .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index);
}
