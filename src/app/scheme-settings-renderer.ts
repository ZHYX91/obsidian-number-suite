import { Setting, setIcon } from "obsidian";

import { type Translate } from "../config/i18n";
import { type NumberSuiteSettings } from "../config/settings";
import {
  BUILT_IN_SCHEMES,
  findMatchingBuiltInSchemeId,
  isBuiltInSchemeId,
} from "../core/schemes";
import { NUMBER_FORMATS, renderTemplate } from "../core/template-compiler";
import { inspectSchemeTemplates } from "../core/scheme-template-validation";
import { matchHeadingExclusion, normalizeExclusionTitle } from "../core/heading-exclusions";
import {
  BUILT_IN_SCHEME_IDS,
  HEADING_LEVEL_COUNT,
  type Counters,
  type CustomNumberingScheme,
  type HeadingExclusionRule,
  type ParsedHeading,
} from "../core/types";
import type { SettingsImpact } from "./settings-impact";

const PREVIEW_COUNTERS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as Counters;

type EditableScheme = Omit<CustomNumberingScheme, "templates" | "exclusions"> & {
  templates: string[];
  exclusions: HeadingExclusionRule[];
};

type SchemeCommit = (
  update: (settings: NumberSuiteSettings) => void,
  impact: SettingsImpact,
  immediate?: boolean,
  rerender?: boolean,
) => void;

function builtInName(id: string, t: Translate): string {
  return isBuiltInSchemeId(id) ? t(`scheme.${id}`) : id;
}

