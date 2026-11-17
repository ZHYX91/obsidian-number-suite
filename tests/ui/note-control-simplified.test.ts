// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installDomFixture } from "./dom-fixture";

vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  class Setting {
    readonly settingEl: HTMLElement;
    constructor(host: HTMLElement) { this.settingEl = host.createDiv(); }
    setName(name: string): this { this.settingEl.createSpan({ text: name }); return this; }
    setDesc(): this { return this; }
    addDropdown(callback: (control: unknown) => void): this {
      const select = this.settingEl.createEl("select");
      const control = {
        addOption(value: string, text: string) { const option = document.createElement("option"); option.textContent = text; option.value = value; select.add(option); return control; },
        setValue(value: string) { select.value = value; return control; },
        onChange(fn: (value: string) => void) { select.addEventListener("change", () => fn(select.value)); return control; },
      };
      callback(control); return this;
    }
    addText(callback: (control: unknown) => void): this {
      const inputEl = this.settingEl.createEl("input");
      const control = {
        inputEl,
        setPlaceholder(value: string) { inputEl.placeholder = value; return control; },
        setValue(value: string) { inputEl.value = value; return control; },
        onChange(fn: (value: string) => void) { inputEl.addEventListener("input", () => fn(inputEl.value)); return control; },
      };
      callback(control); return this;
    }
    addButton(callback: (control: unknown) => void): this {
      const button = this.settingEl.createEl("button");
      const control = {
        setButtonText(text: string) { button.textContent = text; return control; },
        setDisabled(value: boolean) { button.disabled = value; return control; },
        onClick(fn: () => void) { button.addEventListener("click", fn); return control; },
      };
      callback(control); return this;
    }
    addToggle(callback: (control: unknown) => void): this {
      const control = { setValue() { return control; }, onChange() { return control; } };
      callback(control); return this;
    }
  }
  return { ...original, Setting };
});

import { TFile, type App } from "obsidian";
import { createTranslator } from "../../src/config/i18n";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { NoteControlPane } from "../../src/ui/note-control-modal";

beforeEach(installDomFixture);
function render(frontmatter: Record<string, unknown> = {}) {
  const file = new (TFile as unknown as new (path: string) => TFile)("demo.md");
  file.path = "demo.md";
  const host = document.createElement("div");
  const actions = { refreshDisplay: vi.fn(), runCurrent: vi.fn(), openBatch: vi.fn(), openGlobalSettings: vi.fn() };
  const pane = new NoteControlPane({} as App, host, () => DEFAULT_SETTINGS, () => createTranslator("en"), actions);
  const internal = pane as unknown as { file: TFile; frontmatter: Record<string, unknown>; render(): void; applyChange: ReturnType<typeof vi.fn> };
  internal.file = file; internal.frontmatter = frontmatter; internal.applyChange = vi.fn(); internal.render();
  return { host, pane, internal };
}

describe("simplified current-note controls", () => {
  it("starts without numeric fields or a permanent summary table and keeps file operations folded", () => {
    const { host } = render();
    expect(host.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(host.querySelector('[role="table"]')).toBeNull();
    expect(host.querySelector<HTMLDetailsElement>(".number-suite-note-file-actions")?.open).toBe(false);
    expect(host.querySelector(".number-suite-note-control-state")?.textContent).toBe("Following global settings");
    expect(host.querySelector<HTMLElement>(".number-suite-note-save-status")?.hidden).toBe(true);
    expect(host.querySelector(".number-suite-note-control-header p")).toBeNull();
    expect(host.querySelector(".number-suite-note-control-header h3")?.getAttribute("title")).toBe("demo.md");
  });
  it("maps stored-number Show to conceal off and supports multiple explicit level rules", () => {
    const { host, internal } = render();
    const stored = host.querySelectorAll("select")[1]!;
    expect([...stored.options].find((option) => option.value === "off")?.textContent).toBe("Show");
    stored.value = "off"; stored.dispatchEvent(new Event("change"));
    expect(internal.applyChange).toHaveBeenCalledWith({ kind: "conceal-stored", value: "off" });
    for (let i = 0; i < 2; i++) {
      [...host.querySelectorAll("button")].find((button) => button.textContent === "Add heading-level rule")!.click();
    }
    expect(host.querySelectorAll('input[type="number"]')).toHaveLength(4);
  });
  it("shows existing H9 overrides immediately and keeps disabled-note preferences", () => {
    const { host } = render({ "number-suite": ["disabled=true", "heading.virtual=true", "heading.first-number.h9=4"] });
    expect(host.querySelector(".number-suite-note-control-state")?.textContent).toBe("Disabled for this note");
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("4");
    expect(host.querySelector<HTMLDetailsElement>(".number-suite-note-control-levels")?.open).toBe(true);
    expect(host.querySelector("select")?.value).toBe("on");
  });
});
