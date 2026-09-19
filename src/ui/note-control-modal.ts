import {
  NoteSaveConflictError,
  NoteSaveCoordinator,
  type NoteSaveState,
} from "../application/note-save-coordinator";
import { App, Notice, Setting, type TFile } from "obsidian";

import {
  headingLevels,
  NOTE_OVERRIDE_KEYS,
  NoteOverrideFieldConflictError,
  readNoteControlSnapshot,
  rebaseNoteOverrideDraft,
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

const NOTE_SESSIONS = new WeakMap<App, WeakMap<TFile, NoteSaveCoordinator>>();

function sessionsFor(app: App): WeakMap<TFile, NoteSaveCoordinator> {
  let sessions = NOTE_SESSIONS.get(app);
  if (sessions == null) {
    sessions = new WeakMap<TFile, NoteSaveCoordinator>();
    NOTE_SESSIONS.set(app, sessions);
  }
  return sessions;
}

export function clearNoteControlSessions(app: App): void {
  NOTE_SESSIONS.delete(app);
}

export class NoteControlPane {
  private busy = false;
  private coordinator: NoteSaveCoordinator | null = null;
  private coordinatorUnsubscribe: (() => void) | null = null;
  private readonly coordinators: WeakMap<TFile, NoteSaveCoordinator>;
  private fieldConflict: NoteOverrideFieldConflictError | null = null;
  private readonly numberDrafts = new Map<HTMLInputElement, {
    change: Extract<NoteOverrideChange, { kind: "first-number" | "skip-first" }>;
    valid: boolean;
    coordinator: NoteSaveCoordinator | null;
  }>();
  private summaryHost: HTMLElement | null = null;
  private saveStatus: HTMLElement | null = null;
  private saveState: NoteSaveState = "saved";
  private frontmatter: Record<string, unknown> | null = null;
  private file: TFile | null = null;
  private request = 0;

  constructor(
    private readonly app: App,
    private readonly contentEl: HTMLElement,
    private readonly getSettings: () => NumberSuiteSettings,
    private readonly getTranslate: () => Translate,
    private readonly actions: NoteControlActions,
  ) {
    this.coordinators = sessionsFor(app);
  }

  private get t(): Translate {
    return this.getTranslate();
  }

  setFile(file: TFile | null, reload = true): void {
    if (this.file === file) {
      if (reload) void this.reload();
      return;
    }
    const previousFile = this.file;
    const previousCoordinator = this.coordinator;
    this.flushDraft();
    if (
      previousFile != null
      && previousCoordinator != null
      && previousCoordinator.state === "saved"
      && !previousCoordinator.pending
    ) {
      this.coordinators.delete(previousFile);
    }
    this.detachCoordinator();
    this.numberDrafts.clear();
    this.fieldConflict = null;
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
    if (
      this.coordinator != null
      && (this.coordinator.pending || this.numberDrafts.size > 0 || this.contentEl.contains(this.contentEl.ownerDocument.activeElement))
    ) return;
    const file = this.file;
    const request = this.request + 1;
    this.request = request;
    if (file == null) {
      this.renderUnavailable();
      return;
    }

    const retained = this.coordinators.get(file);
    if (retained != null && (retained.pending || retained.state !== "saved")) {
      this.attachCoordinator(file, retained);
      this.busy = false;
      this.render();
      return;
    }
    if (retained != null) this.coordinators.delete(file);

    this.busy = true;
    this.renderLoading();
    try {
      const source = await this.app.vault.cachedRead(file);
      if (request !== this.request || file.path !== this.file?.path) return;
      this.frontmatter = parseFrontmatterRecordFromSource(source);
      this.createCoordinator(file);
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
    this.numberDrafts.clear();
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
    if (!snapshot.valid) {
      const error = this.contentEl.createDiv({ cls: "number-suite-note-control-error" });
      error.setAttribute("role", "alert");
      error.createEl("strong", { text: this.t("panel.properties.invalid") });
      const list = error.createEl("ul");
      for (const entry of snapshot.issues) list.createEl("li", { text: entry.message });
    } else if (snapshot.hasLegacy) {
      this.contentEl.createEl("p", {
        cls: "number-suite-note-control-migration",
        text: this.t("panel.properties.legacy"),
      });
    }
    this.saveStatus = this.contentEl.createDiv({ cls: "number-suite-note-save-status" });
    this.saveStatus.setAttribute("role", "status");
    this.saveStatus.setAttribute("aria-live", "polite");
    this.renderSaveStatus();
    this.summaryHost = this.contentEl.createDiv();
    this.renderSummary(snapshot, settings, this.summaryHost);
    this.renderOverrides(snapshot, settings);
    this.renderActions();
  }

  private renderSummary(snapshot: NoteControlSnapshot, settings: NumberSuiteSettings, host: HTMLElement): void {
    const section = host.createDiv({ cls: "number-suite-note-control-section" });
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

    const advanced = section.createEl("details", { cls: "number-suite-note-control-levels" });
    advanced.open = headingLevels().some((level) => (
      snapshot.firstNumbers[level] != null || snapshot.skipFirst[level] != null
    ));
    advanced.createEl("summary", { text: this.t("panel.numberingByLevel") });
    advanced.createEl("p", { text: this.t("panel.numberingByLevel.desc") });
    for (const level of headingLevels()) {
      const row = new Setting(advanced).setName(`H${level}`).setDesc(this.t("panel.numberingByLevel.columns"));
      row.addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.step = "1";
        text.setPlaceholder(this.t("panel.state.inherit"));
        text.setValue(snapshot.firstNumbers[level]?.toString() ?? "");
        text.inputEl.setAttribute("aria-label", this.t("panel.firstNumber.aria", { level }));
        text.inputEl.addEventListener("blur", () => this.finishLevelNumber("first-number", text.inputEl));
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") this.finishLevelNumber("first-number", text.inputEl);
        });
        text.onChange((raw) => this.applyLevelNumber("first-number", level, raw, text.inputEl));
      });
      row.addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.step = "1";
        text.setPlaceholder("0");
        text.setValue(snapshot.skipFirst[level]?.toString() ?? "");
        text.inputEl.setAttribute("aria-label", this.t("panel.skipFirst.aria", { level }));
        text.inputEl.addEventListener("blur", () => this.finishLevelNumber("skip-first", text.inputEl));
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") this.finishLevelNumber("skip-first", text.inputEl);
        });
        text.onChange((raw) => this.applyLevelNumber("skip-first", level, raw, text.inputEl));
      });
    }
    new Setting(section)
      .setName(this.t("panel.reset"))
      .setDesc(this.t("panel.reset.desc"))
      .addButton((button) => button
        .setButtonText(this.t("panel.reset.button"))
        .setDisabled(!snapshot.hasAnyOverride)
        .onClick(() => void this.applyChange({ kind: "reset" })));
    if (snapshot.hasLegacy) {
      new Setting(section)
        .setName(this.t("panel.migrate"))
        .setDesc(this.t("panel.migrate.desc"))
        .addButton((button) => button
          .setButtonText(this.t("panel.migrate.button"))
          .onClick(() => void this.applyChange({ kind: "migrate" })));
    }
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

  private applyLevelNumber(
    kind: "first-number" | "skip-first",
    level: ReturnType<typeof headingLevels>[number],
    raw: string,
    input: HTMLInputElement,
  ): void {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    const valid = !input.validity.badInput && (value == null || (Number.isSafeInteger(value) && value >= (kind === "first-number" ? 1 : 0)));
    const message = this.t(kind === "first-number" ? "panel.firstNumber.invalid" : "panel.skipFirst.invalid");
    input.setAttribute("aria-invalid", String(!valid));
    input.title = valid ? "" : message;
    let error = input.parentElement?.querySelector<HTMLElement>(`[data-number-error="${kind}"]`);
    if (error == null && input.parentElement != null) {
      error = input.parentElement.createDiv({ cls: "number-suite-field-error" });
      error.dataset.numberError = kind;
      error.id = `number-suite-${kind}-${level}-${Math.random().toString(36).slice(2)}`;
      error.setAttribute("role", "status");
      input.setAttribute("aria-describedby", error.id);
    }
    if (error != null) { error.textContent = valid ? "" : message; error.hidden = valid; }
    this.numberDrafts.set(input, { change: { kind, level, value }, valid, coordinator: this.coordinator });
    this.renderSaveStatus();
  }

  private finishLevelNumber(
    _kind: "first-number" | "skip-first",
    input: HTMLInputElement,
  ): void {
    const draft = this.numberDrafts.get(input);
    if (draft == null || !draft.valid || draft.coordinator !== this.coordinator) return;
    this.numberDrafts.delete(input);
    this.applyChange(draft.change);
    this.renderSaveStatus();
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

  private createCoordinator(file: TFile): void {
    if (this.frontmatter == null) return;
    const app = this.app;
    const refreshDisplay = this.actions.refreshDisplay;
    const coordinator = new NoteSaveCoordinator(this.frontmatter, async (expected, desired) => {
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        const current = frontmatter as Record<string, unknown>;
        const pick = (values: Record<string, unknown>): string => JSON.stringify(Object.fromEntries(
          NOTE_OVERRIDE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(values, key))
            .map((key) => [key, values[key]]),
        ));
        if (pick(current) !== pick(expected)) {
          throw new NoteSaveConflictError(current);
        }
        for (const key of NOTE_OVERRIDE_KEYS) {
          if (Object.prototype.hasOwnProperty.call(desired, key)) current[key] = structuredClone(desired[key]);
          else delete current[key];
        }
      });
      refreshDisplay();
    }, () => undefined);
    this.coordinators.set(file, coordinator);
    this.attachCoordinator(file, coordinator);
  }

  private attachCoordinator(file: TFile, coordinator: NoteSaveCoordinator): void {
    this.detachCoordinator();
    this.coordinator = coordinator;
    this.frontmatter = coordinator.snapshot;
    this.saveState = coordinator.state;
    this.coordinatorUnsubscribe = coordinator.subscribe((state) => {
      if (this.coordinator !== coordinator || this.file !== file) return;
      this.saveState = state;
      this.frontmatter = coordinator.snapshot;
      this.renderSaveStatus();
      if (this.summaryHost != null) {
        this.summaryHost.empty();
        const settings = this.getSettings();
        this.renderSummary(readNoteControlSnapshot(this.frontmatter, settings), settings, this.summaryHost);
      }
    });
  }

  private detachCoordinator(): void {
    this.coordinatorUnsubscribe?.();
    this.coordinatorUnsubscribe = null;
    this.coordinator = null;
  }

  private renderSaveStatus(): void {
    const status = this.saveStatus;
    if (status == null) return;
    status.empty();
    status.createSpan({ text: this.t(`panel.save.${this.saveState === "saved" && this.numberDrafts.size > 0 ? "pending" : this.saveState}`) });
    if (this.saveState === "error") {
      if (this.fieldConflict != null) {
        status.createEl("p", { text: this.t("panel.conflict.description") });
        const list = status.createEl("ul");
        for (const entry of this.fieldConflict.conflicts) {
          const change = entry.change;
          const name = change.kind === "first-number" || change.kind === "skip-first"
            ? this.t(change.kind === "first-number" ? "panel.firstNumber.aria" : "panel.skipFirst.aria", { level: change.level })
            : this.t(change.kind === "scheme" ? "settings.scheme" : change.kind === "ignore" ? "panel.ignore"
              : change.kind === "show-virtual" ? "settings.showVirtual" : "settings.concealStored");
          const label = (value: string | number | boolean | null): string => value == null ? this.t("panel.state.inherit")
            : typeof value === "boolean" ? booleanLabel(value, this.t)
              : change.kind === "scheme" ? schemeDisplayName(String(value), this.getSettings(), this.t) : String(value);
          list.createEl("li", { text: this.t("panel.conflict.value", { name, current: label(entry.current), desired: label(entry.desired) }) });
        }
        const apply = status.createEl("button", { text: this.t("panel.conflict.apply") });
        apply.addEventListener("click", () => this.retryDraft(true));
      } else {
        const retry = status.createEl("button", { text: this.t("panel.retry") });
        retry.addEventListener("click", () => this.retryDraft());
      }
      const reload = status.createEl("button", { text: this.t("panel.conflict.reload") });
      reload.addEventListener("click", () => this.reloadLatest());
    }
  }

  private retryDraft(overwriteConflicts = false): void {
    try {
      if (this.coordinator?.rebaseConflict((current, acknowledged, desired) => (
        rebaseNoteOverrideDraft(current, acknowledged, desired, overwriteConflicts)
      )) === true) {
        this.fieldConflict = null;
        this.frontmatter = this.coordinator.snapshot;
        this.saveState = this.coordinator.state;
        this.render();
      }
    } catch (error: unknown) {
      if (error instanceof NoteOverrideFieldConflictError) {
        this.fieldConflict = error;
        this.renderSaveStatus();
        return;
      }
      console.error("Number Suite: could not rebase current note Properties", error);
      new Notice(this.t("panel.saveFailed"));
      return;
    }
    this.flushDraft();
  }

  private flushDraft(): void {
    void this.coordinator?.flush();
  }

  private reloadLatest(): void {
    if (this.coordinator?.discard() === false) return;
    if (this.file != null) this.coordinators.delete(this.file);
    this.detachCoordinator();
    this.fieldConflict = null;
    this.numberDrafts.clear();
    void this.reload();
  }

  destroy(): void {
    void this.coordinator?.flush();
    this.detachCoordinator();
    this.request += 1;
  }

  private applyChange(change: NoteOverrideChange): void {
    if (this.busy || this.coordinator == null) return;
    try {
      this.coordinator.update(change);
      this.fieldConflict = null;
      if (change.kind === "reset" || change.kind === "migrate") this.render();
      this.flushDraft();
    } catch (error: unknown) {
      console.error("Number Suite: unsafe current note Properties change", error);
      new Notice(this.t("panel.saveFailed"));
    }
  }
}
