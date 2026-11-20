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
        setCta() { return control; },
        setWarning() { return control; },
        setButtonText(text: string) { button.textContent = text; return control; },
        setDisabled(value: boolean) { button.disabled = value; return control; },
        onClick(fn: () => void) { button.addEventListener("click", fn); return control; },
      };
      callback(control); return this;
    }
  }
  class Menu extends (original.Menu as new () => MenuFixture) {
    showAtPosition(): this {
      menus.push(this.items);
      return this;
    }
  }
  return { ...original, Setting, Menu, ItemView: class {
    registerEvent(): void {}
    async setState(): Promise<void> {}
  } };
});

import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import { createTranslator } from "../../src/config/i18n";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { NoteControlPane } from "../../src/ui/note-control-modal";
import { NumberSuiteSidebarView } from "../../src/ui/sidebar-view";
import { planHeadingTransform } from "../../src/core/transform";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

interface MenuFixture {
  readonly items: Array<{ title: string; disabled: boolean; callback: () => void }>;
}
const menus: Array<MenuFixture["items"]> = [];
const translate = createTranslator("en");

beforeEach(() => {
  installDomFixture();
  document.body.replaceChildren();
  menus.length = 0;
});
function render(frontmatter: Record<string, unknown> = {}, app = {} as App) {
  const file = new (TFile as unknown as new (path: string) => TFile)("demo.md");
  file.path = "demo.md";
  const host = document.createElement("div");
  const actions = { refreshDisplay: vi.fn(), runCurrent: vi.fn(), openBatch: vi.fn(), openGlobalSettings: vi.fn() };
  const pane = new NoteControlPane(app, host, () => DEFAULT_SETTINGS, () => createTranslator("en"), actions);
  const internal = pane as unknown as { file: TFile; frontmatter: Record<string, unknown>; render(): void; createCoordinator(file: TFile): void; applyChange: ReturnType<typeof vi.fn> };
  internal.file = file;
  internal.frontmatter = frontmatter;
  if (app.vault != null) internal.createCoordinator(file);
  else internal.applyChange = vi.fn();
  internal.render();
  return { host, pane, internal };
}

