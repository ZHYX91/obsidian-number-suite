// @vitest-environment happy-dom

import { EditorView } from "@codemirror/view";
import {
  MarkdownView,
  Menu,
  TFile,
  type App,
  type Component,
  type Editor,
} from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addCaptionContextMenuItem } from "../../src/commands/caption-insertion";
import type { Translate } from "../../src/config/i18n";
import {
  CaptionCarrierMenuBridge,
  uniqueCaptionCarrierOffset,
} from "../../src/integration/structural-table-caption-menu";

const translate = ((key: string) => key) as Translate;
const cleanups: (() => void)[] = [];

function menuItems(menu: Menu): ReadonlyArray<Readonly<{ title: string }>> {
  return (menu as unknown as { items: Array<{ title: string }> }).items;
}

interface CarrierCase {
  readonly label: string;
  readonly source: string;
  readonly markup: string;
  readonly targetSelector: string;
  readonly expectedTitle: string;
  readonly sourceOffset: number;
}

const CARRIER_CASES: readonly CarrierCase[] = [
  {
    label: "wiki SVG image",
    source: "![[sample.svg|Ready-made image title]]",
    markup: '<span class="image-embed"><img src="sample.svg"></span>',
    targetSelector: "img",
    expectedTitle: "caption.menu.figure.insert",
    sourceOffset: 3,
  },
  {
    label: "wiki raster image",
    source: "![[sample.png]]",
    markup: '<span class="image-embed"><img src="sample.png"></span>',
    targetSelector: "img",
    expectedTitle: "caption.menu.figure.insert",
    sourceOffset: 3,
  },
  {
    label: "Markdown image",
    source: "![Ready-made image title](sample.png)",
    markup: '<span class="image-embed"><img src="sample.png"></span>',
    targetSelector: "img",
    expectedTitle: "caption.menu.figure.insert",
    sourceOffset: 4,
  },
  {
    label: "native table cell",
    source: "| A |\n| --- |\n| 1 |",
    markup: '<div class="cm-table-widget"><table><tbody><tr><td>1</td></tr></tbody></table></div>',
    targetSelector: "td",
    expectedTitle: "caption.menu.table.insert",
    sourceOffset: 17,
  },
  {
    label: "display equation",
    source: "$$ a=b $$",
    markup: '<div class="math-block"><span>a=b</span></div>',
    targetSelector: ".math-block span",
    expectedTitle: "caption.menu.equation.insert",
    sourceOffset: 4,
  },
  {
    label: "fenced code",
    source: "```ts\nconst a = 1;\n```",
    markup: "<pre><code>const a = 1;</code></pre>",
    targetSelector: "code",
    expectedTitle: "caption.menu.code.insert",
    sourceOffset: 8,
  },
];

function component(): Component {
  return {
    registerEvent: () => {},
    register: (cleanup: () => void) => cleanups.push(cleanup),
    registerDomEvent: (
      target: Document | HTMLElement,
      type: string,
      callback: EventListener,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, callback, options);
      cleanups.push(() => target.removeEventListener(type, callback, options));
    },
  } as unknown as Component;
}

