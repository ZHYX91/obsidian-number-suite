import {
  ItemView,
  MarkdownView,
  TFile,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";

import { uiTextDirection, type Translate } from "../config/i18n";
import type { NumberSuiteSettings } from "../config/settings";
import type { TransformOperation } from "../core/types";
import { NoteControlPane } from "./note-control-modal";

export const NUMBER_SUITE_SIDEBAR_VIEW = "number-suite-sidebar";

export interface NumberSuiteSidebarActions {
  readonly getSettings: () => NumberSuiteSettings;
  readonly getTranslate: () => Translate;
  readonly refreshDisplay: () => void;
  readonly runCurrent: (operation: TransformOperation, path: string) => void;
  readonly openBatch: () => void;
  readonly openGlobalSettings: () => void;
  readonly openHeadingMap: (path: string, sourceLeaf: WorkspaceLeaf | null) => void;
}

export class NumberSuiteSidebarView extends ItemView {
  private sourceLeaf: WorkspaceLeaf | null = null;
  private currentFile: TFile | null = null;
  private notePane: NoteControlPane | null = null;

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
    return {};
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    // Old workspace states may contain either tab. Both now restore Current note.
    await super.setState(state, result);
    this.notePane?.setFile(this.currentFile, true);
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("number-suite-sidebar");
    this.contentEl.dir = uiTextDirection(this.actions.getSettings().language);
    const panel = this.contentEl.createDiv({ cls: "number-suite-sidebar-panel is-note" });
    this.notePane = new NoteControlPane(
      this.app,
      panel,
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
        openHeadingMap: () => {
          const path = this.currentFile?.path;
          if (path != null) this.actions.openHeadingMap(path, this.sourceLeaf);
        },
      },
    );
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.setFile(file)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => this.onActiveLeafChange(leaf)));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file.path === this.currentFile?.path) this.notePane?.refresh();
    }));
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    this.sourceLeaf = active?.leaf ?? null;
    this.setFile(active?.file ?? this.app.workspace.getActiveFile());
  }

  override async onClose(): Promise<void> {
    this.notePane?.destroy();
    this.notePane = null;
    this.contentEl.empty();
    this.contentEl.removeAttribute("dir");
  }

  refresh(): void {
    this.contentEl.dir = uiTextDirection(this.actions.getSettings().language);
    this.notePane?.refresh();
  }

  private setFile(file: TFile | null): void {
    const markdown = file?.extension.toLowerCase() === "md" ? file : null;
    if (this.currentFile === markdown) return;
    this.currentFile = markdown;
    this.notePane?.setFile(markdown, true);
  }

  private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
    if (!(leaf?.view instanceof MarkdownView)) return;
    this.sourceLeaf = leaf;
    this.setFile(leaf.view.file);
  }
}
