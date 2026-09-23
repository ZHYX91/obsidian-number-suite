// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownView, TFile, type WorkspaceLeaf } from "obsidian";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {
    // ItemView owns this undocumented header field and uses it before onOpen.
    readonly titleEl = document.createElement("div");
    readonly contentEl = document.createElement("div");

    getDisplayText(): string { return ""; }

    load(): void { this.titleEl.setText(this.getDisplayText()); }

    registerEvent(_event: unknown): void {}
  },
}));

import { NumberSuiteHeadingMapView } from "../../src/ui/heading-map-view";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { findHeadingMapNode, HEADING_MAP_DOCUMENT_ID, type HeadingMapNode } from "../../src/application/heading-map";
import { installDomFixture } from "./dom-fixture";
import type { HeadingMapLayout } from "../../src/application/heading-map-layout";

type Subject = {
  roots: HeadingMapNode[];
  selectedId: string | null;
  scopeId: string | null;
  collapsed: Set<string>;
  scale: number;
  offsetX: number;
  offsetY: number;
  lastLayout: HeadingMapLayout;
  searchQuery: string;
  searchMatches: string[];
  searchIndex: number;
  layoutDirection: "left-to-right" | "top-to-bottom";
  sceneHost: HTMLElement;
  viewport: HTMLElement;
  needsInitialFit: boolean;
  onResize(): void;
  refreshMap(source?: string, path?: string): Promise<void>;
  scheduleRefresh(source?: string): void;
  onActiveLeafChange(leaf: WorkspaceLeaf): void;
  setScaleAt(scale: number, x: number, y: number): void;
  render(): void;
  fitToView(readable?: boolean): void;
  showDocument(): void;
  setExpandRange(range: 1 | 2 | 3 | "all"): void;
  cycleSearch(backward: boolean): void;
  onViewportKeyDown(event: KeyboardEvent): void;
  onWheel(event: WheelEvent): void;
  beginPan(event: PointerEvent): void;
  movePan(event: PointerEvent): void;
  endPan(event: PointerEvent): void;
  setFile(file: { path: string; extension: string }, refresh?: boolean): void;
};

function makeView(): Subject {
  const view = new NumberSuiteHeadingMapView({} as WorkspaceLeaf, {
    getSettings: () => DEFAULT_SETTINGS,
    getTranslate: () => ((key: string) => key),
  });
  const contentEl = document.createElement("div");
  const viewport = contentEl.appendChild(document.createElement("div"));
  const sceneHost = viewport.appendChild(document.createElement("div"));
  Object.defineProperties(viewport, {
    clientWidth: { value: 800, configurable: true },
    clientHeight: { value: 600, configurable: true },
  });
  Object.assign(view, {
    contentEl, viewport, sceneHost,
    currentFile: { path: "Same.md", basename: "Same", extension: "md" },
    needsInitialFit: false,
  });
  return view as unknown as Subject;
}

beforeEach(installDomFixture);
afterEach(() => { vi.useRealTimers(); });

