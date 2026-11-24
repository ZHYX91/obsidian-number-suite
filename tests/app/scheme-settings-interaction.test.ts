// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  Setting: class {
    readonly settingEl: HTMLElement;
    constructor(container: HTMLElement) {
      this.settingEl = container.createDiv();
    }
    setName(name: string): this { this.settingEl.dataset.name = name; return this; }
    setDesc(): this { return this; }
    setHeading(): this { return this; }
    addText(configure: (control: unknown) => void): this {
      const input = this.settingEl.createEl("input");
      const control = {
        setValue(value: string) { input.value = value; return control; },
        setPlaceholder(value: string) { input.placeholder = value; return control; },
        onChange(callback: (value: string) => void) {
          input.addEventListener("input", () => callback(input.value));
          return control;
        },
      };
      configure(control);
      return this;
    }
    addDropdown(configure: (control: unknown) => void): this {
      const select = this.settingEl.createEl("select");
      const control = {
        addOption(value: string, label: string) {
          const option = select.createEl("option", { text: label });
          option.value = value;
          return control;
        },
        setValue(value: string) { select.value = value; return control; },
        onChange(callback: (value: string) => void) {
          select.addEventListener("change", () => callback(select.value));
          return control;
        },
      };
      configure(control);
      return this;
    }
    addButton(configure: (control: unknown) => void): this {
      const buttonEl = this.settingEl.createEl("button");
      const control = {
        buttonEl,
        setButtonText(value: string) { buttonEl.textContent = value; return control; },
        setDisabled(value: boolean) { buttonEl.disabled = value; return control; },
        setIcon() { return control; },
        setTooltip() { return control; },
        setCta() { return control; },
        setWarning() { return control; },
        onClick(callback: () => void) { buttonEl.addEventListener("click", callback); return control; },
      };
      configure(control);
      return this;
    }
  },
}));

import { SchemeSettingsRenderer } from "../../src/app/scheme-settings-renderer";
import { cloneSettings, DEFAULT_SETTINGS, type NumberSuiteSettings } from "../../src/config/settings";
import { createTranslator } from "../../src/config/i18n";
import type { EditableScheme } from "../../src/app/scheme-editor-draft";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { BUILT_IN_SCHEME_IDS } from "../../src/core/types";
import { installDomFixture } from "../ui/dom-fixture";

function editInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function editorFixture() {
  const settings = cloneSettings({
    ...DEFAULT_SETTINGS,
    selectedSchemeId: "custom-alpha",
    customSchemes: ["alpha", "beta"].map(name => ({
      id: "custom-" + name, name, revision: 1, baseLevel: 1,
      templates: ["{1.arabic}", "", "", "", "", "", "", "", ""], exclusions: [],
    })),
  });
  const drafts = new Map<string, EditableScheme>();
  const host = document.createElement("div");
  const headings = parseAtxHeadings("# Section 3: References");
  let t = createTranslator("en");
  function render(language: "en" | "zh" = "en"): void {
    t = createTranslator(language);
    host.empty();
    new SchemeSettingsRenderer(() => settings, update => {
      update(settings);
      render(language);
    }, t, () => headings, drafts).renderSchemes(host);
  }
  render();
  const card = (name: string): HTMLDetailsElement =>
    [...host.querySelectorAll("details")].find(item => item.querySelector("summary")?.textContent?.startsWith(name + " ·"))!;
  const input = (name: string, label: string): HTMLInputElement =>
    card(name).querySelector<HTMLInputElement>(`[data-name="${label}"] input`)!;
  const button = (name: string, label: string): HTMLButtonElement =>
    [...card(name).querySelectorAll("button")].find(item => item.textContent === label)!;
  return { settings, host, render, card, input, button, translate: () => t };
}

