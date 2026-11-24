import { AccessibleSetting as Setting } from "./accessible-setting";
import {
  NoteSaveConflictError,
  NoteSaveCoordinator,
  type NoteSaveState,
} from "../application/note-save-coordinator";
import { App, Menu, Notice, setIcon, type DropdownComponent, type TFile } from "obsidian";

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
import { renderNoteOperationGuide } from "./note-operation-guide";
import { notePropertyIssueText } from "./note-property-diagnostics";

export interface NoteControlActions {
  readonly refreshDisplay: () => void;
  readonly runCurrent: (operation: TransformOperation) => void;
  readonly openBatch: () => void;
  readonly openGlobalSettings: () => void;
  readonly openHeadingMap?: () => void;
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

const NOTE_TABS = ["display", "edit"] as const;
type NoteTab = typeof NOTE_TABS[number];
const LEVEL_NUMBER_FIELDS = {
  "first-number": { values: "firstNumbers", label: "panel.firstNumber.label", aria: "panel.firstNumber.aria" },
  "skip-first": { values: "skipFirst", label: "panel.skipFirst.label", aria: "panel.skipFirst.aria" },
  "skip-per-parent": { values: "skipPerParent", label: "panel.skipPerParent.label", aria: "panel.skipPerParent.aria" },
} as const;
type LevelNumberKind = keyof typeof LEVEL_NUMBER_FIELDS;
let nextPaneId = 0;

export class NoteControlPane {
  private busy = false;
  private coordinator: NoteSaveCoordinator | null = null;
  private coordinatorUnsubscribe: (() => void) | null = null;
  private readonly coordinators: WeakMap<TFile, NoteSaveCoordinator>;
  private fieldConflict: NoteOverrideFieldConflictError | null = null;
  private readonly numberDrafts = new Map<HTMLInputElement, {
    change: Extract<NoteOverrideChange, { kind: LevelNumberKind }>;
    valid: boolean;
    coordinator: NoteSaveCoordinator | null;
  }>();
  private summaryHost: HTMLElement | null = null;
  private refreshConcealScope: ((snapshot: NoteControlSnapshot) => void) | null = null;
  private readonly header: HTMLElement;
  private readonly descriptions: HTMLElement;
  private readonly tabList: HTMLElement;
  private readonly tabs: Record<NoteTab, HTMLButtonElement>;
  private readonly panels: Record<NoteTab, HTMLElement>;
  private readonly editActions: HTMLElement;
  private readonly settingsButton: HTMLButtonElement;
  private activeTab: NoteTab = "display";
  private preview: HTMLElement | null = null;
  private saveStatus: HTMLElement | null = null;
  private saveState: NoteSaveState = "saved";
  private frontmatter: Record<string, unknown> | null = null;
  private file: TFile | null = null;
  private request = 0;
  private readonly addedLevels = new Set<ReturnType<typeof headingLevels>[number]>();

