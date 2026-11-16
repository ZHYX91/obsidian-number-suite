import { ItemView, MarkdownView, TFile, type HeadingCache, type Plugin, type View } from "obsidian";
import { createDisplayPlan } from "../application/display-plan";
import { invalidNoteOverrides, resolveNoteSettings } from "../config/frontmatter";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { numberCaptions, parseDocumentSemantics, withoutTrailingBlockId } from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";

export interface ExtraOutlineHeading extends HeadingCache {
  __numberSuiteExtra?: "extended" | "caption";
}
export interface NativeOutlineProjection {
  readonly headings: ExtraOutlineHeading[];
  readonly numberLabels: ReadonlyMap<number, string>;
}
const NUMBER_CLASS = "number-suite-native-outline-number";
const EXTRA_CLASS = "number-suite-native-outline-extra";

export function createNativeOutlineProjection(
  source: string, native: readonly HeadingCache[], settings: NumberSuiteSettings,
): NativeOutlineProjection {
  const original = [...native];
  const numberLabels = new Map<number, string>();
  if (!settings.showOutlineNumbers && !settings.showOutlineExtendedHeadings && !settings.showOutlineCaptions) {
    return { headings: original, numberLabels };
  }
  const effective = resolveNoteSettings(
    settings, parseNoteOverridesFromSource(source) ?? invalidNoteOverrides(),
  );
  if (effective.disabled || !effective.valid) return { headings: original, numberLabels };
  const headings = parseAtxHeadings(source);
  const usedLines = new Set(original.map((item) => item.position.start.line));
  const extras: ExtraOutlineHeading[] = [];
  if (settings.showOutlineExtendedHeadings) {
    for (const heading of headings) {
      if (heading.level < 7 || usedLines.has(heading.line)) continue;
      extras.push({
        heading: heading.content, level: heading.level,
        position: {
          start: { line: heading.line, col: 0, offset: heading.lineFrom },
          end: { line: heading.line, col: heading.lineTo - heading.lineFrom, offset: heading.lineTo },
        },
        __numberSuiteExtra: "extended",
      });
      usedLines.add(heading.line);
    }
  }
  if (settings.showOutlineCaptions) {
    const headingRows = [...original, ...extras].sort(
      (a, b) => a.position.start.offset - b.position.start.offset,
    );
    for (const caption of numberCaptions(parseDocumentSemantics(source).captions)) {
      if (usedLines.has(caption.line)) continue;
      const ancestors = headingRows.filter((row) => row.position.start.line < caption.line);
      const parent = ancestors[ancestors.length - 1];
      extras.push({
        heading: (settings.showCaptionNumbers ? caption.label : caption.kind)
          + ": " + withoutTrailingBlockId(caption.content),
        level: parent == null ? 1 : parent.level + 1,
        position: {
          start: { line: caption.line, col: 0, offset: caption.lineFrom },
          end: { line: caption.line, col: caption.lineTo - caption.lineFrom, offset: caption.lineTo },
        },
        __numberSuiteExtra: "caption",
      });
      usedLines.add(caption.line);
    }
  }
  if (settings.showOutlineNumbers) {
    const plan = createDisplayPlan(headings, {
      showVirtualNumbers: true, concealStoredNumbers: effective.concealStoredNumbers,
      numbering: toNumberingOptions(settings, {
        schemeId: effective.schemeId, starts: effective.starts, skipFirst: effective.skipFirst,
      }),
      cleanupScope: settings.concealScope, templateSources: cleanupTemplateSources(settings),
      revealOnActiveLine: false, selections: [], composing: false,
    });
    const concealed = new Set(plan.filter((item) => item.kind === "conceal").map((item) => item.line));
    for (const item of plan) {
      if (item.kind === "virtual" && !concealed.has(item.line)) numberLabels.set(item.line, item.label);
    }
  }
  return {
    headings: [...original, ...extras].sort(
      (a, b) => a.position.start.offset - b.position.start.offset,
    ),
    numberLabels,
  };
}

