import { MarkdownView, type App, type TFile, type WorkspaceLeaf } from "obsidian";

export function isExternalMarkdownPath(path?: string | null): boolean {
  return path?.startsWith("file:") === true;
}

/** External Markdown belongs to a live editor. A URI alone does not identify its buffer. */
export function externalMarkdownView(
  app: App, path: string, preferred?: WorkspaceLeaf | null,
): MarkdownView | undefined {
  const workspace = app.workspace;
  const matches = workspace.getLeavesOfType("markdown").map((leaf) => leaf.view)
    .filter((view): view is MarkdownView => view instanceof MarkdownView
      && view.file?.path === path && view.getState().file === path);
  if (preferred != null) return matches.find((view) => view === preferred.view);
  const active = workspace.getActiveViewOfType(MarkdownView);
  if (active != null && matches.includes(active)) return active;
  const recent = workspace.getMostRecentLeaf()?.view;
  return matches.find((view) => view === recent) ?? (matches.length === 1 ? matches[0] : undefined);
}

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
    if (leaf.view instanceof MarkdownView && leaf.view.file === file) matching.push(leaf);
  });

  const preferred = preferredLeaf != null && matching.includes(preferredLeaf)
    && preferredLeaf.view instanceof MarkdownView
    ? preferredLeaf
    : null;
  if (preferred?.view instanceof MarkdownView) {
    return { leaf: preferred, source: preferred.view.editor.getValue() };
  }

  const active = app.workspace.getActiveViewOfType(MarkdownView);
  if (active?.file === file && matching.includes(active.leaf)) {
    return { leaf: active.leaf, source: active.editor.getValue() };
  }

  const only = matching.length === 1 ? matching[0] ?? null : null;
  if (only?.view instanceof MarkdownView) {
    return { leaf: only, source: only.view.editor.getValue() };
  }
  return { leaf: null, source: await app.vault.cachedRead(file) };
}
