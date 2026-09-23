import { MarkdownView, type App, type TFile, type WorkspaceLeaf } from "obsidian";

export interface BoundMarkdownSource {
  readonly leaf: WorkspaceLeaf | null;
  readonly source: string;
}

/** Prefer an explicitly bound pane, then the active same-file pane, then a unique same-file pane. */
export async function readBoundMarkdownSource(
  app: App,
  file: TFile,
  preferredLeaf: WorkspaceLeaf | null,
): Promise<BoundMarkdownSource> {
  const matching: WorkspaceLeaf[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) matching.push(leaf);
  });

  const preferred = preferredLeaf != null && matching.includes(preferredLeaf)
    && preferredLeaf.view instanceof MarkdownView
    ? preferredLeaf
    : null;
  if (preferred?.view instanceof MarkdownView) {
    return { leaf: preferred, source: preferred.view.editor.getValue() };
  }

  const active = app.workspace.getActiveViewOfType(MarkdownView);
  if (active?.file?.path === file.path && matching.includes(active.leaf)) {
    return { leaf: active.leaf, source: active.editor.getValue() };
  }

  const only = matching.length === 1 ? matching[0] ?? null : null;
  if (only?.view instanceof MarkdownView) {
    return { leaf: only, source: only.view.editor.getValue() };
  }
  return { leaf: null, source: await app.vault.cachedRead(file) };
}
