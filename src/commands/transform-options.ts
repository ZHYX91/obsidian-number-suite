import { resolveNoteSettings } from "../config/frontmatter";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { planHeadingTransform } from "../core/transform";
import type { CleanupScope, TransformOperation, TransformPlan } from "../core/types";

export interface SourcePlanResult {
  status: "ready" | "disabled" | "invalid-frontmatter" | "invalid-properties";
  plan: TransformPlan | null;
}

export function createSourcePlan(
  source: string,
  operation: TransformOperation,
  settings: NumberSuiteSettings,
  cleanupScope: CleanupScope = settings.cleanupScope,
): SourcePlanResult {
  const overrides = parseNoteOverridesFromSource(source);
  if (overrides == null) {
    return { status: "invalid-frontmatter", plan: null };
  }
  const effective = resolveNoteSettings(settings, overrides);
  if (!effective.valid) {
    return { status: "invalid-properties", plan: null };
  }
  if (effective.disabled) {
    return { status: "disabled", plan: null };
  }
  return {
    status: "ready",
    plan: planHeadingTransform(source, operation, {
      numbering: toNumberingOptions(settings, {
        schemeId: effective.schemeId,
        starts: effective.starts,
        skipFirst: effective.skipFirst,
      }),
      writeMarkers: settings.writeMarkers,
      cleanupScope,
      templateSources: cleanupTemplateSources(settings),
      removeMultiplePrefixes: settings.removeMultiplePrefixes,
      normalizeManualOnRenumber: settings.normalizeManualOnRenumber,
    }),
  };
}
