import type { Workspace } from "obsidian";

/** Include windows that were already open when the plugin was enabled. */
export function workspaceDocuments(workspace: Workspace): Set<Document> {
  const documents = new Set<Document>();
  if (typeof document !== "undefined") documents.add(document);
  workspace.iterateAllLeaves((leaf) => { documents.add(leaf.view.containerEl.ownerDocument); });
  return documents;
}
