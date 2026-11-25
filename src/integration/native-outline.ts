import { externalMarkdownView, isExternalMarkdownPath } from "../adapters/markdown-source-binding";
import { navigateToLine } from "../adapters/navigate-to-line";
import { nativeHeadingsInSource, rebaseNativeHeadings, updateOutlineStructure, syntheticRowIsCurrent, type OutlineStructure } from "./native-outline-source";
import type { HeadingNumberPillKind } from "../application/display-plan";
import type { StoredHeadingNumberPill } from "../application/heading-map";
import { headingNumberHint, identifyHeadingNumberPill } from "../ui/virtual-numeral";
import { Menu, Notice, ItemView, MarkdownView, TFile, setIcon, type HeadingCache, type Plugin, type View } from "obsidian";
import { planSameParentHeadingMove, type SameParentHeadingMove } from "../application/heading-map-reorder";
import { createTranslator, type Translate } from "../config/i18n";
import type { NumberSuiteSettings } from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";
import { createNativeOutlineProjection, type ExtraOutlineHeading } from "./native-outline-projection";

const NUMBER_CLASS = "number-suite-native-outline-number";
const EXTRA_CLASS = "number-suite-native-outline-extra";

function setOutlineActionLabel(button: HTMLElement, action: string): void {
  button.setAttribute("aria-label", `Number Suite · ${action}`);
  // Obsidian already shows this label on hover. A title adds a second Chromium tooltip.
  button.removeAttribute("title");
}

interface OutlineInternal extends View {
  getHeadings: () => HeadingCache[];
  update?: () => void;
  requestUpdate?: () => void;
}
interface DecoratedRow {
  signature: string;
  original: ChildNode[];
  rendered: ChildNode[];
  text: string | null;
}

interface ObservedOutline {
  view: OutlineInternal;
  root: HTMLElement;
  original: () => HeadingCache[];
  wrapped: () => HeadingCache[];
  releaseWrapper: () => void;
  observer: MutationObserver;
  onDrag: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  labels: ReadonlyMap<number, string>;
  titles: ReadonlyMap<number, string>;
  numberKinds: ReadonlyMap<number, HeadingNumberPillKind>;
  secondaryStoredNumbers: ReadonlyMap<number, StoredHeadingNumberPill>;
  enhanced: boolean;
  pendingMetadata: boolean;
  nativePositions: string;
  nativeRows: string;
  nativeStructure: { path: string; structure: OutlineStructure; source: string } | null;
  lastProjection: { structure: OutlineStructure; path: string; extras: ExtraOutlineHeading[]; relocated: HeadingCache[] | null } | null;
  readonly decoratedRows: Map<HTMLElement, DecoratedRow>;
  readonly rowSources: WeakMap<HTMLElement, OutlineStructure>;
  readonly syntheticRows: Map<HTMLElement, string | null>;
  nativeDragging: boolean;
  drag: { file: TFile; path: string; source: string; line: number } | null;
  preview: SameParentHeadingMove | null;
  cleanupDrag: () => void;
  warned: boolean;
  scheduled: boolean;
}
/** Another plugin may retain our hook as the next link in its own wrapper.
 * Release the enhancer closure when this pane detaches, keeping its native receiver. */
function detachableHeadings(
  native: OutlineInternal, original: () => HeadingCache[], project: (() => HeadingCache[]) | null,
): Pick<ObservedOutline, "wrapped" | "releaseWrapper"> {
  return {
    wrapped: () => project == null ? original.call(native) : project(),
    releaseWrapper: () => { project = null; },
  };
}

function stillOwnsRow(element: HTMLElement, row: DecoratedRow): boolean {
  return element.childNodes.length === row.rendered.length && element.textContent === row.text
    && row.rendered.every((node, index) => element.childNodes[index] === node);
}

function restoreRow(entry: ObservedOutline, element: HTMLElement): void {
  const previous = entry.decoratedRows.get(element);
  if (previous != null && stillOwnsRow(element, previous)) element.replaceChildren(...previous.original);
  entry.decoratedRows.delete(element);
  entry.rowSources.delete(element);
  restoreSyntheticRow(entry, element);
}

function restoreSyntheticRow(entry: ObservedOutline, element: HTMLElement): void {
  if (!entry.syntheticRows.has(element)) return;
  const draggable = entry.syntheticRows.get(element);
  if (element.getAttribute("draggable") === "false") {
    if (draggable == null) element.removeAttribute("draggable");
    else element.setAttribute("draggable", draggable);
  }
  element.classList.remove("number-suite-native-outline-extended");
  element.closest(".tree-item")?.classList.remove(EXTRA_CLASS, "number-suite-native-outline-caption");
  entry.syntheticRows.delete(element);
}

