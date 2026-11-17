import { describe, expect, it, vi } from "vitest";
import { MarkdownView, type WorkspaceLeaf } from "obsidian";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class { async setState(): Promise<void> {} },
}));

import { NumberSuiteSidebarView, type NumberSuiteSidebarActions } from "../../src/ui/sidebar-view";

describe("sidebar source pane lifecycle", () => {
  it.each(["outline", "note"])("migrates old %s workspace state into Current note", async (tab) => {
    const sidebar = new NumberSuiteSidebarView({} as WorkspaceLeaf, {} as NumberSuiteSidebarActions);
    const file = { path: "Current.md", extension: "md" };
    const setFile = vi.fn();
    Object.assign(sidebar, { currentFile: file, notePane: { setFile } });
    await sidebar.setState({ tab }, {} as never);
    expect(setFile).toHaveBeenCalledWith(file, true);
    expect(sidebar.getState()).toEqual({});
  });

  it("updates the source identity when only the active pane changes", () => {
    const sidebar = new NumberSuiteSidebarView({} as WorkspaceLeaf, {} as NumberSuiteSidebarActions);
    const setFile = vi.fn();
    Object.assign(sidebar, { setFile });
    const view = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, {
      file: { path: "Same.md" }, editor: { getValue: () => "# Right buffer" },
    });
    const right = { view } as unknown as WorkspaceLeaf;
    const subject = sidebar as unknown as {
      onActiveLeafChange(leaf: WorkspaceLeaf | null): void;
      sourceLeaf: WorkspaceLeaf | null;
    };
    subject.onActiveLeafChange(right);
    expect(subject.sourceLeaf).toBe(right);
    expect(setFile).toHaveBeenLastCalledWith(view.file);
    subject.onActiveLeafChange(null);
    expect(subject.sourceLeaf).toBe(right);
    expect(setFile).toHaveBeenCalledTimes(1);
  });
});
