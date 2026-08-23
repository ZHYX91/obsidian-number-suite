import type { Setting, SettingDefinitionItem, SettingGroupItem } from "obsidian";

import type { Translate } from "../../config/i18n";
import { DEFAULT_SETTINGS } from "../../config/settings";
import type { SettingsControlKey } from "../../app/settings-control-contract";
import { renderSameFileReferenceGuide } from "./reference-guide";

export interface SettingsDefinitionContext {
  readonly t: Translate;
  readonly selectedSchemeName: () => string;
  readonly renderSaveStatus: (setting: Setting) => () => void;
  readonly renderSchemes: (container: HTMLElement) => void;
  readonly renderCleanupHistory: (container: HTMLElement) => void;
  readonly openResetModal: () => void;
}

export function createSettingDefinitions(
  context: SettingsDefinitionContext,
): SettingDefinitionItem<SettingsControlKey>[] {
  const { t } = context;
  return [
    {
      type: "page",
      name: t("settings.tab.general"),
      items: [
        saveStatusDefinition(context),
        { type: "group", heading: t("settings.general"), items: generalDefinitions(context) },
      ],
    },
    {
      type: "page",
      name: t("settings.tab.headings"),
      displayValue: context.selectedSchemeName,
      items: [
        saveStatusDefinition(context),
        { type: "group", heading: t("settings.headings"), items: headingDefinitions(context) },
        customDefinition(t("settings.scheme"), context.renderSchemes),
      ],
    },
    {
      type: "page",
      name: t("settings.tab.captions"),
      items: [saveStatusDefinition(context), {
        type: "group",
        heading: t("settings.captions"),
        items: [toggleDefinition("captions.showCaptionNumbers", t("settings.captions.enable"),
          t("settings.captions.enable.desc"), DEFAULT_SETTINGS.showCaptionNumbers)],
      }],
    },
    {
      type: "page",
      name: t("settings.tab.references"),
      items: [
        saveStatusDefinition(context),
        {
          type: "group",
          heading: t("settings.references"),
          items: [toggleDefinition("references.showCrossReferences", t("settings.references.enable"),
            t("settings.references.enable.desc"), DEFAULT_SETTINGS.showCrossReferences)],
        },
        customDefinition(
          t("settings.references.guide.title"),
          (container) => renderSameFileReferenceGuide(container, t),
        ),
      ],
    },
    {
      type: "page",
      name: t("settings.tab.notes"),
      items: [saveStatusDefinition(context), {
        type: "group",
        heading: t("settings.notes"),
        items: [toggleDefinition("notes.showNoteNumbers", t("settings.notes.enable"),
          t("settings.notes.enable.desc"), DEFAULT_SETTINGS.showNoteNumbers)],
      }],
    },
    {
      type: "page",
      name: t("settings.tab.cleanup"),
      items: [
        saveStatusDefinition(context),
        { type: "group", heading: t("settings.write"), items: cleanupDefinitions(t) },
        customDefinition(t("settings.scheme.history"), context.renderCleanupHistory),
      ],
    },
    {
      type: "page",
      name: t("settings.tab.views"),
      items: [saveStatusDefinition(context), ...viewDefinitions(t)],
    },
  ];
}

function generalDefinitions(
  context: SettingsDefinitionContext,
): SettingGroupItem<SettingsControlKey>[] {
  const { t } = context;
  return [
    dropdownDefinition(
      "general.language",
      t("settings.language"),
      t("settings.language.desc"),
      { auto: t("language.auto"), en: t("language.en"), zh: t("language.zh") },
      DEFAULT_SETTINGS.language,
    ),
    {
      name: t("settings.reset"),
      desc: t("settings.reset.desc"),
      render: (setting) => {
        setting.addButton((button) => {
          button
            .setButtonText(t("settings.reset.button"))
            .setWarning()
            .onClick(context.openResetModal);
        });
      },
    },
  ];
}

function headingDefinitions(
  context: SettingsDefinitionContext,
): SettingGroupItem<SettingsControlKey>[] {
  const { t } = context;
  return [
    toggleDefinition(
      "general.showVirtualNumbers",
      t("settings.showVirtual"),
      t("settings.showVirtual.desc"),
      DEFAULT_SETTINGS.showVirtualNumbers,
    ),
    toggleDefinition(
      "general.concealStoredNumbers",
      t("settings.concealStored"),
      t("settings.concealStored.desc"),
      DEFAULT_SETTINGS.concealStoredNumbers,
    ),
    {
      name: t("settings.noteOverrides"),
      desc: t("settings.noteOverrides.desc"),
      render: (setting) => {
        setting.settingEl.addClass("structured-numbering-note-overrides-help");
      },
    },
    dropdownDefinition(
      "general.missingLevelStrategy",
      t("settings.missing"),
      undefined,
      {
        "fill-one": t("missing.fill-one"),
        "current-only": t("missing.current-only"),
        skip: t("missing.skip"),
      },
      DEFAULT_SETTINGS.missingLevelStrategy,
    ),
  ];
}