function decorateRow(entry: ObservedOutline, element: HTMLElement, signature: string, render: () => void): void {
  const previous = entry.decoratedRows.get(element);
  const owned = previous != null && stillOwnsRow(element, previous);
  if (owned && previous.signature === signature) return;
  const original = owned ? previous.original : [...element.childNodes];
  render();
  entry.decoratedRows.set(element, { signature, original, rendered: [...element.childNodes], text: element.textContent });
}

function isOutlineRowElement(value: unknown): value is HTMLElement {
  // Popup windows may own a different HTMLElement constructor.
  return typeof value === "object" && value !== null
    && (value as Node).nodeType === 1
    && typeof prop(value, "querySelector") === "function"
    && typeof (value as HTMLElement).prepend === "function";
}
function outlineSpan(owner: Document): HTMLSpanElement {
  return (owner.win as Window & { createSpan(): HTMLSpanElement }).createSpan();
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
      if (!isOutlineRowElement(element) || typeof prop(item, "heading") !== "string") return false;
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
  // The map entry is independent of the private Outline tree adaptation.
  private readonly mapActions = new Map<View, HTMLElement>();
  private readonly optionActions = new Map<View, HTMLElement>();
  private sources = new Map<string, string>();
  private readonly structures = new Map<string, OutlineStructure>();
  private pendingReads = new Map<string, symbol>();
  private stopped = false;

  constructor(
    private readonly plugin: Plugin,
    private readonly settings: () => NumberSuiteSettings,
    private readonly openMap: (path: string) => void = () => undefined,
    private readonly mapLabel: () => string = () => "Open heading mind map",
    private readonly translate?: Translate,
    private readonly saveSettings: (settings: NumberSuiteSettings) => Promise<void> = async () => undefined,
  ) {}

  start(): void {
    const app = this.plugin.app;
    this.plugin.registerEvent(app.workspace.on("layout-change", () => this.refresh()));
    this.plugin.registerEvent(app.workspace.on("file-open", () => this.refresh()));
    this.plugin.registerEvent(app.workspace.on("active-leaf-change", (leaf) => {
      const view = leaf?.view;
      const path = view instanceof MarkdownView ? view.file?.path : null;
      if (path != null && isExternalMarkdownPath(path)) void this.loadSource(path, true);
    }));
    this.plugin.registerEvent(app.workspace.on("editor-change", (editor, info) => {
      const path = info.file?.path;
      if (path == null || !this.usesSource(path)) return;
      if (isExternalMarkdownPath(path)) {
        const view = externalMarkdownView(this.plugin.app, path);
        if (view?.file !== info.file || view?.editor !== editor) return;
      } else if (app.vault.getAbstractFileByPath(path) !== info.file) return;
      this.pendingReads.delete(path);
      this.receiveSource(path, editor.getValue());
    }));
    this.plugin.registerEvent(app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") void this.loadSource(file.path);
    }));
    this.plugin.registerEvent(app.metadataCache.on("changed", (file) => {
      if (file.extension === "md") void this.loadSource(file.path, true);
    }));
    this.plugin.registerEvent(app.vault.on("delete", (file) => {
      this.forgetSource(file.path);
      this.updatePath(file.path);
    }));
    this.plugin.registerEvent(app.vault.on("rename", (_file, oldPath) => {
      this.forgetSource(oldPath);
      this.refresh();
    }));
    this.plugin.register(() => this.stop());
    app.workspace.onLayoutReady(() => { if (!this.stopped) this.refresh(); });
  }

  refresh(): void {
    if (this.stopped) return;
    const views = this.settings().enhanceNativeOutline
      ? this.plugin.app.workspace.getLeavesOfType("outline").map((leaf) => leaf.view) : [];
    for (const [view, action] of this.optionActions) {
      if (!views.includes(view) || !action.isConnected) { action.remove(); this.optionActions.delete(view); }
      else {
        setOutlineActionLabel(action, this.translate?.("outline.displayOptions") ?? "Display options");
      }
    }
    for (const view of [...this.observed.keys()]) {
      if (!views.includes(view)) this.remove(view);
      else this.observed.get(view)!.lastProjection = null;
    }
    for (const [view, action] of this.mapActions) {
      if (!views.includes(view) || !action.isConnected) {
        action.remove();
        this.mapActions.delete(view);
      } else {
        setOutlineActionLabel(action, this.mapLabel());
      }
    }
    const paths = new Set<string>();
    for (const view of views) {
      this.ensureMapAction(view);
      if (!this.observed.has(view)) this.attach(view);
      const path = pathFor(view as unknown as OutlineInternal);
      if (path != null && this.observed.has(view)) paths.add(path);
    }
    for (const path of [...this.sources.keys(), ...this.pendingReads.keys()]) {
      if (!paths.has(path)) this.forgetSource(path);
    }
    for (const path of paths) {
      this.updatePath(path);
      void this.loadSource(path);
    }
  }

  private usesSource(path: string): boolean {
    return !this.stopped && this.settings().enhanceNativeOutline
      && [...this.observed.values()].some((entry) => pathFor(entry.view) === path);
  }

  private forgetSource(path: string): void {
    this.pendingReads.delete(path);
    this.sources.delete(path);
    this.structures.delete(path);
    for (const entry of this.observed.values()) {
      if (entry.nativeStructure?.path === path) entry.nativeStructure = null;
      if (entry.lastProjection?.path === path) entry.lastProjection = null;
    }
  }

  private ensureMapAction(view: View): void {
    if (this.mapActions.has(view)) return;
    // Outline hides the generic ItemView header. Use its visible native
    // navigation toolbar beside search/collapse/expand instead.
    const toolbar = view.containerEl.querySelector<HTMLElement>(
      ".nav-header .nav-buttons-container, .nav-buttons-container",
    ) ?? view.containerEl.querySelector<HTMLElement>(".nav-header");
    if (toolbar == null) return;
    const options = toolbar.createEl("button");
    options.type = "button";
    options.className = "clickable-icon nav-action-button number-suite-outline-options-action";
    setOutlineActionLabel(options, this.translate?.("outline.displayOptions") ?? "Display options");
    setIcon(options, "sliders-horizontal");
    options.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      const menu = new Menu();
      const definitions = [
        ["showOutlineNumbers", "settings.outline.showNumbers"],
        ["showOutlineLevels", "settings.outline.showLevels"],
        ["showOutlineExtendedHeadings", "settings.outline.showExtended"],
        ["showOutlineCaptions", "settings.outline.showCaptions"],
      ] as const;
      for (const [property, key] of definitions) menu.addItem((item) => item
        .setTitle(this.translate?.(key) ?? key).setChecked(this.settings()[property])
        .onClick(() => {
          const next = { ...this.settings(), [property]: !this.settings()[property] };
          void this.saveSettings(next).then(() => this.refresh()).catch((error: unknown) => {
            console.error("Number Suite: failed to save Outline display options", error);
            new Notice(this.translate?.("settings.save.pending") ?? "Settings were not saved.");
          });
        }));
      const bounds = options.getBoundingClientRect();
      menu.showAtPosition({ x: bounds.left, y: bounds.bottom });
    });
    this.optionActions.set(view, options);
    const action = toolbar.createEl("button");
    action.type = "button";
    action.className = "clickable-icon nav-action-button number-suite-outline-map-action";
    setOutlineActionLabel(action, this.mapLabel());
    setIcon(action, "git-branch");
    action.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      const path = pathFor(view as unknown as OutlineInternal);
      if (path != null) this.openMap(path);
    });
    toolbar.append(action);
    this.mapActions.set(view, action);
  }

  private attach(view: View): void {
    const native = view as OutlineInternal;
    if (typeof native.getHeadings !== "function") return;
    const root = view instanceof ItemView ? view.contentEl : view.containerEl;
    const original = native.getHeadings;
    const current: ObservedOutline = {
      view: native, root, original, wrapped: () => [], releaseWrapper: () => {},
      observer: new MutationObserver(() => this.schedule(view)),
      enhanced: false, pendingMetadata: false, nativePositions: "", nativeRows: "", nativeStructure: null, lastProjection: null, decoratedRows: new Map(), rowSources: new WeakMap(), syntheticRows: new Map(),
      labels: new Map(), titles: new Map(), numberKinds: new Map(), secondaryStoredNumbers: new Map(), nativeDragging: false, drag: null, preview: null, cleanupDrag: () => undefined, warned: false, scheduled: false,
      onDrag: (event) => {
        const row = this.rowAt(current, event.target);
        if (row?.item.__numberSuiteExtra === "caption") {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (row?.item.__numberSuiteExtra === "extended") {
          // The scoped pointer gesture owns extended-section movement. Never
          // let native HTML5 dragging take over before its pointerup commits.
          event.preventDefault(); event.stopImmediatePropagation();
        } else {
          // Native H1-H6 drag still belongs to Obsidian. Give its section
          // algorithm the unmodified core heading list for this gesture.
          current.nativeDragging = true;
          // A host listener can cancel dragstart after this capture listener,
          // in which case the platform need not emit dragend.
          queueMicrotask(() => {
            if (!event.defaultPrevented || !current.nativeDragging || this.stopped) return;
            current.nativeDragging = false;
            const path = pathFor(current.view);
            if (path != null) this.updatePath(path);
          });
        }
      },
      onDrop: (event) => {
        if (current.drag != null) {
          event.preventDefault(); event.stopImmediatePropagation();
          this.previewMove(current, event.target, event.clientY);
          void this.commitMove(current);
        } else if (this.rowAt(current, event.target)?.item.__numberSuiteExtra != null) {
          event.preventDefault(); event.stopImmediatePropagation();
        }
      },
    };
    const nativeOnly = (headings: HeadingCache[]): HeadingCache[] => {
      current.enhanced = false;
      current.labels = new Map();
      current.titles = new Map();
      current.numberKinds = new Map();
      current.secondaryStoredNumbers = new Map();
      return headings;
    };
    const projectionHook = detachableHeadings(native, original, () => {
      const headings = original.call(native);
      if (!Array.isArray(headings) || current.nativeDragging) return headings;
      const nativePositions = this.nativePositions(headings);
      const sameNative = current.nativePositions === nativePositions;
      current.nativePositions = nativePositions;
      current.nativeRows = this.nativeRows(headings);
      const path = pathFor(native);
      const source = path == null ? null : this.sources.get(path);
      const structure = path == null ? null : this.structures.get(path);
      const last = current.lastProjection;
      if (last != null && sameNative && last.path === path && last.structure === structure) {
        const nativeRows = last.relocated ?? headings;
        return last.extras.length === 0 ? nativeRows : [...nativeRows, ...last.extras]
          .sort((left, right) => left.position.start.offset - right.position.start.offset);
      }
      current.lastProjection = null;
      if (source == null) return nativeOnly(headings);
      try {
        let relocated: HeadingCache[] | null = null;
        if (path != null && structure != null) {
          const aligned = nativeHeadingsInSource(headings, structure, source);
          if (aligned != null) {
            current.nativeStructure = { path, structure, source };
            if (aligned !== headings) relocated = aligned;
          } else if (current.nativeStructure?.path === path) {
            const previous = current.nativeStructure.structure;
            const previousHeadings = nativeHeadingsInSource(headings, previous, current.nativeStructure.source);
            if (previousHeadings != null) relocated = rebaseNativeHeadings(previousHeadings, previous, structure);
          }
          if (aligned == null && relocated == null) return nativeOnly(headings);
        }
        const projection = createNativeOutlineProjection(source, relocated ?? headings, this.settings(), (kind) => {
          const key = ("caption.kind." + kind.toLowerCase()) as Parameters<Translate>[0];
          return this.translate?.(key) ?? kind;
        });
        current.enhanced = projection.titleLabels != null;
        current.labels = projection.numberLabels;
        current.titles = projection.titleLabels ?? new Map();
        current.numberKinds = projection.numberKinds ?? new Map();
        current.secondaryStoredNumbers = projection.secondaryStoredNumbers ?? new Map();
        current.warned = false;
        if (path != null && structure != null) current.lastProjection = {
          path, structure, relocated, extras: projection.headings.filter((item) => item.__numberSuiteExtra != null),
        };
        return projection.headings;
      } catch (error: unknown) {
        // The native Outline owns navigation. A failed projection must never
        // prevent Obsidian from rendering its unmodified heading list.
        if (!current.warned) console.warn("Number Suite: native Outline enhancement unavailable", error);
        current.warned = true;
        return nativeOnly(headings);
      }
    });
    current.wrapped = projectionHook.wrapped;
    current.releaseWrapper = projectionHook.releaseWrapper;
    try { native.getHeadings = current.wrapped; } catch { return; }
    root.addEventListener("dragstart", current.onDrag, true);
    root.addEventListener("drop", current.onDrop, true);
    current.cleanupDrag = this.installMoveGestures(current);
    current.observer.observe(root, { childList: true, subtree: true, characterData: true });
    this.observed.set(view, current);
  }

  private rowAt(entry: ObservedOutline, target: EventTarget | null): { item: ExtraOutlineHeading; element: HTMLElement } | null {
    if (!isOutlineRowElement(target) || target.closest(".collapse-icon, .tree-item-icon") != null) return null;
    const self = target.closest(".tree-item-self");
    return outlineRows(entry.view)?.find((row) => row.element === target || row.element.contains(target)
      || (self != null && row.element.closest(".tree-item-self") === self)) ?? null;
  }

  private beginMove(entry: ObservedOutline, item: ExtraOutlineHeading): boolean {
    const path = pathFor(entry.view);
    if (path == null || isExternalMarkdownPath(path) || item.__numberSuiteExtra !== "extended") return false;
    const source = this.sources.get(path);
    if (source == null) return false;
    const heading = parseAtxHeadings(source).find((value) => value.line === item.position.start.line);
    if (heading == null || heading.level !== item.level || heading.content !== item.heading) return false;
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    entry.drag = { file, path, source, line: heading.line };
    entry.preview = null;
    return true;
  }

  private clearMove(entry: ObservedOutline): void {
    entry.drag = null;
    entry.preview = null;
    entry.nativeDragging = false;
    entry.root.querySelectorAll(".number-suite-outline-drop-before, .number-suite-outline-drop-after")
      .forEach((element) => element.classList.remove("number-suite-outline-drop-before", "number-suite-outline-drop-after"));
  }

  private previewMove(entry: ObservedOutline, target: EventTarget | null, clientY: number): boolean {
    entry.root.querySelectorAll(".number-suite-outline-drop-before, .number-suite-outline-drop-after")
      .forEach((element) => element.classList.remove("number-suite-outline-drop-before", "number-suite-outline-drop-after"));
    entry.preview = null;
    const drag = entry.drag;
    const row = this.rowAt(entry, target);
    if (drag == null || row == null || row.item.__numberSuiteExtra !== "extended"
      || pathFor(entry.view) !== drag.path || this.sources.get(drag.path) !== drag.source) return false;
    const heading = parseAtxHeadings(drag.source).find((value) => value.line === row.item.position.start.line);
    if (heading == null || heading.level !== row.item.level || heading.content !== row.item.heading) return false;
    const bounds = row.element.getBoundingClientRect();
    const placement = clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const plan = planSameParentHeadingMove(drag.source, drag.line, row.item.position.start.line, placement);
    if (plan == null) return false;
    entry.preview = Object.freeze(plan);
    row.element.classList.add("number-suite-outline-drop-" + placement);
    return true;
  }

  private async commitMove(entry: ObservedOutline): Promise<void> {
    const drag = entry.drag;
    const plan = entry.preview;
    this.clearMove(entry);
    if (this.stopped || drag == null || plan == null || pathFor(entry.view) !== drag.path
      || this.sources.get(drag.path) !== drag.source) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(drag.path);
    if (!(file instanceof TFile) || file !== drag.file) return;
    let editors = this.plugin.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file === file);
    // Never fall back to the unrelated active editor or Vault.modify: editor
    // history owns the complete section move and its single undo/redo step.
    if (editors.length === 0) {
      const leaf = this.plugin.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      if (this.stopped || pathFor(entry.view) !== drag.path
        || this.plugin.app.vault.getAbstractFileByPath(drag.path) !== file) return;
      editors = leaf.view instanceof MarkdownView && leaf.view.file === file ? [leaf.view] : [];
    }
    const view = editors.find((candidate) => candidate.editor.getValue() === plan.expectedSource);
    if (view == null || editors.some((candidate) => candidate.editor.getValue() !== plan.expectedSource)) return;
    const editor = view.editor;
    const source = editor.getValue();
    if (source !== drag.source || source.slice(plan.from, plan.to) !== plan.original
      || this.plugin.app.vault.getAbstractFileByPath(drag.path) !== file) return;
    editor.transaction({ changes: [{
      from: editor.offsetToPos(plan.from), to: editor.offsetToPos(plan.to), text: plan.replacement,
    }] });
    this.pendingReads.delete(drag.path);
    this.receiveSource(drag.path, editor.getValue());
  }

  private installMoveGestures(entry: ObservedOutline): () => void {
    const root = entry.root;
    const owner = root.ownerDocument;
    let pending: { id: number; x: number; y: number; mouse: boolean; item: ExtraOutlineHeading } | null = null;
    let timer: number | null = null;
    const timerWindow = owner.defaultView ?? window;
    let touchId: number | null = null;
    let suppressClickUntil = 0;
    const cancelTimer = (): void => { if (timer != null) timerWindow.clearTimeout(timer); timer = null; pending = null; };
    const dragover = (event: DragEvent): void => {
      if (entry.drag == null) return;
      event.stopImmediatePropagation();
      if (this.previewMove(entry, event.target, event.clientY)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      }
    };
    const touchmove = (event: TouchEvent): void => {
      if (touchId != null) event.preventDefault();
    };
    const contextmenu = (event: Event): void => {
      if (touchId != null || entry.drag != null) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const finish = (): void => {
      const restoreNativeProjection = entry.nativeDragging;
      cancelTimer(); touchId = null; this.clearMove(entry);
      // The host may have rebuilt its tree from the unprojected list during
      // drag/drop. Restore synthetic rows even after a canceled native drag.
      const path = pathFor(entry.view);
      if (restoreNativeProjection && path != null && !this.stopped) this.updatePath(path);
    };
    const down = (event: PointerEvent): void => {
      if (!event.isPrimary) { finish(); return; }
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isExternalMarkdownPath(pathFor(entry.view))) return;
      const row = this.rowAt(entry, event.target);
      if (row?.item.__numberSuiteExtra !== "extended") return;
      cancelTimer();
      const mouse = event.pointerType === "mouse";
      pending = { id: event.pointerId, x: event.clientX, y: event.clientY, mouse, item: row.item };
      if (mouse) {
        // Prevent host mousedown/native drag initiation, preserving the row's
        // ordinary click navigation when the pointer never crosses the threshold.
        event.preventDefault(); event.stopImmediatePropagation();
        return;
      }
      timer = timerWindow.setTimeout(() => {
        const candidate = pending;
        timer = null; pending = null;
        if (candidate != null && this.beginMove(entry, candidate.item)) touchId = candidate.id;
      }, 350);
    };
    const move = (event: PointerEvent): void => {
      const candidate = pending;
      if (candidate != null && candidate.id === event.pointerId
        && Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > (candidate.mouse ? 5 : 8)) {
        cancelTimer();
        if (candidate.mouse && this.beginMove(entry, candidate.item)) touchId = candidate.id;
      }
      if (touchId !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.previewMove(entry, owner.elementFromPoint(event.clientX, event.clientY), event.clientY);
    };
    const up = (event: PointerEvent): void => {
      cancelTimer();
      if (touchId !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.previewMove(entry, owner.elementFromPoint(event.clientX, event.clientY), event.clientY);
      touchId = null;
      suppressClickUntil = Date.now() + 500;
      void this.commitMove(entry);
    };
    const click = (event: MouseEvent): void => {
      if (Date.now() <= suppressClickUntil) {
        suppressClickUntil = 0;
        event.preventDefault(); event.stopImmediatePropagation();
        return;
      }
      const row = this.rowAt(entry, event.target);
      const path = pathFor(entry.view);
      if (row == null || path == null) return;
      const current = this.structures.get(path);
      const external = isExternalMarkdownPath(path);
      const plainClick = event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (current == null || syntheticRowIsCurrent(current, row.item)) {
        if (external && plainClick && (entry.enhanced || row.item.__numberSuiteExtra != null)) {
          event.preventDefault(); event.stopImmediatePropagation();
          if (current != null) this.navigateExternal(path, row.item.position.start.line);
        }
        return;
      }
      const indexed = entry.nativeStructure;
      const previous = entry.rowSources.get(row.element)
        ?? (entry.pendingMetadata && indexed != null && indexed.path === path
          && syntheticRowIsCurrent(indexed.structure, row.item) ? indexed.structure : null);
      if (previous == null) return;
      // Never give the native handler the old offset. When only prose moved,
      // the previous row order identifies the current source line, including duplicate titles.
      event.preventDefault(); event.stopImmediatePropagation();
      if (previous.contentKey !== current.contentKey || !plainClick) return;
      const oldRows = row.item.__numberSuiteExtra === "caption" ? previous.captionByLine : previous.native;
      const newRows = row.item.__numberSuiteExtra === "caption" ? current.captionByLine : current.native;
      const index = [...oldRows.keys()].indexOf(row.item.position.start.line);
      const line = [...newRows.keys()][index];
      if (line == null) return;
      if (external) this.navigateExternal(path, line);
      else {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) void navigateToLine(this.plugin.app, file, line);
      }
    };
    owner.addEventListener("touchmove", touchmove, { capture: true, passive: false });
    root.addEventListener("contextmenu", contextmenu, true);
    root.addEventListener("click", click, true);
    timerWindow.addEventListener("blur", finish);
    root.addEventListener("dragover", dragover, true);
    owner.addEventListener("dragend", finish, true);
    root.addEventListener("pointerdown", down, true);
    owner.addEventListener("pointermove", move, { capture: true, passive: false });
    owner.addEventListener("pointerup", up, true);
    owner.addEventListener("pointercancel", finish, true);
    return () => {
      finish();
      owner.removeEventListener("touchmove", touchmove, true);
      root.removeEventListener("contextmenu", contextmenu, true);
      root.removeEventListener("click", click, true);
      timerWindow.removeEventListener("blur", finish);
      root.removeEventListener("dragover", dragover, true);
      owner.removeEventListener("dragend", finish, true);
      root.removeEventListener("pointerdown", down, true);
      owner.removeEventListener("pointermove", move, true);
      owner.removeEventListener("pointerup", up, true);
      owner.removeEventListener("pointercancel", finish, true);
    };
  }

  private schedule(view: View): void {
    const entry = this.observed.get(view);
    if (entry == null || entry.scheduled) return;
    entry.scheduled = true;
    queueMicrotask(() => {
      entry.scheduled = false;
      if (this.observed.get(view) === entry) this.decorate(entry);
    });
  }

  private decorate(entry: ObservedOutline): void {
    const rows = outlineRows(entry.view);
    entry.observer.disconnect();
    try {
      const t = this.translate ?? createTranslator(this.settings().language);
      const visible = new Set(rows?.map((row) => row.element) ?? []);
      for (const element of entry.decoratedRows.keys()) {
        if (!entry.enhanced || !visible.has(element)) restoreRow(entry, element);
      }
      if (rows == null || !entry.enhanced) return;
      const path = pathFor(entry.view);
      const source = path == null ? null : this.sources.get(path);
      if (path == null || source == null) return;
      const structure = this.structures.get(path);
      if (structure == null) return;
      for (const { item, element } of rows) {
        const caption = item.__numberSuiteCaption;
        const line = item.position.start.line;
        if (!syntheticRowIsCurrent(structure, item)) {
          const rendered = entry.rowSources.get(element);
          if (rendered?.contentKey === structure.contentKey) continue;
          restoreRow(entry, element);
          continue;
        }
        if (item.__numberSuiteExtra == null) restoreSyntheticRow(entry, element);
        else {
          if (!entry.syntheticRows.has(element)) entry.syntheticRows.set(element, element.getAttribute("draggable"));
          const treeItem = element.closest(".tree-item");
          treeItem?.classList.add(EXTRA_CLASS);
          treeItem?.classList.toggle("number-suite-native-outline-caption", caption != null);
          element.classList.toggle("number-suite-native-outline-extended", item.__numberSuiteExtra === "extended");
          element.draggable = false;
        }
        entry.rowSources.set(element, structure);
        if (caption != null) {
          const key = ("caption.kind." + caption.kind.toLowerCase()) as Parameters<Translate>[0];
          const captionLabel = (this.translate?.(key) ?? caption.kind)
            + (this.settings().showCaptionNumbers ? " " + caption.displayNumber : "");
          decorateRow(entry, element, JSON.stringify([caption.kind, captionLabel, caption.title]), () => {
            element.replaceChildren();
            const icon = outlineSpan(element.ownerDocument);
            icon.className = "number-suite-outline-caption-icon";
            icon.setAttribute("aria-hidden", "true");
            setIcon(icon, { Figure: "image", Table: "table", Equation: "sigma", Code: "code" }[caption.kind]);
            const label = outlineSpan(element.ownerDocument);
            label.className = "number-suite-outline-caption-label";
            label.textContent = captionLabel;
            const title = outlineSpan(element.ownerDocument);
            title.className = "number-suite-outline-caption-title";
            title.textContent = caption.title;
            element.append(icon, label, title);
          });
          continue;
        }
        const title = entry.titles.get(line);
        // Obsidian owns native Setext and other headings outside our display plan.
        if (title == null) continue;
        const label = entry.labels.get(line);
        const badge = label ?? (this.settings().showOutlineLevels ? "H" + item.level : null);
        const kind = entry.numberKinds.get(line);
        const saved = entry.secondaryStoredNumbers.get(line);
        const hint = kind == null ? null : headingNumberHint(kind, t);
        const savedHint = saved == null ? null : headingNumberHint(saved.kind, t);
        const signature = JSON.stringify([title, badge, kind, saved, hint, savedHint]);
        decorateRow(entry, element, signature, () => {
          // Keep event ownership on the native row; only its display children change.
          element.replaceChildren();
          if (badge != null) {
            const span = outlineSpan(element.ownerDocument);
            span.className = NUMBER_CLASS
              + (kind == null ? " number-suite-native-outline-level" : ` is-${kind}`);
            if (hint != null) {
              identifyHeadingNumberPill(span, badge, hint);
            } else {
              span.title = badge;
              span.setAttribute("aria-hidden", "true");
            }
            span.textContent = badge;
            element.append(span);
          }
          if (saved != null && savedHint != null) {
            const span = outlineSpan(element.ownerDocument);
            span.className = NUMBER_CLASS + ` is-${saved.kind}`;
            identifyHeadingNumberPill(span, saved.label, savedHint);
            span.textContent = saved.label;
            element.append(span);
          }
          element.append(element.ownerDocument.createTextNode(title));
        });
      }
    } finally {
      entry.observer.takeRecords();
      entry.observer.observe(entry.root, { childList: true, subtree: true, characterData: true });
    }
  }

  private nativeRows(headings: readonly HeadingCache[]): string {
    return JSON.stringify(headings.map((row) => [row.heading, row.level, row.position.start.line, row.position.end.line]));
  }

  private nativePositions(headings: readonly HeadingCache[]): string {
    return JSON.stringify(headings.map((row) => [row.heading, row.level, row.position.start, row.position.end]));
  }

  private receiveSource(path: string, source: string): boolean {
    const previous = this.sources.get(path);
    if (previous === source) return false;
    this.sources.set(path, source);
    const prior = this.structures.get(path);
    let next: OutlineStructure;
    try {
      next = updateOutlineStructure(previous, source, prior);
    } catch {
      this.forgetSource(path);
      this.updatePath(path);
      return true;
    }
    if (prior?.contentKey === next.contentKey && prior.positionKey === next.positionKey
      && prior.hasCarriageReturns === next.hasCarriageReturns) return true;
    this.structures.set(path, next);
    for (const entry of this.observed.values()) {
      if (pathFor(entry.view) !== path) continue;
      if (prior?.contentKey === next.contentKey && prior.hasCarriageReturns === next.hasCarriageReturns) {
        // Offset-only changes do not need a paint. If physical lines also moved,
        // refresh once the host index catches up; clicks are guarded in the meantime.
        entry.pendingMetadata ||= prior.lineKey !== next.lineKey;
        continue;
      }
      const cached = this.readNativeHeadings(entry);
      if (cached == null) { this.updateEntry(entry); continue; }
      entry.pendingMetadata = nativeHeadingsInSource(cached, next, source) == null;
      this.updateEntry(entry);
    }
    return true;
  }

  private readNativeHeadings(entry: ObservedOutline): HeadingCache[] | null {
    try {
      const headings = entry.original.call(entry.view);
      return Array.isArray(headings) ? headings : null;
    } catch {
      return null;
    }
  }

  private updateEntry(entry: ObservedOutline): void {
    try {
      if (entry.view.requestUpdate != null) entry.view.requestUpdate();
      else entry.view.update?.();
      this.schedule(entry.view);
    } catch { /* Preserve the original Outline. */ }
  }

  private updatePath(path: string): void {
    for (const entry of this.observed.values()) {
      if (pathFor(entry.view) === path) this.updateEntry(entry);
    }
  }

  private navigateExternal(path: string, line: number): void {
    const view = externalMarkdownView(this.plugin.app, path);
    if (view?.file == null || view.getViewData() !== this.sources.get(path)) return;
    void navigateToLine(this.plugin.app, view.file, line, view.leaf, { existingOnly: true });
  }

  private async loadSource(path: string, refreshProjection = false): Promise<void> {
    if (!this.usesSource(path)) return;
    const request = Symbol();
    this.pendingReads.set(path, request);
    try {
      let source: string;
      if (isExternalMarkdownPath(path)) {
        const view = externalMarkdownView(this.plugin.app, path);
        if (view == null) {
          const hadSource = this.sources.has(path);
          this.forgetSource(path);
          if (hadSource) this.updatePath(path);
          return;
        }
        source = view.getViewData();
      } else {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || file.extension !== "md") {
          this.forgetSource(path);
          return;
        }
        const editor = this.plugin.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view)
          .find((view): view is MarkdownView => view instanceof MarkdownView && view.file === file);
        source = editor?.editor.getValue() ?? await this.plugin.app.vault.cachedRead(file);
      }
      if (this.pendingReads.get(path) !== request || !this.usesSource(path)) return;
      const changed = this.receiveSource(path, source);
      if (!changed && refreshProjection) {
        for (const entry of this.observed.values()) {
          if (pathFor(entry.view) !== path) continue;
          const native = this.readNativeHeadings(entry);
          if (native == null) continue;
          const structure = this.structures.get(path);
          if (structure == null) continue;
          const caughtUp = nativeHeadingsInSource(native, structure, source) != null;
          if (entry.pendingMetadata && !caughtUp) continue;
          if (entry.nativeRows === this.nativeRows(native) && !entry.pendingMetadata) continue;
          entry.pendingMetadata = false;
          this.updateEntry(entry);
        }
      }
    } catch { /* Source unavailable: leave core Outline intact. */ }
    finally { if (this.pendingReads.get(path) === request) this.pendingReads.delete(path); }
  }

  private remove(view: View): void {
    const entry = this.observed.get(view);
    if (entry == null) return;
    this.observed.delete(view);
    entry.releaseWrapper();
    entry.observer.disconnect();
    entry.cleanupDrag();
    entry.root.removeEventListener("dragstart", entry.onDrag, true);
    entry.root.removeEventListener("drop", entry.onDrop, true);
    for (const element of entry.decoratedRows.keys()) restoreRow(entry, element);
    entry.root.querySelectorAll("." + EXTRA_CLASS).forEach((el) => el.classList.remove(EXTRA_CLASS));
    entry.root.querySelectorAll(".number-suite-native-outline-caption").forEach((el) => el.classList.remove("number-suite-native-outline-caption"));
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
    for (const action of this.mapActions.values()) action.remove();
    this.mapActions.clear();
    for (const action of this.optionActions.values()) action.remove();
    this.optionActions.clear();
    this.sources.clear();
    this.structures.clear();
    this.pendingReads.clear();
  }
}
