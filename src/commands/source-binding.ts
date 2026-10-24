import { MarkdownView, type App, type Editor, type MarkdownFileInfo } from "obsidian";

/** Pin an editable source, including the registered file object, for deferred commands. */
export function captureSourceBinding(app: App, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
  const file = info.file;
  const path = file?.path;
  const source = editor.getValue();
  const view = info instanceof MarkdownView ? info : null;
  return {
    source,
    editor,
    view,
    isCurrent(expectedSource = source): boolean {
      if (file == null || path == null || info.file !== file || file.path !== path
        || app.vault.getAbstractFileByPath(path) !== file || editor.getValue() !== expectedSource) return false;
      if (view !== null) return view.editor === editor && view.getMode() === "source" && view.containerEl.isConnected;
      if (info.editor != null) return info.editor === editor;
      return app.workspace.getLeavesOfType("markdown").some((leaf) => leaf.view instanceof MarkdownView
        && leaf.view.file === file && leaf.view.editor === editor
        && leaf.view.getMode() === "source" && leaf.view.containerEl.isConnected);
    },
  };
}