describe("heading map interactions", () => {
  it("renders an empty file as a document card with a disabled zero handle", async () => {
    const view = makeView();
    await view.refreshMap("");
    const card = view.sceneHost.querySelector(".is-document")!;
    expect(card.querySelector(".number-suite-heading-map-body")?.textContent).toBe("Same");
    expect(card.querySelector(".number-suite-heading-map-number")?.getAttribute("aria-label")).toBe("Same.md");
    const handle = card.querySelector<HTMLButtonElement>(".number-suite-heading-map-children")!;
    expect(handle.disabled).toBe(true);
    expect(handle.textContent).toBe("0");
    expect(view.lastLayout.edges).toHaveLength(0);
  });

  it("preserves document collapse and selection through edits and returns from a subtree", async () => {
    const view = makeView();
    await view.refreshMap("## A\n#### B\n###### C\n# D");
    const documentControl = view.sceneHost.querySelector<HTMLButtonElement>(`[data-node-control="${HEADING_MAP_DOCUMENT_ID}"]`)!;
    expect(documentControl.textContent).toBe("2");
    documentControl.click();
    await view.refreshMap("## A\nbody\n#### B\n###### C\n# D");
    expect(view.selectedId).toBe(HEADING_MAP_DOCUMENT_ID);
    expect(view.lastLayout.nodes).toHaveLength(1);
    view.scopeId = view.roots[0]!.id;
    view.render();
    expect(view.sceneHost.querySelector(".is-document")).toBeNull();
    view.showDocument();
    expect(view.scopeId).toBeNull();
    expect(view.sceneHost.querySelector(".is-document")).not.toBeNull();
    expect(view.collapsed.has(HEADING_MAP_DOCUMENT_ID)).toBe(true);
  });

  it("opens a readable overview and does not reset user expansion on an edit", async () => {
    const view = makeView();
    await view.refreshMap("## A\n#### B\n###### C\n# D");
    expect(view.lastLayout.nodes.map(({ node }) => node.title)).toEqual(["Same", "A", "B", "D"]);
    view.fitToView(true);
    expect(view.scale).toBe(1);
    const root = view.lastLayout.nodes.find(({ node }) => node.id === HEADING_MAP_DOCUMENT_ID)!;
    expect(view.offsetX + root.x).toBe(24);
    const branch = view.roots[0]!.children[0]!;
    view.collapsed.delete(branch.id);
    await view.refreshMap("## A\ntext\n#### B\n###### C\n# D");
    expect(view.lastLayout.nodes.map(({ node }) => node.title)).toContain("C");
  });

  it("loads through the host lifecycle without overwriting the ItemView header", async () => {
    const file = Object.assign(Object.create(TFile.prototype) as TFile, {
      path: "Map.md", basename: "Map", extension: "md",
    });
    const view = new NumberSuiteHeadingMapView({} as WorkspaceLeaf, {
      getSettings: () => DEFAULT_SETTINGS,
      getTranslate: () => ((key: string) => key),
    });
    Object.assign(view, {
      app: {
        workspace: {
          on: vi.fn(),
          getActiveFile: () => file,
          getActiveViewOfType: () => null,
          iterateAllLeaves: vi.fn(),
        },
        vault: { on: vi.fn(), cachedRead: async () => "# Root\n## Child" },
      },
    });
    view.load();
    await view.onOpen();
    const header = (view as unknown as { titleEl: HTMLElement }).titleEl;
    expect(header.textContent).toBe("headingMap.title");
    expect(view.contentEl.querySelector(".number-suite-heading-map-file")?.textContent).toBe("Map");
    expect(view.contentEl.querySelector(".number-suite-heading-map-search")).not.toBeNull();
    expect(view.contentEl.querySelectorAll(".number-suite-heading-map-card")).toHaveLength(3);
    const hostSwipe = vi.fn();
    const hostPointer = vi.fn();
    view.contentEl.addEventListener("touchstart", hostSwipe);
    view.contentEl.addEventListener("touchmove", hostSwipe);
    view.contentEl.addEventListener("touchend", hostSwipe);
    view.contentEl.addEventListener("pointerdown", hostPointer);
    const body = view.contentEl.querySelector<HTMLButtonElement>(".number-suite-heading-map-body")!;
    for (const type of ["touchstart", "touchmove", "touchend"]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    body.click();
    expect(body.parentElement?.classList.contains("is-selected")).toBe(true);
    expect(hostSwipe).not.toHaveBeenCalled();
    expect(hostPointer).not.toHaveBeenCalled();
    await view.onClose();
  });

  it("defers an empty document's initial fit until a hidden tab is revealed without resetting later panning", async () => {
    vi.useFakeTimers();
    const view = makeView();
    Object.defineProperties(view.viewport, { clientWidth: { value: 0 }, clientHeight: { value: 0 } });
    view.needsInitialFit = true;
    await view.refreshMap("");
    vi.advanceTimersByTime(20);
    expect(view.needsInitialFit).toBe(true);
    expect([view.offsetX, view.offsetY]).toEqual([0, 0]);
    Object.defineProperties(view.viewport, { clientWidth: { value: 400 }, clientHeight: { value: 600 } });
    view.onResize();
    vi.advanceTimersByTime(20);
    expect(view.needsInitialFit).toBe(false);
    expect(view.offsetX + view.lastLayout.width / 2).toBe(200);
    expect(view.offsetY + view.lastLayout.height / 2).toBe(300);
    view.offsetX = -120;
    view.offsetY = 70;
    view.scale = 1.2;
    view.onResize();
    vi.advanceTimersByTime(20);
    expect([view.offsetX, view.offsetY, view.scale]).toEqual([-120, 70, 1.2]);
  });

  it("control: preserves selection, scope, and collapse for a body-only edit", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## Child");
    const id = view.roots[0]!.id;
    view.selectedId = id;
    view.scopeId = id;
    view.collapsed.add(id);
    await view.refreshMap("# Root\nbody edited\n## Child");
    expect(view.selectedId).toBe(id);
    expect(view.scopeId).toBe(id);
    expect(view.collapsed.has(view.roots[0]!.id)).toBe(true);
  });

  it("preserves selection, subtree scope, and collapse when the heading is renamed", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## Child");
    const id = view.roots[0]!.id;
    view.selectedId = id;
    view.scopeId = id;
    view.collapsed.add(id);
    await view.refreshMap("# Root renamed\n## Child");
    const renamedId = view.roots[0]!.id;
    expect.soft(view.selectedId).toBe(renamedId);
    expect.soft(view.scopeId).toBe(renamedId);
    expect.soft(view.collapsed.has(renamedId)).toBe(true);
  });

  it("keeps the selected duplicate heading in its original branch after an earlier insertion", async () => {
    const view = makeView();
    const source = "# A\n## Repeated\n### Child A\n# B\n## Repeated\n### Child B";
    await view.refreshMap(source);
    view.selectedId = view.roots[1]!.children[0]!.id;
    await view.refreshMap("# Inserted\n## Repeated\n### Child inserted\n" + source);
    const selected = findHeadingMapNode(view.roots, view.selectedId!);
    expect(selected?.children[0]?.title).toBe("Child B");
  });

  it("cancels an old buffer refresh when switching panes of the same file", () => {
    vi.useFakeTimers();
    const view = makeView();
    const refreshMap = vi.fn().mockResolvedValue(undefined);
    Object.assign(view, { refreshMap });
    view.scheduleRefresh("# Old pane");
    const markdown = Object.assign(Object.create(MarkdownView.prototype), {
      file: { path: "Same.md", extension: "md" },
      editor: { getValue: () => "# New pane" },
    });
    view.onActiveLeafChange({ view: markdown } as WorkspaceLeaf);
    vi.advanceTimersByTime(200);
    expect(refreshMap.mock.calls).toEqual([["# New pane", "Same.md"]]);
  });

  it("applies structural range expansion without changing the heading tree", async () => {
    const view = makeView();
    await view.refreshMap("# A\n## B\n### C\n#### D");
    view.setExpandRange(1);
    expect(view.lastLayout.nodes.map(({ node }) => node.title)).toEqual(["Same", "A"]);
    view.setExpandRange(3);
    expect(view.lastLayout.nodes.map(({ node }) => node.title)).toEqual(["Same", "A", "B", "C"]);
    view.setExpandRange("all");
    expect(view.lastLayout.nodes.map(({ node }) => node.title)).toEqual(["Same", "A", "B", "C", "D"]);
  });

  it("switches to top-to-bottom layout while preserving document order", async () => {
    const view = makeView();
    await view.refreshMap("# A\n## B");
    view.layoutDirection = "top-to-bottom";
    view.render();
    const root = view.lastLayout.nodes[0]!;
    const heading = view.lastLayout.nodes[1]!;
    expect(view.lastLayout.nodes.map(({ node }) => node.title)).toEqual(["Same", "A", "B"]);
    expect(heading.y).toBeGreaterThan(root.y);
  });

  it("cycles all search matches in document order and reverses with Shift semantics", async () => {
    const view = makeView();
    await view.refreshMap("# Alpha\n# Alpha two\n# Alpha three");
    view.searchQuery = "alpha";
    view.render();
    expect(view.searchMatches).toHaveLength(3);
    view.cycleSearch(false);
    const first = view.selectedId;
    view.cycleSearch(false);
    expect(view.selectedId).not.toBe(first);
    view.cycleSearch(true);
    expect(view.selectedId).toBe(first);
  });

  it("supports plus, minus, and zero keyboard viewport controls", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## Child");
    const key = (value: string): void => {
      const event = new KeyboardEvent("keydown", { key: value, cancelable: true });
      Object.defineProperty(event, "target", { value: view.viewport });
      view.onViewportKeyDown(event);
      expect(event.defaultPrevented).toBe(true);
    };
    key("+");
    expect(view.scale).toBeGreaterThan(1);
    key("-");
    expect(view.scale).toBeCloseTo(1);
    view.offsetX = -300;
    key("0");
    expect(view.scale).toBeLessThanOrEqual(1);
  });

  it("keeps the graph point beneath the pointer fixed when zooming out at the top-left boundary", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## Child\n### Deep\n#### Deeper");
    const pointer = { x: 400, y: 300 };
    const world = { x: pointer.x / view.scale, y: pointer.y / view.scale };
    view.setScaleAt(1 / 1.2, pointer.x, pointer.y);
    expect.soft(world.x * view.scale + view.offsetX).toBeCloseTo(pointer.x);
    expect.soft(world.y * view.scale + view.offsetY).toBeCloseTo(pointer.y);
    expect(view.sceneHost.querySelector<HTMLElement>(".number-suite-heading-map-canvas")?.style.transform)
      .toBe(`translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`);
  });

  it("reports a search-revealed branch as expanded while preserving the saved collapse after clearing search", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## Search target");
    const root = view.roots[0]!;
    view.collapsed.add(root.id);
    view.searchQuery = "Search target";
    view.render();
    expect(view.sceneHost.querySelectorAll("[data-node-id]")).toHaveLength(3);
    const control = [...view.sceneHost.querySelectorAll<HTMLElement>("[data-node-control]")]
      .find((element) => element.dataset.nodeControl === root.id)!;
    expect.soft(control.getAttribute("aria-expanded")).toBe("true");
    view.searchQuery = "";
    view.render();
    expect(view.collapsed.has(root.id)).toBe(true);
    expect(view.sceneHost.querySelectorAll("[data-node-id]")).toHaveLength(2);
  });

  it("toggles a search-revealed branch without changing the saved collapse intent", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## Search target");
    const root = view.roots[0]!;
    view.searchQuery = "Search target";
    view.render();
    const rootControl = () => [...view.sceneHost.querySelectorAll<HTMLButtonElement>("[data-node-control]")]
      .find((element) => element.dataset.nodeControl === root.id)!;
    rootControl().click();
    expect(rootControl().getAttribute("aria-expanded")).toBe("false");
    expect(view.sceneHost.querySelectorAll("[data-node-id]")).toHaveLength(2);
    expect(view.collapsed.has(root.id)).toBe(false);
    rootControl().click();
    expect(rootControl().getAttribute("aria-expanded")).toBe("true");
    expect(view.sceneHost.querySelectorAll("[data-node-id]")).toHaveLength(3);
    view.searchQuery = "";
    view.render();
    expect(view.sceneHost.querySelectorAll("[data-node-id]")).toHaveLength(3);
  });

  it("keeps the nearest visible ancestor on screen after clearing a centered hidden match", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## Branch\n### Target");
    const branch = view.roots[0]!.children[0]!;
    const target = branch.children[0]!;
    view.searchQuery = "Target";
    view.selectedId = target.id;
    view.render();
    const before = view.lastLayout.nodes.find(({ node }) => node.id === target.id)!;
    view.offsetX = 400 - (before.x + 132);
    view.offsetY = 300 - (before.y + 24);
    view.searchQuery = "";
    view.render();
    const after = view.lastLayout.nodes.find(({ node }) => node.id === branch.id)!;
    expect(view.selectedId).toBe(branch.id);
    expect(view.collapsed.has(branch.id)).toBe(true);
    expect(after.x + 132 + view.offsetX).toBe(400);
    expect(after.y + 24 + view.offsetY).toBe(300);
  });

  it("pins the clicked parent to the same screen position while collapsing and expanding", async () => {
    const view = makeView();
    await view.refreshMap("# Root\n## A\n## B\n## C\n# Other");
    const root = view.roots[0]!;
    const screenY = () => view.lastLayout.nodes.find(({ node }) => node.id === root.id)!.y
      * view.scale + view.offsetY;
    const before = screenY();
    const control = () => [...view.sceneHost.querySelectorAll<HTMLButtonElement>("[data-node-control]")]
      .find((element) => element.dataset.nodeControl === root.id)!;
    control().click();
    expect(screenY()).toBe(before);
    expect(control().textContent).toBe("3");
    control().click();
    expect(screenY()).toBe(before);
  });

  it.each([[0, 0], [-900, -700], [250, 170]])("keeps zoom anchors and round trips at offset %s, %s", async (x, y) => {
    const view = makeView();
    await view.refreshMap("# Root");
    view.offsetX = x;
    view.offsetY = y;
    const point = { x: (700 - x) / view.scale, y: (500 - y) / view.scale };
    view.setScaleAt(0.5, 700, 500);
    expect(point.x * view.scale + view.offsetX).toBeCloseTo(700);
    expect(point.y * view.scale + view.offsetY).toBeCloseTo(500);
    view.setScaleAt(1, 700, 500);
    expect(view.offsetX).toBeCloseTo(x);
    expect(view.offsetY).toBeCloseTo(y);
  });

  it("centers small trees on Fit and pans with ordinary or Shift-wheel input", async () => {
    const view = makeView();
    await view.refreshMap("# Root");
    view.fitToView();
    expect(view.offsetX + view.lastLayout.width / 2).toBe(400);
    expect(view.offsetY + view.lastLayout.height / 2).toBe(300);
    const before = { x: view.offsetX, y: view.offsetY };
    const event = new WheelEvent("wheel", { deltaY: 40, cancelable: true });
    view.onWheel(event);
    expect(event.defaultPrevented).toBe(true);
    expect(view.offsetY).toBe(before.y - 40);
    // happy-dom does not yet initialize WheelEvent modifier keys from its constructor options.
    const horizontal = new WheelEvent("wheel", { deltaY: 2, deltaMode: 1 });
    Object.defineProperty(horizontal, "shiftKey", { value: true });
    view.onWheel(horizontal);
    expect(view.offsetX).toBe(before.x - 32);
    expect(view.scale).toBe(1);
  });

  it("uses two touch pointers for anchored pinch zoom and returns to one-finger pan", async () => {
    const view = makeView();
    await view.refreshMap("# Root");
    const captured = new Set<number>();
    Object.assign(view.viewport, {
      setPointerCapture: (id: number) => captured.add(id),
      hasPointerCapture: (id: number) => captured.has(id),
      releasePointerCapture: (id: number) => captured.delete(id),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    });
    const pointer = (id: number, x: number, y: number) => new PointerEvent("pointerdown", {
      pointerId: id, pointerType: "touch", button: 0, clientX: x, clientY: y,
    });
    view.beginPan(pointer(1, 100, 100));
    view.beginPan(pointer(2, 300, 100));
    view.movePan(pointer(2, 400, 100));
    expect(view.scale).toBeGreaterThan(1);
    const afterPinch = [view.offsetX, view.offsetY];
    view.endPan(pointer(2, 400, 100));
    view.movePan(pointer(1, 140, 130));
    expect([view.offsetX, view.offsetY]).not.toEqual(afterPinch);
    view.endPan(pointer(1, 140, 130));
    expect(captured.size).toBe(0);
    expect(view.viewport.classList.contains("is-panning")).toBe(false);
  });

  it("invalidates a pending read as soon as a new edit is queued", async () => {
    vi.useFakeTimers();
    const view = makeView();
    let finishRead: (source: string) => void = () => undefined;
    Object.assign(view, { sourceForFile: () => new Promise<string>((resolve) => { finishRead = resolve; }) });
    const reading = view.refreshMap();
    view.scheduleRefresh("# Current buffer");
    finishRead("# Old disk");
    await reading;
    expect(view.roots).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(view.roots[0]?.title).toBe("Current buffer");
  });

  it("cancels delayed old-file buffers and clears document session state on a file switch", async () => {
    vi.useFakeTimers();
    const view = makeView();
    await view.refreshMap("# Root\n## Child");
    view.selectedId = view.roots[0]!.id;
    view.collapsed.add(view.selectedId);
    view.scheduleRefresh("# Old file");
    view.setFile({ path: "Other.md", extension: "md" }, false);
    vi.advanceTimersByTime(200);
    expect(view.roots).toHaveLength(0);
    expect(view.selectedId).toBeNull();
    expect(view.collapsed.size).toBe(0);
  });
});
