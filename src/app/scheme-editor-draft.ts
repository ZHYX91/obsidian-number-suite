import type { Translate } from "../config/i18n";
import { SCHEME_EXCLUSION_LIMIT, SCHEME_NAME_LIMIT, SCHEME_TEMPLATE_LIMIT } from "../config/settings";
import { normalizeExclusionTitle } from "../core/heading-exclusions";
import { inspectSchemeTemplates, type SchemeTemplateIssue } from "../core/scheme-template-validation";
import type { CustomNumberingScheme, HeadingExclusionRule } from "../core/types";

export type EditableScheme = Omit<CustomNumberingScheme, "templates" | "exclusions"> & {
  templates: string[];
  exclusions: HeadingExclusionRule[];
};

export function editScheme(scheme: CustomNumberingScheme): EditableScheme {
  return { ...scheme, templates: [...scheme.templates], exclusions: scheme.exclusions.map(rule => ({ ...rule })) };
}

export function sameSchemeFields(left: CustomNumberingScheme, right: CustomNumberingScheme): boolean {
  return left.name === right.name && left.baseLevel === right.baseLevel
    && left.templates.length === right.templates.length
    && left.templates.every((template, i) => template === right.templates[i])
    && left.exclusions.length === right.exclusions.length
    && left.exclusions.every((rule, i) => rule.title === right.exclusions[i]?.title && rule.scope === right.exclusions[i]?.scope);
}

export function normalizedScheme(draft: EditableScheme): EditableScheme {
  return {
    ...draft,
    name: draft.name.trim(),
    templates: draft.templates.map(template => template.trim().length === 0 ? "" : template),
    exclusions: draft.exclusions.map(rule => ({ ...rule, title: normalizeExclusionTitle(rule.title) })),
  };
}

export function describeSchemeTemplateIssue(issue: SchemeTemplateIssue, t: Translate): string {
  const level = `H${issue.headingLevel}`;
  if (issue.code === "missing-current-level") {
    return t("settings.scheme.issue.missingCurrentLevel", {
      level,
      example: `{${issue.headingLevel}.arabic}`,
    });
  }
  if (issue.code === "descendant-level-reference") {
    return t("settings.scheme.issue.descendantLevel", {
      level,
      referenced: `H${issue.referencedLevel}`,
    });
  }
  return t("settings.scheme.issue.invalidPlaceholder", { level });
}

export function schemeDraftError(draft: EditableScheme, saved: CustomNumberingScheme, t: Translate): string {
  if (draft.revision !== saved.revision) return t("settings.scheme.issue.revisionChanged");
  if (draft.name.trim().length === 0) return t("settings.scheme.issue.nameRequired");
  const lengthError = (field: string, max: number): string =>
    t("settings.scheme.issue.tooLong", { field, max: String(max) });
  if (draft.name.length > SCHEME_NAME_LIMIT) return lengthError(t("settings.scheme.name"), SCHEME_NAME_LIMIT);
  const index = draft.templates.findIndex(template => template.length > SCHEME_TEMPLATE_LIMIT);
  if (index >= 0) return lengthError(`H${index + 1}`, SCHEME_TEMPLATE_LIMIT);
  const templateIssue = inspectSchemeTemplates(draft.templates)[0];
  if (templateIssue != null) return describeSchemeTemplateIssue(templateIssue, t);
  if (draft.exclusions.some(rule => rule.title.length > SCHEME_EXCLUSION_LIMIT)) {
    return lengthError(t("settings.scheme.exclusions"), SCHEME_EXCLUSION_LIMIT);
  }
  const titles = draft.exclusions.map(rule => normalizeExclusionTitle(rule.title));
  return titles.includes("") || new Set(titles).size !== titles.length ? t("settings.scheme.exclusions.invalid") : "";
}
