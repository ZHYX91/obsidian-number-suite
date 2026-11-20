import { NUMBER_SUITE_PROPERTY, type NotePropertyIssue } from "../config/frontmatter";
import type { Translate } from "../config/i18n";

export function notePropertyIssueText(issue: NotePropertyIssue, t: Translate): string {
  const details = issue.details;
  switch (details.kind) {
    case "canonical-type":
    case "malformed-item":
      return t(`panel.properties.issue.${details.kind}`, { property: NUMBER_SUITE_PROPERTY });
    case "invalid-item":
      return t("panel.properties.issue.invalid-item", { property: NUMBER_SUITE_PROPERTY, item: details.item });
    case "unknown-directive":
    case "duplicate-directive":
      return t(`panel.properties.issue.${details.kind}`, { property: NUMBER_SUITE_PROPERTY, key: details.key });
    case "legacy-type":
      return t("panel.properties.issue.legacy-type", { key: details.key });
    case "conflict":
      return t("panel.properties.issue.conflict", { field: issue.field,
        property: NUMBER_SUITE_PROPERTY, legacyKey: details.legacyKey });
    case "unavailable-scheme":
      return t("panel.properties.issue.unavailable-scheme", { scheme: details.schemeId });
    case "source-quoted-key":
    case "source-duplicate-key":
      return t(`panel.properties.issue.${details.kind}`, { key: details.key });
    case "source-invalid-yaml":
      return t("panel.properties.issue.source-invalid-yaml");
  }
}
