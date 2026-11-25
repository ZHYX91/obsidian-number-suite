import { MarkdownView, type App, type TFile, type WorkspaceLeaf } from "obsidian";

const latestNavigation = new WeakMap<App, object>();

/** Prefer the originating pane while it still belongs to this workspace and file. */
export async function navigateToLine(
  app: App, file: TFile, line: number, preferred: WorkspaceLeaf | null = null,
  { existingOnly = false }: { existingOnly?: boolean } = {},
): Promise<void> {
  const request = {};
  latestNavigation.set(app, request);
  const matching: WorkspaceLeaf[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof MarkdownView && leaf.view.file === file) matching.push(leaf);
  });
  const active = app.workspace.getActiveViewOfType?.(MarkdownView)?.leaf;
  const recent = app.workspace.getMostRecentLeaf?.();
  const target = [preferred, active, recent].find((leaf) => leaf != null && matching.includes(leaf))
    ?? matching[0] ?? (existingOnly ? null : app.workspace.getLeaf("tab"));
  if (target == null) return;
  if (!(target.view instanceof MarkdownView) || target.view.file !== file) {
    await target.openFile(file, { active: false });
  }
  if (latestNavigation.get(app) !== request || !(target.view instanceof MarkdownView) || target.view.file !== file) return;
  const view = target.view;
  target.setEphemeralState({ line });
  await app.workspace.revealLeaf(target);
  if (latestNavigation.get(app) === request && target.view === view && view.file === file && view.containerEl?.isConnected !== false
    && view.getMode() === "source") {
    const position = { line, ch: 0 };
    view.editor.setCursor(position);
    view.editor.scrollIntoView({ from: position, to: position }, true);
    view.editor.focus();
  }
}