describe("custom scheme editing", () => {
  beforeEach(() => {
    installDomFixture();
    Object.assign(HTMLElement.prototype, {
      appendText(this: HTMLElement, text: string) { this.append(text); },
    });
  });

  it("keeps independent drafts across a language switch and unrelated disable, save and discard", () => {
    const f = editorFixture();
    editInput(f.input("alpha", "Scheme name"), "draft alpha");
    editInput(f.input("beta", "H1"), "{1.chinese_lower}、   ");
    f.host.querySelector<HTMLButtonElement>(".number-suite-scheme-remove")!.click();
    f.render("zh");
    const t = f.translate();
    expect(f.input("alpha", t("settings.scheme.name")).value).toBe("draft alpha");
    expect(f.card("beta").open).toBe(true);
    expect(f.input("beta", "H1").value).toBe("{1.chinese_lower}、   ");
    f.button("beta", t("settings.scheme.save")).click();
    expect(f.settings.customSchemes.map(scheme => [scheme.name, scheme.revision])).toEqual([["alpha", 1], ["beta", 2]]);
    expect(f.settings.customSchemes[1]!.templates[0]).toBe("{1.chinese_lower}、   ");
    expect(f.input("alpha", t("settings.scheme.name")).value).toBe("draft alpha");
    f.button("alpha", t("settings.scheme.discard")).click();
    expect(f.input("alpha", t("settings.scheme.name")).value).toBe("alpha");
    expect(f.settings.cleanupHistory.map(entry => entry.schemeId)).toEqual(["custom-beta"]);
  });

  it("updates exclusion matches as soon as the template changes", () => {
    const f = editorFixture();
    const t = f.translate();
    f.button("alpha", t("settings.scheme.exclusions.add")).click();
    editInput(f.card("alpha").querySelector<HTMLInputElement>(".number-suite-exclusion-list input")!, "References");
    const preview = f.card("alpha").querySelector(".number-suite-exclusion-preview")!;
    expect(preview.textContent).toBe(t("settings.scheme.exclusions.noMatches"));
    editInput(f.input("alpha", "H1"), "Section {1.arabic}: ");
    expect(preview.textContent).toContain("Section 3: References");
    editInput(f.input("alpha", "H1"), "{1.arabic}");
    expect(preview.textContent).toBe(t("settings.scheme.exclusions.noMatches"));
  });

  it("disables save and retains full invalid values until corrected", () => {
    const f = editorFixture();
    const t = f.translate();
    const name = f.input("alpha", t("settings.scheme.name"));
    const template = f.input("alpha", "H1");
    f.button("alpha", t("settings.scheme.exclusions.add")).click();
    const exclusion = f.card("alpha").querySelector<HTMLInputElement>(".number-suite-exclusion-list input")!;
    editInput(exclusion, "Reference");
    const save = f.button("alpha", t("settings.scheme.save"));
    const alert = f.card("alpha").querySelector<HTMLElement>('[role="alert"]')!;
    for (const [input, value, correct, message] of [
      [name, "  ", "a".repeat(80), t("settings.scheme.issue.nameRequired")],
      [name, "a".repeat(81), "a".repeat(80), "80"],
      [template, "{1.arabic}" + "x".repeat(291), "{1.arabic}" + "x".repeat(290), "300"],
      [exclusion, "x".repeat(201), "x".repeat(200), "200"],
    ] as const) {
      editInput(input, value);
      expect(save.disabled).toBe(true);
      expect(alert.hidden).toBe(false);
      expect(alert.textContent).toContain(message);
      save.click();
      expect(input.value).toBe(value);
      expect(f.settings.customSchemes[0]!.revision).toBe(1);
      editInput(input, correct);
      expect(save.disabled).toBe(false);
    }
    save.click();
    expect(f.settings.customSchemes[0]!.name.length).toBe(80);
    expect(f.settings.customSchemes[0]!.templates[0]!.length).toBe(300);
    expect(f.settings.customSchemes[0]!.exclusions[0]!.title.length).toBe(200);
  });

  it("does not overwrite a newer revision or archive a normalization-only edit", () => {
    const f = editorFixture();
    const t = f.translate();
    editInput(f.input("alpha", "Scheme name"), " alpha ");
    f.button("alpha", t("settings.scheme.save")).click();
    expect(f.settings.customSchemes[0]!.revision).toBe(1);
    editInput(f.input("alpha", "Scheme name"), "old draft");
    Object.assign(f.settings.customSchemes[0]!, { revision: 2, name: "new name" });
    f.render();
    expect(f.input("new name", "Scheme name").value).toBe("old draft");
    expect(f.button("new name", t("settings.scheme.save")).disabled).toBe(true);
    f.button("new name", t("settings.scheme.discard")).click();
    expect(f.input("new name", "Scheme name").value).toBe("new name");
    expect(f.settings.cleanupHistory).toEqual([]);
  });

  it("refreshes recognition when disabling and enabling a built-in scheme", () => {
    const settings = cloneSettings({ ...DEFAULT_SETTINGS, selectedSchemeId: "chinese-official" });
    const commit = vi.fn((update: (next: NumberSuiteSettings) => void) => update(settings));
    const t = createTranslator("en");
    const container = document.createElement("div");
    const renderer = new SchemeSettingsRenderer(() => settings, commit, t);
    renderer.renderSchemes(container);
    const card = [...container.querySelectorAll("details")].find((item) =>
      item.querySelector("summary")?.textContent?.includes(t("scheme.chinese-official")));
    card!.querySelector<HTMLButtonElement>(".number-suite-scheme-remove")!.click();
    expect(commit).toHaveBeenLastCalledWith(expect.any(Function), "display", true, true);
    expect(settings.disabledBuiltInSchemeIds).toEqual(["chinese-official"]);
    expect(settings.selectedSchemeId).not.toBe("chinese-official");

    container.empty();
    renderer.renderSchemes(container);
    expect(container.querySelector('option[value="chinese-official"]')).toBeNull();
    const row = [...container.querySelectorAll<HTMLElement>("[data-name]")].find((item) =>
      item.dataset.name === t("scheme.chinese-official"));
    row!.querySelector("button")!.click();
    expect(commit).toHaveBeenLastCalledWith(expect.any(Function), "display", true, true);
    expect(settings.disabledBuiltInSchemeIds).toEqual([]);
    expect(settings.selectedSchemeId).not.toBe("chinese-official");
  });

  it("keeps the last available scheme enabled without re-enabling an unrelated one", () => {
    const settings = cloneSettings({
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "legal",
      disabledBuiltInSchemeIds: BUILT_IN_SCHEME_IDS.filter((id) => id !== "legal"),
    });
    const commit = vi.fn();
    const container = document.createElement("div");
    new SchemeSettingsRenderer(() => settings, commit, createTranslator("en")).renderSchemes(container);
    const disable = container.querySelector<HTMLButtonElement>(".number-suite-scheme-remove")!;
    expect(disable.disabled).toBe(true);
    disable.click();
    expect(commit).not.toHaveBeenCalled();
  });

  it.each(["en", "zh"] as const)("blocks invalid saves and commits a corrected draft in %s", language => {
    const settings = cloneSettings({
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "custom-test",
      disabledBuiltInSchemeIds: [...BUILT_IN_SCHEME_IDS],
      customSchemes: [{
        id: "custom-test", name: "Test", revision: 1, baseLevel: 1,
        templates: ["{1.arabic}", "{2.arabic}", "", "", "", "", "", "", ""],
        exclusions: [],
      }],
    });
    const original = structuredClone(settings.customSchemes[0]);
    const commit = vi.fn((update: (next: NumberSuiteSettings) => void) => update(settings));
    const t = createTranslator(language);
    const container = document.createElement("div");
    new SchemeSettingsRenderer(() => settings, commit, t).renderSchemes(container);
    const input = container.querySelector<HTMLInputElement>('[data-name="H2"] input')!;
    const alert = container.querySelector<HTMLElement>('[role="alert"]')!;
    const save = [...container.querySelectorAll("button")]
      .find(button => button.textContent === t("settings.scheme.save"))!;
    expect(alert.hidden).toBe(true);

    for (const [value, message] of [
      ["{1.arabic}", t("settings.scheme.issue.missingCurrentLevel", { level: "H2", example: "{2.arabic}" })],
      ["{2.arabic}.{3.arabic}", t("settings.scheme.issue.descendantLevel", { level: "H2", referenced: "H3" })],
      ["{2.unknown}", t("settings.scheme.issue.invalidPlaceholder", { level: "H2" })],
    ]) {
      input.value = value!;
      input.dispatchEvent(new Event("input"));
      expect(alert.hidden).toBe(false);
      expect(alert.textContent).toBe(message);
      save.click();
      expect(commit).not.toHaveBeenCalled();
      expect(settings.customSchemes[0]).toEqual(original);
      expect(settings.cleanupHistory).toEqual([]);
    }

    input.value = "{1.arabic}.{2.arabic}";
    input.dispatchEvent(new Event("input"));
    expect(alert.hidden).toBe(true);
    expect(alert.textContent).toBe("");
    expect(settings.customSchemes[0]).toEqual(original);
    save.click();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(settings.customSchemes[0]?.templates[1]).toBe("{1.arabic}.{2.arabic}");
    expect(settings.customSchemes[0]?.revision).toBe(2);
    expect(settings.cleanupHistory[0]?.templates).toEqual(original?.templates);
  });
});