  constructor(
    private readonly app: App,
    private readonly contentEl: HTMLElement,
    private readonly getSettings: () => NumberSuiteSettings,
    private readonly getTranslate: () => Translate,
    private readonly actions: NoteControlActions,
  ) {
    this.coordinators = sessionsFor(app);
    this.header = contentEl.createDiv({ cls: "number-suite-note-control-header" });
    this.descriptions = contentEl.createDiv();
    this.tabList = contentEl.createDiv({
      cls: "number-suite-sidebar-tabs", attr: { role: "tablist", "aria-orientation": "horizontal" },
    });
    const id = ++nextPaneId;
    const makeTab = (tab: NoteTab): HTMLButtonElement => {
      const button = this.tabList.createEl("button", {
        attr: { type: "button", role: "tab", id: `number-suite-note-${id}-${tab}`,
          "aria-controls": `number-suite-note-${id}-panel-${tab}` },
      });
      button.addEventListener("click", () => this.selectTab(tab));
      button.addEventListener("keydown", (event) => {
        const target = event.key === "Home" ? "display" : event.key === "End" ? "edit"
          : event.key === "ArrowLeft" || event.key === "ArrowRight" ? (tab === "display" ? "edit" : "display") : null;
        if (target == null) return;
        event.preventDefault();
        this.selectTab(target);
        this.tabs[target].focus();
      });
      return button;
    };
    this.tabs = { display: makeTab("display"), edit: makeTab("edit") };
    const makePanel = (tab: NoteTab): HTMLElement => contentEl.createDiv({
      cls: `number-suite-sidebar-tabpanel is-${tab}`,
      attr: { role: "tabpanel", id: `number-suite-note-${id}-panel-${tab}`,
        "aria-labelledby": this.tabs[tab].id, tabindex: "0" },
    });
    this.panels = { display: makePanel("display"), edit: makePanel("edit") };
    this.editActions = this.panels.edit.createDiv({ cls: "number-suite-sidebar-edit-actions" });
    const footer = contentEl.createDiv({ cls: "number-suite-sidebar-footer" });
    this.settingsButton = footer.createEl("button", { attr: { type: "button" } });
    this.settingsButton.addEventListener("click", () => this.actions.openGlobalSettings());
    this.updateLabels();
    this.selectTab("display");
  }

  private get t(): Translate {
    return this.getTranslate();
  }

  private updateLabels(): void {
    this.tabList.setAttribute("aria-label", this.t("panel.title"));
    for (const tab of NOTE_TABS) this.tabs[tab].setText(this.t(`sidebar.tab.${tab}`));
    this.settingsButton.setText(this.t("panel.openSettings"));
  }

  private selectTab(tab: NoteTab): void {
    this.activeTab = tab;
    for (const id of NOTE_TABS) {
      const selected = id === tab;
      this.tabs[id].setAttribute("aria-selected", String(selected));
      this.tabs[id].tabIndex = selected ? 0 : -1;
      this.panels[id].hidden = !selected;
    }
  }

  mountPreview(): HTMLElement {
    this.removePreview();
    this.preview = this.panels.edit.createDiv({ cls: "number-suite-sidebar-preview" });
    this.editActions.hidden = true;
    this.contentEl.classList.add("has-preview");
    this.selectTab("edit");
    return this.preview;
  }

  removePreview(restoreFocus = false): void {
    this.preview?.remove();
    this.preview = null;
    this.editActions.hidden = false;
    this.contentEl.classList.remove("has-preview");
    if (restoreFocus && this.activeTab === "edit") this.tabs.edit.focus();
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
    this.addedLevels.clear();
    this.file = file;
    this.frontmatter = null;
    this.request += 1;
    if (reload) void this.reload();
    else this.renderUnavailable();
  }

  refresh(): void {
    this.updateLabels();
    void this.reload();
  }