interface OutlineInternal extends View {
  getHeadings: () => HeadingCache[];
  update?: () => void;
  requestUpdate?: () => void;
}
interface ObservedOutline {
  view: OutlineInternal;
  root: HTMLElement;
  original: () => HeadingCache[];
  wrapped: () => HeadingCache[];
  observer: MutationObserver;
  onDrag: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  labels: ReadonlyMap<number, string>;
  timer: number | null;
  mapAction: HTMLElement | null;
}
function prop(value: unknown, key: string): unknown {
  return typeof value === "object" && value != null
    ? (value as Record<string, unknown>)[key] : undefined;
}
function outlineRows(view: OutlineInternal): Array<{ item: ExtraOutlineHeading; element: HTMLElement }> | null {
  const internal = view as unknown as { tree?: unknown; treeView?: unknown };
  const root = internal.tree !== undefined ? prop(internal.tree, "root")
    : prop(prop(internal.treeView, "infinityScroll"), "rootEl");
  if (root == null) return null;
  const rows: Array<{ item: ExtraOutlineHeading; element: HTMLElement }> = [];
  const walk = (node: unknown, depth: number): boolean => {
    if (depth > 24) return false;
    const children = prop(prop(node, "vChildren"), "_children");
    if (!Array.isArray(children)) return false;
    for (const child of children) {
      const element = prop(child, "innerEl");
      const item = prop(child, "heading");
      if (!(element instanceof HTMLElement) || typeof prop(item, "heading") !== "string") return false;
      rows.push({ item: item as ExtraOutlineHeading, element });
      if (!walk(child, depth + 1)) return false;
    }
    return true;
  };
  return walk(root, 0) ? rows : null;
}
function pathFor(view: OutlineInternal): string | null {
  const path = view.getState().file;
  return typeof path === "string" ? path : null;
}

/** Scoped, reversible native Outline enhancement. No shared metadata cache writes. */
export class NativeOutlineEnhancer {
  private observed = new Map<View, ObservedOutline>();
  private sources = new Map<string, string>();
  private generations = new Map<string, number>();
  private stopped = false;

  constructor(
    private readonly plugin: Plugin,
    private readonly settings: () => NumberSuiteSettings,
    private readonly openMap: (path: string) => void = () => undefined,
    private readonly mapLabel: () => string = () => "Open heading mind map",
  ) {}

