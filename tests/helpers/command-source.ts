import { MarkdownView, type App, type Editor, type MarkdownFileInfo } from "obsidian";

/** Supply a registered file and a live source view for command fixtures. */
export function commandSourceApp(app: App, editor: Editor, info: MarkdownView | MarkdownFileInfo): App {
  const file = info.file;
  const path = file?.path;
  const view = info instanceof MarkdownView ? info : Object.assign(new MarkdownView(null as never), {
    file,
    editor,
    getMode: () => "source",
    containerEl: { isConnected: true },
  });
  return {
    ...app,
    vault: app.vault ?? { getAbstractFileByPath: (candidate: string) => candidate === path ? file : null },
    workspace: app.workspace ?? { getLeavesOfType: () => [{ view }] },
  } as App;
}
