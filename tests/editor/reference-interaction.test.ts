// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NumeralWidget } from "../../src/editor/heading-display-extension";

const SOURCE = "# Target\n\nSee @[[#Target]].\n\nTail";
const FROM = SOURCE.indexOf("@[[");
const TO = FROM + "@[[#Target]]".length;
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

function setup() {
  let editorPointerEvents = 0;
  const mask = (view: EditorView): DecorationSet => view.state.selection.ranges.some(
    (range) => range.from <= TO && range.to >= FROM,
  ) ? Decoration.none : Decoration.set([
    Decoration.replace({
      widget: new NumeralWidget("Target", "reference", "footnote", "", "", 0),
      inclusive: false,
    }).range(FROM, TO),
  ]);
  const replacement = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(private readonly view: EditorView) { this.decorations = mask(view); }
    update(): void { this.decorations = mask(this.view); }
  }, { decorations: (instance) => instance.decorations });
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({ parent, state: EditorState.create({
    doc: SOURCE,
    selection: { anchor: SOURCE.length },
    extensions: [replacement, EditorView.domEventHandlers({
      // Model an editor handler that would reveal a replaced source token.
      mousedown: (_event, target) => {
        editorPointerEvents += 1;
        target.dispatch({ selection: { anchor: FROM + 3 } });
        return true;
      },
      pointerdown: (_event, target) => {
        editorPointerEvents += 1;
        target.dispatch({ selection: { anchor: FROM + 3 } });
        return true;
      },
    })],
  }) });
  views.push(view);
  const pill = (): HTMLElement => {
    const element = view.dom.querySelector<HTMLElement>(".number-suite-reference-pill");
    if (element == null) throw new Error("Missing rendered reference fixture");
    return element;
  };
  return { view, pill, editorEvents: () => editorPointerEvents };
}

function mouse(element: HTMLElement, type: string, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { button: 0, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

describe("rendered reference activation owns pre-click editor events", () => {
  it("keeps the label mounted until one click navigates, without changing Markdown", () => {
    const { view, pill, editorEvents } = setup();
    const element = pill();
    mouse(element, "mousedown");
    expect(editorEvents()).toBe(0);
    expect(view.state.selection.main.head).toBe(SOURCE.length);
    expect(pill()).toBe(element);
    mouse(element, "mouseup");
    mouse(element, "click", { detail: 1 });
    expect(view.state.selection.main.head).toBe(0);
    expect(view.state.doc.toString()).toBe(SOURCE);
  });

  it("keeps touch preparation from revealing the reference", () => {
    const { view, pill, editorEvents } = setup();
    const element = pill();
    for (const type of ["pointerdown", "pointerup"]) element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, pointerType: "touch",
    }));
    expect(editorEvents()).toBe(0);
    expect(pill()).toBe(element);
    mouse(element, "click", { detail: 1 });
    expect(view.state.selection.main.head).toBe(0);
    expect(view.state.doc.toString()).toBe(SOURCE);
  });

  it("still exposes source when the selection enters the token", () => {
    const { view } = setup();
    view.dispatch({ selection: { anchor: FROM + 3 } });
    expect(view.dom.querySelector(".number-suite-reference-pill")).toBeNull();
    expect(view.contentDOM.textContent).toContain("@[[#Target]]");
    view.dispatch({ selection: { anchor: SOURCE.length } });
    expect(view.dom.querySelector(".number-suite-reference-pill")).not.toBeNull();
    expect(view.state.doc.toString()).toBe(SOURCE);
  });

  it("does not take over shift-click selection", () => {
    const { view, pill, editorEvents } = setup();
    mouse(pill(), "mousedown", { shiftKey: true });
    expect(editorEvents()).toBe(1);
    expect(view.state.selection.main.head).toBe(FROM + 3);
    expect(view.state.doc.toString()).toBe(SOURCE);
  });

  it("keeps note widgets on their existing edit-first path", () => {
    const event = new MouseEvent("mousedown", { button: 0 });
    expect(new NumeralWidget("1", "note-reference").ignoreEvent(event)).toBe(false);
    expect(new NumeralWidget("1", "note-definition").ignoreEvent(event)).toBe(false);
  });
});
