import {
  MarkdownView,
  Menu,
  type App,
  type Component,
} from "obsidian";

import { addStructuralTableCaptionContextMenuItem } from "../commands/caption-insertion";
import type { Translate } from "../config/i18n";

const STRUCTURAL_TABLE_CELL_SELECTOR = [
  ".structural-tables-live-preview[data-structural-source-table-index] th",
  ".structural-tables-live-preview[data-structural-source-table-index] td",
].join(", ");
const STRUCTURAL_TABLE_HOST_SELECTOR = ".structural-tables-live-preview[data-structural-source-table-index]";

export class StructuralTableCaptionMenuBridge {
  private readonly contributedEvents = new WeakSet<Event>();
  private readonly registeredDocuments = new WeakSet<Document>();
  private readonly registeredTargets = new WeakSet<HTMLElement>();

  constructor(
    private readonly app: App,
    private readonly getTranslate: () => Translate,
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
      ...(("matches" in root && (root as Element).matches(STRUCTURAL_TABLE_CELL_SELECTOR))
        ? [root as HTMLElement]
        : []),
      ...root.querySelectorAll<HTMLElement>(STRUCTURAL_TABLE_CELL_SELECTOR),
    ];
    for (const target of targets) {
      if (this.registeredTargets.has(target)) continue;
      this.registeredTargets.add(target);
      component.registerDomEvent(target, "contextmenu", (event) => this.contribute(event));
    }
  }

  private contribute(event: MouseEvent): void {
    if (this.contributedEvents.has(event)) return;
    const target = event.currentTarget;
    if (target == null || !("nodeType" in target) || target.nodeType !== 1) return;
    const host = (target as Element).closest<HTMLElement>(STRUCTURAL_TABLE_HOST_SELECTOR);
    if (host == null) return;
    const sourceTableIndex = Number(host.dataset.structuralSourceTableIndex);
    if (!Number.isInteger(sourceTableIndex) || sourceTableIndex < 0) return;
    const markdownView = this.markdownViewFor(host);
    if (markdownView == null) return;
    this.contributedEvents.add(event);
    addStructuralTableCaptionContextMenuItem(
      this.app,
      Menu.forEvent(event),
      markdownView.editor,
      markdownView,
      this.getTranslate(),
      sourceTableIndex,
    );
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
