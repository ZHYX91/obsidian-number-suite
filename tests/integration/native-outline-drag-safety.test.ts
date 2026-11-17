// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { HeadingCache } from "obsidian";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {
    readonly contentEl = document.createElement("div");
    readonly containerEl = document.createElement("div");
    getState(): Record<string, string> { return { file: "Note.md" }; }
    getHeadings(): HeadingCache[] {
      return [{ heading: "Chapter", level: 1, position: {
        start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 9, offset: 9 },
      } }];
    }
  },
}));
import { ItemView, MarkdownView, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { createTranslator } from "../../src/config/i18n";
import { NativeOutlineEnhancer, type ExtraOutlineHeading } from "../../src/integration/native-outline";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const source = "# Chapter\n####### First\nbody A\nFigure: Picture\n######## Child\nchild body\n####### Second\nbody B\n";
function setup() {
  Object.defineProperty(document, "win", { configurable: true, value: {
    createSpan: () => document.createElement("span"),
  } });
  const view = new (ItemView as unknown as new () => ItemView)();
  document.body.append(view.contentEl);
  const file = new (TFile as unknown as new (path: string) => TFile)("Note.md");
  let buffer = source;
  const transaction = vi.fn((request: { changes: Array<{ from: { ch: number }; to: { ch: number }; text: string }> }) => {
    const change = request.changes[0]!;
    buffer = buffer.slice(0, change.from.ch) + change.text + buffer.slice(change.to.ch);
  });
  const editor = { getValue: () => buffer, offsetToPos: (ch: number) => ({ line: 0, ch }), transaction };
  const markdown = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, { file, editor });
  const plugin = { app: {
    workspace: { getLeavesOfType: (type: string) => [{ view: type === "outline" ? view : markdown }] },
    vault: { getAbstractFileByPath: () => file },
  } };
  const enhancer = new NativeOutlineEnhancer(plugin as never, () => DEFAULT_SETTINGS, undefined, undefined, createTranslator("zh"));
  enhancer.refresh();
  const runtime = enhancer as unknown as {
    sources: Map<string, string>; observed: Map<ItemView, unknown>; decorate(entry: unknown): void;
  };
  runtime.sources.set("Note.md", source);
  const headings = (view as unknown as { getHeadings(): ExtraOutlineHeading[] }).getHeadings();
  const rows = headings.map((heading) => {
    const treeItem = document.createElement("div"); treeItem.className = "tree-item";
    const self = document.createElement("div"); self.className = "tree-item-self";
    const arrow = document.createElement("span"); arrow.className = "collapse-icon";
    const innerEl = document.createElement("div"); innerEl.className = "tree-item-inner";
    self.append(arrow, innerEl); treeItem.append(self); view.contentEl.append(treeItem);
    return { heading, innerEl, vChildren: { _children: [] } };
  });
  Object.assign(view, { tree: { root: { vChildren: { _children: rows } } } });
  runtime.decorate(runtime.observed.get(view));
  const row = (line: number): HTMLElement => rows.find((value) => value.heading.position.start.line === line)!.innerEl;
  return { enhancer, runtime, view, row, headings, transaction, editor, setBuffer: (value: string) => { buffer = value; } };
}
function drag(target: HTMLElement, type: string, clientY = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientY }); target.dispatchEvent(event); return event;
}
function pointer(target: EventTarget, type: string, x = 0, y = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerType: "touch", isPrimary: true, pointerId: 3, clientX: x, clientY: y });
  target.dispatchEvent(event); return event;
}

describe("native Outline section gestures", () => {
  it("moves the complete H7 section including body, caption and child in one transaction", () => {
    const h = setup();
    expect(drag(h.row(1), "dragstart").defaultPrevented).toBe(false);
    drag(h.row(6), "dragover");
    expect(h.row(6).classList.contains("number-suite-outline-drop-after")).toBe(true);
    drag(h.row(6), "drop");
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.editor.getValue()).toBe("# Chapter\n####### Second\nbody B\n####### First\nbody A\nFigure: Picture\n######## Child\nchild body\n");
    h.enhancer.stop();
  });
  it("rejects a stale editor even if the Outline snapshot has not refreshed", () => {
    const h = setup(); drag(h.row(1), "dragstart"); drag(h.row(6), "dragover");
    h.setBuffer(source + "new edit"); drag(h.row(6), "drop");
    expect(h.transaction).not.toHaveBeenCalled(); h.enhancer.stop();
  });
  it("rejects a changed projection source and a descendant destination", () => {
    const h = setup(); drag(h.row(1), "dragstart"); drag(h.row(4), "drop");
    expect(h.transaction).not.toHaveBeenCalled();
    drag(h.row(1), "dragstart"); h.runtime.sources.set("Note.md", source + "edit"); drag(h.row(6), "drop");
    expect(h.transaction).not.toHaveBeenCalled(); h.enhancer.stop();
  });
  it("retains host H1-H6 gestures using the original host headings during the move", () => {
    const h = setup(); expect(h.headings.length).toBeGreaterThan(1);
    expect(drag(h.row(0), "dragstart").defaultPrevented).toBe(false);
    expect((h.view as unknown as { getHeadings(): HeadingCache[] }).getHeadings()).toHaveLength(1);
    document.dispatchEvent(new Event("dragend"));
    expect((h.view as unknown as { getHeadings(): HeadingCache[] }).getHeadings().length).toBeGreaterThan(1);
    h.enhancer.stop();
  });
  it("renders localized caption leaves without a number pill or draggable section", () => {
    const h = setup(); const caption = h.row(3);
    expect(caption.draggable).toBe(false);
    expect(caption.querySelector(".number-suite-outline-caption-label")?.textContent).toBe(createTranslator("zh")("caption.kind.figure") + " 1");
    expect(caption.querySelector(".number-suite-outline-caption-title")?.textContent).toBe("Picture");
    expect(caption.querySelector(".number-suite-native-outline-number")).toBeNull();
    expect(drag(caption, "dragstart").defaultPrevented).toBe(true);
    expect(caption.closest(".tree-item")?.classList.contains("number-suite-native-outline-caption")).toBe(true);
    expect(readFileSync("styles.css", "utf8")).toMatch(/\.number-suite-native-outline-caption[^}]*\.collapse-icon\s*\{[^}]*visibility:\s*hidden/s);
    h.enhancer.stop();
  });
  it("supports long-press pointer movement and cancels early scrolling", () => {
    vi.useFakeTimers(); const h = setup();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => h.row(6) });
    pointer(h.row(1), "pointerdown"); pointer(document, "pointermove", 12); vi.advanceTimersByTime(400); pointer(document, "pointerup");
    expect(h.transaction).not.toHaveBeenCalled();
    pointer(h.row(1), "pointerdown"); vi.advanceTimersByTime(351); pointer(document, "pointermove");
    expect(h.row(6).classList.contains("number-suite-outline-drop-after")).toBe(true);
    pointer(document, "pointerup"); expect(h.transaction).toHaveBeenCalledTimes(1); h.enhancer.stop();
  });
});