function newCustomId(settings: NumberSuiteSettings): string {
  const prefix = `custom-${Date.now().toString(36)}`;
  let id = prefix;
  let suffix = 1;
  while (settings.customSchemes.some((scheme) => scheme.id === id)) {
    id = `${prefix}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function archiveScheme(settings: NumberSuiteSettings, scheme: CustomNumberingScheme): void {
  const key = `${scheme.id}@${scheme.revision}`;
  if (settings.cleanupHistory.some((entry) => `${entry.schemeId}@${entry.revision}` === key)) return;
  settings.cleanupHistory.push({
    schemeId: scheme.id,
    schemeName: scheme.name,
    revision: scheme.revision,
    baseLevel: scheme.baseLevel,
    templates: [...scheme.templates],
  });
}

export function firstAvailableScheme(settings: NumberSuiteSettings, excluding?: string): string {
  const custom = settings.customSchemes.find((scheme) => scheme.id !== excluding);
  if (custom != null) return custom.id;
  const builtIn = BUILT_IN_SCHEME_IDS.find((id) => (
    id !== excluding && !settings.hiddenBuiltInSchemeIds.includes(id)
  ));
  if (builtIn != null) return builtIn;
  settings.hiddenBuiltInSchemeIds = settings.hiddenBuiltInSchemeIds
    .filter((id) => id !== "hierarchical-h2");
  return "hierarchical-h2";
}

export function selectedSchemeName(settings: NumberSuiteSettings, t: Translate): string {
  if (isBuiltInSchemeId(settings.selectedSchemeId)) return builtInName(settings.selectedSchemeId, t);
  const custom = settings.customSchemes.find((scheme) => scheme.id === settings.selectedSchemeId);
  return custom == null ? settings.selectedSchemeId : custom.name;
}

export class SchemeSettingsRenderer {
  constructor(
    private readonly getSettings: () => NumberSuiteSettings,
    private readonly commit: SchemeCommit,
    private readonly t: Translate,
    private readonly getActiveHeadings: () => readonly ParsedHeading[] = () => [],
  ) {}

  renderSchemes(container: HTMLElement): void {
    const t = this.t;
    new Setting(container).setName(t("settings.scheme")).setHeading();
    const settings = this.getSettings();
    const visibleBuiltIns = BUILT_IN_SCHEME_IDS.filter((id) => !settings.hiddenBuiltInSchemeIds.includes(id));
    new Setting(container)
      .setName(t("settings.scheme"))
      .setDesc(t("settings.scheme.desc"))
      .addDropdown((dropdown) => {
        for (const id of visibleBuiltIns) dropdown.addOption(id, builtInName(id, t));
        for (const scheme of settings.customSchemes) dropdown.addOption(scheme.id, scheme.name);
        return dropdown.setValue(settings.selectedSchemeId).onChange((value) => this.commit((next) => {
          next.selectedSchemeId = value;
        }, "display", true, true));
      })
      .addButton((button) => button.setButtonText(t("settings.scheme.add")).setCta().onClick(() => {
        this.commit((next) => {
          const scheme: CustomNumberingScheme = {
            id: newCustomId(next),
            name: `${t("settings.scheme.custom")} ${next.customSchemes.length + 1}`,
            revision: 1,
            baseLevel: 1,
            templates: ["{1.arabic}", "{1.arabic}.{2.arabic}", "", "", "", "", "", "", ""],
            exclusions: [],
          };
          next.customSchemes.push(scheme);
          next.selectedSchemeId = scheme.id;
        }, "display", true, true);
      }));
    this.renderPlaceholderHelp(container);
    for (const id of visibleBuiltIns) this.renderBuiltInScheme(container, id);
    for (const scheme of settings.customSchemes) this.renderCustomScheme(container, scheme);
    new Setting(container).setName(t("settings.scheme.hidden")).setHeading();
    if (settings.hiddenBuiltInSchemeIds.length === 0) {
      container.createEl("p", { cls: "setting-item-description", text: t("settings.scheme.noneHidden") });
    }
    for (const id of settings.hiddenBuiltInSchemeIds) {
      new Setting(container).setName(builtInName(id, t)).addButton((button) => button
        .setButtonText(t("settings.scheme.restore"))
        .onClick(() => this.commit((next) => {
          next.hiddenBuiltInSchemeIds = next.hiddenBuiltInSchemeIds.filter((hidden) => hidden !== id);
        }, "none", true, true)));
    }
  }

  renderCleanupHistory(container: HTMLElement): void {
    const t = this.t;
    new Setting(container).setName(t("settings.scheme.history"))
      .setDesc(t("settings.scheme.history.desc")).setHeading();
    const history = this.getSettings().cleanupHistory;
    if (history.length === 0) {
      container.createEl("p", { cls: "setting-item-description", text: t("settings.scheme.history.empty") });
      return;
    }
    for (const item of history) {
      new Setting(container).setName(`${item.schemeName} · v${item.revision}`)
        .setDesc(item.templates.filter((template) => template.length > 0).join(" · "));
    }
    new Setting(container).addButton((button) => button
      .setButtonText(t("settings.scheme.history.clear"))
      .setWarning()
      .onClick(() => this.commit((settings) => { settings.cleanupHistory = []; }, "display", true, true)));
  }

  private renderPlaceholderHelp(container: HTMLElement): void {
    const t = this.t;
    const guide = container.createDiv({ cls: "number-suite-settings-guide" });
    guide.setAttribute("role", "note");
    const heading = guide.createDiv({ cls: "number-suite-settings-guide-heading" });
    const icon = heading.createSpan({
      cls: "number-suite-settings-guide-icon",
      attr: { "aria-hidden": "true" },
    });
    setIcon(icon, "info");
    heading.createEl("strong", { text: t("settings.scheme.placeholder.title") });
    const body = guide.createDiv({ cls: "number-suite-settings-guide-body" });
    const syntax = body.createEl("p");
    syntax.append(`${t("settings.scheme.placeholder.syntax")} `);
    syntax.createEl("code", { text: "{1.arabic}" });
    const example = body.createDiv({ cls: "number-suite-settings-guide-example" });
    example.append(`${t("settings.scheme.placeholder.example")} `);
    example.createEl("code", { text: "{2.arabic}" });
    example.append(` → 3 · ${t("settings.scheme.placeholder.explanation")}`);
    body.createEl("p", { text: t("settings.scheme.placeholder.formats") });
    const list = body.createEl("ul", { cls: "number-suite-placeholder-formats" });
    for (const format of NUMBER_FORMATS) {
      const item = list.createEl("li");
      item.createEl("code", { text: `{1.${format}}` });
      item.appendText(` — ${t(`format.${format}`)}`);
    }
  }

  private renderBuiltInScheme(container: HTMLElement, id: typeof BUILT_IN_SCHEME_IDS[number]): void {
    const t = this.t;
    const scheme = BUILT_IN_SCHEMES[id];
    const details = container.createEl("details", { cls: "number-suite-scheme-card" });
    details.createEl("summary", { text: `${builtInName(id, t)} · ${t("settings.scheme.builtin")}` });
    this.renderReadOnlyTemplates(details, scheme.templates);
    const actions = new Setting(details);
    actions.settingEl.addClass("number-suite-scheme-actions");
    actions
      .addButton((button) => button.setButtonText(t("settings.scheme.copy")).onClick(() => {
        this.commit((settings) => {
          const copy: CustomNumberingScheme = {
            id: newCustomId(settings),
            name: `${builtInName(id, t)} ${t("settings.scheme.copySuffix")}`,
            revision: 1,
            baseLevel: scheme.baseLevel,
            templates: [...scheme.templates],
            exclusions: [],
          };
          settings.customSchemes.push(copy);
          settings.selectedSchemeId = copy.id;
        }, "display", true, true);
      }))
      .addButton((button) => {
        button.buttonEl.addClass("number-suite-scheme-remove");
        return button.setButtonText(t("settings.scheme.hide")).onClick(() => {
          this.commit((settings) => {
            if (!settings.hiddenBuiltInSchemeIds.includes(id)) settings.hiddenBuiltInSchemeIds.push(id);
            if (settings.selectedSchemeId === id) settings.selectedSchemeId = firstAvailableScheme(settings, id);
          }, "display", true, true);
        });
      });
  }

  private renderReadOnlyTemplates(container: HTMLElement, templates: readonly string[]): void {
    const t = this.t;
    const list = container.createDiv({ cls: "number-suite-readonly-templates" });
    for (let index = 0; index < HEADING_LEVEL_COUNT; index += 1) {
      const template = templates[index] ?? "";
      const row = list.createDiv({ cls: "number-suite-readonly-template" });
      row.createSpan({ cls: "number-suite-readonly-level", text: `H${index + 1}` });
      const body = row.createDiv({ cls: "number-suite-readonly-template-body" });
      if (template.length === 0) {
        body.createSpan({ cls: "number-suite-readonly-disabled", text: t("settings.scheme.disabled") });
      } else {
        body.createEl("code", { text: template });
        body.createSpan({
          cls: "number-suite-readonly-preview",
          text: `→ ${renderTemplate(template, PREVIEW_COUNTERS)}`,
        });
      }
    }
  }

  private renderCustomScheme(container: HTMLElement, scheme: CustomNumberingScheme): void {
    const t = this.t;
    const details = container.createEl("details", { cls: "number-suite-scheme-card" });
    details.open = this.getSettings().selectedSchemeId === scheme.id;
    const displayName = scheme.name;
    details.createEl("summary", { text: `${displayName} · ${t("settings.scheme.custom")}` });
    const matchingBuiltInId = findMatchingBuiltInSchemeId(scheme);
    if (matchingBuiltInId != null) {
      const note = details.createDiv({ cls: "number-suite-scheme-note" });
      note.setAttribute("role", "note");
      note.createEl("p", {
        text: t("settings.scheme.matchesBuiltin", { scheme: builtInName(matchingBuiltInId, t) }),
      });
    }
    const draft: EditableScheme = {
      ...scheme,
      name: displayName,
      templates: [...scheme.templates],
      exclusions: scheme.exclusions.map((rule) => ({ ...rule })),
    };
    new Setting(details).setName(t("settings.scheme.name")).addText((text) => text
      .setValue(draft.name)
      .onChange((value) => { draft.name = value.slice(0, 80); }));
    new Setting(details).setName(t("settings.scheme.base")).addDropdown((dropdown) => {
      for (let level = 1; level <= HEADING_LEVEL_COUNT; level += 1) {
        dropdown.addOption(String(level), `H${level}`);
      }
      return dropdown.setValue(String(draft.baseLevel)).onChange((value) => {
        draft.baseLevel = Number(value);
      });
    });
    const validation = details.createDiv({ cls: "number-suite-template-validation" });
    validation.setAttribute("role", "alert");
    const previewElements: HTMLElement[] = [];
    const updateValidation = (): boolean => {
      const invalidTemplate = inspectSchemeTemplates(draft.templates).length > 0;
      const normalizedTitles = draft.exclusions.map((rule) => normalizeExclusionTitle(rule.title));
      const invalidExclusions = normalizedTitles.some((title) => title.length === 0)
        || new Set(normalizedTitles).size !== normalizedTitles.length;
      validation.hidden = !invalidTemplate && !invalidExclusions;
      validation.textContent = invalidTemplate
        ? t("settings.scheme.invalid")
        : invalidExclusions ? t("settings.scheme.exclusions.invalid") : "";
      draft.templates.forEach((template, index) => {
        const preview = previewElements[index];
        if (preview != null) preview.textContent = template.length === 0
          ? t("settings.scheme.disabled")
          : t("settings.scheme.preview", { value: renderTemplate(template, PREVIEW_COUNTERS) });
      });
      return !invalidTemplate && !invalidExclusions && draft.name.trim().length > 0;
    };
    for (let index = 0; index < HEADING_LEVEL_COUNT; index += 1) {
      const preview = details.createDiv({ cls: "number-suite-template-preview" });
      previewElements.push(preview);
      new Setting(details).setName(`H${index + 1}`).addText((text) => text
        .setValue(draft.templates[index] ?? "")
        .onChange((value) => {
          draft.templates[index] = value.slice(0, 300);
          updateValidation();
        }));
    }
    new Setting(details)
      .setName(t("settings.scheme.exclusions"))
      .setDesc(t("settings.scheme.exclusions.desc"))
      .setHeading();
    const exclusionList = details.createDiv({ cls: "number-suite-exclusion-list" });
    const exclusionPreview = details.createEl("p", {
      cls: "setting-item-description number-suite-exclusion-preview",
    });
    const updateExclusionPreview = (): void => {
      const matches = this.getActiveHeadings().filter((heading) => matchHeadingExclusion(heading, draft) != null);
      exclusionPreview.textContent = matches.length === 0
        ? t("settings.scheme.exclusions.noMatches")
        : t("settings.scheme.exclusions.matches", {
          count: String(matches.length),
          titles: matches.slice(0, 5).map((heading) => heading.content).join(" · "),
        });
    };
    const renderExclusions = (): void => {
      exclusionList.empty();
      draft.exclusions.forEach((rule, index) => {
        new Setting(exclusionList)
          .addText((text) => text
            .setPlaceholder(t("settings.scheme.exclusions.placeholder"))
            .setValue(rule.title)
            .onChange((value) => {
              const currentRule = draft.exclusions[index] ?? rule;
              draft.exclusions[index] = { ...currentRule, title: value.slice(0, 200) };
              updateValidation();
              updateExclusionPreview();
            }))
          .addDropdown((dropdown) => dropdown
            .addOption("subtree", t("settings.scheme.exclusions.subtree"))
            .addOption("heading", t("settings.scheme.exclusions.heading"))
            .setValue(rule.scope)
            .onChange((value) => {
              const currentRule = draft.exclusions[index] ?? rule;
              draft.exclusions[index] = {
                ...currentRule,
                scope: value === "heading" ? "heading" : "subtree",
              };
              updateValidation();
              updateExclusionPreview();
            }))
          .addButton((button) => button
            .setIcon("trash-2")
            .setTooltip(t("settings.scheme.exclusions.remove"))
            .onClick(() => {
              draft.exclusions.splice(index, 1);
              renderExclusions();
              updateValidation();
              updateExclusionPreview();
            }));
      });
    };
    new Setting(details).addButton((button) => button
      .setButtonText(t("settings.scheme.exclusions.add"))
      .onClick(() => {
        draft.exclusions.push({ title: "", scope: "subtree" });
        renderExclusions();
        updateValidation();
        updateExclusionPreview();
      }));
    renderExclusions();
    updateExclusionPreview();
    updateValidation();
    new Setting(details)
      .addButton((button) => button.setButtonText(t("settings.scheme.save")).setCta().onClick(() => {
        if (!updateValidation()) return;
        this.commit((settings) => {
          const current = settings.customSchemes.find((item) => item.id === scheme.id);
          if (current == null) return;
          const changed = current.name !== draft.name.trim()
            || current.baseLevel !== draft.baseLevel
            || current.templates.some((template, index) => template !== draft.templates[index])
            || JSON.stringify(current.exclusions) !== JSON.stringify(draft.exclusions);
          if (!changed) return;
          archiveScheme(settings, current);
          Object.assign(current, {
            name: draft.name.trim(),
            baseLevel: draft.baseLevel,
            templates: [...draft.templates],
            exclusions: draft.exclusions.map((rule) => ({
              title: normalizeExclusionTitle(rule.title),
              scope: rule.scope,
            })),
            revision: current.revision + 1,
          });
        }, "display", true, true);
      }))
      .addButton((button) => button.setButtonText(t("settings.scheme.delete")).setWarning().onClick(() => {
        this.commit((settings) => {
          const current = settings.customSchemes.find((item) => item.id === scheme.id);
          if (current != null) archiveScheme(settings, current);
          settings.customSchemes = settings.customSchemes.filter((item) => item.id !== scheme.id);
          if (settings.selectedSchemeId === scheme.id) {
            settings.selectedSchemeId = firstAvailableScheme(settings, scheme.id);
          }
        }, "display", true, true);
      }));
  }
}
