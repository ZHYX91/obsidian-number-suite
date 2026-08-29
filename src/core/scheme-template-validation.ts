import { compileTemplate } from "./template-compiler";
import { HEADING_LEVEL_COUNT, type HeadingLevel } from "./types";

export type SchemeTemplateIssueCode =
  | "invalid-placeholder"
  | "missing-current-level"
  | "descendant-level-reference";

export interface SchemeTemplateIssue {
  readonly headingLevel: HeadingLevel;
  readonly code: SchemeTemplateIssueCode;
  readonly referencedLevel?: HeadingLevel;
}

export function inspectSchemeTemplates(templates: readonly string[]): SchemeTemplateIssue[] {
  const issues: SchemeTemplateIssue[] = [];
  for (let index = 0; index < HEADING_LEVEL_COUNT; index += 1) {
    const headingLevel = (index + 1) as HeadingLevel;
    const source = templates[index] ?? "";
    if (source.trim().length === 0) continue;
    const compiled = compileTemplate(source);
    if (compiled.diagnostics.length > 0) {
      issues.push({ headingLevel, code: "invalid-placeholder" });
      continue;
    }
    const referenced = compiled.nodes
      .filter((node) => node.kind === "counter")
      .map((node) => node.level);
    if (!referenced.includes(headingLevel)) {
      issues.push({ headingLevel, code: "missing-current-level" });
    }
    for (const referencedLevel of new Set(referenced.filter((level) => level > headingLevel))) {
      issues.push({
        headingLevel,
        code: "descendant-level-reference",
        referencedLevel,
      });
    }
  }
  return issues;
}
