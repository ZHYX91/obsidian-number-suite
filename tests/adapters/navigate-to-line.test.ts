import { describe, expect, it, vi } from "vitest";
import { MarkdownView, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { navigateToLine } from "../../src/adapters/navigate-to-line";

function pane(file: TFile): WorkspaceLeaf {
  const view = Object.create(MarkdownView.prototype) as MarkdownView;
  Object.assign(view, { file, getMode: () => "preview" });
  const leaf = { view, setEphemeralState: vi.fn(), openFile: vi.fn() } as unknown as WorkspaceLeaf;
  Object.assign(view, { leaf });
  return leaf;
}

describe("source pane navigation", () => {
  it("prefers the source pane over enumeration order and falls back after it closes", async () => {
    const file = Object.assign(Object.create(TFile.prototype) as TFile, { path: "Note.md" });
    const left = pane(file);
    const right = pane(file);
    let leaves = [left, right];
    const reveal = vi.fn();
    const app = { workspace: {
      iterateAllLeaves: (visit: (leaf: WorkspaceLeaf) => void) => leaves.forEach(visit),
      getActiveViewOfType: () => right.view,
      getMostRecentLeaf: () => left,
      revealLeaf: reveal,
    } } as unknown as App;
    await navigateToLine(app, file, 12, right);
    expect(reveal).toHaveBeenLastCalledWith(right);
    await navigateToLine(app, file, 13);
    expect(reveal).toHaveBeenLastCalledWith(right);
    leaves = [left];
    await navigateToLine(app, file, 14, right);
    expect(reveal).toHaveBeenLastCalledWith(left);
    expect(left.setEphemeralState).toHaveBeenLastCalledWith({ line: 14 });
  });
});
