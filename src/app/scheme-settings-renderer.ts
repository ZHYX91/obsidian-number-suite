import { AccessibleSetting as Setting } from "../ui/accessible-setting";
import { setIcon } from "obsidian";

import { type Translate } from "../config/i18n";
import { SCHEME_TEMPLATE_LIMIT, type NumberSuiteSettings } from "../config/settings";
import {
  BUILT_IN_SCHEMES,
  findMatchingBuiltInSchemeId,
  isBuiltInSchemeId,
} from "../core/schemes";
import { compileTemplate, NUMBER_FORMATS, renderCompiledTemplate, separatorBeforeTitle } from "../core/template-compiler";
import { resolvedUiLocale } from "../config/i18n";
import { recommendedSchemeForLocale } from "../config/recommended-schemes";
import { editScheme, normalizedScheme, sameSchemeFields, schemeDraftError, type EditableScheme } from "./scheme-editor-draft";
import { matchHeadingExclusion } from "../core/heading-exclusions";
import {
  BUILT_IN_SCHEME_IDS,
  HEADING_LEVEL_COUNT,
  type Counters,
  type CustomNumberingScheme,
  type ParsedHeading,
} from "../core/types";
import type { SettingsImpact } from "./settings-impact";

// Every preview uses the first counter value for each heading level.
// This is a format sample, never the document's actual numbering state.
const PREVIEW_COUNTERS = [1, 1, 1, 1, 1, 1, 1, 1, 1] as Counters;

