import type { Setting, SettingDefinitionItem, SettingGroupItem } from "obsidian";

import type { Translate } from "../../config/i18n";
import { DEFAULT_SETTINGS } from "../../config/settings";
import type { SettingsControlKey } from "../../app/settings-control-contract";
import { renderNoteNumberingGuide } from "./note-guide";
import { renderNoteOverridesGuide } from "./note-overrides-guide";
import { renderSameFileReferenceGuide } from "./reference-guide";
import {
  renderBatchOperationsGuide,
  renderCaptionNumberingGuide,
  renderFileOperationsGuide,
  renderHeadingDisplayGuide,
} from "./usage-guides";

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
        ...generalDefinitions(context),
      ],
    },
    {
      type: "page",
      name: t("settings.tab.headings"),
      displayValue: context.selectedSchemeName,
      items: [
        saveStatusDefinition(context),
        ...headingDefinitions(context),
        customDefinition(t("settings.scheme"), context.renderSchemes),
      ],
    },
    {
      type: "page",
      name: t("settings.tab.captions"),
      items: [
        saveStatusDefinition(context),
        toggleDefinition("captions.showCaptionNumbers", t("settings.captions.enable"),
          t("settings.captions.enable.desc"), DEFAULT_SETTINGS.showCaptionNumbers),
        customDefinition(
          t("settings.captions.guide.title"),
          (container) => renderCaptionNumberingGuide(container, t),
        ),
        {
          type: "group",
          heading: t("settings.captions.placement"),
          items: [
            dropdownDefinition("captions.figurePlacement", t("settings.captions.placement.figure"),
              undefined, captionPlacementOptions(t), DEFAULT_SETTINGS.figureCaptionPlacement),
            dropdownDefinition("captions.tablePlacement", t("settings.captions.placement.table"),
              undefined, captionPlacementOptions(t), DEFAULT_SETTINGS.tableCaptionPlacement),
            dropdownDefinition("captions.equationPlacement", t("settings.captions.placement.equation"),
              undefined, captionPlacementOptions(t), DEFAULT_SETTINGS.equationCaptionPlacement),
            dropdownDefinition("captions.codePlacement", t("settings.captions.placement.code"),
              undefined, captionPlacementOptions(t), DEFAULT_SETTINGS.codeCaptionPlacement),
            toggleDefinition("captions.showImageCaptionTooltips", t("settings.captions.imageTooltip"),
              t("settings.captions.imageTooltip.desc"), DEFAULT_SETTINGS.showImageCaptionTooltips),
          ],
        },
        {
          type: "group",
          heading: t("settings.captions.alignment"),
          items: [
            toggleDefinition("captions.centerFigure", t("settings.captions.center.figure"),
              undefined, DEFAULT_SETTINGS.centerFigureCaptions),
            toggleDefinition("captions.centerTable", t("settings.captions.center.table"),
              undefined, DEFAULT_SETTINGS.centerTableCaptions),
            toggleDefinition("captions.centerEquation", t("settings.captions.center.equation"),
              undefined, DEFAULT_SETTINGS.centerEquationCaptions),
            toggleDefinition("captions.centerCode", t("settings.captions.center.code"),
              undefined, DEFAULT_SETTINGS.centerCodeCaptions),
          ],
        },
      ],
    },
    {
      type: "page",
      name: t("settings.tab.references"),
      items: [
        saveStatusDefinition(context),
        toggleDefinition("references.showCrossReferences", t("settings.references.enable"),
          t("settings.references.enable.desc"), DEFAULT_SETTINGS.showCrossReferences),
        customDefinition(
          t("settings.references.guide.title"),
          (container) => renderSameFileReferenceGuide(container, t),
        ),
      ],
    },
    {
      type: "page",
      name: t("settings.tab.notes"),
      items: [
        saveStatusDefinition(context),
        toggleDefinition("notes.showNoteNumbers", t("settings.notes.enable"),
          t("settings.notes.enable.desc"), DEFAULT_SETTINGS.showNoteNumbers),
        dropdownDefinition(
          "notes.displayMode",
          t("settings.notes.display"),
          t("settings.notes.display.desc"),
          {
            formatted: t("settings.notes.display.formatted"),
            source: t("settings.notes.display.source"),
          },
          DEFAULT_SETTINGS.noteDisplayMode,
        ),
        customDefinition(
          t("settings.notes.guide.title"),
          (container) => renderNoteNumberingGuide(container, t),
        ),
      ],
    },
    {
      type: "page",
      name: t("settings.tab.cleanup"),
      items: [
        saveStatusDefinition(context),
        customDefinition(
          t("settings.operations.guide.title"),
          (container) => renderFileOperationsGuide(container, t),
        ),
        ...cleanupDefinitions(t),
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

function captionPlacementOptions(t: Translate): Record<string, string> {
  return {
    above: t("settings.captions.placement.above"),
    below: t("settings.captions.placement.below"),
  };
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
    dropdownDefinition(
      "general.concealScope",
      t("settings.concealScope"),
      t("settings.concealScope.desc"),
      {
        plugin: t("conceal.plugin"),
        templates: t("conceal.templates"),
      },
      DEFAULT_SETTINGS.concealScope,
    ),
    customDefinition(
      t("settings.headings.guide.title"),
      (container) => renderHeadingDisplayGuide(container, t),
    ),
    customDefinition(
      t("settings.noteOverrides.guide.title"),
      (container) => renderNoteOverridesGuide(container, t, "settings"),
    ),
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
    customDefinition(
      t("settings.batch.guide.title"),
      (container) => renderBatchOperationsGuide(container, t),
    ),
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
      setting.settingEl.addClass("number-suite-settings-custom-row");
      const body = setting.settingEl.createDiv({ cls: "number-suite-settings-custom-body" });
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
