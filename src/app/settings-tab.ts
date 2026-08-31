import {
  App,
  Modal,
  MarkdownView,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";

import { createTranslator, type Translate } from "../config/i18n";
import {
  DEFAULT_SETTINGS,
  cloneSettings,
  type NumberSuiteSettings,
} from "../config/settings";
import type { SettingsSaveStatus } from "../config/settings-save-coordinator";
import { createSettingDefinitions } from "../ui/settings/definitions";
import { renderNoteNumberingGuide } from "../ui/settings/note-guide";
import { renderNoteOverridesGuide } from "../ui/settings/note-overrides-guide";
import { renderSameFileReferenceGuide } from "../ui/settings/reference-guide";
import { createSettingsTabs, type SettingsTabId } from "../ui/settings/tabs";
import {
  renderBatchOperationsGuide,
  renderCaptionNumberingGuide,
  renderFileOperationsGuide,
  renderHeadingDisplayGuide,
} from "../ui/settings/usage-guides";
import type NumberSuitePlugin from "./plugin";
import { SchemeSettingsRenderer, selectedSchemeName } from "./scheme-settings-renderer";
import { parseAtxHeadings } from "../core/heading-parser";
import type { SettingsImpact } from "./settings-impact";
import {
  applySettingsControlValue,
  getSettingsControlValue,
  isSettingsControlKey,
  type SettingsControlKey,
} from "./settings-control-contract";

// Declarative settings are intentionally inactive. Non-empty definitions bypass
// display() and remove the established seven-tab surface, degrading the settings
// experience. Dormant definitions remain covered by tests but must not activate by default.
const USE_NATIVE_SETTING_PAGES = false;

class ResetSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly t: Translate,
    private readonly confirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(this.t("settings.reset"));
    this.contentEl.createEl("p", { text: this.t("settings.reset.desc") });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText(this.t("preview.cancel"))
        .onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText(this.t("settings.reset.button"))
        .setWarning()
        .onClick(() => {
          this.confirm();
          this.close();
        }));
  }
}

export class NumberSuiteSettingTab extends PluginSettingTab {
  private activeTab: SettingsTabId = "general";
  private cleanup: (() => void) | null = null;
  private imperativeVisible = false;