  start(): void {
    const app = this.plugin.app;
    this.plugin.registerEvent(app.workspace.on("layout-change", () => this.refresh()));
    this.plugin.registerEvent(app.workspace.on("file-open", () => this.refresh()));
    this.plugin.registerEvent(app.workspace.on("editor-change", (editor, info) => {
      if (info.file?.path == null) return;
      this.generations.set(info.file.path, (this.generations.get(info.file.path) ?? 0) + 1);
      this.sources.set(info.file.path, editor.getValue());
      this.updatePath(info.file.path);
    }));
    this.plugin.registerEvent(app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") void this.loadSource(file.path);
    }));
    this.plugin.registerEvent(app.metadataCache.on("changed", (file) => {
      if (file.extension === "md") void this.loadSource(file.path);
    }));
    this.plugin.register(() => this.stop());
    app.workspace.onLayoutReady(() => { if (!this.stopped) this.refresh(); });
  }

  refresh(): void {
    if (this.stopped) return;
    const views = this.plugin.app.workspace.getLeavesOfType("outline").map((leaf) => leaf.view);
    for (const view of [...this.observed.keys()]) {
      if (!views.includes(view)) this.remove(view);
    }
    for (const view of views) {
      if (!this.observed.has(view)) this.attach(view);
      const path = pathFor(view as OutlineInternal);
      if (path != null) {
        this.updatePath(path);
        void this.loadSource(path);
      }
    }
  }

  private attach(view: View): void {
    const native = view as OutlineInternal;
    if (typeof native.getHeadings !== "function") return;
    const root = view instanceof ItemView ? view.contentEl : view.containerEl;
    const original = native.getHeadings;
    const current: ObservedOutline = {
      view: native, root, original, wrapped: () => [],
      observer: new MutationObserver(() => this.schedule(view)),
      labels: new Map(), timer: null, mapAction: null,
      onDrag: (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("." + EXTRA_CLASS)) event.preventDefault();
      },
      onDrop: (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("." + EXTRA_CLASS)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
    };
    current.wrapped = () => {
      const headings = original.call(native);
      if (!Array.isArray(headings)) return headings;
      const path = pathFor(native);
      const source = path == null ? null : this.sources.get(path);
      if (source == null) return headings;
      const projection = createNativeOutlineProjection(source, headings, this.settings());
      current.labels = projection.numberLabels;
      return projection.headings;
    };
    try { native.getHeadings = current.wrapped; } catch { return; }
    root.addEventListener("dragstart", current.onDrag, true);
    root.addEventListener("drop", current.onDrop, true);
    current.observer.observe(root, { childList: true, subtree: true, characterData: true });
    this.observed.set(view, current);
    if (view instanceof ItemView) {
      // Public ItemView toolbar API; avoids private header DOM mutations.
      current.mapAction = view.addAction("git-branch", this.mapLabel(), () => {
        const path = pathFor(native);
        if (path != null) this.openMap(path);
      });
      current.mapAction.addClass("number-suite-outline-map-action");
    }
  }

  private schedule(view: View): void {
    const entry = this.observed.get(view);
    if (entry == null || entry.timer != null) return;
    entry.timer = window.setTimeout(() => {
      entry.timer = null;
      this.decorate(entry);
    }, 75);
  }

  private decorate(entry: ObservedOutline): void {
    const rows = outlineRows(entry.view);
    entry.observer.disconnect();
    try {
      entry.root.querySelectorAll("." + NUMBER_CLASS).forEach((el) => el.remove());
      entry.root.querySelectorAll("." + EXTRA_CLASS).forEach((el) => el.classList.remove(EXTRA_CLASS));
      if (rows == null) return;
      const path = pathFor(entry.view);
      const source = path == null ? null : this.sources.get(path);
      const byLine = new Map(
        (source == null ? [] : parseAtxHeadings(source)).map((heading) => [heading.line, heading] as const),
      );
      for (const { item, element } of rows) {
        if (item.__numberSuiteExtra != null) element.closest(".tree-item")?.classList.add(EXTRA_CLASS);
        const line = item.position.start.line;
        const label = entry.labels.get(line);
        if (label == null || item.__numberSuiteExtra === "caption") continue;
        const heading = byLine.get(line);
        if (heading == null || heading.level !== item.level || heading.content.trim() !== item.heading.trim()) {
          continue; // Source and core row can update out of order.
        }
        const span = element.ownerDocument.createElement("span");
        span.className = NUMBER_CLASS;
        span.setAttribute("aria-hidden", "true");
        span.textContent = label;
        element.prepend(span);
      }
    } finally {
      entry.observer.takeRecords();
      entry.observer.observe(entry.root, { childList: true, subtree: true, characterData: true });
    }
  }

  private updatePath(path: string): void {
    for (const entry of this.observed.values()) {
      if (pathFor(entry.view) !== path) continue;
      try {
        if (entry.view.requestUpdate != null) entry.view.requestUpdate();
        else entry.view.update?.();
        this.schedule(entry.view);
      } catch { /* Preserve the original Outline. */ }
    }
  }

  private async loadSource(path: string): Promise<void> {
    const generation = (this.generations.get(path) ?? 0) + 1;
    this.generations.set(path, generation);
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md") return;
    const editor = this.plugin.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === path);
    try {
      const source = editor?.editor.getValue() ?? await this.plugin.app.vault.cachedRead(file);
      if (this.stopped || this.generations.get(path) !== generation) return;
      if (this.sources.get(path) !== source) {
        this.sources.set(path, source);
        this.updatePath(path);
      }
    } catch { /* Source unavailable: leave core Outline intact. */ }
  }

  private remove(view: View): void {
    const entry = this.observed.get(view);
    if (entry == null) return;
    this.observed.delete(view);
    entry.observer.disconnect();
    if (entry.timer != null) window.clearTimeout(entry.timer);
    entry.root.removeEventListener("dragstart", entry.onDrag, true);
    entry.root.removeEventListener("drop", entry.onDrop, true);
    entry.mapAction?.remove();
    entry.root.querySelectorAll("." + NUMBER_CLASS).forEach((el) => el.remove());
    entry.root.querySelectorAll("." + EXTRA_CLASS).forEach((el) => el.classList.remove(EXTRA_CLASS));
    if (entry.view.getHeadings === entry.wrapped) {
      entry.view.getHeadings = entry.original;
      try {
        if (entry.view.requestUpdate != null) entry.view.requestUpdate();
        else entry.view.update?.();
      } catch { /* Host fallback. */ }
    }
  }

  stop(): void {
    this.stopped = true;
    for (const view of [...this.observed.keys()]) this.remove(view);
    this.sources.clear();
    this.generations.clear();
  }
}
