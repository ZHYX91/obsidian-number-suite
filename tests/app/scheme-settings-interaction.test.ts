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
import { BUILT_IN_SCHEME_IDS } from "../../src/core/types";
import { installDomFixture } from "../ui/dom-fixture";

describe("custom scheme editing", () => {
  beforeEach(() => {
    installDomFixture();
    Object.assign(HTMLElement.prototype, {
      appendText(this: HTMLElement, text: string) { this.append(text); },
    });
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
