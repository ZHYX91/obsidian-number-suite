// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { defineLanguageFacet, forceParsing, Language } from "@codemirror/language";
import { GFM, parser } from "@lezer/markdown";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { editorLivePreviewField } from "obsidian";

import * as headingPlans from "../../src/application/display-plan";
import * as semanticPlans from "../../src/application/semantic-display-plan";
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
      extensions: [new Language(defineLanguageFacet(), parser.configure(GFM)), editorLivePreviewField, controller.createExtension()],
    }),
  });
  views.push(view);
  expect(view.state.doc.toString()).toBe(source);
  return parent;
}

it("reuses decorations for ordinary caret movement and refreshes at source boundaries", () => {
  const source = Array.from({ length: 128 }, (_, i) => (
    `## Heading ${i}\nOrdinary paragraph text.\nMore plain text.`
  )).join("\n\n") + "\nSee [^note] here.\n[^note]: Details.";
  render(source);
  const view = views[0]!;
  forceParsing(view, source.length, 2000);
  const plain = source.indexOf("Ordinary");
  const other = source.indexOf("More plain");
  view.dispatch({ selection: { anchor: plain } });
  const heading = vi.spyOn(headingPlans, "createDisplayPlan");
  const semantic = vi.spyOn(semanticPlans, "createSemanticDisplayPlan");
  try {
    for (let i = 0; i < 20; i++) view.dispatch({ selection: { anchor: plain + (i % 10) } });
    view.dispatch({ selection: { anchor: other + 1 } });
    expect(heading).not.toHaveBeenCalled();
    expect(semantic).not.toHaveBeenCalled();

    // A line change can reveal a heading or caption, and an inline reference
    // can change visibility even when both cursor positions are on one line.
    view.dispatch({ selection: { anchor: source.indexOf("Heading") } });
    expect(heading).toHaveBeenCalledTimes(1);
    view.dispatch({ selection: { anchor: source.indexOf("See [") } });
    const ref = source.indexOf("[^note]") + 2;
    view.dispatch({ selection: { anchor: ref } });
    expect(heading).toHaveBeenCalledTimes(3);
    expect(semantic).toHaveBeenCalledTimes(6);
    view.dispatch({ selection: { anchor: plain, head: other } });
    expect(heading).toHaveBeenCalledTimes(4);

    view.dispatch({ selection: { anchor: plain } });
    heading.mockClear();
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    view.dispatch({ selection: { anchor: plain + 1 } });
    expect(heading).toHaveBeenCalledTimes(1);
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  } finally {
    heading.mockRestore();
    semantic.mockRestore();
  }
});

it.each(["-", "--", "---"])("shows only the real caption after a GFM table using %s", (dash) => {
  const source = `| Name | Value |\n| ${dash} | ${dash} |\nTable: Alpha | Beta\n\nTable: Actual\n\nAfter`;
  const parent = render(source);
  expect(Array.from(parent.querySelectorAll(".number-suite-caption-pill"), (node) => node.textContent))
    .toEqual(["Table 1: Actual"]);
});

it("renders the first prose footnote as 1 after an inline-math lookalike", () => {
  const source = "公式 $[^ghost]$，正文 [^real]。\n\n[^ghost]: 示例\n[^real]: 正文脚注\n\n尾部";
  const parent = render(source);
  expect(Array.from(parent.querySelectorAll(".number-suite-note-reference"), (node) => node.textContent))
    .toEqual(["1"]);
  expect(Array.from(parent.querySelectorAll(".number-suite-note-definition"), (node) => node.textContent))
    .toEqual(["[1]"]);
});


it.each([
  ["--- | --- | ---", ["Table 1: Actual"]],
  ["--- | ---", ["Table 1: Candidate", "Table 2: Actual"]],
])("renders native code-pipe table ownership for %s", (delimiter, labels) => {
  const parent = render(`\`A | B\` | C\n${delimiter}\nTable: Candidate\n\nTable: Actual\n\nAfter`);
  expect(Array.from(parent.querySelectorAll(".number-suite-caption-pill"), (node) => node.textContent)).toEqual(labels);
});

it.each([
  ['[label](target "title\n[^ghost] @[[#Target]]")', ["1"], 1],
  ["[label](target 'title\n[^ghost] @[[#Target]]')", ["1"], 1],
  ['[label](target (title\n[^ghost] @[[#Target]]))', ["1"], 1],
  ['[label](target\n"[^ghost] @[[#Target]]")', ["1"], 1],
  ['[label](target "[^ghost] @[[#Target]]")', ["1"], 1],
  ['[label](target)\n[^ghost] @[[#Target]]', ["1", "2"], 2],
  ['[label](target invalid [^ghost] @[[#Target]])', ["1", "2"], 2],
  ['[See [^visible] @[[#Target]]](target "title\n[^ghost] @[[#Target]]")', ["1", "2"], 2],
  ['| Name | Value |\n| --- | --- |\n| [label](target "title | [^ghost] @[[#Target]]") |', ["1", "2"], 2],
  ['| Name | Value |\n| --- | --- |\n| [label](target "title | [^ghost] @[[#Target]] |\n| more | end") |', ["1", "2"], 2],
  ['> Name | Value\n> --- | ---\n> [label](target "title | x\n> [^ghost] @[[#Target]] | end")', ["1", "2"], 2],
  ['- Name | Value\n  --- | ---\n  [label](target "title | x\n  [^ghost] @[[#Target]] | end")', ["1", "2"], 2],
])("renders only prose markers around Markdown link %s", (body, notes, references) => {
  const source = ["# Target", "", body, "", "Prose [^real] @[[#Target]]", "",
    "[^ghost]: Ghost", "[^visible]: Visible", "[^real]: Real", "", "Tail"].join("\n");
  const parent = render(source);
  expect(Array.from(parent.querySelectorAll(".number-suite-note-reference"), (node) => node.textContent)).toEqual(notes);
  expect(parent.querySelectorAll(".number-suite-reference-pill")).toHaveLength(references);
});
