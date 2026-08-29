import { setIcon } from "obsidian";

import type { Translate } from "../../config/i18n";

function renderExample(
  container: HTMLElement,
  title: string,
  source: string,
  result: string,
): void {
  const example = container.createDiv({ cls: "number-suite-reference-guide-example" });
  example.createEl("strong", { text: title });
  const pre = example.createEl("pre");
  pre.createEl("code", { text: source });
  example.createEl("p", { text: result });
}

function renderReferencePreview(container: HTMLElement, text: string): void {
  const preview = container.createDiv({ cls: "number-suite-settings-rendered-example" });
  const pill = preview.createSpan({ cls: "number-suite-reference-pill", text });
  pill.removeAttribute("tabindex");
  pill.removeAttribute("role");
}

export function renderSameFileReferenceGuide(container: HTMLElement, t: Translate): void {
  const guide = container.createDiv({
    cls: "number-suite-settings-guide number-suite-reference-guide",
  });
  guide.setAttribute("role", "note");
  guide.setAttribute("aria-labelledby", "number-suite-reference-guide-title");

  const heading = guide.createDiv({ cls: "number-suite-settings-guide-heading" });
  const icon = heading.createSpan({
    cls: "number-suite-settings-guide-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(icon, "info");
  const title = heading.createEl("strong", { text: t("settings.references.guide.title") });
  title.id = "number-suite-reference-guide-title";

  const body = guide.createDiv({ cls: "number-suite-settings-guide-body" });
  body.createEl("p", { text: t("settings.references.guide.intro") });
  renderExample(
    body,
    t("settings.references.guide.heading.title"),
    t("settings.references.guide.heading.source"),
    t("settings.references.guide.heading.result"),
  );
  renderReferencePreview(body, t("settings.references.guide.heading.preview"));
  renderExample(
    body,
    t("settings.references.guide.caption.title"),
    t("settings.references.guide.caption.source"),
    t("settings.references.guide.caption.result"),
  );
  renderReferencePreview(body, t("settings.references.guide.caption.preview"));

  body.createEl("strong", {
    cls: "number-suite-reference-guide-section-title",
    text: t("settings.references.guide.methods.title"),
  });
  const requirements = body.createEl("ul", { cls: "number-suite-reference-guide-list" });
  for (const key of [
    "settings.references.guide.methods.manual",
    "settings.references.guide.methods.copy",
    "settings.references.guide.methods.captionId",
  ] as const) {
    requirements.createEl("li", { text: t(key) });
  }

  body.createEl("strong", {
    cls: "number-suite-reference-guide-section-title",
    text: t("settings.references.guide.requirements.title"),
  });
  const resolution = body.createEl("ul", { cls: "number-suite-reference-guide-list" });
  for (const key of [
    "settings.references.guide.requirements.heading",
    "settings.references.guide.requirements.caption",
    "settings.references.guide.requirements.sameFile",
  ] as const) resolution.createEl("li", { text: t(key) });

  body.createEl("strong", {
    cls: "number-suite-reference-guide-section-title",
    text: t("settings.references.guide.unchanged.title"),
  });
  body.createEl("p", { text: t("settings.references.guide.unchanged.body") });
}
