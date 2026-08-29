// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSidebarTabs,
  moveHorizontalTabIndex,
  sidebarPanelElementId,
  sidebarTabElementId,
  type SidebarTabsController,
} from "../../src/ui/sidebar-tabs";

const definitions = [
  { id: "outline", label: "Document outline" },
  { id: "note", label: "Current note" },
] as const;
type TabId = typeof definitions[number]["id"];

describe("sidebar tabs", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.documentElement.dir = "";
  });

  it("uses linked tab semantics and roving tabindex", () => {
    const container = document.createElement("div");
    installHelpers(container);
    const controller = createSidebarTabs(
      container,
      definitions,
      "outline",
      "Number Suite sidebar sections",
      vi.fn(),
    );
    const list = container.querySelector<HTMLElement>("[role=tablist]");
    const tabs = container.querySelectorAll<HTMLButtonElement>("[role=tab]");

    expect(list?.getAttribute("aria-label")).toBe("Number Suite sidebar sections");
    expect(list?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(Array.from(tabs, (tab) => tab.id)).toEqual([
      sidebarTabElementId("outline"),
      sidebarTabElementId("note"),
    ]);
    expect(Array.from(tabs, (tab) => tab.getAttribute("aria-controls"))).toEqual([
      sidebarPanelElementId("outline"),
      sidebarPanelElementId("note"),
    ]);
    expect(Array.from(tabs, (tab) => tab.getAttribute("aria-selected")))
      .toEqual(["true", "false"]);
    expect(Array.from(tabs, (tab) => tab.tabIndex)).toEqual([0, -1]);

    controller.update("note");
    expect(Array.from(tabs, (tab) => tab.getAttribute("aria-selected")))
      .toEqual(["false", "true"]);
    expect(Array.from(tabs, (tab) => tab.tabIndex)).toEqual([-1, 0]);
    controller.setAriaLabel("Number Suite 侧栏分区");
    expect(list?.getAttribute("aria-label")).toBe("Number Suite 侧栏分区");
  });

  it.each([
    ["ArrowRight", "outline", "note"],
    ["ArrowLeft", "note", "outline"],
    ["Home", "note", "outline"],
    ["End", "outline", "note"],
  ] as const)("maps %s in left-to-right layouts", async (key, initial, expected) => {
    const { controller, onSelect } = harness(initial);
    const active = controller.buttons.get(initial);

    active?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await Promise.resolve();

    expect(onSelect).toHaveBeenCalledWith(expected);
    expect(document.activeElement).toBe(controller.buttons.get(expected));
  });

  it("reverses visual arrow navigation in right-to-left layouts", () => {
    expect(moveHorizontalTabIndex(0, "ArrowRight", 3, false)).toBe(1);
    expect(moveHorizontalTabIndex(0, "ArrowRight", 3, true)).toBe(2);
    expect(moveHorizontalTabIndex(0, "ArrowLeft", 3, true)).toBe(1);
  });

  it("reveals and focuses a selected tab", async () => {
    const { controller } = harness();
    const note = controller.buttons.get("note");
    const scrollIntoView = vi.fn();
    if (note !== undefined) {
      Object.defineProperty(note, "scrollIntoView", {
        configurable: true,
        value: scrollIntoView,
      });
      note.click();
    }
    await Promise.resolve();

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(document.activeElement).toBe(note);
  });
});

function harness(activeId: TabId = "outline"): {
  readonly controller: SidebarTabsController<TabId>;
  readonly onSelect: ReturnType<typeof vi.fn<(tabId: TabId) => void>>;
} {
  const container = document.createElement("div");
  installHelpers(container);
  document.body.append(container);
  let controller: SidebarTabsController<TabId>;
  const onSelect = vi.fn((tabId: TabId) => controller.update(tabId));
  controller = createSidebarTabs(
    container,
    definitions,
    activeId,
    "Number Suite sidebar sections",
    onSelect,
  );
  return { controller, onSelect };
}

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
  element.createEl = (<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: DomElementInfo,
  ): HTMLElementTagNameMap[K] => {
    const child = document.createElement(tag);
    installHelpers(child);
    if (options?.cls != null) {
      child.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    }
    element.append(child);
    return child;
  }) as HTMLElement["createEl"];
}
