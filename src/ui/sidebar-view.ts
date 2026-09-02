import {
  ItemView,
  MarkdownView,
  TFile,
  setIcon,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";

import { createDisplayPlan } from "../application/display-plan";
import {
  createDocumentOutline,
  type DocumentOutlineNode,
} from "../application/document-outline";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import { resolveNoteSettings } from "../config/frontmatter";
import type { Translate } from "../config/i18n";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";
import type { TransformOperation } from "../core/types";
import type { CaptionKind } from "../core/document-semantics";
import { NoteControlPane } from "./note-control-modal";
import {
  createSidebarTabs,
  sidebarPanelElementId,
  sidebarTabElementId,
  type SidebarTabsController,
} from "./sidebar-tabs";

export const NUMBER_SUITE_SIDEBAR_VIEW = "number-suite-sidebar";
export type NumberSuiteSidebarTab = "outline" | "note";

export interface NumberSuiteSidebarActions {
  readonly getSettings: () => NumberSuiteSettings;
  readonly getTranslate: () => Translate;
  readonly refreshDisplay: () => void;
  readonly runCurrent: (operation: TransformOperation, path: string) => void;
  readonly openBatch: () => void;
  readonly openGlobalSettings: () => void;
}

function sidebarTab(value: unknown): NumberSuiteSidebarTab {
  return value === "note" ? "note" : "outline";
}

const CAPTION_ICONS: Readonly<Record<CaptionKind, string>> = {
  Figure: "image",
  Table: "table-2",
  Equation: "sigma",
  Code: "code-2",
};

export class NumberSuiteSidebarView extends ItemView {
  private activeTab: NumberSuiteSidebarTab = "outline";
  private currentFile: TFile | null = null;
  private outlinePanel: HTMLElement | null = null;
  private notePanel: HTMLElement | null = null;
  private outlineTabButton: HTMLButtonElement | null = null;
  private noteTabButton: HTMLButtonElement | null = null;
  private sidebarTabs: SidebarTabsController<NumberSuiteSidebarTab> | null = null;
  private notePane: NoteControlPane | null = null;
  private outlineRequest = 0;
  private outlineTimer: number | null = null;
  private outlineRoots: readonly DocumentOutlineNode[] = [];
  private readonly collapsed = new Set<string>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly actions: NumberSuiteSidebarActions,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return NUMBER_SUITE_SIDEBAR_VIEW;
  }

  getDisplayText(): string {
    return this.actions.getTranslate()("sidebar.title");
  }

  override getIcon(): string {
    return "list-tree";
  }

  override getState(): Record<string, unknown> {
    return { tab: this.activeTab };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    const value = typeof state === "object" && state != null
      ? (state as Record<string, unknown>).tab
      : null;
    this.activeTab = sidebarTab(value);
    this.applyActiveTab(true);
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("number-suite-sidebar");
    this.sidebarTabs = createSidebarTabs(
      this.contentEl,
      [
        { id: "outline", label: this.actions.getTranslate()("sidebar.tab.outline") },
        { id: "note", label: this.actions.getTranslate()("sidebar.tab.note") },
      ],
      this.activeTab,
      this.actions.getTranslate()("sidebar.tabs.label"),
      (tab) => this.selectTab(tab),
    );
    this.outlineTabButton = this.sidebarTabs.buttons.get("outline") ?? null;
    this.noteTabButton = this.sidebarTabs.buttons.get("note") ?? null;
    const panels = this.contentEl.createDiv({ cls: "number-suite-sidebar-panels" });
    this.outlinePanel = panels.createDiv({ cls: "number-suite-sidebar-panel is-outline" });
    this.outlinePanel.id = sidebarPanelElementId("outline");
    this.outlinePanel.setAttribute("role", "tabpanel");
    this.outlinePanel.setAttribute("aria-labelledby", sidebarTabElementId("outline"));
    this.outlinePanel.tabIndex = 0;
    this.notePanel = panels.createDiv({ cls: "number-suite-sidebar-panel is-note" });
    this.notePanel.id = sidebarPanelElementId("note");
    this.notePanel.setAttribute("role", "tabpanel");
    this.notePanel.setAttribute("aria-labelledby", sidebarTabElementId("note"));
    this.notePanel.tabIndex = 0;
    this.notePane = new NoteControlPane(
      this.app,
      this.notePanel,
      this.actions.getSettings,
      this.actions.getTranslate,
      {
        refreshDisplay: this.actions.refreshDisplay,
        runCurrent: (operation) => {
          const path = this.currentFile?.path;
          if (path != null) this.actions.runCurrent(operation, path);
        },
        openBatch: this.actions.openBatch,
        openGlobalSettings: this.actions.openGlobalSettings,
      },
    );
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.setFile(file)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.setFile(this.app.workspace.getActiveFile());
    }));
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
      if (
        this.activeTab === "outline"
        && info.file?.path === this.currentFile?.path
      ) {
        this.scheduleOutlineRefresh(editor.getValue());
      }
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file.path !== this.currentFile?.path) return;
      if (this.activeTab === "outline") this.scheduleOutlineRefresh();
      else this.notePane?.refresh();
    }));
    this.setFile(this.app.workspace.getActiveFile(), false);
    this.applyActiveTab(true);
  }

  override async onClose(): Promise<void> {
    this.outlineRequest += 1;
    this.clearOutlineTimer();
    this.sidebarTabs?.destroy();
    this.contentEl.empty();
    this.outlinePanel = null;
    this.notePanel = null;
    this.notePane = null;
    this.outlineTabButton = null;
    this.noteTabButton = null;
    this.sidebarTabs = null;
  }

  selectTab(tab: NumberSuiteSidebarTab): void {
    this.activeTab = tab;
    this.applyActiveTab(true);
    void this.app.workspace.requestSaveLayout();
  }

  refresh(): void {
    this.updateTabLabels();
    if (this.activeTab === "outline") void this.refreshOutline();
    else this.notePane?.refresh();
  }

  private updateTabLabels(): void {
    this.sidebarTabs?.setAriaLabel(this.actions.getTranslate()("sidebar.tabs.label"));
    this.outlineTabButton?.setText(this.actions.getTranslate()("sidebar.tab.outline"));
    this.noteTabButton?.setText(this.actions.getTranslate()("sidebar.tab.note"));
  }

  private setFile(file: TFile | null, refresh = true): void {
    const markdown = file?.extension.toLowerCase() === "md" ? file : null;
    if (this.currentFile?.path === markdown?.path) return;
    this.currentFile = markdown;
    this.outlineRoots = [];
    this.collapsed.clear();
    this.notePane?.setFile(markdown, refresh && this.activeTab === "note");
    if (refresh && this.activeTab === "outline") void this.refreshOutline();
  }

  private applyActiveTab(refresh: boolean): void {
    if (
      this.outlinePanel == null
      || this.notePanel == null
      || this.outlineTabButton == null
      || this.noteTabButton == null
    ) return;
    const outline = this.activeTab === "outline";
    this.outlinePanel.toggleAttribute("hidden", !outline);
    this.notePanel.toggleAttribute("hidden", outline);
    this.sidebarTabs?.update(this.activeTab);
    if (!refresh) return;
    if (outline) void this.refreshOutline();
    else this.notePane?.setFile(this.currentFile, true);
  }

  private clearOutlineTimer(): void {
    const timerWindow = this.contentEl.ownerDocument.defaultView;
    if (this.outlineTimer != null) timerWindow?.clearTimeout(this.outlineTimer);
    this.outlineTimer = null;
  }

  private scheduleOutlineRefresh(source?: string): void {
    this.clearOutlineTimer();
    const timerWindow = this.contentEl.ownerDocument.defaultView;
    if (timerWindow == null) {
      void this.refreshOutline(source);
      return;
    }
    this.outlineTimer = timerWindow.setTimeout(() => {
      this.outlineTimer = null;
      void this.refreshOutline(source);
    }, 120);
  }

  private async sourceForFile(file: TFile): Promise<string> {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file?.path === file.path) return active.editor.getValue();
    const matching: MarkdownView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
        matching.push(leaf.view);
      }
    });
    return matching.length === 1
      ? matching[0]?.editor.getValue() ?? this.app.vault.cachedRead(file)
      : this.app.vault.cachedRead(file);
  }

  private async refreshOutline(sourceOverride?: string): Promise<void> {
    const panel = this.outlinePanel;
    const file = this.currentFile;
    const request = this.outlineRequest + 1;
    this.outlineRequest = request;
    if (panel == null) return;
    if (file == null) {
      this.renderOutlineEmpty(panel, "notice.noActiveNote");
      return;
    }
    panel.addClass("is-loading");
    try {
      const source = sourceOverride ?? await this.sourceForFile(file);
      if (request !== this.outlineRequest || file.path !== this.currentFile?.path) return;
      const overrides = parseNoteOverridesFromSource(source);
      if (overrides == null) {
        this.renderOutlineEmpty(panel, "notice.invalidFrontmatter");
        return;
      }
      const settings = this.actions.getSettings();
      const effective = resolveNoteSettings(settings, overrides);
      if (!effective.valid) {
        this.renderOutlineEmpty(panel, "notice.invalidProperties");
        return;
      }
      const headings = parseAtxHeadings(source);
      const displayPlan = effective.disabled ? [] : createDisplayPlan(headings, {
        showVirtualNumbers: effective.showVirtualNumbers,
        concealStoredNumbers: effective.concealStoredNumbers,
        numbering: toNumberingOptions(settings, {
          schemeId: effective.schemeId,
          starts: effective.starts,
          skipFirst: effective.skipFirst,
        }),
        cleanupScope: settings.concealScope,
        templateSources: cleanupTemplateSources(settings),
        revealOnActiveLine: false,
        selections: [],
        composing: false,
      });
      const outline = createDocumentOutline(source, {
        headingDisplayPlan: displayPlan,
        showCaptionNumbers: !effective.disabled && settings.showCaptionNumbers,
      });
      this.renderOutline(panel, file, outline);
    } catch (error: unknown) {
      console.error("Number Suite: failed to build document outline", error);
      if (request === this.outlineRequest) this.renderOutlineEmpty(panel, "sidebar.outline.readFailed");
    } finally {
      if (request === this.outlineRequest) panel.removeClass("is-loading");
    }
  }

  private renderOutline(
    panel: HTMLElement,
    file: TFile,
    outline: readonly DocumentOutlineNode[],
  ): void {
    this.outlineRoots = outline;
    panel.empty();
    const header = panel.createDiv({ cls: "number-suite-sidebar-file" });
    header.createEl("h4", { text: file.basename });
    header.createEl("p", { text: file.path });
    if (outline.length === 0) {
      panel.createEl("p", {
        cls: "number-suite-sidebar-empty",
        text: this.actions.getTranslate()("sidebar.outline.empty"),
      });
      return;
    }
    const tree = panel.createDiv({ cls: "number-suite-outline-tree" });
    tree.setAttribute("role", "tree");
    for (const node of outline) this.renderOutlineNode(tree, file, node, 0);
  }

  private renderOutlineNode(
    container: HTMLElement,
    file: TFile,
    node: DocumentOutlineNode,
    depth: number,
  ): void {
    const key = `${file.path}:${node.kind}:${node.line}`;
    const collapsed = this.collapsed.has(key);
    const item = container.createDiv({ cls: `number-suite-outline-item is-${node.kind}` });
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", String(depth + 1));
    item.style.setProperty("--number-suite-outline-depth", String(depth));
    const row = item.createDiv({ cls: "number-suite-outline-row" });
    const toggle = row.createEl("button", { cls: "number-suite-outline-toggle" });
    toggle.type = "button";
    if (node.children.length > 0) {
      setIcon(toggle, collapsed ? "chevron-right" : "chevron-down");
      toggle.setAttribute("aria-label", this.actions.getTranslate()(
        collapsed ? "sidebar.outline.expand" : "sidebar.outline.collapse",
      ));
      item.setAttribute("aria-expanded", String(!collapsed));
      toggle.addEventListener("click", () => {
        if (collapsed) this.collapsed.delete(key);
        else this.collapsed.add(key);
        if (this.outlinePanel != null) this.renderOutline(this.outlinePanel, file, this.outlineRoots);
      });
    } else {
      toggle.disabled = true;
      toggle.setAttribute("aria-hidden", "true");
    }
    const navigate = row.createEl("button", { cls: "number-suite-outline-link" });
    navigate.type = "button";
    const badge = navigate.createSpan({ cls: "number-suite-outline-badge" });
    if (node.kind === "heading") {
      badge.setText(`H${node.level}`);
    } else {
      setIcon(badge, CAPTION_ICONS[node.captionKind]);
      badge.setAttribute("aria-label", node.captionKind);
    }
    if (node.numberLabel != null) {
      navigate.createSpan({ cls: "number-suite-outline-number", text: node.numberLabel });
    }
    navigate.createSpan({
      cls: "number-suite-outline-title",
      text: node.title || this.actions.getTranslate()("sidebar.outline.untitled"),
    });
    navigate.addEventListener("click", () => void this.navigateToLine(file, node.line));
    if (node.children.length > 0 && !collapsed) {
      const group = item.createDiv({ cls: "number-suite-outline-children" });
      group.setAttribute("role", "group");
      for (const child of node.children) this.renderOutlineNode(group, file, child, depth + 1);
    }
  }

  private renderOutlineEmpty(
    panel: HTMLElement,
    key: "notice.noActiveNote" | "notice.invalidFrontmatter" | "notice.invalidProperties" | "sidebar.outline.readFailed",
  ): void {
    this.outlineRoots = [];
    panel.empty();
    panel.createEl("p", {
      cls: "number-suite-sidebar-empty",
      text: this.actions.getTranslate()(key),
    });
  }

  private async navigateToLine(file: TFile, line: number): Promise<void> {
    let target: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (target == null && leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
        target = leaf;
      }
    });
    target ??= this.app.workspace.getLeaf("tab");
    if (!(target.view instanceof MarkdownView) || target.view.file?.path !== file.path) {
      await target.openFile(file, { active: true, eState: { line } });
    }
    target.setEphemeralState({ line });
    await this.app.workspace.revealLeaf(target);
    if (target.view instanceof MarkdownView && target.view.getMode() === "source") {
      const position = { line, ch: 0 };
      target.view.editor.setCursor(position);
      target.view.editor.scrollIntoView({ from: position, to: position }, true);
      target.view.editor.focus();
    }
  }
}
