import { App, Notice, Setting, type TFile } from "obsidian";

import {
  applyNoteOverrideChange,
  readNoteControlSnapshot,
  type NoteControlSnapshot,
  type NoteOverrideChange,
  type TriState,
} from "../application/note-overrides";
import type { Translate } from "../config/i18n";
import { parseFrontmatterRecordFromSource } from "../config/frontmatter-source";
import { noteSchemeOptions, schemeDisplayName } from "../config/scheme-labels";
import type { NumberSuiteSettings } from "../config/settings";
import type { TransformOperation } from "../core/types";
import { renderNoteOverridesGuide } from "./settings/note-overrides-guide";

export interface NoteControlActions {
  readonly refreshDisplay: () => void;
  readonly runCurrent: (operation: TransformOperation) => void;
  readonly openBatch: () => void;
  readonly openGlobalSettings: () => void;
}

function stateLabel(value: TriState, t: Translate): string {
  return t(`panel.state.${value}`);
}

function booleanLabel(value: boolean, t: Translate): string {
  return t(value ? "panel.value.on" : "panel.value.off");
}

export class NoteControlPane {
  private busy = false;
  private frontmatter: Record<string, unknown> | null = null;
  private file: TFile | null = null;
  private request = 0;

  constructor(
    private readonly app: App,
    private readonly contentEl: HTMLElement,
    private readonly getSettings: () => NumberSuiteSettings,
    private readonly getTranslate: () => Translate,
    private readonly actions: NoteControlActions,
  ) {}

  private get t(): Translate {
    return this.getTranslate();
  }

  setFile(file: TFile | null, reload = true): void {
    if (this.file?.path === file?.path) {
      if (reload) void this.reload();
      return;
    }
    this.file = file;
    this.frontmatter = null;
    this.request += 1;
    if (reload) void this.reload();
    else this.renderUnavailable();
  }

  refresh(): void {
    void this.reload();
  }

  private async reload(): Promise<void> {
    const file = this.file;
    const request = this.request + 1;
    this.request = request;
    if (file == null) {
      this.renderUnavailable();
      return;
    }
    this.busy = true;
    this.renderLoading();
    try {
      const source = await this.app.vault.cachedRead(file);
      if (request !== this.request || file.path !== this.file?.path) return;
      this.frontmatter = parseFrontmatterRecordFromSource(source);
    } catch (error: unknown) {
      console.error("Number Suite: failed to read current note Properties", error);
      if (request !== this.request || file.path !== this.file?.path) return;
      this.frontmatter = null;
    }
    this.busy = false;
    this.contentEl.removeClass("is-loading");
    this.render();
  }

  private renderLoading(): void {
    this.contentEl.empty();
    const status = this.contentEl.createDiv({
      cls: "number-suite-note-control-loading",
    });
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.createSpan({
      cls: "number-suite-note-control-loading-indicator",
      attr: { "aria-hidden": "true" },
    });
    status.createEl("p", { text: this.t("panel.loading") });
  }

