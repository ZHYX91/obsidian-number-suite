import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownView, Notice, TFile, type App, type EditorChange } from "obsidian";
import * as obsidian from "obsidian";

import { DEFAULT_SETTINGS } from "../../src/config/settings";
import type { PreviewDocument } from "../../src/ui/preview-modal";

const preview = vi.hoisted(() => ({
  options: null as null | {
    readonly documents?: readonly PreviewDocument[];
    readonly cleanupScope?: string;
    readonly onCleanupScopeChange?: (scope: "plugin" | "templates" | "common") => unknown;
    readonly onConfirm: () => Promise<void>;
  },
}));

vi.mock("../../src/ui/preview-modal", () => ({
  ChangePreviewModal: class {
    constructor(options: { readonly documents?: readonly PreviewDocument[]; readonly onConfirm: () => Promise<void> }) {
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
  const view = new MarkdownView({} as never);
  view.file = new FileConstructor("note.md");
  Object.assign(view, { editor, getMode: () => mode, containerEl: { isConnected: true } });
  const files = new Map([[view.file.path, view.file]]);
  let active: MarkdownView | null = view;
  let openViews: MarkdownView[] = [view];
  const app = {
    vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
    workspace: {
      getActiveViewOfType: () => active,
      iterateAllLeaves: (callback: (leaf: { readonly view: MarkdownView }) => void) => {
        for (const openView of openViews) callback({ view: openView });
      },
    },
  } as unknown as App;
  return {
    app,
    files,
    editor,
    transactions,
    view,
    setActive: (next: MarkdownView | null) => { active = next; },
    setOpenViews: (next: MarkdownView[]) => { openViews = next; },
    setMode: (next: string) => { mode = next; },
    setValue: (next: string) => { value = next; },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  notices().length = 0;
  preview.options = null;
});

describe("current-note operations", () => {
  it.each(["write", "renumber"] as const)("shows an overflow warning from the %s command without transacting", async (operation) => {
    const frontmatter = `number-suite:\n  - heading.first-number.h1=${Number.MAX_SAFE_INTEGER}`;
    const source = `---\n${frontmatter}\n---\n# First\n# Overflow\n## Child`;
    const test = harness(source);
    vi.spyOn(obsidian, "getFrontMatterInfo").mockReturnValue({
      exists: true, frontmatter, from: 4, to: 4 + frontmatter.length,
      contentStart: 9 + frontmatter.length,
    });
    vi.spyOn(obsidian, "parseYaml").mockReturnValue({
      "number-suite": [`heading.first-number.h1=${Number.MAX_SAFE_INTEGER}`],
    });

    runCurrentNoteOperation(test.app, WRITE_SETTINGS, operation, (key) => key);

    const plan = preview.options?.documents?.[0]?.plan;
    expect(plan?.result).toBe(source);
    expect(plan?.changes).toEqual([]);
    expect(plan?.warnings.map(({ code }) => code)).toEqual(["counter-overflow", "counter-overflow"]);
    expect(notices()).toEqual([]);
    await preview.options?.onConfirm();
    expect(test.transactions).toEqual([]);
    expect(test.editor.getValue()).toBe(source);
  });

  it("keeps the no-changes notice for a write with no changes or warnings", () => {
    const test = harness("No headings here.");

    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "write", (key) => key);

    expect(preview.options).toBeNull();
    expect(notices()).toEqual(["notice.noChanges"]);
    expect(test.transactions).toEqual([]);
  });

  it.each(["file", "editor", "unregistered", "detached", "preview", "unloaded"])("rejects a retained preview after %s", async (change) => {
    const test = harness();
    const controller = new AbortController();
    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "write", (key) => key, undefined, controller.signal);
    expect(preview.options).not.toBeNull();
    const replacement = harness();
    if (change === "file") test.view.file = replacement.view.file;
    if (change === "editor") test.view.editor = replacement.editor as never;
    if (change === "unregistered") test.files.clear();
    if (change === "detached") Object.assign(test.view.containerEl, { isConnected: false });
    if (change === "preview") test.setMode("preview");
    if (change === "unloaded") controller.abort();
    await preview.options?.onConfirm();
    expect(test.transactions).toHaveLength(0);
    expect(replacement.transactions).toHaveLength(0);
    expect(notices()).toEqual(change === "unloaded" ? [] : ["notice.stalePreview"]);
  });

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

  it("can target the sidebar note while focus is outside the editor", async () => {
    const test = harness();
    test.setActive(null);

    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "write", (key) => key, "note.md");
    expect(preview.options).not.toBeNull();

    await preview.options?.onConfirm();

    expect(test.transactions).toHaveLength(1);
  });

  it("refuses a sidebar write when the same note has multiple editor views", () => {
    const test = harness();
    const FileConstructor = TFile as unknown as new (path: string) => TFile;
    const duplicate = new MarkdownView({} as never);
    duplicate.file = new FileConstructor("note.md");
    test.setOpenViews([test.view, duplicate]);

    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "write", (key) => key, "note.md");

    expect(preview.options).toBeNull();
    expect(notices()).toContain("notice.uniqueEditorRequired");
  });

  it("opens a zero-change cleanup preview so its recognition scope can be broadened", async () => {
    const test = harness("# 9.2 Existing");
    runCurrentNoteOperation(test.app, WRITE_SETTINGS, "remove", (key) => key);

    expect(preview.options?.cleanupScope).toBe("templates");
    const replanned = await preview.options?.onCleanupScopeChange?.("common") as
      | Array<{ readonly plan: { readonly result: string } }>
      | undefined;
    expect(replanned?.[0]?.plan.result).toBe("# Existing");
  });
});
