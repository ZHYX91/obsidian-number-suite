import { EditorView } from "@codemirror/view";
import {
  MarkdownView,
  Menu,
  type App,
  Component,
  type Editor,
} from "obsidian";

import {
  addCaptionContextMenuItem,
  addStructuralTableCaptionContextMenuItem,
} from "../commands/caption-insertion";
import { findCaptionInsertionTarget } from "../core/caption-insertion";
import {
  readStructuralTableSourceSnapshot,
  resolveStructuralTableSource,
  type StructuralTableSourceSnapshot,
} from "./structural-table-source";
import type { CaptionKind } from "../core/document-semantics";
import type { Translate } from "../config/i18n";

const STRUCTURAL_TABLE_HOST_SELECTOR = ".structural-tables-live-preview";
const CARRIER_TARGET_SELECTOR = [
  `${STRUCTURAL_TABLE_HOST_SELECTOR} th`,
  `${STRUCTURAL_TABLE_HOST_SELECTOR} td`,
  ".cm-content .cm-table-widget th",
  ".cm-content .cm-table-widget td",
  ".cm-content .image-embed",
  ".cm-content .internal-embed.image-embed",
  ".cm-content img",
  ".cm-content .math-block",
  ".cm-content mjx-container[display='true']",
  ".cm-content pre",
  ".cm-content .HyperMD-codeblock",
].join(", ");

interface ResolvedCarrierContext {
  readonly kind: CaptionKind;
  readonly offset: number;
  readonly structuralSnapshot: StructuralTableSourceSnapshot | null;
}

function carrierKind(target: Element): CaptionKind | null {
  if (target.closest(`${STRUCTURAL_TABLE_HOST_SELECTOR}, .cm-table-widget`) != null) return "Table";
  if (target.closest(".image-embed, .internal-embed.image-embed, img") != null) return "Figure";
  if (target.closest(".math-block, mjx-container[display='true']") != null) return "Equation";
  return target.closest("pre, .HyperMD-codeblock") == null ? null : "Code";
}

function carrierRoot(target: Element, kind: CaptionKind): HTMLElement {
  const selector = kind === "Figure"
    ? ".image-embed, .internal-embed.image-embed, img"
    : kind === "Table"
      ? `${STRUCTURAL_TABLE_HOST_SELECTOR}, .cm-table-widget`
      : kind === "Equation"
        ? ".math-block, mjx-container[display='true']"
        : "pre, .HyperMD-codeblock";
  return target.closest<HTMLElement>(selector) ?? target as HTMLElement;
}

export function uniqueCaptionCarrierOffset(
  source: string,
  expectedKind: CaptionKind,
  offsets: readonly number[],
): number | null {
  const targets = new Map<string, ReturnType<typeof findCaptionInsertionTarget>>();
  for (const offset of new Set(offsets)) {
    const target = findCaptionInsertionTarget(source, offset);
    if (target == null || target.kind !== expectedKind) continue;
    targets.set(`${target.kind}:${target.objectFrom}:${target.objectTo}`, target);
  }
  if (targets.size !== 1) return null;
  return [...targets.values()][0]?.objectFrom ?? null;
}

function domOffsets(target: HTMLElement, event: MouseEvent): number[] {
  const codeMirror = EditorView.findFromDOM(target);
  if (codeMirror == null) return [];
  const offsets: number[] = [];
  try {
    const offset = codeMirror.posAtCoords({ x: event.clientX, y: event.clientY });
    if (offset != null) offsets.push(offset);
  } catch {
    // DOM positions below remain authoritative when coordinates are outside the editor viewport.
  }
  for (
    let candidate: HTMLElement | null = target;
    candidate != null && codeMirror.contentDOM.contains(candidate);
    candidate = candidate.parentElement
  ) {
    try {
      offsets.push(codeMirror.posAtDOM(candidate, 0));
    } catch {
      // Some Obsidian replacement widgets do not expose a direct CodeMirror position.
    }
    if (candidate === codeMirror.contentDOM) break;
  }
  return offsets;
}

interface CarrierDocumentScope {
  readonly owner: Component;
  readonly targets: Map<HTMLElement, { owner: Component; view: MarkdownView }>;
  active: boolean;
}

export class CaptionCarrierMenuBridge {
  private readonly contributedEvents = new WeakSet<Event>();
  private readonly documents = new Map<Document, CarrierDocumentScope>();

  constructor(
    private readonly app: App,
    private readonly getTranslate: () => Translate,
    private readonly recordContextOffset: (
      editor: Editor,
      offset: number | null,
      filePath: string | null,
      timerWindow: Window | null,
    ) => void,
    private readonly signal?: AbortSignal,
  ) {}

