// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HeadingCache } from "obsidian";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {
    readonly contentEl = document.createElement("div");
    readonly containerEl = document.createElement("div");
    getState(): Record<string, string> { return { file: "Note.md" }; }
    getHeadings(): HeadingCache[] {
      return [{
        heading: "Heading", level: 1,
        position: {
          start: { line: 0, col: 0, offset: 0 },
          end: { line: 0, col: 9, offset: 9 },
        },
      }];
    }
  },
}));

import { ItemView } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { NativeOutlineEnhancer } from "../../src/integration/native-outline";

beforeEach(() => document.body.replaceChildren());

describe("native Outline synthetic entry safety", () => {
  function setup(synthetic: boolean) {
    const view = new (ItemView as unknown as new () => ItemView)();
    document.body.append(view.contentEl);
    const plugin = {
      app: {
        workspace: { getLeavesOfType: () => [{ view }] },
        vault: { getAbstractFileByPath: () => null },
      },
    };
    const settings = {
      ...DEFAULT_SETTINGS,
      showOutlineExtendedHeadings: synthetic,
      showOutlineCaptions: synthetic,
    };
    const enhancer = new NativeOutlineEnhancer(plugin as never, () => settings);
    enhancer.refresh();
    const internal = enhancer as unknown as {
      sources: Map<string, string>;
    };
    internal.sources.set("Note.md", "# Heading\nFigure: Picture");
    const headings = (view as unknown as { getHeadings(): HeadingCache[] }).getHeadings();
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    view.contentEl.dispatchEvent(drag);
    return { enhancer, drag, headings };
  }

  it("blocks host drag moves while synthetic caption entries affect section boundaries", () => {
    const h = setup(true);
    expect(h.headings).toHaveLength(2);
    expect(h.drag.defaultPrevented).toBe(true);
    h.enhancer.stop();
  });

  it("preserves native section dragging when the enhancement adds numbers only", () => {
    const h = setup(false);
    expect(h.headings).toHaveLength(1);
    expect(h.drag.defaultPrevented).toBe(false);
    h.enhancer.stop();
  });
});
