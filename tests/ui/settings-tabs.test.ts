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

const scrollLabels = { earlier: "Show earlier tabs", later: "Show later tabs" };

describe("settings tabs", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.documentElement.dir = "";
  });

  it("keeps a visible selection in view through narrowing and preserves manual paging", () => {
    const container = document.createElement("div");
    installHelpers(container);
    document.body.append(container);
    const layout = createSettingsTabs(container, definitions, "views", "Settings", scrollLabels, vi.fn());
    const list = container.querySelector<HTMLElement>('[role="tablist"]')!;
    const active = list.querySelector<HTMLElement>('[aria-selected="true"]')!;
    const strip = list.parentElement!;
    let width = 0;
    Object.defineProperty(strip, "clientWidth", { get: () => width });
    Object.defineProperty(list, "clientWidth", { get: () => width });
    Object.defineProperty(list, "scrollWidth", { get: () => 400 });
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, width, 34));
    vi.spyOn(active, "getBoundingClientRect").mockImplementation(() => new DOMRect(320 - list.scrollLeft, 0, 80, 34));
    try {
      width = 300;
      window.dispatchEvent(new Event("resize"));
      expect(list.scrollLeft).toBe(100);
      width = 200;
      window.dispatchEvent(new Event("resize"));
      expect(list.scrollLeft).toBe(200);

      list.scrollLeft = 0;
      list.dispatchEvent(new Event("scroll"));
      width = 180;
      window.dispatchEvent(new Event("resize"));
      expect(list.scrollLeft).toBe(0);
      expect(active.getAttribute("aria-selected")).toBe("true");
    } finally {
      layout.cleanup();
      container.remove();
    }
  });

  it("uses a linked tablist and roving tabindex", () => {
    const container = document.createElement("div");
    installHelpers(container);
    document.body.append(container);
    const select = vi.fn();
    const result = createSettingsTabs(container, definitions, "general", "Sections", scrollLabels, select);
    const tabs = container.querySelectorAll<HTMLElement>("[role=tab]");
    expect(container.querySelector("[role=tablist]")?.getAttribute("aria-label")).toBe("Sections");
    expect(container.querySelector("[role=tablist]")?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(Array.from(tabs, (tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true", "false", "false", "false", "false", "false", "false",
    ]);
    expect(Array.from(tabs, (tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    for (const tab of tabs) expect(document.getElementById(tab.getAttribute("aria-controls")!)).toBe(result.panel);
    expect(result.panel.getAttribute("role")).toBe("tabpanel");
    expect(result.panel.getAttribute("aria-labelledby")).toBe("number-suite-settings-tab-general");
    result.cleanup();
  });

  it.each(["ltr", "rtl"])("reveals the next clipped tab without selecting it (%s)", (direction) => {
    const container = document.createElement("div");
    container.dir = direction;
    installHelpers(container);
    document.body.append(container);
    const select = vi.fn();
    const layout = createSettingsTabs(container, definitions, "general", "Sections", scrollLabels, select);
    const list = container.querySelector<HTMLElement>("[role=tablist]")!;
    const strip = list.parentElement!;
    const earlier = strip.querySelector<HTMLButtonElement>('[data-direction="earlier"]')!;
    const later = strip.querySelector<HTMLButtonElement>('[data-direction="later"]')!;
    const buttons = Array.from(list.querySelectorAll<HTMLElement>("[role=tab]"));
    const rtl = direction === "rtl";
    const tabWidth = 80;
    const arrowWidth = 32;
    let available = 164;
    Object.defineProperty(strip, "clientWidth", { get: () => available });
    Object.defineProperty(list, "scrollWidth", { get: () => buttons.length * tabWidth });
    // Visible arrows occupy space at opposite physical edges in LTR and RTL.
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => {
      const left = (rtl ? later : earlier).hidden ? 0 : arrowWidth;
      const right = available - ((rtl ? earlier : later).hidden ? 0 : arrowWidth);
      return { left, right, width: right - left } as DOMRect;
    });
    for (const [index, button] of buttons.entries()) {
      vi.spyOn(button, "getBoundingClientRect").mockImplementation(() => {
        const viewport = list.getBoundingClientRect();
        const start = rtl ? viewport.right - (index + 1) * tabWidth : viewport.left + index * tabWidth;
        const left = start - list.scrollLeft;
        return { left, right: left + tabWidth, width: tabWidth } as DOMRect;
      });
    }
    // Mimic the scroll event fired after native wheel or touch interaction.
    list.dispatchEvent(new Event("scroll"));
    expect(earlier.hidden).toBe(true);
    expect(later.hidden).toBe(false);
    expect(later.getAttribute("aria-label")).toBe(scrollLabels.later);
    // When touch or wheel scrolling reveals the opposite arrow, the tab under
    // the pointer should not jump sideways to make space for the new control.
    list.scrollLeft = rtl ? -20 : 20;
    const anchor = buttons[1]!;
    const before = anchor.getBoundingClientRect().left;
    list.dispatchEvent(new Event("scroll"));
    expect(earlier.hidden).toBe(false);
    expect(anchor.getBoundingClientRect().left).toBe(before);

    later.click();
    const revealed = anchor.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    expect(revealed.left).toBeGreaterThanOrEqual(viewport.left);
    expect(revealed.right).toBeLessThanOrEqual(viewport.right);
    expect(earlier.hidden).toBe(false);
    expect(later.hidden).toBe(false);
    for (let index = 2; index < buttons.length; index++) later.click();
    expect(later.hidden).toBe(true);
    expect(earlier.hidden).toBe(false);
    expect(buttons[0]?.getAttribute("aria-selected")).toBe("true");
    expect(select).not.toHaveBeenCalled();

    available = buttons.length * tabWidth;
    list.dispatchEvent(new Event("scroll"));
    expect(strip.classList.contains("has-overflow")).toBe(false);
    expect(earlier.hidden).toBe(true);
    expect(later.hidden).toBe(true);
    layout.cleanup();
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
    createSettingsTabs(container, definitions, "general", "Sections", scrollLabels, select);
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
    createSettingsTabs(container, definitions, "general", "Sections", scrollLabels, select);
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
