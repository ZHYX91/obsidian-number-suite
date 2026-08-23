import { setIcon } from "obsidian";

import type { Translate } from "../../config/i18n";

function renderExample(
  container: HTMLElement,
  title: string,
  source: string,
  result: string,
): void {
  const example = container.createDiv({
    cls: "structured-numbering-settings-guide-example structured-numbering-note-guide-example",
  });
  example.createEl("strong", { text: title });
  const pre = example.createEl("pre");
  pre.createEl("code", { text: source });
  example.createEl("p", { text: result });
}

export function renderNoteNumberingGuide(container: HTMLElement, t: Translate): void {
  const guide = container.createDiv({
    cls: "structured-numbering-settings-guide structured-numbering-note-guide",
  });
  guide.setAttribute("role", "note");
  guide.setAttribute("aria-labelledby", "structured-numbering-note-guide-title");

  const heading = guide.createDiv({ cls: "structured-numbering-settings-guide-heading" });
  const icon = heading.createSpan({
    cls: "structured-numbering-settings-guide-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(icon, "info");
  const title = heading.createEl("strong", { text: t("settings.notes.guide.title") });
  title.id = "structured-numbering-note-guide-title";

  const body = guide.createDiv({ cls: "structured-numbering-settings-guide-body" });
  body.createEl("p", { text: t("settings.notes.guide.intro") });
  renderExample(
    body,
    t("settings.notes.guide.footnote.title"),
    t("settings.notes.guide.footnote.source"),
    t("settings.notes.guide.footnote.result"),
  );
  renderExample(
    body,
    t("settings.notes.guide.endnote.title"),
    t("settings.notes.guide.endnote.source"),
    t("settings.notes.guide.endnote.result"),
  );
  body.createEl("p", { text: t("settings.notes.guide.editing") });
  body.createEl("p", { text: t("settings.notes.guide.safety") });
}