function fixture(testCase: CarrierCase): {
  readonly app: App;
  readonly editor: Editor;
  readonly markdownView: MarkdownView;
  readonly target: HTMLElement;
  readonly content: HTMLElement;
} {
  document.body.innerHTML = `<div class="markdown-view"><div class="cm-content">${testCase.markup}</div></div>`;
  const container = document.querySelector<HTMLElement>(".markdown-view")!;
  const content = container.querySelector<HTMLElement>(".cm-content")!;
  const target = container.querySelector<HTMLElement>(testCase.targetSelector)!;
  const editor = {
    getValue: () => testCase.source,
    getCursor: () => ({ line: 0, ch: 0 }),
    posToOffset: () => 0,
  } as unknown as Editor;
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  const markdownView = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, {
    containerEl: container,
    editor,
    file: new FileConstructor("note.md"),
  });
  const app = {
    workspace: {
      iterateAllLeaves: (callback: (leaf: { view: MarkdownView }) => void) => {
        callback({ view: markdownView });
      },
      on: () => ({}),
    },
  } as unknown as App;
  return { app, editor, markdownView, target, content };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("caption carrier menu bridge", () => {
  it.each(CARRIER_CASES)(
    "uses the current $label pointer target and contributes exactly once",
    (testCase) => {
      const { app, editor, markdownView, target, content } = fixture(testCase);
      const records: Array<readonly [Editor, number | null, string | null]> = [];
      vi.spyOn(EditorView, "findFromDOM").mockReturnValue({
        contentDOM: content,
        posAtCoords: () => testCase.sourceOffset,
        posAtDOM: () => testCase.sourceOffset,
      } as unknown as EditorView);
      target.addEventListener("contextmenu", (event) => {
        Menu.forEvent(event).addItem((item) => item.setTitle("Native action"));
      });
      new CaptionCarrierMenuBridge(
        app,
        () => translate,
        (recordEditor, offset, filePath) => records.push([recordEditor, offset, filePath]),
      ).register(component());

      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        cancelable: true,
        clientX: 20,
        clientY: 30,
      });
      target.dispatchEvent(event);
      const menu = Menu.forEvent(event);

      expect(menuItems(menu).map((item) => item.title)).toEqual([
        "Native action",
        testCase.expectedTitle,
      ]);
      expect(records).toEqual([[editor, expect.any(Number), "note.md"]]);

      addCaptionContextMenuItem(
        app,
        menu,
        editor,
        markdownView,
        translate,
        testCase.sourceOffset,
      );
      expect(menuItems(menu).filter((item) => item.title === testCase.expectedTitle)).toHaveLength(1);
    },
  );

  it("keeps the Structural Tables source-index path and native menu idempotent", () => {
    const testCase: CarrierCase = {
      label: "Structural Tables cell",
      source: "| A |\n| --- |\n| 1 |",
      markup: [
        '<div class="structural-tables-live-preview" data-structural-source-table-index="0">',
        "<table><tbody><tr><td>1</td></tr></tbody></table></div>",
      ].join(""),
      targetSelector: "td",
      expectedTitle: "caption.menu.table.insert",
      sourceOffset: 17,
    };
    const { app, target } = fixture(testCase);
    target.addEventListener("contextmenu", (event) => {
      Menu.forEvent(event).addItem((item) => item.setTitle("Structural action"));
    });
    new CaptionCarrierMenuBridge(app, () => translate, () => {}).register(component());

    const event = new MouseEvent("contextmenu", { bubbles: true, button: 2, cancelable: true });
    target.dispatchEvent(event);

    expect(menuItems(Menu.forEvent(event)).map((item) => item.title)).toEqual([
      "Structural action",
      "caption.menu.table.insert",
    ]);
  });

  it("blocks cursor fallback when the current pointer carrier cannot be mapped uniquely", () => {
    const source = "![[first.png]]\n\n![[second.png]]";
    const testCase: CarrierCase = {
      label: "ambiguous rendered image",
      source,
      markup: '<span class="image-embed"><img src="first.png"></span>',
      targetSelector: "img",
      expectedTitle: "caption.menu.figure.insert",
      sourceOffset: 3,
    };
    const { app, target, content } = fixture(testCase);
    const records: Array<number | null> = [];
    vi.spyOn(EditorView, "findFromDOM").mockReturnValue({
      contentDOM: content,
      posAtCoords: () => source.indexOf("second"),
      posAtDOM: () => source.indexOf("first"),
    } as unknown as EditorView);
    target.addEventListener("contextmenu", (event) => {
      Menu.forEvent(event).addItem((item) => item.setTitle("Native action"));
    });
    new CaptionCarrierMenuBridge(
      app,
      () => translate,
      (_editor, offset) => records.push(offset),
    ).register(component());

    const event = new MouseEvent("contextmenu", { bubbles: true, button: 2, cancelable: true });
    target.dispatchEvent(event);

    expect(records).toEqual([null]);
    expect(menuItems(Menu.forEvent(event)).map((item) => item.title)).toEqual(["Native action"]);
  });

  it("fails closed when DOM and pointer offsets resolve to different carriers", () => {
    const source = "![[first.png]]\n\n![[second.png]]";
    expect(uniqueCaptionCarrierOffset(source, "Figure", [3, source.indexOf("second")])).toBeNull();
    expect(uniqueCaptionCarrierOffset(source, "Figure", [3, 4])).toBe(0);
    expect(uniqueCaptionCarrierOffset(source, "Table", [3, 4])).toBeNull();
  });
});
