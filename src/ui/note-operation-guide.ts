import type { Translate } from "../config/i18n";

/** The same source/display/write distinction used in the README task table. */
export function renderNoteOperationGuide(container: HTMLElement, t: Translate): void {
  const guide = container.createEl("details", { cls: "number-suite-note-operation-guide" });
  guide.createEl("summary", { text: t("panel.modes.title") });
  guide.createEl("p", { text: t("panel.modes.properties") });
  const table = guide.createEl("table");
  const headings = table.createEl("thead").createEl("tr");
  for (const key of ["source", "goal", "action", "markdown"] as const) {
    headings.createEl("th", { text: t(`panel.modes.${key}`), attr: { scope: "col" } });
  }
  const body = table.createEl("tbody");
  const rows = [
    ["## …", "1.1 …", t("settings.showVirtual"), false],
    ["## 1.1 …", "…", t("settings.concealStored"), false],
    ["## 1.1 …", "2.1 …", `${t("settings.showVirtual")} + ${t("settings.concealStored")}`, false],
    ["## …", "## 1.1 …", t("command.write.current"), true],
    ["## 1.1 …", "## …", t("command.remove.current"), true],
  ] as const;
  for (const [source, goal, action, writes] of rows) {
    const row = body.createEl("tr");
    row.createEl("td").createEl("code", { text: source, attr: { dir: "auto" } });
    row.createEl("td").createEl("code", { text: goal, attr: { dir: "auto" } });
    row.createEl("td", { text: action });
    row.createEl("td", { text: t(writes ? "panel.modes.rewritten" : "panel.modes.unchanged") });
  }
}
