// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { createSettingsTabs } from "../../src/ui/settings/tabs";

describe("settings tabs", () => {
  it("uses an accessible tablist and supports keyboard navigation", () => {
    const container = document.createElement("div");
    const installHelpers = (element: HTMLElement): void => {
      element.createDiv = (options?: string | DomElementInfo): HTMLDivElement => {
        const child = document.createElement("div");
        installHelpers(child);
        if (typeof options === "string") child.className = options;
        else if (options?.cls != null) child.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
        element.append(child);
        return child;
      };
      element.createEl = (<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
        const child = document.createElement(tag);
        installHelpers(child);
        element.append(child);
        return child;
      }) as HTMLElement["createEl"];
    };
    installHelpers(container);
    document.body.append(container);
    const select = vi.fn();
    const result = createSettingsTabs(container, [
      { id: "general", label: "General" },
      { id: "headings", label: "Headings" },
      { id: "captions", label: "Captions" },
      { id: "references", label: "References" },
      { id: "notes", label: "Notes" },
      { id: "cleanup", label: "Cleanup" },
      { id: "views", label: "Views" },
    ], "general", "Sections", select);
    const tabs = container.querySelectorAll<HTMLElement>("[role=tab]");
    expect(container.querySelector("[role=tablist]")?.getAttribute("aria-label")).toBe("Sections");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(select).toHaveBeenCalledWith("headings");
    expect(result.panel.getAttribute("aria-labelledby")).toBe("number-suite-settings-tab-general");
    result.cleanup();
  });
});
