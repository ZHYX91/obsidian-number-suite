// @vitest-environment happy-dom

import { EditorState, StateEffect, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorLivePreviewField } from "obsidian";

import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { HeadingDisplayController } from "../../src/editor/heading-display-extension";

const SOURCE = "Body [^first] and [^second].\n\n[^first]: First note.\n[^second]: Second note.\n\nTail";
const views: EditorView[] = [];

beforeEach(() => {
  window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
    const span = document.createElement("span");
    this.appendChild(span);
    return span;
  };
  Object.defineProperty(document, "win", { configurable: true, value: window });
  Object.assign(window, { createFragment: () => document.createDocumentFragment() });
});

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

// Native Obsidian hides the opening "[^" and closing "]:" separately and
// underlines the ID. Preserve those observed ranges rather than inventing a
// whole-marker replacement or deriving the oracle from Number Suite's parser.
function nativeDefinitionMask(view: EditorView): DecorationSet {
  if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
  const source = view.state.doc.toString();
  const ranges = [];
  for (const match of source.matchAll(/^\[\^[^\]\n]+\]:/gmu)) {
    const from = match.index;
    const to = from + match[0].length;
    const line = view.state.doc.lineAt(from);
    if (view.state.selection.ranges.some((range) => range.from <= line.to && range.to >= line.from)) continue;
    ranges.push(Decoration.replace({}).range(from, from + 2));
    ranges.push(Decoration.mark({ class: "cm-underline" }).range(from + 2, to - 2));
    ranges.push(Decoration.replace({}).range(to - 2, to));
  }
  return Decoration.set(ranges, true);
}

function setup(nativeFirst: boolean) {
  const settings = { ...DEFAULT_SETTINGS };
  let controller = new HeadingDisplayController(() => settings);
  let product = controller.createExtension();
  const native = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(private readonly view: EditorView) { this.decorations = nativeDefinitionMask(view); }
    update() { this.decorations = nativeDefinitionMask(this.view); }
  }, { decorations: (instance) => instance.decorations });
  const extensions = (enabled: boolean, livePreview = true): Extension[] => [
    ...(livePreview ? [editorLivePreviewField] : []),
    ...(nativeFirst ? [native, ...(enabled ? [product] : [])] : [...(enabled ? [product] : []), native]),
  ];
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({ parent, state: EditorState.create({
    doc: SOURCE, selection: { anchor: SOURCE.length }, extensions: extensions(true),
  }) });
  views.push(view);
  return {
    view, settings,
    configure(enabled: boolean, livePreview = true) {
      view.dispatch({ effects: StateEffect.reconfigure.of(extensions(enabled, livePreview)) });
    },
    reload() {
      view.dispatch({ effects: StateEffect.reconfigure.of(extensions(false)) });
      controller = new HeadingDisplayController(() => settings);
      product = controller.createExtension();
      view.dispatch({ effects: StateEffect.reconfigure.of(extensions(true)) });
    },
    refresh: () => controller.refreshAll(),
  };
}

function labels(view: EditorView): string[] {
  return [...view.dom.querySelectorAll(".number-suite-note-definition")].map((node) => node.textContent ?? "");
}

describe("note definition labels beside native punctuation concealment", () => {
  it.each([true, false])("survives initial rendering and repeated plugin reload with nativeFirst=%s", (nativeFirst) => {
    const { view, reload } = setup(nativeFirst);
    expect(labels(view)).toEqual(["[1]", "[2]"]);
    for (let index = 0; index < 2; index++) {
      reload();
      expect(labels(view)).toEqual(["[1]", "[2]"]);
      view.dispatch({ selection: { anchor: 1 } });
      expect(labels(view)).toEqual(["[1]", "[2]"]);
      view.dispatch({ selection: { anchor: SOURCE.length } });
      expect(view.state.doc.toString()).toBe(SOURCE);
    }
  });

  it("reveals the selected marker and preserves inactive labels during composition", async () => {
    const { view, reload } = setup(true);
    reload();
    const marker = SOURCE.indexOf("[^first]:");
    view.dispatch({ selection: { anchor: marker + 3 } });
    expect(labels(view)).toEqual(["[2]"]);
    expect(view.contentDOM.textContent).toContain("[^first]: First note.");

    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    view.dispatch({ selection: { anchor: marker + 4 } });
    expect(labels(view)).toEqual(["[2]"]);
    expect(view.contentDOM.textContent).toContain("[^first]: First note.");
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    view.dispatch({ selection: { anchor: SOURCE.length } });
    expect(labels(view)).toEqual(["[1]", "[2]"]);
    expect(view.state.doc.toString()).toBe(SOURCE);
  });

  it("clears definition widgets when display is disabled and restores them without duplicates", () => {
    const { view, settings, refresh, configure, reload } = setup(true);
    reload();
    settings.noteDisplayMode = "source";
    refresh();
    expect(labels(view)).toEqual([]);
    settings.noteDisplayMode = "formatted";
    refresh();
    expect(labels(view)).toEqual(["[1]", "[2]"]);
    settings.showNoteNumbers = false;
    refresh();
    expect(labels(view)).toEqual([]);
    settings.showNoteNumbers = true;
    refresh();
    expect(labels(view)).toEqual(["[1]", "[2]"]);
    settings.enableLivePreview = false;
    refresh();
    expect(labels(view)).toEqual([]);
    settings.enableLivePreview = true;
    refresh();
    expect(labels(view)).toEqual(["[1]", "[2]"]);

    configure(true, false);
    expect(labels(view)).toEqual([]);
    expect(view.contentDOM.textContent).toContain("[^first]: First note.");
    configure(true);
    expect(labels(view)).toEqual(["[1]", "[2]"]);
    configure(false);
    expect(labels(view)).toEqual([]);
    configure(true);
    expect(labels(view)).toEqual(["[1]", "[2]"]);
    expect(view.state.doc.toString()).toBe(SOURCE);
  });
});
