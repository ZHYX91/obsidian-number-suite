import {
  ItemView,
  MarkdownView,
  TFile,
  setIcon,
  type WorkspaceLeaf,
} from "obsidian";

import { navigateToLine } from "../adapters/navigate-to-line";
import { createDisplayPlan } from "../application/display-plan";
import { HeadingMapIdentity } from "../application/heading-map-identity";
import {
  findHeadingMapNode,
  createHeadingMap,
  type HeadingMapNode,
} from "../application/heading-map";
import {
  HEADING_MAP_CARD_HEIGHT,
  HEADING_MAP_CARD_WIDTH,
  layoutHeadingMap,
  type HeadingMapLayout,
} from "../application/heading-map-layout";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import { resolveNoteSettings } from "../config/frontmatter";
import type { Translate } from "../config/i18n";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";

export const NUMBER_SUITE_HEADING_MAP_VIEW = "number-suite-heading-map";

export interface HeadingMapViewActions {
  readonly getSettings: () => NumberSuiteSettings;
  readonly getTranslate: () => Translate;
}

interface PanState {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const MIN_SCALE = 0.38;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.2;
const SVG_NS = "http://www.w3.org/2000/svg";

export class NumberSuiteHeadingMapView extends ItemView {
  private currentFile: TFile | null = null;
  private sourceLeaf: WorkspaceLeaf | null = null;
  private roots: readonly HeadingMapNode[] = [];
  private identities = new HeadingMapIdentity();
  private readonly collapsed = new Set<string>();
  private readonly searchCollapsed = new Set<string>();
  private selectedId: string | null = null;
  private scopeId: string | null = null;
  private searchQuery = "";
  private firstSearchMatch: string | null = null;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private request = 0;
  private refreshTimer: number | null = null;
  private needsInitialFit = true;
  private pan: PanState | null = null;
  private viewport: HTMLElement | null = null;
  private sceneHost: HTMLElement | null = null;
  private canvas: HTMLElement | null = null;
  private fileLabelEl: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private documentButton: HTMLButtonElement | null = null;
  private subtreeButton: HTMLButtonElement | null = null;
  private scaleLabel: HTMLElement | null = null;
  private lastLayout: HeadingMapLayout | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly actions: HeadingMapViewActions,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return NUMBER_SUITE_HEADING_MAP_VIEW;
  }

  getDisplayText(): string {
    return this.actions.getTranslate()("headingMap.title");
  }

