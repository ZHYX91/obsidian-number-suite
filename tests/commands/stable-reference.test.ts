import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Notice,
  MarkdownView,
  TFile,
  type App,
  type Editor,
  type EditorChange,
  type EditorPosition,
  type EditorTransaction,
  type MarkdownFileInfo,
  type Menu,
  type MenuItem,
} from "obsidian";

import type { Translate } from "../../src/config/i18n";
import type { StableReferenceModalOptions } from "../../src/ui/stable-reference-modal";

const modal = vi.hoisted(() => ({ options: null as StableReferenceModalOptions | null }));

vi.mock("../../src/ui/stable-reference-modal", () => ({
  StableReferenceModal: class {
    constructor(options: StableReferenceModalOptions) {
      modal.options = options;
    }

    open(): void {}
  },
}));

import { addStableReferenceContextMenuItem as addStableReferenceContextMenuItemImpl } from "../../src/commands/stable-reference";


import { commandSourceApp } from "../helpers/command-source";

function addStableReferenceContextMenuItem(...args: Parameters<typeof addStableReferenceContextMenuItemImpl>): void {
  const [app, menu, editor, info, ...rest] = args;
  addStableReferenceContextMenuItemImpl(commandSourceApp(app, editor, info), menu, editor, info, ...rest);
}

const translate = ((key: string) => key) as Translate;
const clipboard = vi.fn(async (_text: string): Promise<void> => undefined);

function notices(): string[] {
  return (Notice as unknown as { readonly messages: string[] }).messages;
}

function fileInfo(path = "note.md"): MarkdownFileInfo {
  const FileConstructor = TFile as unknown as new (filePath: string) => TFile;
  return { file: new FileConstructor(path) } as MarkdownFileInfo;
}

function createMenu(): { menu: Menu; titles: string[]; click: (() => void) | null } {
  const result = { menu: null as unknown as Menu, titles: [] as string[], click: null as (() => void) | null };
  const menu = {
    addItem(callback: (item: MenuItem) => unknown) {
      const item = {
        setTitle(title: string) { result.titles.push(title); return item; },
        setIcon() { return item; },
        onClick(handler: () => void) { result.click = handler; return item; },
      } as unknown as MenuItem;
      callback(item);
      return menu;
    },
  } as unknown as Menu;
  result.menu = menu;
  return result;
}

function createEditor(initial: string, cursorOffset: number) {
  let value = initial;
  const transactions: EditorTransaction[] = [];
  const position = (offset: number): EditorPosition => ({ line: 0, ch: offset });
  const editor = {
    getValue: () => value,
    getCursor: () => position(cursorOffset),
    posToOffset: (pos: EditorPosition) => pos.ch,
    offsetToPos: (offset: number) => position(offset),
    transaction: (transaction: EditorTransaction) => {
      transactions.push(transaction);
      const changes = Array.isArray(transaction.changes) ? transaction.changes : [transaction.changes];
      for (const change of [...changes].reverse() as EditorChange[]) {
        value = `${value.slice(0, change.from.ch)}${change.text}${value.slice(change.to?.ch ?? change.from.ch)}`;
      }
    },
  } as unknown as Editor;
  return { editor, transactions, getValue: () => value, setValue: (next: string) => { value = next; } };
}

beforeEach(() => {
  modal.options = null;
  clipboard.mockClear();
  notices().length = 0;
  vi.stubGlobal("navigator", { clipboard: { writeText: clipboard } });
});