/** Shared preview for built-in and editable H1–H9 templates. Never writes a note. */
export function renderSchemeTemplatePreview(container: HTMLElement, template: string, t: Translate): void {
  container.empty();
  container.removeClass("number-suite-scheme-example");
  if (template.trim().length === 0) {
    container.setText(t("settings.scheme.disabled"));
    return;
  }
  if (template.length > SCHEME_TEMPLATE_LIMIT) {
    container.setText("—");
    return;
  }
  const compiled = compileTemplate(template);
  const value = compiled.diagnostics.length === 0 ? renderCompiledTemplate(compiled, PREVIEW_COUNTERS) : "";
  if (value.length === 0) {
    // The validation message beside the editor explains an invalid template.
    container.setText("—");
    return;
  }
  const heading = t("settings.scheme.preview.heading");
  container.addClass("number-suite-scheme-example");
  const styled = container.createSpan({ cls: "number-suite-scheme-styled-preview" });
  styled.createSpan({
    cls: "number-suite-heading-number number-suite-scheme-example-number",
    text: value,
  });
  styled.createSpan({ cls: "number-suite-scheme-example-heading", text: heading });
  const written = container.createSpan({ cls: "number-suite-scheme-write-preview" });
  written.createSpan({ text: t("settings.scheme.writeExample") });
  written.createEl("code", {
    text: value + separatorBeforeTitle(value, compiled.separator, heading) + heading,
    attr: { dir: "auto" },
  });
}

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
    id !== excluding && !settings.disabledBuiltInSchemeIds.includes(id)
  ));
  if (builtIn != null) return builtIn;
  settings.disabledBuiltInSchemeIds = settings.disabledBuiltInSchemeIds
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
    private readonly drafts = new Map<string, EditableScheme>(),
  ) {}

  renderSchemes(container: HTMLElement): void {
    const t = this.t;
    new Setting(container).setName(t("settings.scheme")).setHeading();
    const settings = this.getSettings();
    for (const id of this.drafts.keys()) {
      if (!settings.customSchemes.some(scheme => scheme.id === id)) this.drafts.delete(id);
    }
    const enabledBuiltIns = BUILT_IN_SCHEME_IDS.filter((id) => !settings.disabledBuiltInSchemeIds.includes(id));
    const picker = new Setting(container);
    picker.settingEl.addClass("number-suite-scheme-picker");
    picker
      .setName(t("settings.scheme"))
      .setDesc(t("settings.scheme.desc"))
      .addDropdown((dropdown) => {
        for (const id of enabledBuiltIns) dropdown.addOption(id, builtInName(id, t));
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
    const suggestion = recommendedSchemeForLocale(resolvedUiLocale(settings.language));
    if (suggestion !== settings.selectedSchemeId
        && !settings.disabledBuiltInSchemeIds.includes(suggestion)) {
      new Setting(container)
        .setName(t("settings.scheme.suggestion", { scheme: builtInName(suggestion, t) }))
        .setDesc(t("settings.scheme.suggestion.desc"))
        .addButton((button) => button
          .setButtonText(t("settings.scheme.useSuggestion"))
          .onClick(() => this.commit((next) => {
            next.selectedSchemeId = suggestion;
          }, "display", true, true)));
    }
    this.renderPlaceholderHelp(container);
    const canDisable = enabledBuiltIns.length + settings.customSchemes.length > 1;
    for (const id of enabledBuiltIns) this.renderBuiltInScheme(container, id, canDisable);
    for (const scheme of settings.customSchemes) this.renderCustomScheme(container, scheme);
    new Setting(container).setName(t("settings.scheme.disabledList"))
      .setDesc(t("settings.scheme.disabledList.desc")).setHeading();
    if (settings.disabledBuiltInSchemeIds.length === 0) {
      container.createEl("p", { cls: "setting-item-description", text: t("settings.scheme.noneDisabled") });
    }
    for (const id of settings.disabledBuiltInSchemeIds) {
      new Setting(container).setName(builtInName(id, t)).addButton((button) => button
        .setButtonText(t("settings.scheme.enable"))
        .onClick(() => this.commit((next) => {
          next.disabledBuiltInSchemeIds = next.disabledBuiltInSchemeIds.filter((disabled) => disabled !== id);
        }, "display", true, true)));
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
    const guide = container.createDiv({ cls: "number-suite-settings-guide number-suite-placeholder-guide" });
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
    example.createSpan({
      cls: "number-suite-placeholder-explanation",
      text: t("settings.scheme.placeholder.explanation"),
    });
    body.createEl("p", { text: t("settings.scheme.placeholder.formats") });
    const list = body.createEl("ul", { cls: "number-suite-placeholder-formats" });
    for (const format of NUMBER_FORMATS) {
      const item = list.createEl("li");
      item.createEl("code", { text: `{1.${format}}` });
      item.appendText(` — ${t(`format.${format}`)}`);
    }
  }

  private renderBuiltInScheme(container: HTMLElement, id: typeof BUILT_IN_SCHEME_IDS[number], canDisable: boolean): void {
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
        return button.setButtonText(t("settings.scheme.disable")).setDisabled(!canDisable).onClick(() => {
          this.commit((settings) => {
            if (!settings.disabledBuiltInSchemeIds.includes(id)) settings.disabledBuiltInSchemeIds.push(id);
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
      if (template.trim().length === 0) {
        body.createSpan({ cls: "number-suite-readonly-disabled", text: t("settings.scheme.disabled") });
      } else {
        body.createEl("code", { text: template });
        const preview = body.createSpan({ cls: "number-suite-readonly-preview" });
        renderSchemeTemplatePreview(preview, template, t);
      }
    }
  }

  private renderCustomScheme(
    container: HTMLElement,
    scheme: CustomNumberingScheme,
    details = container.createEl("details", { cls: "number-suite-scheme-card" }),
  ): void {
    const t = this.t;
    details.empty();
    details.open = details.open || this.drafts.has(scheme.id) || this.getSettings().selectedSchemeId === scheme.id;
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
    const draft = this.drafts.get(scheme.id) ?? editScheme(scheme);
    const currentScheme = (): CustomNumberingScheme =>
      this.getSettings().customSchemes.find(saved => saved.id === scheme.id) ?? scheme;
    let saveButton: HTMLButtonElement;
    let discardButton: HTMLButtonElement;
    const updateValidation = (): boolean => {
      const saved = currentScheme();
      const dirty = !sameSchemeFields(draft, saved);
      if (dirty) this.drafts.set(scheme.id, draft);
      else {
        this.drafts.delete(scheme.id);
        draft.revision = saved.revision;
      }
      const message = schemeDraftError(draft, saved, t);
      validation.hidden = message.length === 0;
      validation.textContent = message;
      saveButton.disabled = !dirty || message.length > 0;
      discardButton.hidden = !dirty;
      return !saveButton.disabled;
    };
    new Setting(details).setName(t("settings.scheme.name")).addText((text) => text
      .setValue(draft.name)
      .onChange((value) => {
        draft.name = value;
        updateValidation();
      }));
    new Setting(details).setName(t("settings.scheme.base")).addDropdown((dropdown) => {
      for (let level = 1; level <= HEADING_LEVEL_COUNT; level += 1) {
        dropdown.addOption(String(level), `H${level}`);
      }
      return dropdown.setValue(String(draft.baseLevel)).onChange((value) => {
        draft.baseLevel = Number(value);
        updateValidation();
      });
    });
    const validation = details.createDiv({ cls: "number-suite-template-validation" });
    validation.setAttribute("role", "alert");
    for (let index = 0; index < HEADING_LEVEL_COUNT; index += 1) {
      const row = new Setting(details).setName(`H${index + 1}`);
      const preview = details.createDiv({ cls: "number-suite-template-preview" });
      renderSchemeTemplatePreview(preview, draft.templates[index] ?? "", t);
      row.addText((text) => text
        .setValue(draft.templates[index] ?? "")
        .onChange((value) => {
          // The prefix matcher caches compiled patterns by immutable template-list identity.
          const templates = [...draft.templates];
          templates[index] = value;
          draft.templates = templates;
          renderSchemeTemplatePreview(preview, value, t);
          updateValidation();
          updateExclusionPreview();
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
      exclusionPreview.hidden = draft.templates.some(template => template.length > SCHEME_TEMPLATE_LIMIT);
      if (exclusionPreview.hidden) return;
      const matches = draft.exclusions.length === 0 ? []
        : this.getActiveHeadings().filter((heading) => matchHeadingExclusion(heading, draft) != null);
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
        const row = new Setting(exclusionList)
          .addText((text) => text
            .setPlaceholder(t("settings.scheme.exclusions.placeholder"))
            .setValue(rule.title)
            .onChange((value) => {
              const currentRule = draft.exclusions[index] ?? rule;
              draft.exclusions[index] = { ...currentRule, title: value };
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
        row.settingEl.querySelector("input")?.setAttribute("aria-label", `${t("settings.scheme.exclusions")} ${index + 1}`);
        row.settingEl.querySelector("select")?.setAttribute("aria-label", `${t("settings.scheme.exclusions")} ${index + 1} · ${t("batch.scope.label")}`);
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
    const actions = new Setting(details);
    actions.settingEl.addClass("number-suite-scheme-actions");
    actions
      .addButton((button) => {
        saveButton = button.buttonEl;
        return button.setButtonText(t("settings.scheme.save")).setCta().onClick(() => {
          if (!updateValidation()) return;
          this.commit((settings) => {
            const current = settings.customSchemes.find((item) => item.id === scheme.id);
            if (current == null || current.revision !== draft.revision) return;
            const next = normalizedScheme(draft);
            this.drafts.delete(scheme.id);
            if (sameSchemeFields(current, next)) return;
            archiveScheme(settings, current);
            Object.assign(current, next, { revision: current.revision + 1 });
          }, "display", true, true);
        });
      })
      .addButton((button) => {
        discardButton = button.buttonEl;
        return button.setButtonText(t("settings.scheme.discard")).onClick(() => {
          this.drafts.delete(scheme.id);
          this.renderCustomScheme(container, currentScheme(), details);
          details.querySelector<HTMLInputElement>("input")?.focus();
        });
      })
      .addButton((button) => button.setButtonText(t("settings.scheme.delete")).setWarning().onClick(() => {
        this.commit((settings) => {
          const current = settings.customSchemes.find((item) => item.id === scheme.id);
          if (current != null) archiveScheme(settings, current);
          this.drafts.delete(scheme.id);
          settings.customSchemes = settings.customSchemes.filter((item) => item.id !== scheme.id);
          if (settings.selectedSchemeId === scheme.id) {
            settings.selectedSchemeId = firstAvailableScheme(settings, scheme.id);
          }
        }, "display", true, true);
      }));
    updateValidation();
  }
}
