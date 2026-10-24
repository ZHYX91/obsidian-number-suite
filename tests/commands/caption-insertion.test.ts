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

import structuralContract from "../fixtures/structural-table-source-contract.json";
import { parseDocumentSemantics } from "../../src/core/document-semantics";

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
  addCaptionContextMenuItem as addCaptionContextMenuItemImpl,
  addStructuralTableCaptionContextMenuItem as addStructuralTableCaptionContextMenuItemImpl,
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


import { commandSourceApp } from "../helpers/command-source";

function addCaptionContextMenuItem(...args: Parameters<typeof addCaptionContextMenuItemImpl>): void {
  const [app, menu, editor, info, ...rest] = args;
  addCaptionContextMenuItemImpl(commandSourceApp(app, editor, info), menu, editor, info, ...rest);
}

function addStructuralTableCaptionContextMenuItem(...args: Parameters<typeof addStructuralTableCaptionContextMenuItemImpl>): void {
  const [app, menu, editor, info, ...rest] = args;
  addStructuralTableCaptionContextMenuItemImpl(commandSourceApp(app, editor, info), menu, editor, info, ...rest);
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
    focus: vi.fn(),
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
  it.each(["closed", "detached", "reading", "editor-replaced"])(
    "rejects file-info confirmation and focus after its owner is %s", async (state) => {
      const testMenu = createMenu();
      const testEditor = createEditor("![[cat.png]]", 4);
      const info = { ...fileInfo(), editor: testEditor.editor } as MarkdownFileInfo;
      let mode = "source";
      const view = Object.assign(new MarkdownView(null as never), {
        file: info.file, editor: testEditor.editor, getMode: () => mode, containerEl: { isConnected: true },
      });
      let leaves = [{ view }];
      const app = {
        vault: { getAbstractFileByPath: () => info.file },
        workspace: { getLeavesOfType: () => leaves, getActiveViewOfType: () => view },
      } as unknown as App;
      addCaptionContextMenuItemImpl(app, testMenu.menu, testEditor.editor, info, translate);
      testMenu.click?.();
      expect(modal.options).not.toBeNull();
      if (state === "closed") leaves = [];
      if (state === "detached") Object.assign(view.containerEl, { isConnected: false });
      if (state === "reading") mode = "preview";
      if (state === "editor-replaced") view.editor = createEditor(testEditor.getValue(), 4).editor;
      expect(await modal.options?.onConfirm("Cat")).toBe(false);
      modal.options?.onApplied?.();
      expect(testEditor.transactions).toHaveLength(0);
      expect(testEditor.editor.focus).not.toHaveBeenCalled();
      expect(notices()).toEqual(["notice.stalePreview"]);
    },
  );

  it.each(["menu", "confirm"])("rejects caption %s callbacks after unload", async (phase) => {
    const testMenu = createMenu();
    const testEditor = createEditor("![Cat](cat.png)", 5);
    const owner = new AbortController();
    addCaptionContextMenuItem({} as App, testMenu.menu, testEditor.editor, fileInfo(), translate, undefined, owner.signal);
    if (phase === "confirm") { testMenu.click?.(); expect(modal.options).not.toBeNull(); }
    owner.abort();
    testMenu.click?.();
    await modal.options?.onConfirm("Cat");
    modal.options?.onApplied?.();
    expect(testEditor.transactions).toHaveLength(0);
    expect(notices()).toEqual([]);
    if (phase === "menu") expect(modal.options).toBeNull();
  });

  it.each(["current", "file-rebound", "editor-rebound", "detached", "inactive", "source-changed"])(
    "restores focus after closing only for the current committed editor: %s", async (state) => {
      const testEditor = createEditor("![[cat.png]]", 4);
      const view = Object.assign(new MarkdownView(null as never), fileInfo(), {
        editor: testEditor.editor,
        containerEl: { isConnected: true } as HTMLElement,
        getMode: () => "source",
      });
      let activeView: MarkdownView | null = view;
      const app = { workspace: { getActiveViewOfType: () => activeView } } as unknown as App;
      const testMenu = createMenu();
      addCaptionContextMenuItem(app, testMenu.menu, testEditor.editor, view, translate);
      testMenu.click?.();
      expect(await modal.options?.onConfirm("Cat")).toBe(true);
      expect(testEditor.editor.focus).not.toHaveBeenCalled();
      if (state === "file-rebound") Object.assign(view, fileInfo());
      if (state === "editor-rebound") view.editor = createEditor(testEditor.getValue(), 0).editor;
      if (state === "detached") Object.assign(view.containerEl, { isConnected: false });
      if (state === "inactive") activeView = null;
      if (state === "source-changed") testEditor.setValue(`${testEditor.getValue()}\nNew text`);
      modal.options?.onApplied?.();
      expect(testEditor.editor.focus).toHaveBeenCalledTimes(state === "current" ? 1 : 0);
    },
  );

  it("refuses a same-path file rebind before confirming without restoring focus", async () => {
    const testEditor = createEditor("![[cat.png]]", 4);
    const info = fileInfo();
    const testMenu = createMenu();
    addCaptionContextMenuItem({} as App, testMenu.menu, testEditor.editor, info, translate);
    testMenu.click?.();
    Object.assign(info, fileInfo());
    expect(await modal.options?.onConfirm("Cat")).toBe(false);
    modal.options?.onApplied?.();
    expect(testEditor.transactions).toHaveLength(0);
    expect(testEditor.editor.focus).not.toHaveBeenCalled();
  });

  it.each([false, true])("adds a bounded Figure action and applies its confirmed plan with file-info editor=%s", async (hasEditor) => {
    const testMenu = createMenu();
    const testEditor = createEditor("![[Miao.png]]", 4);
    const info = fileInfo();
    if (hasEditor) info.editor = testEditor.editor;
    addCaptionContextMenuItem(
      {} as App,
      testMenu.menu,
      testEditor.editor,
      info,
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

  it("adds the Table action for a Structural Tables-owned widget by verified source range", async () => {
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
      {
        version: "1",
        from: source.indexOf("| Region"),
        to: source.length,
        path: "note.md",
        source: source.slice(source.indexOf("| Region")),
      },
    );

    expect(testMenu.titles).toEqual(["caption.menu.table.insert"]);
    testMenu.click?.();
    await modal.options?.onConfirm("Quarterly sales");
    expect(testEditor.transactions).toHaveLength(1);
    expect(testEditor.getValue()).toContain(
      "Table: Quarterly sales\n\n| Region | Sales |\n| Quarter | Q1 |",
    );
  });
  it("writes to the second identical Structural table without moving the first table or its references", async () => {
    const fixture = structuralContract.cases.find(({ id }) => id === "identical-tables-have-distinct-ranges");
    if (fixture === undefined) throw new Error("Missing identical-tables contract fixture");
    const table = fixture.tables[1];
    if (table === undefined) throw new Error("Missing second table");
    const testMenu = createMenu();
    const testEditor = createEditor(fixture.source, 0);
    addStructuralTableCaptionContextMenuItem(
      {} as App, testMenu.menu, testEditor.editor, fileInfo(fixture.sourcePath), translate,
      { version: "1", ...table, path: fixture.sourcePath },
    );
    testMenu.click?.();
    await modal.options?.onConfirm("Second table");
    expect(testEditor.transactions).toHaveLength(1);
    expect(testEditor.getValue()).toBe(
      `${fixture.source.slice(0, table.from)}Table: Second table\n\n${fixture.source.slice(table.from)}`,
    );
  });

  it.each(["source", "path"] as const)("refuses a Structural table confirmation after the %s changes", async (change) => {
    const source = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const testMenu = createMenu();
    const testEditor = createEditor(source, 0);
    const info = fileInfo();
    addStructuralTableCaptionContextMenuItem(
      {} as App, testMenu.menu, testEditor.editor, info, translate,
      { version: "1", from: 0, to: source.length, source, path: "note.md" },
    );
    testMenu.click?.();
    if (change === "source") testEditor.setValue(`New paragraph.\n\n${source}`);
    else Object.assign(info, fileInfo("different.md"));
    const currentSource = testEditor.getValue();
    await modal.options?.onConfirm("Sales");
    expect(testEditor.transactions).toHaveLength(0);
    expect(testEditor.getValue()).toBe(currentSource);
    expect(notices()).toEqual(["notice.stalePreview"]);
  });

  it("keeps caption reference ownership through the confirmed editor transaction", async () => {
    const source = "![[Miao.png]]\n\nFigure: Miao\n^fig-miao\n\nSee [[#^fig-miao]].";
    const testMenu = createMenu();
    const testEditor = createEditor(source, 4);
    addCaptionContextMenuItem({} as App, testMenu.menu, testEditor.editor, fileInfo(), translate);
    testMenu.click?.();
    await modal.options?.onConfirm("Miao sleeping");
    const result = testEditor.getValue();
    const semantics = parseDocumentSemantics(result);
    expect(result).toContain("Figure: Miao sleeping\n^fig-miao\n\n![[Miao.png]]");
    expect(semantics.blockOwners.get("block:fig-miao"))
      .toBe(semantics.captions[0]?.line);
    expect(result).toContain("See [[#^fig-miao]].");
    expect(testEditor.transactions).toHaveLength(1);
  });

  it.each([
    { kind: "Figure", object: "![[cat.png]]" },
    { kind: "Table", object: "| A |\n| --- |\n| 1 |" },
    { kind: "Equation", object: "$$\nx\n$$" },
    { kind: "Code", object: "```js\nx\n```" },
  ])("offers no destructive relocation for a $kind with a second object ID", ({ kind, object }) => {
    const source = `${object}\n^object-id\n^second-object-id\n\n${kind}: Title\n\nSee @[[#^second-object-id]].`;
    const testMenu = createMenu();
    const testEditor = createEditor(source, 1);
    addCaptionContextMenuItem({} as App, testMenu.menu, testEditor.editor, fileInfo(), translate);
    expect(testMenu.titles).toEqual([]);
    expect(testMenu.click).toBeNull();
    expect(modal.options).toBeNull();
    expect(testEditor.transactions).toHaveLength(0);
    expect(testEditor.getValue()).toBe(source);
  });

  it("offers no Structural table relocation across a second object ID", () => {
    const table = "| A |\n| --- |\n| 1 |";
    const source = `${table}\n^object-id\n^second-object-id\n\nTable: Title\n\nSee @[[#^second-object-id]].`;
    const testMenu = createMenu();
    const testEditor = createEditor(source, 1);
    addStructuralTableCaptionContextMenuItem(
      {} as App, testMenu.menu, testEditor.editor, fileInfo(), translate,
      { version: "1", from: 0, to: table.length, source: table, path: "note.md" },
    );
    expect(testMenu.titles).toEqual([]);
    expect(testMenu.click).toBeNull();
    expect(modal.options).toBeNull();
    expect(testEditor.transactions).toHaveLength(0);
    expect(testEditor.getValue()).toBe(source);
  });

});
