// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {
    readonly contentEl = document.createElement("div");
    readonly containerEl = document.createElement("div");
    readonly actions = document.createElement("div");
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

import { ItemView } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { NativeOutlineEnhancer } from "../../src/integration/native-outline";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("native Outline mind-map entry", () => {
  it("works without a private getHeadings method and cleans up on unload", () => {
    const view = new (ItemView as unknown as new () => ItemView)();
    const actions = (view as unknown as { actions: HTMLElement }).actions;
    document.body.append(actions);
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
    expect(button?.getAttribute("aria-label")).toBe("Open heading mind map");
    button?.click();
    expect(opened).toEqual(["Pinned.md"]);
    enhancer.stop();
    expect(actions.querySelector(".number-suite-outline-map-action")).toBeNull();
  });

  it("refreshes an existing action label rather than creating duplicates", () => {
    const view = new (ItemView as unknown as new () => ItemView)();
    const actions = (view as unknown as { actions: HTMLElement }).actions;
    document.body.append(actions);
    let label = "Open map";
    const enhancer = new NativeOutlineEnhancer({
      app: {
        workspace: { getLeavesOfType: () => [{ view }] },
        vault: { getAbstractFileByPath: () => null },
      },
    } as never, () => DEFAULT_SETTINGS, () => undefined, () => label);
    enhancer.refresh();
    const first = actions.querySelector(".number-suite-outline-map-action");
    label = "打开标题思维导图";
    enhancer.refresh();
    expect(actions.querySelector(".number-suite-outline-map-action")).toBe(first);
    expect(actions.querySelectorAll(".number-suite-outline-map-action")).toHaveLength(1);
    expect(first?.getAttribute("aria-label")).toBe(label);
    enhancer.stop();
  });
});