  private renderUnavailable(): void {
    this.busy = false;
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      cls: "number-suite-sidebar-empty",
      text: this.t("notice.noActiveNote"),
    });
  }

  private render(): void {
    const file = this.file;
    if (file == null) {
      this.renderUnavailable();
      return;
    }
    this.contentEl.empty();
    const header = this.contentEl.createDiv({ cls: "number-suite-note-control-header" });
    header.createEl("h3", { text: file.basename });
    header.createEl("p", { text: file.path });

    if (this.frontmatter == null) {
      const error = this.contentEl.createDiv({ cls: "number-suite-note-control-error" });
      error.setAttribute("role", "alert");
      error.setText(this.t("notice.invalidFrontmatter"));
      new Setting(this.contentEl).addButton((button) => button
        .setButtonText(this.t("panel.retry"))
        .onClick(() => void this.reload()));
      return;
    }

    const settings = this.getSettings();
    const snapshot = readNoteControlSnapshot(this.frontmatter, settings);
    this.renderSummary(snapshot, settings);
    this.renderOverrides(snapshot, settings);
    this.renderActions();
  }

  private renderSummary(snapshot: NoteControlSnapshot, settings: NumberSuiteSettings): void {
    const section = this.contentEl.createDiv({ cls: "number-suite-note-control-section" });
    section.createEl("h4", { text: this.t("panel.summary") });
    const grid = section.createDiv({ cls: "number-suite-note-control-summary" });
    grid.setAttribute("role", "table");
    const headingRow = grid.createDiv({ cls: "number-suite-note-control-summary-row is-heading" });
    headingRow.setAttribute("role", "row");
    for (const heading of [
      this.t("panel.summary.setting"),
      this.t("panel.summary.global"),
      this.t("panel.summary.override"),
      this.t("panel.summary.effective"),
    ]) {
      const cell = headingRow.createDiv({ cls: "number-suite-note-control-summary-heading" });
      cell.setAttribute("role", "columnheader");
      cell.setText(heading);
    }
    const ignored = this.t("panel.value.ignored");
    this.addSummaryRow(grid, this.t("settings.showVirtual"), [
      booleanLabel(settings.showVirtualNumbers, this.t),
      stateLabel(snapshot.showVirtual, this.t),
      snapshot.effectiveIgnore ? ignored : booleanLabel(snapshot.effectiveShowVirtual, this.t),
    ]);
    this.addSummaryRow(grid, this.t("settings.concealStored"), [
      booleanLabel(settings.concealStoredNumbers, this.t),
      stateLabel(snapshot.concealStored, this.t),
      snapshot.effectiveIgnore ? ignored : booleanLabel(snapshot.effectiveConcealStored, this.t),
    ]);
    this.addSummaryRow(grid, this.t("settings.scheme"), [
      schemeDisplayName(settings.selectedSchemeId, settings, this.t),
      snapshot.schemeId == null
        ? this.t("panel.state.inherit")
        : schemeDisplayName(snapshot.schemeId, settings, this.t),
      snapshot.effectiveIgnore
        ? ignored
        : schemeDisplayName(snapshot.effectiveSchemeId, settings, this.t),
    ]);
    this.addSummaryRow(grid, this.t("panel.ignore"), [
      this.t("panel.value.off"),
      snapshot.ignore ? this.t("panel.state.on") : this.t("panel.state.inherit"),
      booleanLabel(snapshot.effectiveIgnore, this.t),
    ]);
  }

  private addSummaryRow(container: HTMLElement, name: string, values: readonly string[]): void {
    const row = container.createDiv({ cls: "number-suite-note-control-summary-row" });
    row.setAttribute("role", "row");
    const nameCell = row.createDiv({ cls: "number-suite-note-control-summary-name" });
    nameCell.setAttribute("role", "rowheader");
    nameCell.setText(name);
    const labels = [
      this.t("panel.summary.global"),
      this.t("panel.summary.override"),
      this.t("panel.summary.effective"),
    ];
    values.forEach((value, index) => {
      const cell = row.createDiv({ cls: "number-suite-note-control-summary-value" });
      cell.setAttribute("role", "cell");
      cell.dataset.label = labels[index] ?? "";
      cell.setText(value);
    });
  }

  private renderOverrides(snapshot: NoteControlSnapshot, settings: NumberSuiteSettings): void {
    const section = this.contentEl.createDiv({ cls: "number-suite-note-control-section" });
    section.createEl("h4", { text: this.t("panel.overrides") });
    renderNoteOverridesGuide(section, this.t, "panel");
    this.addTriStateSetting(
      section,
      this.t("settings.showVirtual"),
      this.t("panel.show.desc"),
      snapshot.showVirtual,
      (value) => ({ kind: "show-virtual", value }),
    );
    this.addTriStateSetting(
      section,
      this.t("settings.concealStored"),
      this.t("panel.conceal.desc"),
      snapshot.concealStored,
      (value) => ({ kind: "conceal-stored", value }),
    );
    new Setting(section)
      .setName(this.t("settings.scheme"))
      .setDesc(this.t("panel.scheme.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("", this.t("panel.state.inherit"));
        for (const [id, label] of noteSchemeOptions(settings, snapshot.schemeId, this.t)) {
          dropdown.addOption(id, label);
        }
        return dropdown.setValue(snapshot.schemeId ?? "").onChange((value) => {
          void this.applyChange({ kind: "scheme", value: value.length === 0 ? null : value });
        });
      });
    new Setting(section)
      .setName(this.t("panel.ignore"))
      .setDesc(this.t("panel.ignore.desc"))
      .addToggle((toggle) => toggle.setValue(snapshot.ignore).onChange((value) => {
        void this.applyChange({ kind: "ignore", value });
      }));
    new Setting(section)
      .setName(this.t("panel.reset"))
      .setDesc(this.t("panel.reset.desc"))
      .addButton((button) => button
        .setButtonText(this.t("panel.reset.button"))
        .setDisabled(!snapshot.hasAnyOverride)
        .onClick(() => void this.applyChange({ kind: "reset" })));
  }

  private addTriStateSetting(
    container: HTMLElement,
    name: string,
    description: string,
    value: TriState,
    change: (value: TriState) => NoteOverrideChange,
  ): void {
    new Setting(container).setName(name).setDesc(description).addDropdown((dropdown) => dropdown
      .addOption("inherit", this.t("panel.state.inherit"))
      .addOption("on", this.t("panel.state.on"))
      .addOption("off", this.t("panel.state.off"))
      .setValue(value)
      .onChange((next) => void this.applyChange(change(next as TriState))));
  }

  private renderActions(): void {
    const section = this.contentEl.createDiv({ cls: "number-suite-note-control-section" });
    section.createEl("h4", { text: this.t("panel.actions") });
    const actions = section.createDiv({ cls: "number-suite-note-control-actions" });
    for (const [operation, key] of [
      ["write", "command.write.current"],
      ["remove", "command.remove.current"],
      ["renumber", "command.renumber.current"],
      ["strip-markers", "command.strip.current"],
    ] as const) {
      const button = actions.createEl("button", { text: this.t(key) });
      button.addEventListener("click", () => {
        this.actions.runCurrent(operation);
      });
    }
    const navigation = section.createDiv({ cls: "number-suite-note-control-navigation" });
    const batch = navigation.createEl("button", { text: this.t("command.batch.folder") });
    batch.addEventListener("click", () => {
      this.actions.openBatch();
    });
    const settings = navigation.createEl("button", { text: this.t("panel.openSettings") });
    settings.addClass("mod-cta");
    settings.addEventListener("click", () => {
      this.actions.openGlobalSettings();
    });
  }

  private async applyChange(change: NoteOverrideChange): Promise<void> {
    const file = this.file;
    if (this.busy || this.frontmatter == null || file == null) return;
    const preview = { ...this.frontmatter };
    if (!applyNoteOverrideChange(preview, change)) return;
    this.busy = true;
    this.contentEl.addClass("is-loading");
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        applyNoteOverrideChange(frontmatter as Record<string, unknown>, change);
      });
      this.actions.refreshDisplay();
      await this.reload();
    } catch (error: unknown) {
      console.error("Number Suite: failed to update current note Properties", error);
      new Notice(this.t("panel.saveFailed"));
      this.busy = false;
      this.contentEl.removeClass("is-loading");
    }
  }
}