  private async reload(): Promise<void> {
    if (
      this.coordinator != null
      && (this.coordinator.pending || this.numberDrafts.size > 0 || this.panels.display.contains(this.contentEl.ownerDocument.activeElement))
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
    this.render();
  }

  private renderLoading(): void {
    this.resetContent();
    this.renderHeader();
    const status = this.descriptions.createDiv({
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
    this.resetContent();
    this.descriptions.createEl("p", {
      cls: "number-suite-sidebar-empty",
      text: this.t("notice.noActiveNote"),
    });
  }

  private resetContent(): void {
    this.summaryHost = null;
    this.refreshConcealScope = null;
    this.saveStatus = null;
    this.header.empty();
    this.descriptions.empty();
    this.panels.display.empty();
    this.editActions.empty();
  }

  private renderHeader(): void {
    const file = this.file;
    if (file == null) return;
    const t = this.t;
    const info = this.header.createDiv({ cls: "number-suite-note-control-identity" });
    info.createDiv({ cls: "number-suite-note-current-label", text: t("panel.title") });
    info.createEl("h3", { text: file.basename, attr: { title: file.path, dir: "auto" } });
    this.summaryHost = info.createDiv();
    const actions = this.header.createDiv({ cls: "number-suite-note-header-actions" });
    if (this.actions.openHeadingMap != null) {
      const label = t("command.headingMap.open");
      const mapButton = actions.createEl("button", {
        cls: "clickable-icon",
        attr: { "aria-label": label, title: label, type: "button" },
      });
      setIcon(mapButton, "git-branch");
      mapButton.addEventListener("click", () => this.actions.openHeadingMap?.());
    }
    const more = t("sidebar.more");
    const menuButton = actions.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": more, title: more, type: "button", "aria-haspopup": "menu" },
    });
    setIcon(menuButton, "ellipsis");
    menuButton.disabled = this.frontmatter == null;
    menuButton.addEventListener("click", () => {
      const current = this.frontmatter;
      const coordinator = this.coordinator;
      if (this.busy || current == null || this.file !== file) return;
      const snapshot = readNoteControlSnapshot(current, this.getSettings());
      const change = (operation: NoteOverrideChange): void => {
        if (this.file !== file || this.coordinator !== coordinator) return;
        this.applyChange(operation);
        this.header.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
      };
      const menu = new Menu();
      menu.addItem((item) => item
        .setTitle(t(snapshot.ignore ? "sidebar.enableNote" : "sidebar.disableNote"))
        .setIcon(snapshot.ignore ? "play" : "ban")
        .setDisabled(!snapshot.valid)
        .onClick(() => change({ kind: "ignore", value: !snapshot.ignore })));
      menu.addItem((item) => item.setTitle(t("sidebar.restoreGlobal")).setIcon("rotate-ccw")
        .setDisabled(!snapshot.hasAnyOverride).onClick(() => change({ kind: "reset" })));
      const bounds = menuButton.getBoundingClientRect();
      menu.showAtPosition({ x: bounds.left, y: bounds.bottom }, menuButton.ownerDocument);
    });
  }

  private render(): void {
    this.numberDrafts.clear();
    this.resetContent();
    if (this.file == null) {
      this.renderUnavailable();
      return;
    }
    this.renderHeader();

    if (this.frontmatter == null) {
      const error = this.descriptions.createDiv({ cls: "number-suite-note-control-error" });
      error.setAttribute("role", "alert");
      error.setText(this.t("notice.invalidFrontmatter"));
      new Setting(this.descriptions).addButton((button) => button
        .setButtonText(this.t("panel.retry"))
        .onClick(() => void this.reload()));
      return;
    }

    const settings = this.getSettings();
    const snapshot = readNoteControlSnapshot(this.frontmatter, settings);
    if (!snapshot.valid) {
      const error = this.descriptions.createDiv({ cls: "number-suite-note-control-error" });
      error.setAttribute("role", "alert");
      error.createEl("strong", { text: this.t("panel.properties.invalid") });
      const list = error.createEl("ul");
      for (const entry of snapshot.issues) list.createEl("li", { text: notePropertyIssueText(entry, this.t) });
    } else if (snapshot.hasLegacy) {
      this.panels.display.createEl("p", {
        cls: "number-suite-note-control-migration",
        text: this.t("panel.properties.legacy"),
      });
    }
    this.saveStatus = this.descriptions.createDiv({ cls: "number-suite-note-save-status" });
    this.saveStatus.setAttribute("role", "status");
    this.saveStatus.setAttribute("aria-live", "polite");
    this.renderSaveStatus();
    if (this.summaryHost != null) this.renderSummary(snapshot, this.summaryHost);
    this.renderOverrides(snapshot, settings);
    this.renderActions(snapshot);
  }

  private renderSummary(snapshot: NoteControlSnapshot, host: HTMLElement): void {
    const count = Number(snapshot.showVirtual !== "inherit") + Number(snapshot.concealStored !== "inherit")
      + Number(snapshot.concealStored === "on" && snapshot.concealScope != null)
      + Number(snapshot.schemeId != null) + Object.keys(snapshot.firstNumbers).length
      + Object.keys(snapshot.skipFirst).length + Object.keys(snapshot.skipPerParent).length;
    host.createDiv({
      cls: "number-suite-note-control-state",
      text: snapshot.effectiveIgnore ? this.t("panel.status.disabled")
        : count > 0 ? this.t("panel.status.custom", { count }) : this.t("panel.status.inherit"),
    });
  }

  private renderOverrides(snapshot: NoteControlSnapshot, settings: NumberSuiteSettings): void {
    const section = this.panels.display.createDiv({ cls: "number-suite-note-control-section" });
    this.addTriStateSetting(
      section,
      this.t("settings.showVirtual"),
      settings.showVirtualNumbers,
      snapshot.showVirtual,
      (value) => ({ kind: "show-virtual", value }),
    );
    this.addTriStateSetting(
      section,
      this.t("panel.storedNumbers"),
      !settings.concealStoredNumbers,
      snapshot.concealStored,
      (value) => ({ kind: "conceal-stored", value }),
      true,
    );
    const scopeHost = section.createDiv();
    let scopeSelect: DropdownComponent | null = null;
    this.refreshConcealScope = (current) => {
      if (current.concealStored !== "on") {
        scopeHost.empty();
        scopeSelect = null;
      } else if (scopeSelect != null) {
        scopeSelect.setValue(current.concealScope ?? "");
      } else {
        const label = this.t("panel.concealScope");
        const row = new Setting(scopeHost).setName(label).addDropdown((dropdown) => {
          scopeSelect = dropdown;
          dropdown.addOption("", this.t("panel.concealScope.inherit"))
            .addOption("plugin", this.t("conceal.plugin"))
            .addOption("templates", this.t("conceal.templates"))
            .addOption("common", this.t("conceal.common"))
            .setValue(current.concealScope ?? "")
            .onChange((next) => {
              if (next === "" || next === "plugin" || next === "templates" || next === "common") {
                this.applyChange({ kind: "conceal-scope", value: next === "" ? null : next });
              }
            });
        });
        row.settingEl.querySelector("select")?.setAttribute("aria-label", label);
      }
    };
    this.refreshConcealScope(snapshot);
    new Setting(section)
      .setName(this.t("settings.scheme"))
      .addDropdown((dropdown) => {
        dropdown.addOption("", this.t("panel.inheritValue", { value: schemeDisplayName(settings.selectedSchemeId, settings, this.t) }));
        for (const [id, label] of noteSchemeOptions(settings, snapshot.schemeId, this.t)) {
          dropdown.addOption(id, label);
        }
        return dropdown.setValue(snapshot.schemeId ?? "").onChange((value) => {
          void this.applyChange({ kind: "scheme", value: value.length === 0 ? null : value });
        });
      });
    const advanced = section.createEl("details", { cls: "number-suite-note-control-levels number-suite-light-disclosure" });
    const configured = headingLevels().filter((level) => (
      snapshot.firstNumbers[level] != null || snapshot.skipFirst[level] != null
      || snapshot.skipPerParent[level] != null || this.addedLevels.has(level)
    ));
    advanced.open = configured.length > 0;
    const summary = advanced.createEl("summary");
    advanced.createEl("p", { cls: "setting-item-description", text: this.t("panel.numberingByLevel.desc") });
    const rows = advanced.createDiv({ cls: "number-suite-note-level-rules" });
    const visibleLevels = new Set<ReturnType<typeof headingLevels>[number]>();
    let refreshPicker = (): void => undefined;
    const addRow = (level: ReturnType<typeof headingLevels>[number]): void => {
      visibleLevels.add(level);
      const current = readNoteControlSnapshot(this.frontmatter ?? {}, this.getSettings());
      const descriptionId = `${this.panels.display.id}-skip-h${level}`;
      const row = rows.createEl("fieldset", {
        cls: "number-suite-level-rule", attr: { "aria-describedby": descriptionId },
      });
      row.createEl("legend", { text: this.t("panel.levelRule.title", { level }) });
      row.createEl("p", {
        cls: "setting-item-description", attr: { id: descriptionId },
        text: level === 1 ? this.t("panel.skipPerParent.rootDesc")
          : this.t("panel.skipPerParent.desc", { level, parent: level - 1 }),
      });
      const fields = row.createDiv({ cls: "number-suite-level-rule-fields" });
      for (const kind of ["first-number", "skip-first", "skip-per-parent"] as const) {
        if (level === 1 && kind === "skip-per-parent") continue;
        const { values, label, aria } = LEVEL_NUMBER_FIELDS[kind];
        const first = kind === "first-number";
        const field = fields.createEl("label");
        field.createSpan({ text: this.t(label) });
        const input = field.createEl("input", { attr: {
          type: "number", min: first ? "1" : "0", step: "1",
          placeholder: first ? this.t("panel.state.inherit") : "0",
          "aria-label": this.t(aria, { level }),
        } });
        input.value = current[values][level]?.toString() ?? "";
        input.addEventListener("input", () => this.applyLevelNumber(kind, level, input.value, input));
        input.addEventListener("blur", () => this.finishLevelNumber(kind, input));
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") this.finishLevelNumber(kind, input);
        });
      }
      const remove = row.createEl("button", { text: this.t("panel.removeLevelRule"), attr: { type: "button" } });
      remove.addEventListener("click", () => {
        if (!this.applyChange({ kind: "remove-level-rule", level })) return;
        this.numberDrafts.forEach((draft, input) => {
          if (draft.change.level === level) this.numberDrafts.delete(input);
        });
        this.addedLevels.delete(level);
        visibleLevels.delete(level);
        row.remove();
        refreshPicker();
        this.renderSaveStatus();
        picker.querySelector("select")?.focus();
      });
    };
    for (const level of configured) addRow(level);
    const picker = advanced.createDiv();
    refreshPicker = (): void => {
      summary.setText(this.t("panel.numberingByLevel") + (visibleLevels.size === 0 ? "" : ` (${visibleLevels.size})`));
      picker.empty();
      const available = headingLevels().filter((level) => !visibleLevels.has(level));
      if (available.length === 0) return;
      let selected = available[0]!;
      new Setting(picker).setName(this.t("panel.addLevel"))
        .addDropdown((dropdown) => {
          for (const level of available) dropdown.addOption(String(level), `H${level}`);
          dropdown.setValue(String(selected)).onChange((value) => { selected = Number(value) as typeof selected; });
        })
        .addButton((button) => button.setButtonText(this.t("panel.addLevel")).onClick(() => {
          this.addedLevels.add(selected);
          addRow(selected);
          refreshPicker();
        }));
    };
    refreshPicker();
    if (snapshot.hasLegacy) {
      new Setting(advanced)
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
    globalDisplay: boolean,
    value: TriState,
    change: (value: TriState) => NoteOverrideChange,
    inverted = false,
  ): void {
    const showValue = inverted ? "off" : "on";
    const hideValue = inverted ? "on" : "off";
    new Setting(container).setName(name).addDropdown((dropdown) => dropdown
      .addOption("inherit", this.t("panel.inheritValue", {
        value: this.t(globalDisplay ? "panel.display.show" : "panel.display.hide"),
      }))
      .addOption(showValue, this.t("panel.display.show"))
      .addOption(hideValue, this.t("panel.display.hide"))
      .setValue(value)
      .onChange((next) => void this.applyChange(change(next as TriState))));
  }

