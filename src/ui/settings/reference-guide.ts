import { setIcon } from "obsidian";

import type { Translate } from "../../config/i18n";

function renderExample(
  container: HTMLElement,
  title: string,
  source: string,
  result: string,
): void {
  const example = container.createDiv({ cls: "structured-numbering-reference-guide-example" });
  example.createEl("strong", { text: title });
  const pre = example.createEl("pre");
  pre.createEl("code", { text: source });
  example.createEl("p", { text: result });
}

export function renderSameFileReferenceGuide(container: HTMLElement, t: Translate): void {
  const guide = container.createDiv({
    cls: "structured-numbering-settings-guide structured-numbering-reference-guide",
  });
  guide.setAttribute("role", "note");
  guide.setAttribute("aria-labelledby", "structured-numbering-reference-guide-title");

  const heading = guide.createDiv({ cls: "structured-numbering-settings-guide-heading" });
  const icon = heading.createSpan({
    cls: "structured-numbering-settings-guide-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(icon, "info");
  const title = heading.createEl("strong", { text: t("settings.references.guide.title") });
  title.id = "structured-numbering-reference-guide-title";

  const body = guide.createDiv({ cls: "structured-numbering-settings-guide-body" });
  body.createEl("p", { text: t("settings.references.guide.intro") });
  renderExample(
    body,
    t("settings.references.guide.heading.title"),
    t("settings.references.guide.heading.source"),
    t("settings.references.guide.heading.result"),
  );
  renderExample(
    body,
    t("settings.references.guide.caption.title"),
    t("settings.references.guide.caption.source"),
    t("settings.references.guide.caption.result"),
  );

  body.createEl("strong", {
    cls: "structured-numbering-reference-guide-section-title",
    text: t("settings.references.guide.requirements.title"),
  });
  const requirements = body.createEl("ul", { cls: "structured-numbering-reference-guide-list" });
  for (const key of [
    "settings.references.guide.requirements.heading",
    "settings.references.guide.requirements.caption",
    "settings.references.guide.requirements.sameFile",
  ] as const) {
    requirements.createEl("li", { text: t(key) });
  }

  body.createEl("strong", {
    cls: "structured-numbering-reference-guide-section-title",
    text: t("settings.references.guide.unchanged.title"),
  });
  body.createEl("p", { text: t("settings.references.guide.unchanged.body") });
}