  register(component: Component): void {
    this.registerDocument(component, document);
    component.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, window) => {
      this.registerDocument(component, window.document);
    }));
    component.registerEvent(this.app.workspace.on("window-close", (_workspaceWindow, window) => {
      const scope = this.documents.get(window.document);
      if (scope != null) component.removeChild(scope.owner);
    }));
  }

  private registerDocument(component: Component, targetDocument: Document): void {
    if (this.signal?.aborted || this.documents.has(targetDocument)) return;
    const owner = component.addChild(new Component());
    const scope: CarrierDocumentScope = { owner, targets: new Map(), active: true };
    this.documents.set(targetDocument, scope);
    owner.registerDomEvent(targetDocument, "contextmenu", (event) => this.captureContext(event), { capture: true });
    const Observer = targetDocument.defaultView?.MutationObserver;
    const observer = Observer == null ? null : new Observer((records) => {
      if (!scope.active) return;
      // Prune final ownership before additions, so a move across views can bind
      // again while a same-view detach/reattach keeps its listener ordering.
      for (const [target, entry] of scope.targets) {
        if (!target.isConnected || target.ownerDocument !== targetDocument || !entry.view.containerEl.contains(target)) {
          entry.view.removeChild(entry.owner);
        }
      }
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1) this.registerTargets(scope, targetDocument, node as Element);
      }
    });
    owner.register(() => {
      scope.active = false;
      observer?.disconnect();
      for (const entry of [...scope.targets.values()]) entry.view.removeChild(entry.owner);
      scope.targets.clear();
      this.documents.delete(targetDocument);
    });
    this.registerTargets(scope, targetDocument, targetDocument);
    if (targetDocument.body != null) observer?.observe(targetDocument.body, { childList: true, subtree: true });
  }

  private registerTargets(scope: CarrierDocumentScope, targetDocument: Document, root: ParentNode): void {
    if (!scope.active) return;
    const targets = [
      ...(("matches" in root && (root as Element).matches(CARRIER_TARGET_SELECTOR)) ? [root as HTMLElement] : []),
      ...root.querySelectorAll<HTMLElement>(CARRIER_TARGET_SELECTOR),
    ];
    for (const target of targets) {
      if (!target.isConnected || target.ownerDocument !== targetDocument || scope.targets.has(target)) continue;
      const view = this.markdownViewFor(target);
      if (view == null) continue;
      const owner = view.addChild(new Component());
      scope.targets.set(target, { owner, view });
      owner.register(() => scope.targets.delete(target));
      owner.registerDomEvent(target, "contextmenu", (event) => this.contribute(event));
    }
  }

  private captureContext(event: MouseEvent): void {
    const target = event.target;
    if (target == null || !("nodeType" in target) || target.nodeType !== 1) return;
    const element = target as Element;
    if (carrierKind(element) == null) return;
    const markdownView = this.markdownViewFor(element);
    if (markdownView == null) return;
    const context = this.resolveContext(element, event);
    this.recordContextOffset(
      markdownView.editor,
      context?.offset ?? null,
      markdownView.file?.path ?? null,
      element.ownerDocument.defaultView,
    );
  }

  private contribute(event: MouseEvent): void {
    if (this.signal?.aborted || this.contributedEvents.has(event)) return;
    const target = event.currentTarget;
    if (target == null || !("nodeType" in target) || target.nodeType !== 1) return;
    const element = target as Element;
    const context = this.resolveContext(element, event);
    const markdownView = this.markdownViewFor(element);
    if (markdownView == null) return;
    if (context == null) {
      if (element.closest(STRUCTURAL_TABLE_HOST_SELECTOR) != null) {
        this.contributedEvents.add(event);
        Menu.forEvent(event).addItem((item) => item
          .setTitle(this.getTranslate()("caption.menu.table.unavailable"))
          .setIcon("table-properties")
          .setDisabled(true));
      }
      return;
    }
    this.contributedEvents.add(event);
    const menu = Menu.forEvent(event);
    if (context.structuralSnapshot != null) {
      addStructuralTableCaptionContextMenuItem(
        this.app,
        menu,
        markdownView.editor,
        markdownView,
        this.getTranslate(),
        context.structuralSnapshot,
        this.signal,
      );
      return;
    }
    addCaptionContextMenuItem(
      this.app,
      menu,
      markdownView.editor,
      markdownView,
      this.getTranslate(),
      context.offset,
      this.signal,
    );
  }

  private resolveContext(target: Element, event: MouseEvent): ResolvedCarrierContext | null {
    const kind = carrierKind(target);
    if (kind == null) return null;
    const markdownView = this.markdownViewFor(target);
    if (markdownView == null) return null;
    const source = markdownView.editor.getValue();
    const structuralHost = target.closest<HTMLElement>(STRUCTURAL_TABLE_HOST_SELECTOR);
    if (structuralHost != null) {
      const snapshot = readStructuralTableSourceSnapshot(structuralHost.dataset);
      if (snapshot == null) return null;
      const resolved = resolveStructuralTableSource(source, markdownView.file?.path ?? null, snapshot);
      return resolved == null ? null : {
        kind: "Table",
        offset: resolved.from,
        structuralSnapshot: snapshot,
      };
    }
    const root = carrierRoot(target, kind);
    const offset = uniqueCaptionCarrierOffset(source, kind, domOffsets(root, event));
    return offset == null ? null : { kind, offset, structuralSnapshot: null };
  }

  private markdownViewFor(target: Node): MarkdownView | null {
    let found: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found === null && leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(target)) {
        found = leaf.view;
      }
    });
    return found;
  }
}
