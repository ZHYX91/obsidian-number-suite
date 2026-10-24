import { MarkdownView, type App, type Editor, type MarkdownFileInfo } from "obsidian";

/** Supply the file registry and file-info editor binding used by the host. */
export function commandSourceApp(app: App, editor: Editor, info: MarkdownView | MarkdownFileInfo): App {
  const file = info.file;
  const path = file?.path;
  if (!(info instanceof MarkdownView) && info.editor == null) info.editor = editor;
  return {
    ...app,
    vault: app.vault ?? { getAbstractFileByPath: (candidate: string) => candidate === path ? file : null },
    workspace: app.workspace ?? { getLeavesOfType: () => [] },
  } as App;
}
