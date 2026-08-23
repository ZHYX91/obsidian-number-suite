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
  type StructuredNumberingSettings,
} from "../config/settings";
import type { SettingsSaveStatus } from "../config/settings-save-coordinator";
import { createSettingDefinitions } from "../ui/settings/definitions";
import { createSettingsTabs, type SettingsTabId } from "../ui/settings/tabs";
import type StructuredNumberingPlugin from "./plugin";
import { SchemeSettingsRenderer, selectedSchemeName } from "./scheme-settings-renderer";
import { parseAtxHeadings } from "../core/heading-parser";
import type { SettingsImpact } from "./settings-impact";
import {
  applySettingsControlValue,
  getSettingsControlValue,
  isSettingsControlKey,
  type SettingsControlKey,
} from "./settings-control-contract";

// Keep the established seven-tab surface as the active UX. The tested Obsidian 1.13
// definitions remain available behind this explicit switch for a future native-page transition.
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
        .setDestructive()
        .onClick(() => {
          this.confirm();
          this.close();
        }));
  }
}

export class StructuredNumberingSettingTab extends PluginSettingTab {
  private activeTab: SettingsTabId = "general";
  private cleanup: (() => void) | null = null;
  private imperativeVisible = false;

  constructor(app: App, private readonly plugin: StructuredNumberingPlugin) {
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
        setting.settingEl.addClass("structured-numbering-settings-save-row");
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
    if (!isSettingsControlKey(key)) throw new Error(`Unsupported Structured Numbering setting: ${key}`);
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
      console.error(`Structured Numbering: failed to update setting ${key}`, error);
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
    containerEl.addClass("structured-numbering-settings");
    new Setting(containerEl).setName(t("settings.title")).setHeading();
    const statusCleanup = this.renderSaveStatus(containerEl, t);
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
      const target = this.containerEl.querySelector<HTMLElement>(`#structured-numbering-settings-tab-${id}`);
      target?.focus();
    });
    if (this.activeTab === "general") this.renderGeneral(layout.panel, t);
    else if (this.activeTab === "headings") this.renderHeadings(layout.panel, t);
    else if (this.activeTab === "captions") this.renderCaptions(layout.panel, t);
    else if (this.activeTab === "references") this.renderReferences(layout.panel, t);
    else if (this.activeTab === "notes") this.renderNotes(layout.panel, t);
    else if (this.activeTab === "cleanup") this.renderCleanup(layout.panel, t);
    else this.renderViews(layout.panel, t);
    this.cleanup = () => {
      layout.cleanup();
      statusCleanup();
      containerEl.removeClass("structured-numbering-settings");
    };
  }

  private openResetModal(t: Translate): void {
    new ResetSettingsModal(this.app, t, () => {
      void this.plugin.saveSettings(cloneSettings(DEFAULT_SETTINGS), "all")
        .then(() => this.refreshSurface())
        .catch((error: unknown) => {
          console.error("Structured Numbering: failed to reset settings", error);
        });
    }).open();
  }

  private refreshSurface(): void {
    if (this.imperativeVisible) {
      this.display();
      return;
    }
    this.update();
  }

  private renderSaveStatus(container: HTMLElement, t: Translate, hideContainer = false): () => void {
    const row = container.createDiv({ cls: "structured-numbering-settings-save-status" });
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
      row.setAttribute("role", status.state === "pending" ? "alert" : "status");
      row.setAttribute("aria-live", status.state === "pending" ? "assertive" : "polite");
      const errorDetail = status.state === "pending" ? settingsErrorMessage(status.error) : "";
      message.textContent = status.state === "scheduled"
        ? t("settings.save.scheduled")
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

  private commit(
    update: (settings: StructuredNumberingSettings) => void,
    impact: SettingsImpact,
    immediate = false,
    rerender = false,
  ): void {
    const next = cloneSettings(this.plugin.settings);
    update(next);
    if (immediate) {
      void this.plugin.saveSettings(next, impact).catch((error: unknown) => {
        console.error("Structured Numbering: failed to save settings", error);
      });
    } else {
      this.plugin.scheduleSettings(next, impact);
    }
    if (rerender) this.refreshSurface();
  }

  private renderGeneral(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.general")).setHeading();
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
      .addButton((button) => button.setButtonText(t("settings.reset.button")).setDestructive().onClick(() => {
        this.openResetModal(t);
      }));
  }

  private renderHeadings(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.headings")).setHeading();
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
    const noteOverridesHelp = new Setting(container)
      .setName(t("settings.noteOverrides"))
      .setDesc(t("settings.noteOverrides.desc"));
    noteOverridesHelp.settingEl.addClass("structured-numbering-note-overrides-help");
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
    new Setting(container).setName(t("settings.captions")).setHeading();
    new Setting(container).setName(t("settings.captions.enable"))
      .setDesc(t("settings.captions.enable.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showCaptionNumbers)
        .onChange((value) => this.updateControl("captions.showCaptionNumbers", value)));
  }

  private renderReferences(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.references")).setHeading();
    new Setting(container).setName(t("settings.references.enable"))
      .setDesc(t("settings.references.enable.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showCrossReferences)
        .onChange((value) => this.updateControl("references.showCrossReferences", value)));
  }

  private renderNotes(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.notes")).setHeading();
    new Setting(container).setName(t("settings.notes.enable"))
      .setDesc(t("settings.notes.enable.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showNoteNumbers)
        .onChange((value) => this.updateControl("notes.showNoteNumbers", value)));
  }

  private renderCleanup(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.write")).setHeading();
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
      .setLimits(0.15, 1, 0.05).setValue(this.plugin.settings.virtualOpacity)
      .onChange((value) => this.updateControl("views.virtualOpacity", value)));
    new Setting(container).setName(t("settings.gap")).addSlider((slider) => slider
      .setLimits(0, 2, 0.05).setValue(this.plugin.settings.virtualGapEm)
      .onChange((value) => this.updateControl("views.virtualGapEm", value)));
    new Setting(container).setName(t("settings.batch")).setHeading();
    new Setting(container).setName(t("settings.excluded")).setDesc(t("settings.excluded.desc"))
      .addText((text) => text.setValue(this.plugin.settings.excludedFolders.join(", "))
        .onChange((value) => this.updateControl("views.excludedFolders", value)));
    new Setting(container).setName(t("settings.backupLimit")).addSlider((slider) => slider
      .setLimits(1, 100, 1).setValue(this.plugin.settings.batchBackupLimitMb)
      .onChange((value) => this.updateControl("views.batchBackupLimitMb", value)));
  }
}

function settingsErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 240);
  return typeof error === "string" ? error.slice(0, 240) : "";
}