  private applyLevelNumber(
    kind: LevelNumberKind,
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
      error = input.parentElement.createSpan({ cls: "number-suite-field-error" });
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
    _kind: LevelNumberKind,
    input: HTMLInputElement,
  ): void {
    const draft = this.numberDrafts.get(input);
    if (draft == null || !draft.valid || draft.coordinator !== this.coordinator) return;
    this.numberDrafts.delete(input);
    this.applyChange(draft.change);
    this.renderSaveStatus();
  }

  private renderActions(snapshot: NoteControlSnapshot): void {
    const actions = this.editActions.createDiv({ cls: "number-suite-note-control-actions" });
    for (const [operation, key] of [
      ["write", "command.write.current"],
      ["renumber", "command.renumber.current"],
      ["remove", "command.remove.current"],
    ] as const) {
      const button = actions.createEl("button", { text: this.t(key), attr: { type: "button" } });
      button.disabled = snapshot.effectiveIgnore || !snapshot.valid;
      button.addEventListener("click", () => this.actions.runCurrent(operation));
    }
    const navigation = this.editActions.createDiv({ cls: "number-suite-note-control-navigation" });
    const strip = navigation.createEl("button", { text: this.t("command.strip.current"), attr: { type: "button" } });
    strip.disabled = snapshot.effectiveIgnore || !snapshot.valid;
    strip.addEventListener("click", () => this.actions.runCurrent("strip-markers"));
    const batch = navigation.createEl("button", { text: this.t("command.batch.folder"), attr: { type: "button" } });
    batch.addEventListener("click", () => this.actions.openBatch());
    renderNoteOperationGuide(this.editActions, this.t);
  }

