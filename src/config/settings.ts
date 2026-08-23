import {
  CONFIDENCES,
  type CleanupScope,
  type CleanupTemplateHistory,
  type CleanupTemplateSource,
  type CustomNumberingScheme,
  type HeadingExclusionRule,
  type MissingLevelStrategy,
  type NumberingOptions,
  type SchemeId,
} from "../core/types";
import { compileTemplate } from "../core/template-compiler";
import { inspectSchemeTemplates } from "../core/scheme-template-validation";
import { BUILT_IN_SCHEMES, isBuiltInSchemeId, resolveScheme } from "../core/schemes";
import type { CaptionKind } from "../core/document-semantics";

export interface StructuredNumberingSettings {
  language: "auto" | "en" | "zh";
  showVirtualNumbers: boolean;
  concealStoredNumbers: boolean;
  showCaptionNumbers: boolean;
  centerFigureCaptions: boolean;
  centerTableCaptions: boolean;
  centerEquationCaptions: boolean;
  centerCodeCaptions: boolean;
  showCrossReferences: boolean;
  showNoteNumbers: boolean;
  noteDisplayMode: "formatted" | "source";
  selectedSchemeId: string;
  customSchemes: CustomNumberingScheme[];
  hiddenBuiltInSchemeIds: string[];
  cleanupHistory: CleanupTemplateHistory[];
  missingLevelStrategy: MissingLevelStrategy;
  writeMarkers: boolean;
  cleanupScope: CleanupScope;
  removeMultiplePrefixes: boolean;
  normalizeManualOnRenumber: boolean;
  revealOnActiveLine: boolean;
  enableLivePreview: boolean;
  enableReadingView: boolean;
  enableSourceMode: boolean;
  virtualOpacity: number;
  virtualGapEm: number;
  excludedFolders: string[];
  batchBackupLimitMb: number;
}

export interface BatchFileSnapshot {
  path: string;
  before: string;
  afterHash: string;
}

export interface LastBatchSnapshot {
  createdAt: string;
  operation: "write" | "remove" | "renumber" | "strip-markers";
  status: "pending" | "applied";
  files: BatchFileSnapshot[];
}

export interface PersistedPluginData {
  schemaVersion: 1;
  settings: StructuredNumberingSettings;
}

export const PERSISTENCE_SCHEMA_VERSION = 1 as const;

export const DEFAULT_CUSTOM_TEMPLATES = [
  "{1.arabic}",
  "{1.arabic}.{2.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
];

export const DEFAULT_SETTINGS: StructuredNumberingSettings = {
  language: "auto",
  showVirtualNumbers: false,
  concealStoredNumbers: false,
  showCaptionNumbers: true,
  centerFigureCaptions: true,
  centerTableCaptions: false,
  centerEquationCaptions: true,
  centerCodeCaptions: false,
  showCrossReferences: true,
  showNoteNumbers: true,
  noteDisplayMode: "formatted",
  selectedSchemeId: "hierarchical-h2",
  customSchemes: [],
  hiddenBuiltInSchemeIds: [],
  cleanupHistory: [],
  missingLevelStrategy: "fill-one",
  writeMarkers: false,
  cleanupScope: "templates",
  removeMultiplePrefixes: true,
  normalizeManualOnRenumber: true,
  revealOnActiveLine: true,
  enableLivePreview: true,
  enableReadingView: true,
  enableSourceMode: false,
  virtualOpacity: 0.82,
  virtualGapEm: 0.32,
  excludedFolders: [],
  batchBackupLimitMb: 12,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function templates(value: unknown, fallback: readonly string[]): string[] {
  const source: readonly unknown[] = Array.isArray(value) ? value as unknown[] : fallback;
  return Array.from({ length: 6 }, (_unused, index) => {
    const template = source[index];
    return typeof template === "string" ? template.slice(0, 300) : fallback[index] ?? "";
  });
}

function validCustomId(value: unknown): value is string {
  return typeof value === "string"
    && /^custom-[a-z0-9][a-z0-9-]{0,55}$/u.test(value)
    && !isBuiltInSchemeId(value);
}

function sanitizeExclusions(value: unknown): HeadingExclusionRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: HeadingExclusionRule[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.title !== "string") continue;
    const title = item.title.normalize("NFC").trim().replace(/[ \t]+/gu, " ").slice(0, 200);
    if (title.length === 0 || seen.has(title)) continue;
    seen.add(title);
    output.push({
      title,
      scope: item.scope === "heading" ? "heading" : "subtree",
    });
  }
  return output;
}

