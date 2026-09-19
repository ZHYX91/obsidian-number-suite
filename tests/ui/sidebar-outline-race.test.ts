// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownView, type WorkspaceLeaf } from "obsidian";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {},
}));

import { NumberSuiteSidebarView, type NumberSuiteSidebarActions } from "../../src/ui/sidebar-view";

afterEach(() => {
  vi.useRealTimers();
});

describe("sidebar outline refresh identity", () => {
  it("cancels a delayed buffer refresh when the active file changes", () => {
    vi.useFakeTimers();
    const sidebar = new NumberSuiteSidebarView({} as WorkspaceLeaf, {} as NumberSuiteSidebarActions);
    const host = document.createElement("div");
    const refreshOutline = vi.fn().mockResolvedValue(undefined);
    Object.assign(sidebar, {
      contentEl: host,
      currentFile: { path: "A.md", extension: "md" },
      refreshOutline,
    });
    const subject = sidebar as unknown as {
      scheduleOutlineRefresh(source?: string): void;
      setFile(file: { path: string; extension: string } | null, refresh?: boolean): void;
    };

    subject.scheduleOutlineRefresh("# From A");
    subject.setFile({ path: "B.md", extension: "md" }, false);
    vi.advanceTimersByTime(200);

    expect(refreshOutline).not.toHaveBeenCalled();
  });

  it("invalidates a delayed refresh when switching panes of the same file", () => {
    vi.useFakeTimers();
    const sidebar = new NumberSuiteSidebarView({} as WorkspaceLeaf, {} as NumberSuiteSidebarActions);
    const host = document.createElement("div");
    const refreshOutline = vi.fn().mockResolvedValue(undefined);
    const currentFile = { path: "Same.md", extension: "md" };
    Object.assign(sidebar, {
      contentEl: host,
      currentFile,
      activeTab: "outline",
      refreshOutline,
    });
    const subject = sidebar as unknown as {
      scheduleOutlineRefresh(source?: string): void;
      onActiveLeafChange(leaf: WorkspaceLeaf | null): void;
    };
    subject.scheduleOutlineRefresh("# Old pane");

    const view = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, {
      file: currentFile,
      editor: { getValue: () => "# New pane" },
    });
    subject.onActiveLeafChange({ view } as unknown as WorkspaceLeaf);
    vi.advanceTimersByTime(200);

    expect(refreshOutline).toHaveBeenCalledTimes(1);
    expect(refreshOutline).toHaveBeenCalledWith("# New pane", "Same.md");
  });
});
