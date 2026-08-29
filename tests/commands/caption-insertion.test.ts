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
import type { CaptionInsertionModalOptions } from "../../src/ui/caption-insertion-modal";

const modal = vi.hoisted(() => ({ options: null as CaptionInsertionModalOptions | null }));

vi.mock("../../src/ui/caption-insertion-modal", () => ({
  CaptionInsertionModal: class {
    constructor(options: CaptionInsertionModalOptions) {
      modal.options = options;
    }

    open(): void {}
  },
}));

import {
  addCaptionContextMenuItem,
  addStructuralTableCaptionContextMenuItem,
} from "../../src/commands/caption-insertion";

interface TestMenu {
  readonly menu: Menu;
  readonly titles: string[];
  click: (() => void) | null;
}

interface TestEditor {
  readonly editor: Editor;
  readonly transactions: EditorTransaction[];
  getValue: () => string;
  setValue: (next: string) => void;
}

const translate = ((key: string) => key) as Translate;

function notices(): string[] {
  return (Notice as unknown as { readonly messages: string[] }).messages;
}

function createMenu(): TestMenu {
  const result: TestMenu = {
    menu: null as unknown as Menu,
    titles: [],
    click: null,
  };
  const menu = {
    addItem(callback: (item: MenuItem) => unknown) {
      const item = {
        setTitle(title: string) {
          result.titles.push(title);
          return item;
        },
        setIcon() { return item; },
        onClick(handler: () => void) {
          result.click = handler;
          return item;
        },
      } as unknown as MenuItem;
      callback(item);
      return menu;
    },
  } as unknown as Menu;
  (result as { menu: Menu }).menu = menu;
  return result;
}

function createEditor(initial: string, cursorOffset: number): TestEditor {
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
  return {
    editor,
    transactions,
    getValue: () => value,
    setValue: (next) => { value = next; },
  };
}

function fileInfo(path = "note.md"): MarkdownFileInfo {
  const FileConstructor = TFile as unknown as new (filePath: string) => TFile;
  return { file: new FileConstructor(path) } as MarkdownFileInfo;
}

beforeEach(() => {
  modal.options = null;
  notices().length = 0;
});

describe("caption context menu", () => {
  it("adds a bounded Figure action and applies its confirmed plan", async () => {
    const testMenu = createMenu();
    const testEditor = createEditor("![[Miao.png]]", 4);
    addCaptionContextMenuItem(
      {} as App,
      testMenu.menu,
      testEditor.editor,
      fileInfo(),
      translate,
    );

    expect(testMenu.titles).toEqual(["caption.menu.figure.insert"]);
    testMenu.click?.();
    expect(modal.options?.target).toMatchObject({ kind: "Figure", action: "insert" });
    await modal.options?.onConfirm("Miao");
    expect(testEditor.transactions).toHaveLength(1);
    expect(testEditor.getValue()).toBe("Figure: Miao\n\n![[Miao.png]]");
    expect(notices()).toContain("caption.notice.inserted");
  });

  it("uses the actual context-menu offset instead of the editor cursor", () => {
    const source = "Cursor here.\n\n![[Miao.png]]";
    const testMenu = createMenu();
    const testEditor = createEditor(source, 2);
    addCaptionContextMenuItem(
      {} as App,
      testMenu.menu,
      testEditor.editor,
      fileInfo(),
      translate,
      source.indexOf("Miao"),
    );
    expect(testMenu.titles).toEqual(["caption.menu.figure.insert"]);
  });

  it("adds Equation and Code actions", () => {
    for (const [source, kind, key] of [
      ["$$\nx\n$$", "Equation", "caption.menu.equation.insert"],
      ["```js\nx\n```", "Code", "caption.menu.code.insert"],
    ] as const) {
      const testMenu = createMenu();
      const testEditor = createEditor(source, source.indexOf("x"));
      addCaptionContextMenuItem({} as App, testMenu.menu, testEditor.editor, fileInfo(), translate);
      expect(testMenu.titles).toEqual([key]);
      testMenu.click?.();
      expect(modal.options?.target.kind).toBe(kind);
    }
  });

  it("fails closed when the source changes after the menu opens", async () => {
    const testMenu = createMenu();
    const testEditor = createEditor("![[Miao.png]]", 4);
    addCaptionContextMenuItem(
      {} as App,
      testMenu.menu,
      testEditor.editor,
      fileInfo(),
      translate,
    );
    testMenu.click?.();
    testEditor.setValue("Changed");
    await modal.options?.onConfirm("Miao");
    expect(testEditor.transactions).toHaveLength(0);
    expect(notices()).toContain("notice.stalePreview");
  });

  it("does not add an action away from a supported target", () => {
    const testMenu = createMenu();
    const testEditor = createEditor("![[Another note]]", 4);
    addCaptionContextMenuItem(
      {} as App,
      testMenu.menu,
      testEditor.editor,
      fileInfo(),
      translate,
    );
    expect(testMenu.titles).toEqual([]);
  });

  it("adds the Table action for a Structural Tables-owned widget by source index", async () => {
    const source = [
      "Cursor is outside the rendered table.",
      "",
      "| Region | Sales |",
      "| Quarter | Q1 |",
      "| --- || --- |",
      "| North | 10 |",
    ].join("\n");
    const testMenu = createMenu();
    const testEditor = createEditor(source, 0);
    addStructuralTableCaptionContextMenuItem(
      {} as App,
      testMenu.menu,
      testEditor.editor,
      fileInfo(),
      translate,
      0,
    );

    expect(testMenu.titles).toEqual(["caption.menu.table.insert"]);
    testMenu.click?.();
    await modal.options?.onConfirm("Quarterly sales");
    expect(testEditor.transactions).toHaveLength(1);
    expect(testEditor.getValue()).toContain(
      "Table: Quarterly sales\n\n| Region | Sales |\n| Quarter | Q1 |",
    );
  });
});
