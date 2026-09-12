import { describe, expect, it, vi } from "vitest";
import { MarkdownView, type WorkspaceLeaf } from "obsidian";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {},
}));

import { NumberSuiteSidebarView, type NumberSuiteSidebarActions } from "../../src/ui/sidebar-view";

describe("sidebar source pane lifecycle", () => {
  it("updates the source identity when only the active pane changes", () => {
    const sidebar = new NumberSuiteSidebarView({} as WorkspaceLeaf, {} as NumberSuiteSidebarActions);
    const setFile = vi.fn();
    const refresh = vi.fn().mockResolvedValue(undefined);
    Object.assign(sidebar, { setFile, refreshOutline: refresh });
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
    expect(refresh).toHaveBeenLastCalledWith("# Right buffer");
    subject.onActiveLeafChange(null);
    expect(subject.sourceLeaf).toBe(right);
    expect(setFile).toHaveBeenCalledTimes(1);
  });
});