  override getIcon(): string {
    return "git-fork";
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("number-suite-heading-map-view");
    this.buildToolbar();
    this.viewport = this.contentEl.createDiv({ cls: "number-suite-heading-map-viewport" });
    this.sceneHost = this.viewport.createDiv({ cls: "number-suite-heading-map-scene" });

    this.viewport.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    this.viewport.addEventListener("pointerdown", (event) => this.beginPan(event));
    this.viewport.addEventListener("pointermove", (event) => this.movePan(event));
    this.viewport.addEventListener("pointerup", (event) => this.endPan(event));
    this.viewport.addEventListener("pointercancel", (event) => this.endPan(event));
    this.viewport.addEventListener("lostpointercapture", (event) => this.endPan(event));

    this.registerEvent(this.app.workspace.on("file-open", (file) => this.setFile(file)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => this.onActiveLeafChange(leaf)));
    this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => {
      if (info.file?.path === this.currentFile?.path) {
        // Resolve the currently bound pane when the debounce fires, not an arbitrary pane's buffer.
        this.scheduleRefresh();
      }
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file.path === this.currentFile?.path) this.scheduleRefresh();
    }));
    this.setFile(this.app.workspace.getActiveFile(), false);
    await this.refreshMap();
  }

  override async onClose(): Promise<void> {
    this.request += 1;
    this.clearRefreshTimer();
    this.contentEl.empty();
    this.viewport = null;
    this.sceneHost = null;
    this.canvas = null;
    this.lastLayout = null;
  }

  showFile(file: TFile | null, sourceLeaf: WorkspaceLeaf | null = null): void {
    this.clearRefreshTimer();
    this.setFile(file, false);
    if (sourceLeaf?.view instanceof MarkdownView && sourceLeaf.view.file === file) {
      this.sourceLeaf = sourceLeaf;
    }
    void this.refreshMap();
  }

  refresh(): void {
    this.clearRefreshTimer();
    void this.refreshMap();
  }

  private buildToolbar(): void {
    const toolbar = this.contentEl.createDiv({ cls: "number-suite-heading-map-toolbar" });
    const primary = toolbar.createDiv({ cls: "number-suite-heading-map-toolbar-primary" });
    this.fileLabelEl = primary.createDiv({ cls: "number-suite-heading-map-file" });
    const search = primary.createEl("input", {
      cls: "number-suite-heading-map-search",
      type: "search",
    });
    search.placeholder = this.actions.getTranslate()("headingMap.search");
    search.setAttribute("aria-label", this.actions.getTranslate()("headingMap.search"));
    search.addEventListener("input", () => {
      this.searchQuery = search.value.trim();
      this.searchCollapsed.clear();
      this.render();
    });
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || this.firstSearchMatch == null) return;
      event.preventDefault();
      this.searchCollapsed.clear();
      this.render();
      if (this.firstSearchMatch == null) return;
      this.setSelection(this.firstSearchMatch);
      this.centerNode(this.firstSearchMatch);
    });
    this.searchInput = search;

    const secondary = toolbar.createDiv({ cls: "number-suite-heading-map-toolbar-secondary" });
    const scope = secondary.createDiv({ cls: "number-suite-heading-map-scope" });
    this.documentButton = scope.createEl("button", {
      text: this.actions.getTranslate()("headingMap.scope.document"),
    });
    this.documentButton.type = "button";
    this.documentButton.addEventListener("click", () => {
      this.scopeId = null;
      this.needsInitialFit = true;
      this.render();
    });
    this.subtreeButton = scope.createEl("button", {
      text: this.actions.getTranslate()("headingMap.scope.subtree"),
    });
    this.subtreeButton.type = "button";
    this.subtreeButton.addEventListener("click", () => {
      if (this.selectedId == null) return;
      this.scopeId = this.selectedId;
      this.needsInitialFit = true;
      this.render();
    });

    const zoom = secondary.createDiv({ cls: "number-suite-heading-map-zoom" });
    const zoomOut = zoom.createEl("button");
    zoomOut.type = "button";
    setIcon(zoomOut, "minus");
    zoomOut.setAttribute("aria-label", this.actions.getTranslate()("headingMap.zoomOut"));
    zoomOut.addEventListener("click", () => this.setScaleAt(this.scale / ZOOM_STEP));
    this.scaleLabel = zoom.createSpan({ cls: "number-suite-heading-map-scale" });
    const zoomIn = zoom.createEl("button");
    zoomIn.type = "button";
    setIcon(zoomIn, "plus");
    zoomIn.setAttribute("aria-label", this.actions.getTranslate()("headingMap.zoomIn"));
    zoomIn.addEventListener("click", () => this.setScaleAt(this.scale * ZOOM_STEP));
    const fit = zoom.createEl("button");
    fit.type = "button";
    setIcon(fit, "maximize-2");
    fit.setAttribute("aria-label", this.actions.getTranslate()("headingMap.fit"));
    fit.addEventListener("click", () => this.fitToView());
    this.updateToolbarState();
  }

  private updateToolbarState(): void {
    if (this.fileLabelEl != null) {
      this.fileLabelEl.setText(this.currentFile?.basename ?? this.actions.getTranslate()("headingMap.title"));
      this.fileLabelEl.title = this.currentFile?.path ?? "";
    }
    this.documentButton?.classList.toggle("is-active", this.scopeId == null);
    this.subtreeButton?.classList.toggle("is-active", this.scopeId != null);
    if (this.subtreeButton != null) this.subtreeButton.disabled = this.selectedId == null;
    if (this.scaleLabel != null) this.scaleLabel.setText(`${Math.round(this.scale * 100)}%`);
  }

  private setFile(file: TFile | null, refresh = true): void {
    const markdown = file?.extension.toLowerCase() === "md" ? file : null;
    if (this.currentFile?.path === markdown?.path) return;
    this.clearRefreshTimer();
    this.request += 1;
    this.currentFile = markdown;
    this.identities = new HeadingMapIdentity();
    this.roots = [];
    this.lastLayout = null;
    this.collapsed.clear();
    this.searchCollapsed.clear();
    this.selectedId = null;
    this.scopeId = null;
    this.searchQuery = "";
    if (this.searchInput != null) this.searchInput.value = "";
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.needsInitialFit = true;
    this.updateToolbarState();
    if (refresh) void this.refreshMap();
  }

  private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
    if (!(leaf?.view instanceof MarkdownView)) return;
    this.clearRefreshTimer();
    this.request += 1;
    this.sourceLeaf = leaf;
    const path = leaf.view.file?.path ?? null;
    this.setFile(leaf.view.file, false);
    void this.refreshMap(leaf.view.editor.getValue(), path);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer == null) return;
    this.contentEl.ownerDocument.defaultView?.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private scheduleRefresh(source?: string): void {
    this.clearRefreshTimer();
    const request = ++this.request;
    const expectedPath = this.currentFile?.path ?? null;
    const expectedLeaf = this.sourceLeaf;
    const run = (): void => {
      this.refreshTimer = null;
      if (request !== this.request || expectedLeaf !== this.sourceLeaf
        || expectedPath !== (this.currentFile?.path ?? null)) return;
      void this.refreshMap(source, expectedPath);
    };
    const timerWindow = this.contentEl.ownerDocument.defaultView;
    if (timerWindow == null) {
      run();
      return;
    }
    this.refreshTimer = timerWindow.setTimeout(run, 120);
  }

  private async sourceForFile(file: TFile): Promise<string> {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file?.path === file.path) {
      this.sourceLeaf = active.leaf;
      return active.editor.getValue();
    }
    const matching: MarkdownView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
        matching.push(leaf.view);
      }
    });
    const source = matching.find((view) => view.leaf === this.sourceLeaf)
      ?? (matching.length === 1 ? matching[0] : null);
    if (source != null) {
      this.sourceLeaf = source.leaf;
      return source.editor.getValue();
    }
    return this.app.vault.cachedRead(file);
  }

  private async refreshMap(
    sourceOverride?: string,
    expectedPath: string | null = this.currentFile?.path ?? null,
  ): Promise<void> {
    if (expectedPath !== (this.currentFile?.path ?? null)) return;
    const file = this.currentFile;
    const request = this.request + 1;
    this.request = request;
    if (file == null) {
      this.renderStatus(this.actions.getTranslate()("notice.noActiveNote"));
      return;
    }
    this.contentEl.addClass("is-loading");
    try {
      const source = sourceOverride ?? await this.sourceForFile(file);
      if (request !== this.request || expectedPath !== this.currentFile?.path) return;
      const overrides = parseNoteOverridesFromSource(source);
      if (overrides == null) {
        this.renderStatus(this.actions.getTranslate()("notice.invalidFrontmatter"));
        return;
      }
      const settings = this.actions.getSettings();
      const effective = resolveNoteSettings(settings, overrides);
      if (!effective.valid) {
        this.renderStatus(this.actions.getTranslate()("notice.invalidProperties"));
        return;
      }
      const numbering = toNumberingOptions(settings, {
        schemeId: effective.schemeId,
        starts: effective.starts,
        skipFirst: effective.skipFirst,
      });
      const templateSources = cleanupTemplateSources(settings);
      const headings = parseAtxHeadings(source);
      const displayPlan = effective.disabled ? [] : createDisplayPlan(headings, {
        showVirtualNumbers: effective.showVirtualNumbers,
        concealStoredNumbers: effective.concealStoredNumbers,
        numbering,
        cleanupScope: settings.concealScope,
        templateSources,
        revealOnActiveLine: false,
        selections: [],
        composing: false,
      });
      this.roots = createHeadingMap(source, {
        nodeIds: this.identities.update(source, headings),
        headingDisplayPlan: displayPlan,
        numbering,
        cleanupScope: settings.concealScope,
        templateSources,
        concealStoredNumbers: !effective.disabled && effective.concealStoredNumbers,
        recognizeStoredNumbers: !effective.disabled,
      });
      const liveIds = new Set<string>();
      const collectIds = (nodes: readonly HeadingMapNode[]): void => {
        for (const node of nodes) {
          liveIds.add(node.id);
          collectIds(node.children);
        }
      };
      collectIds(this.roots);
      for (const collection of [this.collapsed, this.searchCollapsed]) {
        for (const id of collection) if (!liveIds.has(id)) collection.delete(id);
      }
      if (this.selectedId != null && findHeadingMapNode(this.roots, this.selectedId) == null) {
        this.selectedId = null;
      }
      if (this.scopeId != null && findHeadingMapNode(this.roots, this.scopeId) == null) {
        this.scopeId = null;
      }
      this.render();
    } catch (error: unknown) {
      console.error("Number Suite: failed to build heading mind map", error);
      if (request === this.request) {
        this.renderStatus(this.actions.getTranslate()("headingMap.readFailed"));
      }
    } finally {
      if (request === this.request) this.contentEl.removeClass("is-loading");
    }
  }

  private renderStatus(message: string): void {
    this.roots = [];
    this.lastLayout = null;
    this.canvas = null;
    this.sceneHost?.empty();
    this.sceneHost?.createDiv({ cls: "number-suite-heading-map-status", text: message });
    this.updateToolbarState();
  }

  private render(): void {
    const host = this.sceneHost;
    if (host == null) return;
    const previousAnchor = this.lastLayout?.nodes.find(({ node }) => node.id === this.selectedId);
    host.empty();
    if (this.roots.length === 0) {
      host.createDiv({
        cls: "number-suite-heading-map-status",
        text: this.actions.getTranslate()("headingMap.empty"),
      });
      this.lastLayout = null;
      this.canvas = null;
      this.updateToolbarState();
      return;
    }

    const scoped = this.scopeId == null ? null : findHeadingMapNode(this.roots, this.scopeId);
    const visibleRoots = scoped == null ? this.roots : [scoped];
    const { matches, ancestors } = this.searchState(visibleRoots);
    this.firstSearchMatch = matches.values().next().value ?? null;
    const effectiveCollapsed = new Set(
      [...this.collapsed].filter((id) => !ancestors.has(id)),
    );
    if (this.searchQuery.length > 0) {
      for (const id of this.searchCollapsed) effectiveCollapsed.add(id);
    }
    const layout = layoutHeadingMap(visibleRoots, effectiveCollapsed);
    const nextAnchor = layout.nodes.find(({ node }) => node.id === this.selectedId);
    if (!this.needsInitialFit && previousAnchor != null && nextAnchor != null) {
      this.offsetX += (previousAnchor.x - nextAnchor.x) * this.scale;
      this.offsetY += (previousAnchor.y - nextAnchor.y) * this.scale;
    }
    this.lastLayout = layout;

    const canvas = host.createDiv({ cls: "number-suite-heading-map-canvas" });
    this.canvas = canvas;
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;

    const svg = canvas.ownerDocument.createElementNS(SVG_NS, "svg");
    svg.classList.add("number-suite-heading-map-edges");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("width", String(layout.width));
    svg.setAttribute("height", String(layout.height));
    for (const edge of layout.edges) {
      const path = canvas.ownerDocument.createElementNS(SVG_NS, "path");
      const delta = Math.max(32, (edge.toX - edge.fromX) * 0.45);
      path.setAttribute(
        "d",
        `M ${edge.fromX} ${edge.fromY} C ${edge.fromX + delta} ${edge.fromY}, ${edge.toX - delta} ${edge.toY}, ${edge.toX} ${edge.toY}`,
      );
      svg.appendChild(path);
    }
    canvas.appendChild(svg);

    for (const item of layout.nodes) {
      const { node } = item;
      const card = canvas.createDiv({
        cls: "number-suite-heading-map-card",
        attr: { "data-node-id": node.id },
      });
      card.style.left = `${item.x}px`;
      card.style.top = `${item.y}px`;
      card.style.width = `${HEADING_MAP_CARD_WIDTH}px`;
      card.style.height = `${HEADING_MAP_CARD_HEIGHT}px`;
      card.classList.toggle("is-selected", node.id === this.selectedId);
      card.classList.toggle("is-match", matches.has(node.id));

      const number = card.createEl("button", { cls: "number-suite-heading-map-number" });
      number.type = "button";
      number.setText(node.numberLabel ?? `H${node.level}`);
      number.title = node.numberLabel ?? `H${node.level}`;
      number.addEventListener("click", () => this.setSelection(node.id));
      number.addEventListener("focus", () => this.revealNode(node.id));

      const body = card.createEl("button", { cls: "number-suite-heading-map-body" });
      body.type = "button";
      body.setText(node.title || this.actions.getTranslate()("headingMap.untitled"));
      body.title = node.title || this.actions.getTranslate()("headingMap.untitled");
      body.addEventListener("click", () => this.setSelection(node.id));
      body.addEventListener("focus", () => this.revealNode(node.id));
      body.addEventListener("dblclick", () => void this.navigate(node));
      body.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.repeat) return;
        event.preventDefault();
        void this.navigate(node);
      });

      const childCount = node.children.length;
      const handle = card.createEl("button", {
        cls: "number-suite-heading-map-children",
        text: String(childCount),
        attr: { "data-node-control": node.id },
      });
      handle.type = "button";
      handle.addEventListener("focus", () => this.revealNode(node.id));
      handle.disabled = childCount === 0;
      if (childCount > 0) {
        const collapsed = effectiveCollapsed.has(node.id);
        handle.classList.toggle("is-collapsed", collapsed);
        handle.setAttribute("aria-expanded", String(!collapsed));
        handle.setAttribute("aria-label", this.actions.getTranslate()(
          collapsed ? "headingMap.expand" : "headingMap.collapse",
          { count: childCount },
        ));
        handle.title = handle.getAttribute("aria-label") ?? "";
        handle.addEventListener("click", () => {
          this.setSelection(node.id);
          const collection = this.searchQuery.length > 0 && ancestors.has(node.id)
            ? this.searchCollapsed : this.collapsed;
          if (collapsed) collection.delete(node.id);
          else collection.add(node.id);
          this.render();
          this.focusControl(node.id);
        });
      } else {
        const label = this.actions.getTranslate()("headingMap.childCount", { count: 0 });
        handle.setAttribute("aria-label", label);
        handle.title = label;
      }
    }

    this.applyScale();
    this.updateToolbarState();
    if (this.needsInitialFit) {
      this.needsInitialFit = false;
      this.requestFrame(() => this.fitToView());
    }
  }

  private searchState(roots: readonly HeadingMapNode[]): {
    matches: Set<string>;
    ancestors: Set<string>;
  } {
    const matches = new Set<string>();
    const ancestors = new Set<string>();
    const query = this.searchQuery.toLocaleLowerCase();
    if (query.length === 0) return { matches, ancestors };

    const visit = (node: HeadingMapNode, path: readonly string[]): void => {
      const searchable = `${node.numberLabel ?? ""} ${node.title}`.toLocaleLowerCase();
      if (searchable.includes(query)) {
        matches.add(node.id);
        for (const id of path) ancestors.add(id);
      }
      for (const child of node.children) visit(child, [...path, node.id]);
    };
    for (const root of roots) visit(root, []);
    return { matches, ancestors };
  }

  private setSelection(id: string): void {
    this.selectedId = id;
    const cards = this.sceneHost?.querySelectorAll<HTMLElement>("[data-node-id]") ?? [];
    for (const card of cards) {
      card.classList.toggle("is-selected", card.dataset.nodeId === id);
    }
    this.updateToolbarState();
  }

  private focusControl(id: string): void {
    this.requestFrame(() => {
      const controls = this.sceneHost?.querySelectorAll<HTMLButtonElement>("[data-node-control]") ?? [];
      for (const control of controls) {
        if (control.dataset.nodeControl === id) {
          control.focus({ preventScroll: true });
          break;
        }
      }
    });
  }

  private centerNode(id: string): void {
    const viewport = this.viewport;
    const layout = this.lastLayout;
    if (viewport == null || layout == null) return;
    const item = layout.nodes.find(({ node }) => node.id === id);
    if (item == null) return;
    const centerX = (item.x + HEADING_MAP_CARD_WIDTH / 2) * this.scale;
    const centerY = (item.y + HEADING_MAP_CARD_HEIGHT / 2) * this.scale;
    this.offsetX = viewport.clientWidth / 2 - centerX;
    this.offsetY = viewport.clientHeight / 2 - centerY;
    this.applyScale();
  }

  private revealNode(id: string): void {
    const viewport = this.viewport;
    const item = this.lastLayout?.nodes.find(({ node }) => node.id === id);
    if (viewport == null || item == null) return;
    const left = item.x * this.scale + this.offsetX;
    const top = item.y * this.scale + this.offsetY;
    if (left < 0 || top < 0 || left + HEADING_MAP_CARD_WIDTH * this.scale > viewport.clientWidth
      || top + HEADING_MAP_CARD_HEIGHT * this.scale > viewport.clientHeight) this.centerNode(id);
  }

  private async navigate(node: HeadingMapNode): Promise<void> {
    const file = this.currentFile;
    if (file == null) return;
    await navigateToLine(this.app, file, node.line, this.sourceLeaf);
  }

  private setScaleAt(next: number, pointerX?: number, pointerY?: number): void {
    const viewport = this.viewport;
    if (viewport == null || this.lastLayout == null) return;
    const previous = this.scale;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    if (Math.abs(scale - previous) < 0.001) return;
    const x = pointerX ?? viewport.clientWidth / 2;
    const y = pointerY ?? viewport.clientHeight / 2;
    const logicalX = (x - this.offsetX) / previous;
    const logicalY = (y - this.offsetY) / previous;
    this.scale = scale;
    this.offsetX = x - logicalX * scale;
    this.offsetY = y - logicalY * scale;
    this.applyScale();
  }

  private applyScale(): void {
    const host = this.sceneHost;
    const canvas = this.canvas;
    const layout = this.lastLayout;
    if (host == null || canvas == null || layout == null) return;
    canvas.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    this.updateToolbarState();
  }

  private fitToView(): void {
    const viewport = this.viewport;
    const layout = this.lastLayout;
    if (viewport == null || layout == null || layout.width === 0 || layout.height === 0) return;
    const availableWidth = Math.max(1, viewport.clientWidth - 32);
    const availableHeight = Math.max(1, viewport.clientHeight - 32);
    this.scale = Math.min(
      1,
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min(availableWidth / layout.width, availableHeight / layout.height)),
    );
    this.offsetX = (viewport.clientWidth - layout.width * this.scale) / 2;
    this.offsetY = (viewport.clientHeight - layout.height * this.scale) / 2;
    this.applyScale();
  }

  private onWheel(event: WheelEvent): void {
    const viewport = this.viewport;
    if (viewport == null) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      if (event.deltaY === 0) return;
      const bounds = viewport.getBoundingClientRect();
      this.setScaleAt(this.scale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
        event.clientX - bounds.left, event.clientY - bounds.top);
    } else {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      this.offsetX -= (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) * unit;
      this.offsetY -= (event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY) * unit;
      this.applyScale();
    }
  }

  private beginPan(event: PointerEvent): void {
    const viewport = this.viewport;
    const ElementType = this.contentEl.ownerDocument.defaultView?.Element;
    const target = ElementType != null && event.target instanceof ElementType ? event.target : null;
    if (viewport == null || this.pan != null || event.button !== 0
      || target?.closest(".number-suite-heading-map-card, .number-suite-heading-map-toolbar") != null) {
      return;
    }
    this.pan = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.addClass("is-panning");
  }

  private movePan(event: PointerEvent): void {
    const viewport = this.viewport;
    const pan = this.pan;
    if (viewport == null || pan == null || pan.pointerId !== event.pointerId) return;
    this.offsetX = pan.offsetX + event.clientX - pan.x;
    this.offsetY = pan.offsetY + event.clientY - pan.y;
    this.applyScale();
  }

  private endPan(event: PointerEvent): void {
    const viewport = this.viewport;
    if (viewport == null || this.pan?.pointerId !== event.pointerId) return;
    this.pan = null;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    viewport.removeClass("is-panning");
  }

  private requestFrame(callback: () => void): void {
    const view = this.contentEl.ownerDocument.defaultView;
    if (view == null) callback();
    else view.requestAnimationFrame(callback);
  }
}
