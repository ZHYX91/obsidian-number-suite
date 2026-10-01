import { MarkdownView, type Plugin } from "obsidian";

/** Counters depend on the whole file, including sections Obsidian did not rerender. */
export function registerReadingViewRefresh(plugin: Plugin): void {
  plugin.registerEvent(plugin.app.metadataCache.on("changed", (file) => {
    plugin.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === file.path
        && view.getMode() === "preview") {
        // Metadata has caught up with the saved source. Rebuild unchanged sections too;
        // an incremental host render otherwise retains their previous counter values.
        view.previewMode.rerender(true);
      }
    });
  }));
}
