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
  it("leaves the cursor at the latest destination when two reveal requests resolve in reverse", async () => {
    const file = Object.assign(Object.create(TFile.prototype) as TFile, { path: "Note.md" });
    const leaf = pane(file);
    const setCursor = vi.fn();
    const focus = vi.fn();
    Object.assign(leaf.view, { getMode: () => "source", editor: { setCursor, scrollIntoView: vi.fn(), focus } });
    let release!: () => void;
    const revealLeaf = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const app = { workspace: {
      iterateAllLeaves: (visit: (leaf: WorkspaceLeaf) => void) => visit(leaf), revealLeaf,
    } } as unknown as App;
    const first = navigateToLine(app, file, 1, leaf);
    await navigateToLine(app, file, 12, leaf);
    release();
    await first;
    expect(setCursor.mock.calls).toEqual([[{ line: 12, ch: 0 }]]);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does not refocus a pane detached while it is being revealed", async () => {
    const file = Object.assign(Object.create(TFile.prototype) as TFile, { path: "Note.md" });
    const leaf = pane(file);
    const setCursor = vi.fn();
    const containerEl = { isConnected: true };
    Object.assign(leaf.view, { getMode: () => "source", containerEl, editor: { setCursor, scrollIntoView: vi.fn(), focus: vi.fn() } });
    const app = { workspace: {
      iterateAllLeaves: (visit: (leaf: WorkspaceLeaf) => void) => visit(leaf),
      revealLeaf: () => { containerEl.isConnected = false; },
    } } as unknown as App;
    await navigateToLine(app, file, 4, leaf);
    expect(setCursor).not.toHaveBeenCalled();
  });

  it("navigates to the replacement file instead of a retired pane at the same path", async () => {
    const file = Object.assign(Object.create(TFile.prototype) as TFile, { path: "Note.md" });
    const retired = pane(Object.assign(Object.create(TFile.prototype) as TFile, { path: file.path }));
    const current = pane(file);
    const revealLeaf = vi.fn();
    const app = { workspace: {
      iterateAllLeaves: (visit: (leaf: WorkspaceLeaf) => void) => [retired, current].forEach(visit),
      getActiveViewOfType: () => retired.view, revealLeaf,
    } } as unknown as App;
    await navigateToLine(app, file, 3, retired);
    expect(revealLeaf).toHaveBeenCalledWith(current);
    expect(retired.setEphemeralState).not.toHaveBeenCalled();
  });

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
