// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSettingsTabs } from "../../src/ui/settings/tabs";

const definitions = [
  { id: "general", label: "General" },
  { id: "headings", label: "Headings" },
  { id: "captions", label: "Captions" },
  { id: "references", label: "References" },
  { id: "notes", label: "Notes" },
  { id: "cleanup", label: "Cleanup" },
  { id: "views", label: "Views" },
] as const;

describe("settings tabs", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.documentElement.dir = "";
  });

  it("uses a linked tablist and roving tabindex", () => {
    const container = document.createElement("div");
    installHelpers(container);
    document.body.append(container);
    const select = vi.fn();
    const result = createSettingsTabs(container, definitions, "general", "Sections", select);
    const tabs = container.querySelectorAll<HTMLElement>("[role=tab]");
    expect(container.querySelector("[role=tablist]")?.getAttribute("aria-label")).toBe("Sections");
    expect(container.querySelector("[role=tablist]")?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(Array.from(tabs, (tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true", "false", "false", "false", "false", "false", "false",
    ]);
    expect(Array.from(tabs, (tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    expect(tabs[0]?.getAttribute("aria-controls")).toBe(result.panel.id);
    expect(result.panel.getAttribute("role")).toBe("tabpanel");
    expect(result.panel.getAttribute("aria-labelledby")).toBe("number-suite-settings-tab-general");
    result.cleanup();
  });

  it.each([
    ["ArrowRight", "headings"],
    ["ArrowLeft", "views"],
    ["Home", "general"],
    ["End", "views"],
  ] as const)("maps %s in left-to-right layouts", (key, expected) => {
    const container = document.createElement("div");
    installHelpers(container);
    document.body.append(container);
    const select = vi.fn();
    createSettingsTabs(container, definitions, "general", "Sections", select);
    const activeTab = container.querySelector<HTMLElement>("[role=tab][aria-selected=true]");

    activeTab?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    expect(select).toHaveBeenCalledWith(expected);
  });

  it("reverses left and right arrow navigation in right-to-left layouts", () => {
    const container = document.createElement("div");
    container.dir = "rtl";
    installHelpers(container);
    document.body.append(container);
    const select = vi.fn();
    createSettingsTabs(container, definitions, "general", "Sections", select);
    const tabs = container.querySelectorAll<HTMLElement>("[role=tab]");

    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(select).toHaveBeenLastCalledWith("views");
    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(select).toHaveBeenLastCalledWith("headings");
  });
});

function installHelpers(element: HTMLElement): void {
  element.createDiv = (options?: string | DomElementInfo): HTMLDivElement => {
    const child = document.createElement("div");
    installHelpers(child);
    if (typeof options === "string") child.className = options;
    else if (options?.cls != null) {
      child.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    }
    element.append(child);
    return child;
  };
  element.createEl = (<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const child = document.createElement(tag);
    installHelpers(child);
    element.append(child);
    return child;
  }) as HTMLElement["createEl"];
}