function sanitizeCustomSchemes(value: unknown): CustomNumberingScheme[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: CustomNumberingScheme[] = [];
  for (const item of value) {
    if (!isRecord(item) || !validCustomId(item.id) || seen.has(item.id)) continue;
    const nextTemplates = templates(item.templates, DEFAULT_CUSTOM_TEMPLATES);
    if (nextTemplates.some((template) => compileTemplate(template).diagnostics.length > 0)) continue;
    if (inspectSchemeTemplates(nextTemplates).length > 0) continue;
    seen.add(item.id);
    output.push({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim().length > 0
        ? item.name.trim().slice(0, 80)
        : "Custom scheme",
      revision: Math.max(1, Math.trunc(boundedNumber(item.revision, 1, 1, Number.MAX_SAFE_INTEGER))),
      baseLevel: Math.trunc(boundedNumber(item.baseLevel, 1, 1, 6)),
      templates: nextTemplates,
      exclusions: sanitizeExclusions(item.exclusions),
    });
  }
  return output;
}

function sanitizeCleanupHistory(value: unknown): CleanupTemplateHistory[] {
  if (!Array.isArray(value)) return [];
  const output: CleanupTemplateHistory[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.schemeId !== "string") continue;
    const revision = Math.max(1, Math.trunc(boundedNumber(item.revision, 1, 1, Number.MAX_SAFE_INTEGER)));
    const key = `${item.schemeId}@${revision}`;
    if (seen.has(key)) continue;
    const nextTemplates = templates(item.templates, []);
    if (nextTemplates.every((template) => template.length === 0)) continue;
    seen.add(key);
    output.push({
      schemeId: item.schemeId.slice(0, 64),
      schemeName: typeof item.schemeName === "string" ? item.schemeName.slice(0, 80) : item.schemeId,
      revision,
      baseLevel: Math.trunc(boundedNumber(item.baseLevel, 1, 1, 6)),
      templates: nextTemplates,
    });
  }
  return output;
}

export function sanitizeSettings(value: unknown): StructuredNumberingSettings {
  const raw = isRecord(value) ? value : {};
  const customSchemes = sanitizeCustomSchemes(raw.customSchemes);
  const requestedScheme = typeof raw.selectedSchemeId === "string"
    ? raw.selectedSchemeId
    : DEFAULT_SETTINGS.selectedSchemeId;
  const selectedSchemeId = isBuiltInSchemeId(requestedScheme)
    || customSchemes.some((scheme) => scheme.id === requestedScheme)
    ? requestedScheme
    : DEFAULT_SETTINGS.selectedSchemeId;
  const hiddenBuiltInSchemeIds = Array.isArray(raw.hiddenBuiltInSchemeIds)
    ? raw.hiddenBuiltInSchemeIds
      .filter((id): id is string => typeof id === "string" && isBuiltInSchemeId(id))
      .filter((id, index, all) => all.indexOf(id) === index && id !== selectedSchemeId)
    : [];
  const excludedFolders = Array.isArray(raw.excludedFolders)
    ? raw.excludedFolders
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").trim())
      .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index)
    : [];

  return {
    language: oneOf(raw.language, ["auto", "en", "zh"] as const, DEFAULT_SETTINGS.language),
    showVirtualNumbers: booleanOr(raw.showVirtualNumbers, DEFAULT_SETTINGS.showVirtualNumbers),
    concealStoredNumbers: booleanOr(raw.concealStoredNumbers, DEFAULT_SETTINGS.concealStoredNumbers),
    showCaptionNumbers: booleanOr(raw.showCaptionNumbers, DEFAULT_SETTINGS.showCaptionNumbers),
    centerFigureCaptions: booleanOr(
      raw.centerFigureCaptions,
      DEFAULT_SETTINGS.centerFigureCaptions,
    ),
    centerTableCaptions: booleanOr(raw.centerTableCaptions, DEFAULT_SETTINGS.centerTableCaptions),
    centerEquationCaptions: booleanOr(
      raw.centerEquationCaptions,
      DEFAULT_SETTINGS.centerEquationCaptions,
    ),
    centerCodeCaptions: booleanOr(raw.centerCodeCaptions, DEFAULT_SETTINGS.centerCodeCaptions),
    showCrossReferences: booleanOr(raw.showCrossReferences, DEFAULT_SETTINGS.showCrossReferences),
    showNoteNumbers: booleanOr(raw.showNoteNumbers, DEFAULT_SETTINGS.showNoteNumbers),
    noteDisplayMode: oneOf(
      raw.noteDisplayMode,
      ["formatted", "source"] as const,
      DEFAULT_SETTINGS.noteDisplayMode,
    ),
    selectedSchemeId,
    customSchemes,
    hiddenBuiltInSchemeIds,
    cleanupHistory: sanitizeCleanupHistory(raw.cleanupHistory),
    missingLevelStrategy: oneOf(
      raw.missingLevelStrategy,
      ["fill-one", "current-only", "skip"] as const,
      DEFAULT_SETTINGS.missingLevelStrategy,
    ),
    writeMarkers: booleanOr(raw.writeMarkers, DEFAULT_SETTINGS.writeMarkers),
    cleanupScope: oneOf(
      raw.cleanupScope,
      ["plugin", "templates", "common"] as const,
      DEFAULT_SETTINGS.cleanupScope,
    ),
    removeMultiplePrefixes: booleanOr(raw.removeMultiplePrefixes, DEFAULT_SETTINGS.removeMultiplePrefixes),
    normalizeManualOnRenumber: booleanOr(
      raw.normalizeManualOnRenumber,
      DEFAULT_SETTINGS.normalizeManualOnRenumber,
    ),
    revealOnActiveLine: booleanOr(raw.revealOnActiveLine, DEFAULT_SETTINGS.revealOnActiveLine),
    enableLivePreview: booleanOr(raw.enableLivePreview, DEFAULT_SETTINGS.enableLivePreview),
    enableReadingView: booleanOr(raw.enableReadingView, DEFAULT_SETTINGS.enableReadingView),
    enableSourceMode: booleanOr(raw.enableSourceMode, DEFAULT_SETTINGS.enableSourceMode),
    virtualOpacity: boundedNumber(raw.virtualOpacity, DEFAULT_SETTINGS.virtualOpacity, 0.15, 1),
    virtualGapEm: boundedNumber(raw.virtualGapEm, DEFAULT_SETTINGS.virtualGapEm, 0, 2),
    excludedFolders,
    batchBackupLimitMb: boundedNumber(
      raw.batchBackupLimitMb,
      DEFAULT_SETTINGS.batchBackupLimitMb,
      1,
      100,
    ),
  };
}