  constructor(app: App, private readonly plugin: NumberSuitePlugin) {
    super(app, plugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem<SettingsControlKey>[] {
    return USE_NATIVE_SETTING_PAGES ? this.getDeclarativeSettingDefinitions() : [];
  }

  getDeclarativeSettingDefinitions(): SettingDefinitionItem<SettingsControlKey>[] {
    this.imperativeVisible = false;
    const t = createTranslator(this.plugin.settings.language);
    return createSettingDefinitions({
      t,
      selectedSchemeName: () => selectedSchemeName(
        this.plugin.settings,
        createTranslator(this.plugin.settings.language),
      ),
      renderSaveStatus: (setting) => {
        setting.settingEl.empty();
        setting.settingEl.addClass("number-suite-settings-save-row");
        return this.renderSaveStatus(setting.settingEl, t, true);
      },
      renderSchemes: (container) => this.schemeRenderer(t).renderSchemes(container),
      renderCleanupHistory: (container) => this.schemeRenderer(t).renderCleanupHistory(container),
      openResetModal: () => this.openResetModal(t),
    });
  }

  override getControlValue(key: string): unknown {
    if (!isSettingsControlKey(key)) return undefined;
    return getSettingsControlValue(this.plugin.settings, key);
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (!isSettingsControlKey(key)) throw new Error(`Unsupported Number Suite setting: ${key}`);
    const mutation = applySettingsControlValue(this.plugin.settings, key, value);
    if (mutation.persistence === "scheduled") {
      this.plugin.scheduleSettings(mutation.settings, mutation.impact);
    } else {
      await this.plugin.saveSettings(mutation.settings, mutation.impact);
    }
    if (mutation.refreshSurface) this.refreshSurface();
  }

  private updateControl(key: SettingsControlKey, value: unknown): void {
    void this.setControlValue(key, value).catch((error: unknown) => {
      console.error(`Number Suite: failed to update setting ${key}`, error);
    });
  }

  private schemeRenderer(t: Translate): SchemeSettingsRenderer {
    return new SchemeSettingsRenderer(
      () => this.plugin.settings,
      (update, impact, immediate, rerender) => this.commit(update, impact, immediate, rerender),
      t,
      () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view == null ? [] : parseAtxHeadings(view.editor.getValue());
      },
    );
  }

  override hide(): void {
    this.imperativeVisible = false;
    this.cleanup?.();
    this.cleanup = null;
    super.hide();
  }

  override display(): void {
    this.imperativeVisible = true;
    this.cleanup?.();
    const { containerEl } = this;
    const settings = this.plugin.settings;
    const t = createTranslator(settings.language);
    containerEl.empty();
    containerEl.addClass("number-suite-settings");
    const tabs = [
      { id: "general", label: t("settings.tab.general") },
      { id: "headings", label: t("settings.tab.headings") },
      { id: "captions", label: t("settings.tab.captions") },
      { id: "references", label: t("settings.tab.references") },
      { id: "notes", label: t("settings.tab.notes") },
      { id: "cleanup", label: t("settings.tab.cleanup") },
      { id: "views", label: t("settings.tab.views") },
    ] as const;
    const layout = createSettingsTabs(containerEl, tabs, this.activeTab, t("settings.tabs.label"), (id) => {
      this.activeTab = id;
      this.display();
      const target = this.containerEl.querySelector<HTMLElement>(`#number-suite-settings-tab-${id}`);
      target?.focus();
    });
    const statusCleanup = this.renderSaveStatus(layout.panel, t);
    if (this.activeTab === "general") this.renderGeneral(layout.panel, t);
    else if (this.activeTab === "headings") this.renderHeadings(layout.panel, t);
    else if (this.activeTab === "captions") this.renderCaptions(layout.panel, t);
    else if (this.activeTab === "references") this.renderReferences(layout.panel, t);
    else if (this.activeTab === "notes") this.renderNotes(layout.panel, t);
    else if (this.activeTab === "cleanup") this.renderCleanup(layout.panel, t);
    else this.renderViews(layout.panel, t);
    this.applyReadOnlyState(layout.panel);
    this.cleanup = () => {
      layout.cleanup();
      statusCleanup();
      containerEl.removeClass("number-suite-settings");
    };
  }

  private openResetModal(t: Translate): void {
    new ResetSettingsModal(this.app, t, () => {
      void this.plugin.saveSettings(cloneSettings(DEFAULT_SETTINGS), "all")
        .then(() => this.refreshSurface())
        .catch((error: unknown) => {
          console.error("Number Suite: failed to reset settings", error);
        });
    }).open();
  }

  private refreshSurface(): void {
    if (this.imperativeVisible) {
      this.display();
      return;
    }
    const update = (this as unknown as { readonly update?: () => void }).update;
    update?.call(this);
  }

  private renderSaveStatus(container: HTMLElement, t: Translate, hideContainer = false): () => void {
    const row = container.createDiv({ cls: "number-suite-settings-save-status" });
    const message = row.createSpan();
    const retry = row.createEl("button", { text: t("settings.save.retry") });
    retry.type = "button";
    retry.addEventListener("click", () => {
      retry.disabled = true;
      void this.plugin.retrySettingsSave().catch(() => undefined);
    });
    const update = (status: SettingsSaveStatus): void => {
      row.hidden = status.state === "saved";
      if (hideContainer) container.hidden = status.state === "saved";
      const alert = status.state === "pending" || status.state === "incompatible";
      row.setAttribute("role", alert ? "alert" : "status");
      row.setAttribute("aria-live", alert ? "assertive" : "polite");
      const errorDetail = status.state === "pending" ? settingsErrorMessage(status.error) : "";
      message.textContent = status.state === "incompatible"
        ? t("settings.save.incompatible", { version: status.schemaVersion })
        : status.state === "scheduled" ? t("settings.save.scheduled")
          : status.state === "saving" ? t("settings.save.saving")
            : errorDetail.length === 0
              ? t("settings.save.pending")
              : `${t("settings.save.pending")} ${errorDetail}`;
      retry.hidden = status.state !== "pending";
      retry.disabled = status.state !== "pending";
    };
    const unsubscribe = this.plugin.subscribeSettingsSaveStatus(update);
    return () => {
      unsubscribe();
      if (hideContainer) container.hidden = false;
      retry.replaceWith(retry.cloneNode(true));
      row.remove();
    };
  }

  private applyReadOnlyState(container: HTMLElement): void {
    if (this.plugin.settingsSaveStatus().state !== "incompatible") return;
    container.addClass("number-suite-settings-read-only");
    for (const control of container.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("button, input, select, textarea")) {
      if (control.closest(".number-suite-settings-save-status") == null) control.disabled = true;
    }
  }

  private commit(
    update: (settings: NumberSuiteSettings) => void,
    impact: SettingsImpact,
    immediate = false,
    rerender = false,
  ): void {
    const next = cloneSettings(this.plugin.settings);
    update(next);
    if (immediate) {
      void this.plugin.saveSettings(next, impact).catch((error: unknown) => {
        console.error("Number Suite: failed to save settings", error);
      });
    } else {
      this.plugin.scheduleSettings(next, impact);
    }
    if (rerender) this.refreshSurface();
  }

  private renderGeneral(container: HTMLElement, t: Translate): void {
    new Setting(container)
      .setName(t("settings.language"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("auto", t("language.auto"))
        .addOption("en", t("language.en"))
        .addOption("zh", t("language.zh"))
        .setValue(this.plugin.settings.language)
        .onChange((value) => this.updateControl("general.language", value)));
    new Setting(container)
      .setName(t("settings.reset"))
      .setDesc(t("settings.reset.desc"))
      .addButton((button) => button.setButtonText(t("settings.reset.button")).setWarning().onClick(() => {
        this.openResetModal(t);
      }));
  }

  private renderHeadings(container: HTMLElement, t: Translate): void {
    new Setting(container)
      .setName(t("settings.showVirtual"))
      .setDesc(t("settings.showVirtual.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showVirtualNumbers)
        .onChange((value) => this.updateControl("general.showVirtualNumbers", value)));
    new Setting(container)
      .setName(t("settings.concealStored"))
      .setDesc(t("settings.concealStored.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.concealStoredNumbers)
        .onChange((value) => this.updateControl("general.concealStoredNumbers", value)));
    renderHeadingDisplayGuide(container, t);
    renderNoteOverridesGuide(container, t, "settings");
    new Setting(container)
      .setName(t("settings.missing"))
      .addDropdown((dropdown) => dropdown
        .addOption("fill-one", t("missing.fill-one"))
        .addOption("current-only", t("missing.current-only"))
        .addOption("skip", t("missing.skip"))
        .setValue(this.plugin.settings.missingLevelStrategy)
        .onChange((value) => this.updateControl("general.missingLevelStrategy", value)));
    this.schemeRenderer(t).renderSchemes(container);
  }

  private renderCaptions(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.captions.enable"))
      .setDesc(t("settings.captions.enable.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showCaptionNumbers)
        .onChange((value) => this.updateControl("captions.showCaptionNumbers", value)));
    renderCaptionNumberingGuide(container, t);
    new Setting(container).setName(t("settings.captions.placement"))
      .setDesc(t("settings.captions.placement.desc"))
      .setHeading();
    const placements = [
      ["settings.captions.placement.figure", "captions.figurePlacement", "figureCaptionPlacement"],
      ["settings.captions.placement.table", "captions.tablePlacement", "tableCaptionPlacement"],
      ["settings.captions.placement.equation", "captions.equationPlacement", "equationCaptionPlacement"],
      ["settings.captions.placement.code", "captions.codePlacement", "codeCaptionPlacement"],
    ] as const;
    for (const [name, control, property] of placements) {
      new Setting(container).setName(t(name))
        .addDropdown((dropdown) => dropdown
          .addOption("above", t("settings.captions.placement.above"))
          .addOption("below", t("settings.captions.placement.below"))
          .setValue(this.plugin.settings[property])
          .onChange((value) => this.updateControl(control, value)));
    }
    new Setting(container).setName(t("settings.captions.imageTooltip"))
      .setDesc(t("settings.captions.imageTooltip.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showImageCaptionTooltips)
        .onChange((value) => this.updateControl("captions.showImageCaptionTooltips", value)));
    new Setting(container).setName(t("settings.captions.alignment"))
      .setDesc(t("settings.captions.alignment.desc"))
      .setHeading();
    const alignment = [
      ["settings.captions.center.figure", "captions.centerFigure", "centerFigureCaptions"],
      ["settings.captions.center.table", "captions.centerTable", "centerTableCaptions"],
      ["settings.captions.center.equation", "captions.centerEquation", "centerEquationCaptions"],
      ["settings.captions.center.code", "captions.centerCode", "centerCodeCaptions"],
    ] as const;
    for (const [name, control, property] of alignment) {
      new Setting(container).setName(t(name))
        .addToggle((toggle) => toggle.setValue(this.plugin.settings[property])
          .onChange((value) => this.updateControl(control, value)));
    }
  }

  private renderReferences(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.references.enable"))
      .setDesc(t("settings.references.enable.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showCrossReferences)
        .onChange((value) => this.updateControl("references.showCrossReferences", value)));
    renderSameFileReferenceGuide(container, t);
  }

  private renderNotes(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.notes.enable"))
      .setDesc(t("settings.notes.enable.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showNoteNumbers)
        .onChange((value) => this.updateControl("notes.showNoteNumbers", value)));
    new Setting(container).setName(t("settings.notes.display"))
      .setDesc(t("settings.notes.display.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("formatted", t("settings.notes.display.formatted"))
        .addOption("source", t("settings.notes.display.source"))
        .setValue(this.plugin.settings.noteDisplayMode)
        .onChange((value) => this.updateControl("notes.displayMode", value)));
    renderNoteNumberingGuide(container, t);
  }

  private renderCleanup(container: HTMLElement, t: Translate): void {
    renderFileOperationsGuide(container, t);
    new Setting(container)
      .setName(t("settings.markers"))
      .setDesc(t("settings.markers.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.writeMarkers)
        .onChange((value) => this.updateControl("cleanup.writeMarkers", value)));
    new Setting(container)
      .setName(t("settings.cleanup"))
      .setDesc(t("settings.cleanup.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("plugin", t("cleanup.plugin"))
        .addOption("templates", t("cleanup.templates"))
        .addOption("common", t("cleanup.common"))
        .setValue(this.plugin.settings.cleanupScope)
        .onChange((value) => this.updateControl("cleanup.cleanupScope", value)));
    new Setting(container).setName(t("settings.multiple")).addToggle((toggle) => toggle
      .setValue(this.plugin.settings.removeMultiplePrefixes)
      .onChange((value) => this.updateControl("cleanup.removeMultiplePrefixes", value)));
    new Setting(container).setName(t("settings.normalize")).addToggle((toggle) => toggle
      .setValue(this.plugin.settings.normalizeManualOnRenumber)
      .onChange((value) => this.updateControl("cleanup.normalizeManualOnRenumber", value)));
    this.schemeRenderer(t).renderCleanupHistory(container);
  }

  private renderViews(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.views")).setHeading();
    const toggle = (name: Parameters<Translate>[0], key: "enableLivePreview" | "enableReadingView" | "enableSourceMode" | "revealOnActiveLine", description?: Parameters<Translate>[0]): void => {
      const setting = new Setting(container).setName(t(name));
      if (description != null) setting.setDesc(t(description));
      setting.addToggle((component) => component.setValue(this.plugin.settings[key])
        .onChange((value) => this.updateControl(`views.${key}`, value)));
    };
    toggle("settings.live", "enableLivePreview");
    toggle("settings.reading", "enableReadingView");
    toggle("settings.source", "enableSourceMode", "settings.source.desc");
    toggle("settings.reveal", "revealOnActiveLine");
    new Setting(container).setName(t("settings.appearance")).setHeading();
    new Setting(container).setName(t("settings.opacity")).addSlider((slider) => slider
      .setLimits(0.15, 1, 0.05).setDynamicTooltip().setValue(this.plugin.settings.virtualOpacity)
      .onChange((value) => this.updateControl("views.virtualOpacity", value)));
    new Setting(container).setName(t("settings.gap")).addSlider((slider) => slider
      .setLimits(0, 2, 0.05).setDynamicTooltip().setValue(this.plugin.settings.virtualGapEm)
      .onChange((value) => this.updateControl("views.virtualGapEm", value)));
    new Setting(container).setName(t("settings.batch")).setHeading();
    renderBatchOperationsGuide(container, t);
    new Setting(container).setName(t("settings.excluded")).setDesc(t("settings.excluded.desc"))
      .addText((text) => text.setValue(this.plugin.settings.excludedFolders.join(", "))
        .onChange((value) => this.updateControl("views.excludedFolders", value)));
    new Setting(container).setName(t("settings.backupLimit")).addSlider((slider) => slider
      .setLimits(1, 100, 1).setDynamicTooltip().setValue(this.plugin.settings.batchBackupLimitMb)
      .onChange((value) => this.updateControl("views.batchBackupLimitMb", value)));
  }
}

function settingsErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 240);
  return typeof error === "string" ? error.slice(0, 240) : "";
}
