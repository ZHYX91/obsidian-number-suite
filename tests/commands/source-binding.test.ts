import { describe, expect, it } from "vitest";
import { MarkdownView, TFile, type App, type Editor, type MarkdownFileInfo } from "obsidian";
import { captureSourceBinding } from "../../src/commands/source-binding";

describe("source binding for file-info callbacks", () => {
  it("requires a live matching MarkdownView when file-info has no editor", () => {
    const file = new (TFile as unknown as new (path: string) => TFile)("note.md");
    const editor = { getValue: () => "source" } as Editor;
    const info = { file } as MarkdownFileInfo;
    const view = Object.assign(new MarkdownView({} as never), {
      file, editor, getMode: () => "source", containerEl: { isConnected: true },
    });
    let leaves = [{ view }];
    const app = { vault: { getAbstractFileByPath: () => file }, workspace: { getLeavesOfType: () => leaves } } as unknown as App;
    const binding = captureSourceBinding(app, editor, info);
    expect(binding.isCurrent()).toBe(true);
    Object.assign(view.containerEl, { isConnected: false });
    expect(binding.isCurrent()).toBe(false);
    Object.assign(view.containerEl, { isConnected: true });
    leaves = [];
    expect(binding.isCurrent()).toBe(false);
  });
});
