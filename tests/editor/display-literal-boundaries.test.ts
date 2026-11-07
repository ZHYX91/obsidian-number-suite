// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, expect, it } from "vitest";
import { editorLivePreviewField } from "obsidian";

import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { HeadingDisplayController } from "../../src/editor/heading-display-extension";

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

function render(source: string): HTMLElement {
  const parent = document.createElement("div");
  document.body.append(parent);
  const controller = new HeadingDisplayController(() => DEFAULT_SETTINGS);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source, selection: { anchor: source.length },
      extensions: [editorLivePreviewField, controller.createExtension()],
    }),
  });
  views.push(view);
  expect(view.state.doc.toString()).toBe(source);
  return parent;
}

it.each(["-", "--", "---"])("shows only the real caption after a GFM table using %s", (dash) => {
  const source = `| Name | Value |\n| ${dash} | ${dash} |\nTable: Alpha | Beta\n\nTable: Actual\n\nAfter`;
  const parent = render(source);
  expect(Array.from(parent.querySelectorAll(".number-suite-caption-pill"), (node) => node.textContent))
    .toEqual(["Table 1: Actual"]);
});
