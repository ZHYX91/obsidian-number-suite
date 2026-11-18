import { Menu, Notice, ItemView, MarkdownView, TFile, setIcon, type HeadingCache, type Plugin, type View } from "obsidian";
import { createHeadingMap } from "../application/heading-map";
import { planSameParentHeadingMove, type SameParentHeadingMove } from "../application/heading-map-reorder";
import type { Translate } from "../config/i18n";
import type { CaptionKind } from "../core/document-semantics";
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
  __numberSuiteCaption?: { kind: CaptionKind; ordinal: number; title: string };
}
export interface NativeOutlineProjection {
  readonly headings: ExtraOutlineHeading[];
  readonly numberLabels: ReadonlyMap<number, string>;
  readonly titleLabels?: ReadonlyMap<number, string>;
  readonly numberKinds?: ReadonlyMap<number, "virtual" | "stored">;
  readonly secondaryStoredNumbers?: ReadonlyMap<number, string>;
}
const NUMBER_CLASS = "number-suite-native-outline-number";
const EXTRA_CLASS = "number-suite-native-outline-extra";

export function createNativeOutlineProjection(
  source: string, native: readonly HeadingCache[], settings: NumberSuiteSettings,
  captionTypeLabel?: (kind: CaptionKind) => string,
): NativeOutlineProjection {
  const original = [...native];
  const numberLabels = new Map<number, string>();
  if (!settings.enhanceNativeOutline) {
    return { headings: original, numberLabels };
  }
  const effective = resolveNoteSettings(
    settings, parseNoteOverridesFromSource(source) ?? invalidNoteOverrides(),
  );
  if (effective.disabled || !effective.valid) return { headings: original, numberLabels };
  const headings = parseAtxHeadings(source);
  const parsedByLine = new Map(headings.map((heading) => [heading.line, heading] as const));
  // A stale core cache must never be combined with a newer editor heading
  // at the same position. Until the cache catches up, retain native Outline.
  if (original.some((item) => {
    const heading = parsedByLine.get(item.position.start.line);
    return heading == null || heading.level !== item.level
      || withoutTrailingBlockId(heading.content).trim() !== withoutTrailingBlockId(item.heading).trim();
  })) return { headings: original, numberLabels };
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
    for (const caption of numberCaptions(parseDocumentSemantics(source).captions)) {
      if (usedLines.has(caption.line)) continue;

      extras.push({
        heading: (captionTypeLabel?.(caption.kind) ?? caption.kind)
          + (settings.showCaptionNumbers ? " " + caption.number : "")
          + ": " + withoutTrailingBlockId(caption.content),
        // Higher than every supported heading: attached to the preceding
        // section, then popped before any following heading. Captions stay leaves.
        level: 10,
        position: {
          start: { line: caption.line, col: 0, offset: caption.lineFrom },
          end: { line: caption.line, col: caption.lineTo - caption.lineFrom, offset: caption.lineTo },
        },
        __numberSuiteExtra: "caption",
        __numberSuiteCaption: { kind: caption.kind, ordinal: caption.number, title: withoutTrailingBlockId(caption.content) },
      });
      usedLines.add(caption.line);
    }
  }
  const numbering = toNumberingOptions(settings, {
    schemeId: effective.schemeId, starts: effective.starts, skipFirst: effective.skipFirst,
  });
  const templateSources = cleanupTemplateSources(settings);
  const plan = createDisplayPlan(headings, {
    showVirtualNumbers: effective.showVirtualNumbers,
    concealStoredNumbers: effective.concealStoredNumbers, numbering,
    cleanupScope: settings.concealScope, templateSources,
    revealOnActiveLine: false, selections: [], composing: false,
  });
  const titleLabels = new Map<number, string>();
  const numberKinds = new Map<number, "virtual" | "stored">();
  const secondaryStoredNumbers = new Map<number, string>();
  const collect = (nodes: ReturnType<typeof createHeadingMap>): void => {
    for (const node of nodes) {
      titleLabels.set(node.line, node.title);
      if (settings.showOutlineNumbers && node.numberLabel != null) {
        numberLabels.set(node.line, node.numberLabel);
        if (node.numberKind != null) numberKinds.set(node.line, node.numberKind);
        if (node.storedNumberLabel) secondaryStoredNumbers.set(node.line, node.storedNumberLabel);
      }
      collect(node.children);
    }
  };
  collect(createHeadingMap(source, {
    headingDisplayPlan: plan, numbering, cleanupScope: settings.concealScope,
    templateSources, concealStoredNumbers: effective.concealStoredNumbers,
    recognizeStoredNumbers: !effective.disabled,
    styleStoredNumbers: settings.styleStoredHeadingNumbers && settings.showOutlineNumbers,
  }));
  return {
    headings: [...original, ...extras].sort(
      (a, b) => a.position.start.offset - b.position.start.offset,
    ),
    numberLabels, titleLabels, numberKinds, secondaryStoredNumbers,
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
  titles: ReadonlyMap<number, string>;
  numberKinds: ReadonlyMap<number, "virtual" | "stored">;
  secondaryStoredNumbers: ReadonlyMap<number, string>;
  nativeDragging: boolean;
  drag: { file: TFile; path: string; source: string; line: number } | null;
  preview: SameParentHeadingMove | null;
  cleanupDrag: () => void;
  hasSyntheticEntries: boolean;
  warned: boolean;
  timer: number | null;
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
  private generations = new Map<string, number>();
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
      if (file.extension === "md") void this.loadSource(file.path, true);
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
        const label = this.translate?.("outline.displayOptions") ?? "Display options";
        action.setAttribute("aria-label", label); action.title = label;
      }
    }
    for (const view of [...this.observed.keys()]) {
      if (!views.includes(view)) this.remove(view);
    }
    for (const [view, action] of this.mapActions) {
      if (!views.includes(view) || !action.isConnected) {
        action.remove();
        this.mapActions.delete(view);
      } else {
        const label = this.mapLabel();
        action.setAttribute("aria-label", label);
        action.setAttribute("title", label);
      }
    }
    for (const view of views) {
      this.ensureMapAction(view);
      if (!this.observed.has(view)) this.attach(view);
      const path = pathFor(view as unknown as OutlineInternal);
      if (path != null) {
        this.updatePath(path);
        void this.loadSource(path);
      }
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
    options.setAttribute("aria-label", this.translate?.("outline.displayOptions") ?? "Display options");
    options.title = options.getAttribute("aria-label") ?? "Display options";
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
    action.setAttribute("aria-label", this.mapLabel());
    action.title = this.mapLabel();
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
      view: native, root, original, wrapped: () => [],
      observer: new MutationObserver(() => this.schedule(view)),
      labels: new Map(), titles: new Map(), numberKinds: new Map(), secondaryStoredNumbers: new Map(), nativeDragging: false, drag: null, preview: null, cleanupDrag: () => undefined, hasSyntheticEntries: false, warned: false, timer: null,
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
    current.wrapped = () => {
      const headings = original.call(native);
      if (!Array.isArray(headings) || current.nativeDragging) return headings;
      const path = pathFor(native);
      const source = path == null ? null : this.sources.get(path);
      if (source == null) {
        current.labels = new Map();
        current.numberKinds = new Map();
        current.secondaryStoredNumbers = new Map();
        current.hasSyntheticEntries = false;
        return headings;
      }
      try {
        const projection = createNativeOutlineProjection(source, headings, this.settings(), (kind) => {
          const key = ("caption.kind." + kind.toLowerCase()) as Parameters<Translate>[0];
          return this.translate?.(key) ?? kind;
        });
        current.labels = projection.numberLabels;
        current.titles = projection.titleLabels ?? new Map();
        current.numberKinds = projection.numberKinds ?? new Map();
        current.secondaryStoredNumbers = projection.secondaryStoredNumbers ?? new Map();
        current.hasSyntheticEntries = projection.headings.some((heading) => heading.__numberSuiteExtra != null);
        current.warned = false;
        return projection.headings;
      } catch (error: unknown) {
        // The native Outline owns navigation. A failed projection must never
        // prevent Obsidian from rendering its unmodified heading list.
        if (!current.warned) console.warn("Number Suite: native Outline enhancement unavailable", error);
        current.warned = true;
        current.labels = new Map();
        current.numberKinds = new Map();
        current.secondaryStoredNumbers = new Map();
        current.hasSyntheticEntries = false;
        return headings;
      }
    };
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
    const source = path == null ? null : this.sources.get(path);
    if (path == null || source == null || item.__numberSuiteExtra !== "extended") return false;
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
    this.sources.set(drag.path, editor.getValue());
    this.updatePath(drag.path);
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
      if (Date.now() > suppressClickUntil) return;
      suppressClickUntil = 0;
      event.preventDefault(); event.stopImmediatePropagation();
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
        const caption = item.__numberSuiteCaption;
        const treeItem = element.closest(".tree-item");
        treeItem?.classList.toggle(EXTRA_CLASS, item.__numberSuiteExtra != null);
        treeItem?.classList.toggle("number-suite-native-outline-caption", caption != null);
        if (item.__numberSuiteExtra === "extended") {
          element.draggable = false;
          element.classList.add("number-suite-native-outline-extended");
        }
        const line = item.position.start.line;
        if (caption != null) {
          element.replaceChildren();
          const icon = outlineSpan(element.ownerDocument);
          icon.className = "number-suite-outline-caption-icon";
          icon.setAttribute("aria-hidden", "true");
          setIcon(icon, { Figure: "image", Table: "table", Equation: "sigma", Code: "code" }[caption.kind]);
          const label = outlineSpan(element.ownerDocument);
          label.className = "number-suite-outline-caption-label";
          const key = ("caption.kind." + caption.kind.toLowerCase()) as Parameters<Translate>[0];
          label.textContent = (this.translate?.(key) ?? caption.kind)
            + (this.settings().showCaptionNumbers ? " " + caption.ordinal : "");
          const title = outlineSpan(element.ownerDocument);
          title.className = "number-suite-outline-caption-title";
          title.textContent = caption.title;
          element.append(icon, label, title);
          element.draggable = false;
          continue;
        }
        const heading = byLine.get(line);
        if (heading == null || heading.level !== item.level || withoutTrailingBlockId(heading.content).trim() !== withoutTrailingBlockId(item.heading).trim()) continue;
        const title = entry.titles.get(line) ?? withoutTrailingBlockId(item.heading);
        const label = entry.labels.get(line);
        const badge = label ?? (this.settings().showOutlineLevels ? "H" + item.level : null);
        if (title == null) continue;
        // Keep event ownership on the native row; only its display children change.
        element.replaceChildren();
        if (badge != null) {
          const span = outlineSpan(element.ownerDocument);
          const kind = entry.numberKinds.get(line);
          span.className = NUMBER_CLASS
            + (label == null ? " number-suite-native-outline-level" : kind === "stored"
              ? " is-stored" : " is-virtual");
          span.title = kind === "stored"
            ? this.translate?.("display.heading.storedHint") ?? "Stored heading number"
            : kind === "virtual"
              ? this.translate?.("display.heading.virtualHint") ?? "Virtual heading number"
              : "H" + item.level;
          span.setAttribute("aria-hidden", "true");
          span.textContent = badge;
          element.append(span);
        }
        const saved = entry.secondaryStoredNumbers.get(line);
        if (saved) {
          const span = outlineSpan(element.ownerDocument);
          span.className = NUMBER_CLASS + " is-stored";
          span.title = this.translate?.("display.heading.storedHint") ?? "Stored heading number";
          span.setAttribute("aria-hidden", "true");
          span.textContent = saved;
          element.append(span);
        }
        element.append(element.ownerDocument.createTextNode(title));
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

  private async loadSource(path: string, refreshProjection = false): Promise<void> {
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
      } else if (refreshProjection) {
        // The editor text can arrive before the core heading cache. Once the
        // cache catches up, retry even though the source itself did not change.
        this.updatePath(path);
      }
    } catch { /* Source unavailable: leave core Outline intact. */ }
  }

  private remove(view: View): void {
    const entry = this.observed.get(view);
    if (entry == null) return;
    this.observed.delete(view);
    entry.observer.disconnect();
    entry.cleanupDrag();
    if (entry.timer != null) window.clearTimeout(entry.timer);
    entry.root.removeEventListener("dragstart", entry.onDrag, true);
    entry.root.removeEventListener("drop", entry.onDrop, true);
    entry.root.querySelectorAll("." + NUMBER_CLASS).forEach((el) => el.remove());
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
    this.generations.clear();
  }
}
