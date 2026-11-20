// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { installDomFixture } from "../ui/dom-fixture";

const menus = vi.hoisted(() => [] as Array<{ items: Array<{ title: string; checked: boolean; callback: () => void }> }>);

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  Menu: class {
    readonly items: Array<{ title: string; checked: boolean; callback: () => void }> = [];
    constructor() { menus.push(this); }
    addItem(configure: (item: unknown) => void): this {
      const data = { title: "", checked: false, callback: () => undefined };
      const item = {
        setTitle: (title: string) => { data.title = title; return item; },
        setChecked: (checked: boolean) => { data.checked = checked; return item; },
        onClick: (callback: () => undefined) => { data.callback = callback; return item; },
      };
      configure(item); this.items.push(data); return this;
    }
    showAtPosition(): void {}
  },
  ItemView: class {
    readonly contentEl = document.createElement("div");
    readonly containerEl = document.createElement("div");
    readonly actions = document.createElement("div");
    constructor() {
      this.actions.className = "nav-buttons-container";
      const header = document.createElement("div"); header.className = "nav-header";
      header.append(this.actions); this.containerEl.append(header);
    }
    getState(): Record<string, string> { return { file: "Pinned.md" }; }
    addAction(_icon: string, label: string, callback: () => void): HTMLElement {
      const button = document.createElement("button");
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("click", callback);
      this.actions.append(button);
      return button;
    }
  },
}));

import { ItemView, Notice } from "obsidian";
import { createTranslator } from "../../src/config/i18n";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { NativeOutlineEnhancer } from "../../src/integration/native-outline";

beforeEach(() => {
  menus.length = 0;
  (Notice as unknown as { messages: string[] }).messages.length = 0;
  installDomFixture();
  document.body.replaceChildren();
});

describe("native Outline mind-map entry", () => {
  it("works without a private getHeadings method and cleans up on unload", () => {
    const view = new (ItemView as unknown as new () => ItemView)();
    const actions = (view as unknown as { actions: HTMLElement }).actions;
    document.body.append(view.containerEl);
    const opened: string[] = [];
    const plugin = {
      app: {
        workspace: { getLeavesOfType: () => [{ view }] },
        vault: { getAbstractFileByPath: () => null },
      },
    };
    const enhancer = new NativeOutlineEnhancer(
      plugin as never, () => DEFAULT_SETTINGS,
      (path) => { opened.push(path); }, () => "Open heading mind map",
    );
    enhancer.refresh();
    const button = actions.querySelector<HTMLButtonElement>(".number-suite-outline-map-action");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Number Suite · Open heading mind map");
    button?.click();
    expect(opened).toEqual(["Pinned.md"]);
    enhancer.stop();
    expect(actions.querySelector(".number-suite-outline-map-action")).toBeNull();
  });

  it("removes both toolbar enhancements while disabled and restores saved preferences", () => {
    const view = new (ItemView as unknown as new () => ItemView)();
    const actions = (view as unknown as { actions: HTMLElement }).actions;
    document.body.append(view.containerEl);
    let settings = { ...DEFAULT_SETTINGS, showOutlineNumbers: false };
    const enhancer = new NativeOutlineEnhancer({ app: {
      workspace: { getLeavesOfType: () => [{ view }] }, vault: { getAbstractFileByPath: () => null },
    } } as never, () => settings);
    enhancer.refresh();
    expect(actions.querySelectorAll("button")).toHaveLength(2);
    settings = { ...settings, enhanceNativeOutline: false };
    enhancer.refresh();
    expect(actions.querySelectorAll("button")).toHaveLength(0);
    settings = { ...settings, enhanceNativeOutline: true };
    enhancer.refresh();
    expect(actions.querySelectorAll("button")).toHaveLength(2);
    expect(settings.showOutlineNumbers).toBe(false);
    enhancer.stop();
  });

  it("shows four persisted display choices and reports save failures", async () => {
    const view = new (ItemView as unknown as new () => ItemView)();
    document.body.append(view.containerEl);
    let settings = { ...DEFAULT_SETTINGS };
    let fail = false;
    const save = vi.fn(async (next: typeof settings) => {
      if (fail) throw new Error("disk unavailable");
      settings = next;
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const enhancer = new NativeOutlineEnhancer({ app: {
      workspace: { getLeavesOfType: () => [{ view }] }, vault: { getAbstractFileByPath: () => null },
    } } as never, () => settings, () => undefined, undefined, undefined, save);
    enhancer.refresh();
    view.containerEl.querySelector<HTMLButtonElement>(".number-suite-outline-options-action")?.click();
    expect(menus[0]?.items).toHaveLength(4);
    menus[0]?.items[0]?.callback();
    await Promise.resolve(); await Promise.resolve();
    expect(settings.showOutlineNumbers).toBe(false);
    expect(settings.showVirtualNumbers).toBe(DEFAULT_SETTINGS.showVirtualNumbers);
    fail = true;
    menus[0]?.items[1]?.callback();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect((Notice as unknown as { messages: string[] }).messages).toContain("Settings were not saved.");
    expect(settings.showOutlineLevels).toBe(true);
    enhancer.stop(); error.mockRestore();
  });

  it("identifies both plugin actions on hover and for screen readers after a language change", () => {
    const view = new (ItemView as unknown as new () => ItemView)();
    const actions = (view as unknown as { actions: HTMLElement }).actions;
    document.body.append(view.containerEl);
    let translate = createTranslator("en");
    const enhancer = new NativeOutlineEnhancer({
      app: {
        workspace: { getLeavesOfType: () => [{ view }] },
        vault: { getAbstractFileByPath: () => null },
      },
    } as never, () => DEFAULT_SETTINGS, () => undefined, () => translate("command.headingMap.open"), (key) => translate(key));
    enhancer.refresh();
    const map = actions.querySelector<HTMLButtonElement>(".number-suite-outline-map-action");
    const options = actions.querySelector<HTMLButtonElement>(".number-suite-outline-options-action");
    expect(map?.title).toBe("Number Suite · Open heading mind map");
    expect(options?.title).toBe("Number Suite · Display options");
    translate = createTranslator("zh");
    enhancer.refresh();
    expect(actions.querySelectorAll("button")).toHaveLength(2);
    expect(map?.title).toBe("Number Suite · 打开标题思维导图");
    expect(map?.getAttribute("aria-label")).toBe(map?.title);
    expect(options?.title).toBe("Number Suite · 显示选项");
    expect(options?.getAttribute("aria-label")).toBe(options?.title);
    enhancer.stop();
  });
});
