import { describe, expect, it } from "vitest";
import { MarkdownView, TFile, type App, type WorkspaceLeaf } from "obsidian";

import { readBoundMarkdownSource } from "../../src/adapters/markdown-source-binding";

function view(file: TFile, source: string): MarkdownView {
  return Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, {
    editor: { getValue: () => source },
    file,
  });
}

describe("Markdown source binding", () => {
  it("keeps an existing preferred same-file pane ahead of another active pane", async () => {
    const file = new TFile("Same.md");
    const preferredView = view(file, "# Preferred");
    const activeView = view(file, "# Active");
    const preferred = { view: preferredView } as WorkspaceLeaf;
    const active = { view: activeView } as WorkspaceLeaf;
    Object.assign(preferredView, { leaf: preferred });
    Object.assign(activeView, { leaf: active });
    const app = {
      workspace: {
        iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
          callback(preferred);
          callback(active);
        },
        getActiveViewOfType: () => activeView,
      },
      vault: { cachedRead: async () => "# Disk" },
    } as unknown as App;

    await expect(readBoundMarkdownSource(app, file, preferred)).resolves.toEqual({
      leaf: preferred,
      source: "# Preferred",
    });
  });

  it("falls back to disk when multiple panes exist and none is bound or active", async () => {
    const file = new TFile("Same.md");
    const first = { view: view(file, "# First") } as WorkspaceLeaf;
    const second = { view: view(file, "# Second") } as WorkspaceLeaf;
    const app = {
      workspace: {
        iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
          callback(first);
          callback(second);
        },
        getActiveViewOfType: () => null,
      },
      vault: { cachedRead: async () => "# Disk" },
    } as unknown as App;

    await expect(readBoundMarkdownSource(app, file, null)).resolves.toEqual({
      leaf: null,
      source: "# Disk",
    });
  });
});
