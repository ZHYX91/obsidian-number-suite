import { setIcon } from "obsidian";

import type { Translate } from "../../config/i18n";

export type NoteOverridesGuideSurface = "settings" | "panel";

export function renderNoteOverridesGuide(
  container: HTMLElement,
  t: Translate,
  surface: NoteOverridesGuideSurface,
): void {
  const guide = container.createDiv({
    cls: `number-suite-settings-guide number-suite-note-overrides-guide is-${surface}`,
  });
  guide.setAttribute("role", "note");

  const titleId = `number-suite-note-overrides-guide-${surface}-title`;
  guide.setAttribute("aria-labelledby", titleId);

  const heading = guide.createDiv({ cls: "number-suite-settings-guide-heading" });
  const icon = heading.createSpan({
    cls: "number-suite-settings-guide-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(icon, "info");
  const title = heading.createEl("strong", {
    text: t(`${surface === "settings" ? "settings.noteOverrides" : "panel.overrides"}.guide.title`),
  });
  title.id = titleId;

  const body = guide.createDiv({ cls: "number-suite-settings-guide-body" });
  if (surface === "settings") {
    body.createEl("p", { text: t("settings.noteOverrides.guide.intro") });
    body.createEl("p", { text: t("settings.noteOverrides.guide.action") });
    return;
  }
  body.createEl("p", { text: t("panel.overrides.guide.body") });
}
