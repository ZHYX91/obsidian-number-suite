import { EditorView } from "@codemirror/view";
import {
  MarkdownView,
  Menu,
  type App,
  type Component,
  type Editor,
} from "obsidian";

import {
  addCaptionContextMenuItem,
  addStructuralTableCaptionContextMenuItem,
} from "../commands/caption-insertion";
import {
  findCaptionInsertionTarget,
  findCaptionInsertionTargetForTable,
} from "../core/caption-insertion";
import type { CaptionKind } from "../core/document-semantics";
import type { Translate } from "../config/i18n";

const STRUCTURAL_TABLE_HOST_SELECTOR = ".structural-tables-live-preview[data-structural-source-table-index]";
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
  readonly sourceTableIndex: number | null;
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

export class CaptionCarrierMenuBridge {
  private readonly contributedEvents = new WeakSet<Event>();
  private readonly registeredDocuments = new WeakSet<Document>();
  private readonly registeredTargets = new WeakSet<HTMLElement>();

  constructor(
    private readonly app: App,
    private readonly getTranslate: () => Translate,
    private readonly recordContextOffset: (
      editor: Editor,
      offset: number | null,
      filePath: string | null,
      timerWindow: Window | null,
    ) => void,
  ) {}

  register(component: Component): void {
    this.registerDocument(component, document);
    component.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, window) => {
      this.registerDocument(component, window.document);
    }));
  }

  private registerDocument(component: Component, targetDocument: Document): void {
    if (this.registeredDocuments.has(targetDocument)) return;
    this.registeredDocuments.add(targetDocument);
    component.registerDomEvent(
      targetDocument,
      "contextmenu",
      (event) => this.captureContext(event),
      { capture: true },
    );
    this.registerTargets(component, targetDocument);
    const Observer = targetDocument.defaultView?.MutationObserver;
    if (Observer === undefined || targetDocument.body === null) return;
    const observer = new Observer((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) this.registerTargets(component, node as Element);
        }
      }
    });
    observer.observe(targetDocument.body, { childList: true, subtree: true });
    component.register(() => observer.disconnect());
  }

  private registerTargets(component: Component, root: ParentNode): void {
    const targets = [
      ...(("matches" in root && (root as Element).matches(CARRIER_TARGET_SELECTOR))
        ? [root as HTMLElement]
        : []),
      ...root.querySelectorAll<HTMLElement>(CARRIER_TARGET_SELECTOR),
    ];
    for (const target of targets) {
      if (this.registeredTargets.has(target)) continue;
      this.registeredTargets.add(target);
      component.registerDomEvent(target, "contextmenu", (event) => this.contribute(event));
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
    if (this.contributedEvents.has(event)) return;
    const target = event.currentTarget;
    if (target == null || !("nodeType" in target) || target.nodeType !== 1) return;
    const element = target as Element;
    const context = this.resolveContext(element, event);
    if (context == null) return;
    const markdownView = this.markdownViewFor(element);
    if (markdownView == null) return;
    this.contributedEvents.add(event);
    const menu = Menu.forEvent(event);
    if (context.sourceTableIndex != null) {
      addStructuralTableCaptionContextMenuItem(
        this.app,
        menu,
        markdownView.editor,
        markdownView,
        this.getTranslate(),
        context.sourceTableIndex,
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
      const sourceTableIndex = Number(structuralHost.dataset.structuralSourceTableIndex);
      if (!Number.isInteger(sourceTableIndex) || sourceTableIndex < 0) return null;
      const resolved = findCaptionInsertionTargetForTable(source, sourceTableIndex);
      return resolved == null ? null : {
        kind: "Table",
        offset: resolved.objectFrom,
        sourceTableIndex,
      };
    }
    const root = carrierRoot(target, kind);
    const offset = uniqueCaptionCarrierOffset(source, kind, domOffsets(root, event));
    return offset == null ? null : { kind, offset, sourceTableIndex: null };
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