describe("simplified current-note controls", () => {
  it("starts on Display & numbering and leaves advanced rules and help closed", () => {
    const { host } = render();
    expect(host.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(host.querySelector('[role="table"]')).toBeNull();
    const display = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
    expect(display.textContent).toBe("Display & numbering");
    expect(host.querySelector<HTMLDetailsElement>(".number-suite-note-control-levels")?.open).toBe(false);
    expect(host.querySelector<HTMLDetailsElement>(".number-suite-note-operation-guide")?.open).toBe(false);
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
    expect([...host.querySelectorAll("fieldset")].map((card) => card.querySelectorAll('input[type="number"]').length)).toEqual([2, 3]);
  });
  it("shows existing H9 overrides immediately and keeps disabled-note preferences", () => {
    const { host } = render({ "number-suite": ["disabled=true", "heading.virtual=true", "heading.first-number.h9=4"] });
    expect(host.querySelector(".number-suite-note-control-state")?.textContent).toBe("Disabled for this note");
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("4");
    expect(host.querySelector<HTMLDetailsElement>(".number-suite-note-control-levels")?.open).toBe(true);
    expect(host.querySelector("select")?.value).toBe("on");
    expect(host.querySelector<HTMLButtonElement>(".number-suite-note-control-actions button")?.disabled).toBe(true);
  });
  it("describes the scope of each level's skip rule when the card is opened or added", () => {
    const { host } = render({ "number-suite": ["heading.skip-first.h2=1", "heading.skip-per-parent.h9=2"] });
    const cards = () => [...host.querySelectorAll("fieldset")];
    const description = (card: HTMLFieldSetElement): string | null => {
      const id = card.getAttribute("aria-describedby");
      expect(id).toBeTruthy();
      return card.querySelector(`[id="${id}"]`)?.textContent ?? null;
    };
    expect(cards().map(description)).toEqual([
      translate("panel.skipPerParent.desc", { level: 2, parent: 1 }),
      translate("panel.skipPerParent.desc", { level: 9, parent: 8 }),
    ]);
    const add = [...host.querySelectorAll("button")].find((button) => button.textContent === translate("panel.addLevel"))!;
    add.click();
    const root = cards().find((card) => card.querySelector("legend")?.textContent === "H1 rule")!;
    expect(description(root)).toBe(translate("panel.skipPerParent.rootDesc"));
  });
  it("labels all H2 fields and removes only that rule in one save", async () => {
    const initial = { "number-suite": ["heading.first-number.h2=4", "heading.skip-first.h2=1", "heading.skip-per-parent.h2=2", "heading.first-number.h3=2"], keep: "untouched" };
    const stored = structuredClone(initial);
    const write = vi.fn(async (_file: TFile, update: (values: typeof stored) => void) => update(stored));
    const app = { vault: { getAbstractFileByPath: () => file }, fileManager: { processFrontMatter: write } } as unknown as App;
    const { host, internal } = render(initial, app);
    const file = internal.file;
    const row = host.querySelector("fieldset")!;
    expect(row.querySelector("legend")?.textContent).toBe("H2 rule");
    expect([...row.querySelectorAll("label")].map((label) => label.textContent)).toEqual([
      translate("panel.firstNumber.label"), translate("panel.skipFirst.label"), translate("panel.skipPerParent.label"),
    ]);
    const inputs = [...row.querySelectorAll("input")];
    expect(inputs.map((input) => [input.value, input.getAttribute("aria-label")])).toEqual([
      ["4", translate("panel.firstNumber.aria", { level: 2 })], ["1", translate("panel.skipFirst.aria", { level: 2 })],
      ["2", translate("panel.skipPerParent.aria", { level: 2 })],
    ]);
    expect(row.querySelector("button")?.textContent).toBe("Remove rule");
    row.querySelector("button")!.click();
    expect([...host.querySelectorAll("legend")].map((el) => el.textContent)).toEqual(["H3 rule"]);
    expect(host.querySelector(".number-suite-note-control-levels summary")?.textContent).toContain("(1)");
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(stored).toEqual({ "number-suite": ["heading.first-number.h3=2"], keep: "untouched" });
  });
  it("edits and clears the two skip fields independently", async () => {
    const initial = { "number-suite": ["heading.first-number.h2=4", "heading.skip-per-parent.h2=2"] };
    const stored = structuredClone(initial);
    const write = vi.fn(async (_file: TFile, update: (values: typeof stored) => void) => update(stored));
    const app = { vault: { getAbstractFileByPath: () => file }, fileManager: { processFrontMatter: write } } as unknown as App;
    const { host, internal } = render(initial, app);
    const file = internal.file;
    const fields = host.querySelectorAll<HTMLInputElement>("fieldset input");
    const edit = (input: HTMLInputElement, value: string): void => {
      input.value = value;
      input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    };
    expect([...fields].map((input) => input.value)).toEqual(["4", "", "2"]);
    edit(fields[1]!, "1");
    await vi.waitFor(() => expect(stored["number-suite"]).toContain("heading.skip-first.h2=1"));
    expect(stored["number-suite"]).toContain("heading.skip-per-parent.h2=2");
    edit(fields[2]!, "");
    await vi.waitFor(() => expect(stored["number-suite"]).toEqual(["heading.first-number.h2=4", "heading.skip-first.h2=1"]));
    edit(fields[2]!, "3");
    await vi.waitFor(() => expect(stored["number-suite"]).toContain("heading.skip-per-parent.h2=3"));
    edit(fields[1]!, "0");
    await vi.waitFor(() => expect(stored["number-suite"]).toEqual(["heading.first-number.h2=4", "heading.skip-per-parent.h2=3"]));
  });
});

describe("current-note overflow menu", () => {
  it("offers disable, leaves restore disabled for an untouched note and guards stale menu targets", () => {
    const { host, pane, internal } = render();
    host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click();
    const [disable, reset] = menus[0]!;
    expect(disable?.title).toBe("Disable for this note");
    expect(disable?.disabled).toBe(false);
    expect(reset?.disabled).toBe(true);
    pane.setFile(null, false);
    disable?.callback();
    expect(internal.applyChange).not.toHaveBeenCalled();
  });

  it("disables and enables without deleting choices, then restores only Number Suite fields", async () => {
    const initial = { "number-suite": ["heading.virtual=true"], owner: "unrelated" };
    const stored = structuredClone(initial);
    const app = {
      vault: { getAbstractFileByPath: () => file },
      fileManager: { processFrontMatter: async (_file: TFile, update: (value: typeof stored) => void) => update(stored) },
    } as unknown as App;
    const { host, internal } = render(initial, app);
    const file = internal.file;
    function choose(index: number): MenuFixture["items"][number] {
      host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click();
      const item = menus[menus.length - 1]![index]!;
      expect(item.disabled).toBe(false);
      item.callback();
      return item;
    }
    expect(choose(0).title).toBe("Disable for this note");
    await vi.waitFor(() => expect(stored["number-suite"]).toContain("disabled=true"));
    expect(stored["number-suite"]).toContain("heading.virtual=true");
    expect(choose(0).title).toBe("Enable for this note");
    await vi.waitFor(() => expect(stored["number-suite"]).toEqual(["heading.virtual=true"]));
    choose(1);
    await vi.waitFor(() => expect(stored).toEqual({ owner: "unrelated" }));
  });
});

async function openSidebar() {
  const host = document.body.appendChild(document.createElement("div"));
  const file = (basename: string): TFile => Object.assign(
    new (TFile as unknown as new (path: string) => TFile)(`${basename}.md`), { basename },
  );
  const original = file("Original");
  const next = file("Next");
  let openFile!: (file: TFile | null) => void;
  const app = {
    workspace: {
      getActiveViewOfType: () => null,
      getActiveFile: () => original,
      on: (name: string, listener: typeof openFile) => { if (name === "file-open") openFile = listener; },
    },
    vault: { on() {}, cachedRead: vi.fn().mockResolvedValue("# Original") },
  } as unknown as App;
  const runCurrent = vi.fn();
  const sidebar = new NumberSuiteSidebarView({} as WorkspaceLeaf, {
    getSettings: () => DEFAULT_SETTINGS, getTranslate: () => translate,
    refreshDisplay() {}, runCurrent, openBatch() {}, openGlobalSettings() {}, openHeadingMap() {},
  });
  Object.assign(sidebar, { app, contentEl: host });
  await sidebar.onOpen();
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const [display, edit] = [tabs[0]!, tabs[1]!];
  const panel = (tab: HTMLButtonElement): HTMLElement => document.getElementById(tab.getAttribute("aria-controls")!)!;
  const button = (key: Parameters<typeof translate>[0]): HTMLButtonElement => [...host.querySelectorAll("button")]
    .find((el) => el.textContent === translate(key))!;
  const plan = planHeadingTransform("# Original", "write", {
    numbering: { scheme: BUILT_IN_SCHEMES.hierarchical, starts: {}, missingLevelStrategy: "fill-one" },
    writeMarkers: false, cleanupScope: "templates", templateSources: [],
    removeMultiplePrefixes: true, normalizeManualOnRenumber: true,
  });
  const target = { path: original.path, plan };
  const show = (onConfirm: () => Promise<boolean | void>): void => sidebar.showPreview({
    app, translate, operation: "write", documents: [target], onConfirm,
  });
  return { sidebar, display, edit, panel, show, button, runCurrent, next, openFile, host, target };
}

describe("sidebar tabs and shared preview", () => {
  it("links panels and supports click, arrows, Home and End with roving focus", async () => {
    const h = await openSidebar();
    expect(h.panel(h.display).getAttribute("aria-labelledby")).toBe(h.display.id);
    expect(h.panel(h.edit).getAttribute("aria-labelledby")).toBe(h.edit.id);
    expect(h.panel(h.display).hidden).toBe(false);
    expect(h.panel(h.edit).hidden).toBe(true);
    expect(h.display.tabIndex).toBe(0);
    expect(h.edit.tabIndex).toBe(-1);
    const key = (input: string): void => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: input, bubbles: true }));
    };
    h.display.focus();
    key("ArrowRight");
    expect(document.activeElement).toBe(h.edit);
    expect(h.edit.getAttribute("aria-selected")).toBe("true");
    key("Home");
    expect(document.activeElement).toBe(h.display);
    key("End");
    expect(document.activeElement).toBe(h.edit);
    key("ArrowLeft");
    expect(document.activeElement).toBe(h.display);
    h.edit.click();
    h.button("command.write.current").click();
    expect(h.runCurrent).toHaveBeenCalledWith("write", "Original.md");
    await h.sidebar.onClose();
  });

  it.each(["preview.back", "preview.cancel", "preview.confirm"] as const)(
    "keeps the preview and original plan across tab and note changes, then restores actions via %s",
    async (dismiss) => {
      const h = await openSidebar();
      const confirm = vi.fn(async () => true);
      h.show(confirm);
      const preview = h.panel(h.edit).querySelector(".number-suite-sidebar-preview");
      expect(preview?.querySelector(".number-suite-preview-target")?.textContent).toContain("Original.md");
      h.display.click();
      h.openFile(h.next);
      await vi.waitFor(() => expect(h.host.querySelector(".number-suite-note-control-header h3")?.textContent).toBe("Next"));
      expect(h.panel(h.edit).hidden).toBe(true);
      h.edit.click();
      expect(h.panel(h.edit).querySelector(".number-suite-sidebar-preview")).toBe(preview);
      expect(preview?.querySelector(".number-suite-preview-path")?.textContent).toBe("Original.md");
      h.button(dismiss).click();
      await vi.waitFor(() => expect(preview?.isConnected).toBe(false));
      expect(h.edit.getAttribute("aria-selected")).toBe("true");
      expect(h.panel(h.edit).querySelector<HTMLElement>(".number-suite-sidebar-edit-actions")?.hidden).toBe(false);
      if (dismiss === "preview.confirm") expect(confirm).toHaveBeenCalledWith([h.target]);
      else expect(confirm).not.toHaveBeenCalled();
      await h.sidebar.onClose();
    },
  );
});