describe("stable cross-reference context menu", () => {
  it.each([
    [false, "closed"], [false, "detached"], [false, "reading"], [false, "editor-replaced"],
    [true, "closed"], [true, "detached"], [true, "reading"], [true, "editor-replaced"],
  ] as const)("rejects file-info callbacks with existing ID=%s after owner is %s", async (hasId, state) => {
    const menu = createMenu();
    const editor = createEditor(hasId ? "Figure: Miao ^figure-id" : "Figure: Miao", 8);
    const info = { ...fileInfo(), editor: editor.editor } as MarkdownFileInfo;
    let mode = "source";
    const view = Object.assign(new MarkdownView(null as never), {
      file: info.file, editor: editor.editor, getMode: () => mode, containerEl: { isConnected: true },
    });
    let leaves = [{ view }];
    const app = {
      vault: { getAbstractFileByPath: () => info.file },
      workspace: { getLeavesOfType: () => leaves },
    } as unknown as App;
    addStableReferenceContextMenuItemImpl(app, menu.menu, editor.editor, info, translate);
    if (!hasId) { menu.click?.(); expect(modal.options).not.toBeNull(); }
    if (state === "closed") leaves = [];
    if (state === "detached") Object.assign(view.containerEl, { isConnected: false });
    if (state === "reading") mode = "preview";
    if (state === "editor-replaced") view.editor = createEditor(editor.getValue(), 8).editor;
    if (hasId) menu.click?.();
    else await modal.options?.onConfirm();
    await Promise.resolve();
    expect(editor.transactions).toHaveLength(0);
    expect(clipboard).not.toHaveBeenCalled();
    expect(notices()).toEqual(["notice.stalePreview"]);
  });

  it("does not dispatch a clipboard write when the transaction synchronously unloads its owner", async () => {
    const menu = createMenu();
    const editor = createEditor("# Architecture\nBody", 4);
    const owner = new AbortController();
    const apply = editor.editor.transaction.bind(editor.editor);
    editor.editor.transaction = (transaction, origin) => {
      apply(transaction, origin);
      owner.abort();
    };
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, fileInfo(), translate, undefined, owner.signal);
    menu.click?.();
    expect(modal.options).not.toBeNull();
    await modal.options?.onConfirm();
    expect(owner.signal.aborted).toBe(true);
    expect(editor.transactions).toHaveLength(1);
    expect(editor.getValue()).toBe("# Architecture\n^ns-h-architecture\nBody");
    expect(clipboard).not.toHaveBeenCalled();
    expect(notices()).toEqual([]);
  });

  it.each(["file", "editor", "registry", "unloaded"])("rejects a retained creation callback after %s", async (change) => {
    const menu = createMenu();
    const editor = createEditor("# Architecture\nBody", 4);
    const info = fileInfo();
    const registry = new Map([[info.file!.path, info.file]]);
    const app = { vault: { getAbstractFileByPath: (path: string) => registry.get(path) ?? null } } as unknown as App;
    const owner = new AbortController();
    addStableReferenceContextMenuItem(app, menu.menu, editor.editor, info, translate, undefined, owner.signal);
    menu.click?.();
    expect(modal.options).not.toBeNull();
    if (change === "file") Object.assign(info, { file: fileInfo().file });
    if (change === "editor") info.editor = createEditor(editor.getValue(), 4).editor;
    if (change === "registry") registry.clear();
    if (change === "unloaded") owner.abort();
    await modal.options?.onConfirm();
    expect(editor.transactions).toHaveLength(0);
    expect(clipboard).not.toHaveBeenCalled();
    expect(notices()).toEqual(change === "unloaded" ? [] : ["notice.stalePreview"]);
  });

  it.each([false, true])("rejects a stale menu after unload with existing ID=%s", async (hasId) => {
    const menu = createMenu();
    const editor = createEditor(hasId ? "Figure: Miao ^figure-id" : "Figure: Miao", 8);
    const owner = new AbortController();
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, fileInfo(), translate, undefined, owner.signal);
    owner.abort();
    menu.click?.();
    await Promise.resolve();
    expect(modal.options).toBeNull();
    expect(clipboard).not.toHaveBeenCalled();
    expect(editor.transactions).toHaveLength(0);
    expect(notices()).toEqual([]);
  });

  it.each(["resolve", "reject"])("settles an accepted clipboard write on %s without a late notice after unload", async (outcome) => {
    let release!: () => void;
    clipboard.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
      release = outcome === "resolve" ? resolve : () => { reject(new Error("Clipboard rejected")); };
    }));
    const menu = createMenu();
    const editor = createEditor("Figure: Miao ^figure-id", 8);
    const owner = new AbortController();
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, fileInfo(), translate, undefined, owner.signal);
    menu.click?.();
    expect(clipboard).toHaveBeenCalledOnce();
    owner.abort();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(notices()).toEqual([]);
  });

  it.each([false, true])("previews one block-ID write, then applies and copies it with file-info editor=%s", async (hasEditor) => {
    const menu = createMenu();
    const editor = createEditor("# Architecture\nBody", 4);
    const info = fileInfo();
    if (hasEditor) info.editor = editor.editor;
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, info, translate);

    expect(menu.titles).toEqual(["reference.menu.copy"]);
    menu.click?.();
    expect(modal.options?.plan.link).toBe("@[[#^ns-h-architecture|Architecture]]");
    await modal.options?.onConfirm();
    expect(editor.transactions).toHaveLength(1);
    expect(editor.getValue()).toBe("# Architecture\n^ns-h-architecture\nBody");
    expect(clipboard).toHaveBeenCalledWith("@[[#^ns-h-architecture|Architecture]]");
    expect(notices()).toContain("reference.notice.createdCopied");
  });

  it.each([false, true])("reuses an existing ID without opening a modal with file-info editor=%s", async (hasEditor) => {
    const menu = createMenu();
    const editor = createEditor("Figure: Miao ^figure-id", 8);
    const info = fileInfo();
    if (hasEditor) info.editor = editor.editor;
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, info, translate);
    menu.click?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(modal.options).toBeNull();
    expect(editor.transactions).toHaveLength(0);
    expect(clipboard).toHaveBeenCalledWith("@[[#^figure-id|Miao]]");
    expect(notices()).toContain("reference.notice.copied");
  });

  it("fails closed when an existing-ID source changes before copy", async () => {
    const menu = createMenu();
    const editor = createEditor("Figure: Miao ^figure-id", 8);
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, fileInfo(), translate);
    editor.setValue("Figure: Changed ^figure-id");

    menu.click?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.options).toBeNull();
    expect(editor.transactions).toHaveLength(0);
    expect(clipboard).not.toHaveBeenCalled();
    expect(notices()).toContain("notice.stalePreview");
  });

  it("fails closed when the source changes after preview", async () => {
    const menu = createMenu();
    const editor = createEditor("# Architecture", 4);
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, fileInfo(), translate);
    menu.click?.();
    editor.setValue("# Changed");
    await modal.options?.onConfirm();
    expect(editor.transactions).toHaveLength(0);
    expect(clipboard).not.toHaveBeenCalled();
    expect(notices()).toContain("notice.stalePreview");
  });

  it("uses the actual context-menu offset instead of the cursor", () => {
    const source = "Body\n# Architecture";
    const menu = createMenu();
    const editor = createEditor(source, 1);
    addStableReferenceContextMenuItem(
      {} as App,
      menu.menu,
      editor.editor,
      fileInfo(),
      translate,
      source.indexOf("Architecture"),
    );
    expect(menu.titles).toEqual(["reference.menu.copy"]);
  });
});
