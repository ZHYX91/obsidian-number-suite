import { describe, expect, it } from "vitest";
import { MarkdownView, TFile, type App, type Editor, type MarkdownFileInfo } from "obsidian";
import { captureSourceBinding } from "../../src/commands/source-binding";

describe("source binding for file-info callbacks", () => {
  it.each([false, true])("requires a live editable owner with file-info editor=%s", (hasEditor) => {
    const file = new (TFile as unknown as new (path: string) => TFile)("note.md");
    const editor = { getValue: () => "source" } as Editor;
    const info = { file, ...(hasEditor ? { editor } : {}) } as MarkdownFileInfo;
    let mode = "source";
    const view = Object.assign(new MarkdownView({} as never), {
      file, editor, getMode: () => mode, containerEl: { isConnected: true },
    });
    let leaves = [{ view }];
    const app = { vault: { getAbstractFileByPath: () => file }, workspace: { getLeavesOfType: () => leaves } } as unknown as App;
    const binding = captureSourceBinding(app, editor, info);
    expect(binding.isCurrent()).toBe(true);

    mode = "preview";
    expect(binding.isCurrent()).toBe(false);
    mode = "source";
    expect(binding.isCurrent()).toBe(true);

    view.editor = { getValue: () => "source" } as Editor;
    expect(binding.isCurrent()).toBe(false);
    view.editor = editor;
    expect(binding.isCurrent()).toBe(true);

    if (hasEditor) {
      info.editor = { getValue: () => "source" } as Editor;
      expect(binding.isCurrent()).toBe(false);
      info.editor = editor;
      expect(binding.isCurrent()).toBe(true);
    }

    Object.assign(view.containerEl, { isConnected: false });
    expect(binding.isCurrent()).toBe(false);
    Object.assign(view.containerEl, { isConnected: true });
    leaves = [];
    expect(binding.isCurrent()).toBe(false);
  });
});
