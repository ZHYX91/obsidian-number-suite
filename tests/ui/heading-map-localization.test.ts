// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import type { Translate } from "../../src/config/i18n";
import type { UiLanguage } from "../../src/config/language-options";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {
    readonly contentEl = document.createElement("div");
  },
}));

import { NumberSuiteHeadingMapView } from "../../src/ui/heading-map-view";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { installDomFixture } from "./dom-fixture";

type Subject = {
  buildToolbar(): void;
  refreshMap(): Promise<void>;
  setScaleAt(value: number): void;
  setExpandRange(value: 1 | 2 | 3 | "all"): void;
  fitToView(): boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  searchQuery: string;
  selectedId: string | null;
  scopeId: string | null;
  collapsed: Set<string>;
  searchCollapsed: Set<string>;
  rangeSelect: HTMLSelectElement | null;
  zoomOutButton: HTMLButtonElement | null;
  zoomInButton: HTMLButtonElement | null;
  fitButton: HTMLButtonElement | null;
  searchInput: HTMLInputElement | null;
};

function makeView(initialLanguage: UiLanguage = "en") {
  let language = initialLanguage;
  const view = new NumberSuiteHeadingMapView({} as WorkspaceLeaf, {
    getSettings: () => ({ ...DEFAULT_SETTINGS, language }),
    getTranslate: () => {
      const locale = language;
      const translate: Translate = (key) => `${locale}:${key}`;
      return translate;
    },
  });
  document.body.appendChild(view.contentEl);
  const viewport = view.contentEl.createDiv({ cls: "number-suite-heading-map-viewport" });
  Object.assign(view, { viewport });
  const subject = view as unknown as Subject;
  let finishRead: () => void = () => undefined;
  const pendingRead = new Promise<void>((resolve) => { finishRead = resolve; });
  // The toolbar must refresh immediately, even while the next source read is pending.
  vi.spyOn(subject, "refreshMap").mockReturnValue(pendingRead);
  subject.buildToolbar();
  const search = view.contentEl.querySelector<HTMLInputElement>(".number-suite-heading-map-search")!;
  const range = view.contentEl.querySelector<HTMLSelectElement>(".number-suite-heading-map-range")!;
  const zoom = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".number-suite-heading-map-zoom button")];
  return {
    view, subject, viewport, search, range, zoom,
    setLanguage: (next: UiLanguage) => { language = next; },
    dispose: async () => {
      finishRead();
      await view.onClose();
      view.contentEl.remove();
    },
  };
}

beforeEach(installDomFixture);

describe("heading map live localization", () => {
  it.each(["zh", "ar", "en"] as const)("refreshes all toolbar labels in %s without rebuilding controls", async (language) => {
    const h = makeView(language === "en" ? "ar" : "en");
    const hostDirection = document.documentElement.getAttribute("dir");
    const controls = [...h.view.contentEl.querySelectorAll("button, input, select, option")];
    const label = (key: string) => `${language}:${key}`;
    h.search.value = "draft 中文";
    h.subject.searchQuery = h.search.value;
    h.search.focus();
    h.search.setSelectionRange(2, 5);
    h.range.value = "2";
    try {
      h.setLanguage(language);
      h.view.refresh();
      expect(h.view.contentEl.querySelector(".number-suite-heading-map-scope button")?.textContent)
        .toBe(label("headingMap.scope.document"));
      expect(h.range.getAttribute("aria-label")).toBe(label("headingMap.expandRange"));
      expect([...h.range.options].map((option) => option.textContent)).toEqual([
        label("headingMap.expandRange"), label("headingMap.expandRange.1"),
        label("headingMap.expandRange.2"), label("headingMap.expandRange.3"), label("headingMap.expandRange.all"),
      ]);
      const zoomKeys = ["headingMap.zoomOut", "headingMap.actualSize", "headingMap.zoomIn", "headingMap.fit"];
      expect(h.zoom.map((button) => button.getAttribute("aria-label"))).toEqual(zoomKeys.map(label));
      expect(h.zoom.map((button) => button.title)).toEqual(zoomKeys.map(label));
      expect(h.search.placeholder).toBe(label("headingMap.search"));
      expect(h.search.getAttribute("aria-label")).toBe(label("headingMap.search"));
      expect(h.viewport.getAttribute("aria-label")).toBe(label("headingMap.canvas"));
      expect(h.view.contentEl.dir).toBe(language === "ar" ? "rtl" : "ltr");
      expect(document.documentElement.getAttribute("dir")).toBe(hostDirection);
      expect([...h.view.contentEl.querySelectorAll("button, input, select, option")]).toEqual(controls);
      expect(document.activeElement).toBe(h.search);
      expect([h.search.selectionStart, h.search.selectionEnd]).toEqual([2, 5]);
      expect(h.search.value).toBe("draft 中文");
      expect(h.subject.searchQuery).toBe("draft 中文");
      expect(h.range.value).toBe("2");
    } finally {
      await h.dispose();
    }
  });

  it("preserves scope and viewport state without duplicating control handlers", async () => {
    const h = makeView();
    const heading = { id: "chapter", title: "原文章节", children: [] };
    Object.assign(h.subject, {
      roots: [heading], selectedId: heading.id, scopeId: heading.id,
      scale: 1.5, offsetX: -30, offsetY: 72,
    });
    h.subject.collapsed.add(heading.id);
    h.subject.searchCollapsed.add(heading.id);
    const scale = vi.spyOn(h.subject, "setScaleAt").mockImplementation(() => undefined);
    const fit = vi.spyOn(h.subject, "fitToView").mockReturnValue(false);
    const expand = vi.spyOn(h.subject, "setExpandRange").mockImplementation(() => undefined);
    try {
      for (const language of ["zh", "ar", "en"] as const) {
        h.setLanguage(language);
        h.view.refresh();
      }
      expect([h.subject.scale, h.subject.offsetX, h.subject.offsetY]).toEqual([1.5, -30, 72]);
      expect([h.subject.selectedId, h.subject.scopeId]).toEqual([heading.id, heading.id]);
      expect([...h.subject.collapsed]).toEqual([heading.id]);
      expect([...h.subject.searchCollapsed]).toEqual([heading.id]);
      expect(h.view.contentEl.querySelectorAll(".number-suite-heading-map-scope button")[1]?.textContent)
        .toBe(heading.title);
      for (const button of h.zoom) button.click();
      expect(scale.mock.calls).toEqual([[1.5 / 1.2], [1], [1.5 * 1.2]]);
      expect(fit).toHaveBeenCalledTimes(1);
      h.range.value = "2";
      h.range.dispatchEvent(new Event("change"));
      expect(expand.mock.calls).toEqual([[2]]);
      expect(h.range.value).toBe("");
    } finally {
      await h.dispose();
    }
  });

  it("releases toolbar references when the view closes", async () => {
    const h = makeView();
    await h.dispose();
    expect(h.view.contentEl.children).toHaveLength(0);
    expect(h.view.contentEl.hasAttribute("dir")).toBe(false);
    for (const field of ["searchInput", "rangeSelect", "zoomOutButton", "zoomInButton", "fitButton"] as const) {
      expect(h.subject[field]).toBeNull();
    }
  });
});
