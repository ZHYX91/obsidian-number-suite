import { MarkdownView, type Plugin, type TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { registerReadingViewRefresh } from "../../src/reading/refresh-reading-views";

describe("reading view source refresh", () => {
  it("refreshes every reading pane for the changed file without touching editors or other notes", () => {
    const pane = (path: string | null, mode: string) => Object.assign(
      Object.create(MarkdownView.prototype) as MarkdownView,
      { file: path == null ? null : { path }, getMode: () => mode,
        previewMode: { rerender: vi.fn() } },
    );
    const first = pane("Note.md", "preview");
    const second = pane("Note.md", "preview");
    const editor = pane("Note.md", "source");
    const other = pane("Other.md", "preview");
    const empty = pane(null, "preview");
    const leaves = [first, second, editor, other, empty, {}].map((view) => ({ view }));
    let changed: (file: TFile) => void = () => { throw new Error("not registered"); };
    const event = {};
    const registerEvent = vi.fn();
    const plugin = {
      registerEvent,
      app: {
        metadataCache: { on: vi.fn((_name, callback: typeof changed) => {
          changed = callback;
          return event;
        }) },
        workspace: { iterateAllLeaves: (callback: (leaf: { view: unknown }) => void) => {
          leaves.forEach(callback);
        } },
      },
    };
    registerReadingViewRefresh(plugin as unknown as Plugin);
    expect(plugin.app.metadataCache.on).toHaveBeenCalledWith("changed", expect.any(Function));
    expect(registerEvent).toHaveBeenCalledWith(event);
    changed({ path: "Note.md" } as TFile);
    expect(first.previewMode.rerender).toHaveBeenCalledExactlyOnceWith(true);
    expect(second.previewMode.rerender).toHaveBeenCalledExactlyOnceWith(true);
    for (const view of [editor, other, empty]) {
      expect(view.previewMode.rerender).not.toHaveBeenCalled();
    }
  });
});
