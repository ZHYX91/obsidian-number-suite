import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Notice,
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

import { addStableReferenceContextMenuItem } from "../../src/commands/stable-reference";

const translate = ((key: string) => key) as Translate;
const clipboard = vi.fn(async (_text: string) => undefined);

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
  it("previews one block-ID write, then applies and copies it", async () => {
    const menu = createMenu();
    const editor = createEditor("# Architecture\nBody", 4);
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, fileInfo(), translate);

    expect(menu.titles).toEqual(["reference.menu.copy"]);
    menu.click?.();
    expect(modal.options?.plan.link).toBe("@[[#^ns-h-architecture|Architecture]]");
    await modal.options?.onConfirm();
    expect(editor.transactions).toHaveLength(1);
    expect(editor.getValue()).toBe("# Architecture\n^ns-h-architecture\nBody");
    expect(clipboard).toHaveBeenCalledWith("@[[#^ns-h-architecture|Architecture]]");
    expect(notices()).toContain("reference.notice.createdCopied");
  });

  it("reuses an existing ID and copies immediately without opening a modal", async () => {
    const menu = createMenu();
    const editor = createEditor("Figure: Miao ^figure-id", 8);
    addStableReferenceContextMenuItem({} as App, menu.menu, editor.editor, fileInfo(), translate);
    menu.click?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(modal.options).toBeNull();
    expect(editor.transactions).toHaveLength(0);
    expect(clipboard).toHaveBeenCalledWith("@[[#^figure-id|Miao]]");
    expect(notices()).toContain("reference.notice.copied");
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
