import { beforeEach, describe, expect, it, vi } from "vitest";

import { Notice, TFile, type App, type EditorChange, type MarkdownView } from "obsidian";

import { DEFAULT_SETTINGS } from "../../src/config/settings";

const preview = vi.hoisted(() => ({
  options: null as null | { readonly onConfirm: () => Promise<void> },
}));

vi.mock("../../src/ui/preview-modal", () => ({
  ChangePreviewModal: class {
    constructor(options: { readonly onConfirm: () => Promise<void> }) {
      preview.options = options;
    }

    open(): void {}
  },
}));

import { runCurrentNoteOperation } from "../../src/commands/current-note";

const WRITE_SETTINGS = { ...DEFAULT_SETTINGS, selectedSchemeId: "hierarchical" };

function notices(): string[] {
  return (Notice as unknown as { readonly messages: string[] }).messages;
}

function harness(source = "# A") {
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  let value = source;
  let mode = "source";
  const transactions: Array<{ readonly changes: EditorChange[] }> = [];
  const editor = {
    getValue: () => value,
    offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
    transaction: (transaction: { readonly changes: EditorChange[] }) => {
      transactions.push(transaction);
    },
  };
  const view = {
    file: new FileConstructor("note.md"),
    editor,
    getMode: () => mode,
  } as unknown as MarkdownView;
  let active: MarkdownView | null = view;
  const app = {
    workspace: { getActiveViewOfType: () => active },
  } as unknown as App;
  return {
    app,
    transactions,
    setActive: (next: MarkdownView | null) => { active = next; },
    setMode: (next: string) => { mode = next; },
    setValue: (next: string) => { value = next; },
  };
}

beforeEach(() => {
  notices().length = 0;
  preview.options = null;
});

describe("current-note operations", () => {
  it("requires an active editing view", () => {
    const test = harness();
    test.setActive(null);
    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "write", (key) => key);
    expect(notices()).toContain("notice.noActiveNote");

    const reading = harness();
    reading.setMode("preview");
    runCurrentNoteOperation(reading.app, WRITE_SETTINGS, "write", (key) => key);
    expect(notices()).toContain("notice.editModeRequired");
  });

  it("applies the previewed plan in one editor transaction", async () => {
    const test = harness();
    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "write", (key) => key);
    expect(preview.options).not.toBeNull();

    await preview.options?.onConfirm();

    expect(test.transactions).toHaveLength(1);
    expect(test.transactions[0]?.changes.length).toBeGreaterThan(0);
  });

  it("rejects a preview after the editor source changes", async () => {
    const test = harness();
    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "write", (key) => key);
    test.setValue("# Changed");

    await preview.options?.onConfirm();

    expect(test.transactions).toHaveLength(0);
    expect(notices()).toContain("notice.stalePreview");
  });
});