function isBatchFile(value: unknown): value is BatchFileSnapshot {
  return isRecord(value)
    && typeof value.path === "string"
    && typeof value.before === "string"
    && typeof value.afterHash === "string";
}

export function sanitizeLastBatch(value: unknown): LastBatchSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.files) || !value.files.every(isBatchFile)) {
    return null;
  }
  if (
    typeof value.createdAt !== "string"
    || !["write", "remove", "renumber", "strip-markers"].includes(String(value.operation))
    || !["pending", "applied"].includes(String(value.status))
  ) {
    return null;
  }
  return {
    createdAt: value.createdAt,
    operation: value.operation as LastBatchSnapshot["operation"],
    status: value.status as LastBatchSnapshot["status"],
    files: value.files.map((file) => ({
      path: file.path,
      before: file.before,
      afterHash: file.afterHash,
    })),
  };
}

export function sanitizePluginData(value: unknown): PersistedPluginData {
  const validEnvelope = isRecord(value)
    && value.schemaVersion === PERSISTENCE_SCHEMA_VERSION
    && isRecord(value.settings);
  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    settings: validEnvelope ? sanitizeSettings(value.settings) : cloneSettings(DEFAULT_SETTINGS),
  };
}

export function cloneSettings(settings: StructuredNumberingSettings): StructuredNumberingSettings {
  return {
    ...settings,
    customSchemes: settings.customSchemes.map((scheme) => ({
      ...scheme,
      templates: [...scheme.templates],
      exclusions: scheme.exclusions.map((rule) => ({ ...rule })),
    })),
    hiddenBuiltInSchemeIds: [...settings.hiddenBuiltInSchemeIds],
    cleanupHistory: settings.cleanupHistory.map((entry) => ({
      ...entry,
      templates: [...entry.templates],
    })),
    excludedFolders: [...settings.excludedFolders],
  };
}

export function centeredCaptionKinds(
  settings: StructuredNumberingSettings,
): CaptionKind[] {
  const kinds: CaptionKind[] = [];
  if (settings.centerFigureCaptions) kinds.push("Figure");
  if (settings.centerTableCaptions) kinds.push("Table");
  if (settings.centerEquationCaptions) kinds.push("Equation");
  if (settings.centerCodeCaptions) kinds.push("Code");
  return kinds;
}

export function toNumberingOptions(
  settings: StructuredNumberingSettings,
  overrides: Readonly<{
    schemeId?: SchemeId;
    starts?: Readonly<Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>>;
  }> = {},
): NumberingOptions {
  const scheme = resolveScheme(overrides.schemeId ?? settings.selectedSchemeId, settings.customSchemes);
  return {
    scheme,
    missingLevelStrategy: settings.missingLevelStrategy,
    starts: overrides.starts ?? {},
  };
}

export function cleanupTemplateSources(settings: StructuredNumberingSettings): CleanupTemplateSource[] {
  const sources: CleanupTemplateSource[] = Object.values(BUILT_IN_SCHEMES).map((scheme) => ({
    schemeId: scheme.id,
    schemeName: scheme.id,
    revision: 1,
    templates: scheme.templates,
  }));
  for (const scheme of settings.customSchemes) {
    sources.push({
      schemeId: scheme.id,
      schemeName: scheme.name,
      revision: scheme.revision,
      templates: scheme.templates,
    });
  }
  sources.push(...settings.cleanupHistory);
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.schemeId}@${source.revision}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isKnownConfidence(value: unknown): boolean {
  return value === "plugin" || (typeof value === "string" && CONFIDENCES.includes(value as never));
}