  private createCoordinator(file: TFile): void {
    if (this.frontmatter == null) return;
    const app = this.app;
    const refreshDisplay = this.actions.refreshDisplay;
    const coordinator = new NoteSaveCoordinator(this.frontmatter, async (expected, desired) => {
      const path = file.path;
      const assertFileIdentity = (): void => {
        if (file.path !== path || app.vault.getAbstractFileByPath(path) !== file) {
          throw new Error("Number Suite note file changed before its Properties could be saved.");
        }
      };
      assertFileIdentity();
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        assertFileIdentity();
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
      const settings = this.getSettings();
      const snapshot = readNoteControlSnapshot(this.frontmatter, settings);
      this.refreshConcealScope?.(snapshot);
      if (this.summaryHost != null) {
        this.summaryHost.empty();
        if (this.summaryHost != null) this.renderSummary(snapshot, this.summaryHost);
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
    status.hidden = this.saveState === "saved" && this.numberDrafts.size === 0;
    status.setAttribute("role", this.saveState === "error" ? "alert" : "status");
    status.createSpan({ text: this.t(`panel.save.${this.saveState === "saved" && this.numberDrafts.size > 0 ? "pending" : this.saveState}`) });
    if (this.saveState === "error") {
      if (this.fieldConflict != null) {
        status.createEl("p", { text: this.t("panel.conflict.description") });
        const list = status.createEl("ul");
        for (const entry of this.fieldConflict.conflicts) {
          const change = entry.change;
          const name = change.kind === "first-number" || change.kind === "skip-first" || change.kind === "skip-per-parent"
            ? this.t(LEVEL_NUMBER_FIELDS[change.kind].aria, { level: change.level })
            : this.t(change.kind === "scheme" ? "settings.scheme" : change.kind === "ignore" ? "panel.ignore"
              : change.kind === "show-virtual" ? "settings.showVirtual"
              : change.kind === "conceal-scope" ? "panel.concealScope" : "settings.concealStored");
          const label = (value: string | number | boolean | null): string => value == null ? this.t("panel.state.inherit")
            : typeof value === "boolean" ? booleanLabel(value, this.t)
              : change.kind === "scheme" ? schemeDisplayName(String(value), this.getSettings(), this.t)
                : change.kind === "conceal-scope" && (value === "plugin" || value === "templates" || value === "common")
                  ? this.t(`conceal.${value}`) : String(value);
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

  private applyChange(change: NoteOverrideChange): boolean {
    if (this.busy || this.coordinator == null) return false;
    try {
      this.coordinator.update(change);
      this.fieldConflict = null;
      if (change.kind === "reset") this.addedLevels.clear();
      if (change.kind === "reset" || change.kind === "migrate" || change.kind === "ignore") this.render();
      this.flushDraft();
      return true;
    } catch (error: unknown) {
      console.error("Number Suite: unsafe current note Properties change", error);
      new Notice(this.t("panel.saveFailed"));
      return false;
    }
  }
}