function cleanupDefinitions(t: Translate): SettingGroupItem<SettingsControlKey>[] {
  return [
    toggleDefinition(
      "cleanup.writeMarkers",
      t("settings.markers"),
      t("settings.markers.desc"),
      DEFAULT_SETTINGS.writeMarkers,
    ),
    dropdownDefinition(
      "cleanup.cleanupScope",
      t("settings.cleanup"),
      t("settings.cleanup.desc"),
      {
        plugin: t("cleanup.plugin"),
        templates: t("cleanup.templates"),
        common: t("cleanup.common"),
      },
      DEFAULT_SETTINGS.cleanupScope,
    ),
    toggleDefinition(
      "cleanup.removeMultiplePrefixes",
      t("settings.multiple"),
      undefined,
      DEFAULT_SETTINGS.removeMultiplePrefixes,
    ),
    toggleDefinition(
      "cleanup.normalizeManualOnRenumber",
      t("settings.normalize"),
      undefined,
      DEFAULT_SETTINGS.normalizeManualOnRenumber,
    ),
  ];
}

function viewDefinitions(t: Translate): SettingDefinitionItem<SettingsControlKey>[] {
  return [
    {
      type: "group",
      heading: t("settings.views"),
      items: [
        toggleDefinition("views.enableLivePreview", t("settings.live"), undefined,
          DEFAULT_SETTINGS.enableLivePreview),
        toggleDefinition("views.enableReadingView", t("settings.reading"), undefined,
          DEFAULT_SETTINGS.enableReadingView),
        toggleDefinition("views.enableSourceMode", t("settings.source"), t("settings.source.desc"),
          DEFAULT_SETTINGS.enableSourceMode),
        toggleDefinition("views.revealOnActiveLine", t("settings.reveal"), undefined,
          DEFAULT_SETTINGS.revealOnActiveLine),
      ],
    },
    {
      type: "group",
      heading: t("settings.appearance"),
      items: [
        sliderDefinition("views.virtualOpacity", t("settings.opacity"),
          DEFAULT_SETTINGS.virtualOpacity, 0.15, 1, 0.05),
        sliderDefinition("views.virtualGapEm", t("settings.gap"),
          DEFAULT_SETTINGS.virtualGapEm, 0, 2, 0.05),
      ],
    },
    {
      type: "group",
      heading: t("settings.batch"),
      items: [
        {
          name: t("settings.excluded"),
          desc: t("settings.excluded.desc"),
          control: { type: "text", key: "views.excludedFolders", defaultValue: "" },
        },
        sliderDefinition("views.batchBackupLimitMb", t("settings.backupLimit"),
          DEFAULT_SETTINGS.batchBackupLimitMb, 1, 100, 1),
      ],
    },
  ];
}

function saveStatusDefinition(
  context: SettingsDefinitionContext,
): SettingGroupItem<SettingsControlKey> {
  return {
    name: context.t("settings.save.pending"),
    searchable: false,
    render: context.renderSaveStatus,
  };
}

function customDefinition(
  name: string,
  render: (container: HTMLElement) => void,
): SettingGroupItem<SettingsControlKey> {
  return {
    name,
    searchable: false,
    render: (setting) => {
      setting.settingEl.empty();
      setting.settingEl.addClass("structured-numbering-settings-custom-row");
      const body = setting.settingEl.createDiv({ cls: "structured-numbering-settings-custom-body" });
      render(body);
      return () => body.remove();
    },
  };
}

function dropdownDefinition(
  key: SettingsControlKey,
  name: string,
  desc: string | undefined,
  options: Record<string, string>,
  defaultValue: string,
): SettingGroupItem<SettingsControlKey> {
  return {
    name,
    ...(desc === undefined ? {} : { desc }),
    control: { type: "dropdown", key, options, defaultValue },
  };
}

function toggleDefinition(
  key: SettingsControlKey,
  name: string,
  desc: string | undefined,
  defaultValue: boolean,
): SettingGroupItem<SettingsControlKey> {
  return {
    name,
    ...(desc === undefined ? {} : { desc }),
    control: { type: "toggle", key, defaultValue },
  };
}

function sliderDefinition(
  key: SettingsControlKey,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
): SettingGroupItem<SettingsControlKey> {
  return { name, control: { type: "slider", key, defaultValue, min, max, step } };
}
