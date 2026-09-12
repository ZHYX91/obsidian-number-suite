import { MarkdownView, type App, type TFile, type WorkspaceLeaf } from "obsidian";

/** Prefer the originating pane while it still belongs to this workspace and file. */
export async function navigateToLine(
  app: App, file: TFile, line: number, preferred: WorkspaceLeaf | null = null,
): Promise<void> {
  const matching: WorkspaceLeaf[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) matching.push(leaf);
  });
  const active = app.workspace.getActiveViewOfType?.(MarkdownView)?.leaf;
  const recent = app.workspace.getMostRecentLeaf?.();
  const target = [preferred, active, recent].find((leaf) => leaf != null && matching.includes(leaf))
    ?? matching[0] ?? app.workspace.getLeaf("tab");
  if (!(target.view instanceof MarkdownView) || target.view.file?.path !== file.path) {
    await target.openFile(file, { active: true, eState: { line } });
  }
  target.setEphemeralState({ line });
  await app.workspace.revealLeaf(target);
  if (target.view instanceof MarkdownView && target.view.getMode() === "source") {
    const position = { line, ch: 0 };
    target.view.editor.setCursor(position);
    target.view.editor.scrollIntoView({ from: position, to: position }, true);
    target.view.editor.focus();
  }
}
