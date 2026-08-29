// @vitest-environment happy-dom

import { Prec, StateField, EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorLivePreviewField } from "obsidian";

import { DEFAULT_SETTINGS } from "../../src/config/settings";
import type { CaptionKind } from "../../src/core/document-semantics";
import {
  captionAttachmentShift,
  captionAttachmentShiftFromRects,
  captionTrackGeometry,
  HeadingDisplayController,
} from "../../src/editor/heading-display-extension";

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
  while (views.length > 0) views.pop()?.destroy();
  document.body.replaceChildren();
});

function createView(placement: "above" | "below"): EditorView {
  return createCaptionView("Figure", "![[miao.png]]", placement, "Miao");
}

function createCaptionView(
  captionKind: CaptionKind,
  objectSource: string,
  placement: "above" | "below",
  title = "Pair",
  sourcePlacement: "above" | "below" = "above",
  blankLines = 1,
): EditorView {
  const separator = "\n".repeat(blankLines + 1);
  const captionSource = `${captionKind}: ${title}`;
  const doc = sourcePlacement === "above"
    ? `${captionSource}${separator}${objectSource}`
    : `${objectSource}${separator}${captionSource}`;
  const controller = new HeadingDisplayController(() => ({
    ...DEFAULT_SETTINGS,
    figureCaptionPlacement: captionKind === "Figure" ? placement : "above",
    tableCaptionPlacement: captionKind === "Table" ? placement : "above",
    equationCaptionPlacement: captionKind === "Equation" ? placement : "above",
    codeCaptionPlacement: captionKind === "Code" ? placement : "above",
  }));
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: sourcePlacement === "above" ? doc.length : 0 },
      extensions: [
        editorLivePreviewField,
        controller.createExtension(),
      ],
    }),
  });
  views.push(view);
  return view;
}

const CAPTION_PLACEMENT_CASES = [
  { captionKind: "Figure", objectSource: "![[carrier.png]]" },
  { captionKind: "Table", objectSource: "| A |\n| --- |\n| 1 |" },
  { captionKind: "Equation", objectSource: "$$ x = 1 $$" },
  { captionKind: "Code", objectSource: "```ts\nconst x = 1;\n```" },
] as const;

const COMPOSITE_SOURCE = "Figure: Composite\n\n| A |\n| --- |\n| ![[a.png]] |";

function tableReplacementField(
  source: string,
  hostClass: string,
  highestPrecedence: boolean,
): Extension {
  class TableWidget extends WidgetType {
    override toDOM(): HTMLElement {
      const host = document.createElement("div");
      host.className = hostClass;
      host.append(document.createElement("table"));
      return host;
    }
  }
  const tableFrom = source.indexOf("| A |");
  const field = StateField.define<DecorationSet>({
    create: () => Decoration.set([
      Decoration.replace({ widget: new TableWidget(), block: true }).range(tableFrom, source.length),
    ]),
    update: (value) => value,
    provide: (stateField) => {
      const decorations = EditorView.decorations.from(stateField);
      return highestPrecedence ? Prec.highest(decorations) : decorations;
    },
  });
  return field;
}

function createCompositeTableView(
  hostClass: string,
  highestPrecedence: boolean,
  replacementFirst: boolean,
): EditorView {
  const controller = new HeadingDisplayController(() => ({
    ...DEFAULT_SETTINGS,
    figureCaptionPlacement: "below",
  }));
  const replacement = tableReplacementField(COMPOSITE_SOURCE, hostClass, highestPrecedence);
  const numberSuite = controller.createExtension();
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: COMPOSITE_SOURCE,
      selection: { anchor: COMPOSITE_SOURCE.length },
      extensions: [
        editorLivePreviewField,
        ...(replacementFirst ? [replacement, numberSuite] : [numberSuite, replacement]),
      ],
    }),
  });
  views.push(view);
  return view;
}

describe("anchored caption block widgets", () => {
  it("moves the rendered widget toward the carrier without adding vertical margins", () => {
    expect(captionAttachmentShift("above", 58)).toBe(54);
    expect(captionAttachmentShift("below", 28)).toBe(-24);
    expect(captionAttachmentShift("above", 3)).toBe(0);
  });

  it("measures the visible pill edge instead of the taller CodeMirror widget box", () => {
    expect(captionAttachmentShiftFromRects(
      "above",
      { top: 250, bottom: 283 },
      { top: 303, bottom: 603 },
      0,
    )).toBe(16);
    expect(captionAttachmentShiftFromRects(
      "below",
      { top: 323, bottom: 356 },
      { top: 20, bottom: 303 },
      0,
    )).toBe(-16);
    expect(captionAttachmentShiftFromRects(
      "above",
      { top: 266, bottom: 299 },
      { top: 303, bottom: 603 },
      16,
    )).toBe(16);
  });

  it("sizes and offsets the centered track from the carrier box", () => {
    expect(captionTrackGeometry(
      { left: 100, width: 800 },
      { left: 220, width: 400 },
    )).toEqual({ offset: 120, width: 400 });
    expect(captionTrackGeometry(
      { left: 100, width: 800 },
      { left: 800, width: 400 },
    )).toEqual({ offset: 700, width: 100 });
    expect(captionTrackGeometry(
      { left: 100, width: 0 },
      { left: 220, width: 400 },
    )).toBeNull();
  });

  it.each(["above", "below"] as const)("renders %s through a direct StateField", (placement) => {
    const view = createView(placement);
    const widget = view.dom.querySelector<HTMLElement>(".number-suite-caption-widget");
    expect(widget?.dataset.numberSuiteCaptionPlacement).toBe(placement);
    expect(widget?.classList.contains("number-suite-caption-centered")).toBe(true);
    expect(widget?.textContent).toBe("Figure 1: Miao");
    expect(view.dom.querySelector(".number-suite-caption-source-relocated")).not.toBeNull();
  });

  it.each([0, 1])(
    "keeps a source-below image caption visible across %s blank lines",
    (blankLines) => {
      const view = createCaptionView(
        "Figure",
        "![[miao.png]]",
        "below",
        "Miao",
        "below",
        blankLines,
      );
      const widget = view.dom.querySelector<HTMLElement>(".number-suite-caption-widget");
      expect(widget?.dataset.numberSuiteCaptionPlacement).toBe("below");
      expect(widget?.textContent).toBe("Figure 1: Miao");
      expect(view.dom.querySelector(".number-suite-caption-source-relocated")).not.toBeNull();
    },
  );

  it.each(CAPTION_PLACEMENT_CASES.flatMap((item) => (
    (["above", "below"] as const).map((placement) => ({ ...item, placement }))
  )))(
    "anchors a $captionKind caption $placement",
    ({ captionKind, objectSource, placement }) => {
      const view = createCaptionView(captionKind, objectSource, placement);
      const widget = view.dom.querySelector<HTMLElement>(".number-suite-caption-widget");
      expect(widget?.dataset.numberSuiteCaptionPlacement).toBe(placement);
      expect(widget?.dataset.numberSuiteCaptionObjectKind).toBe(captionKind);
      expect(widget?.textContent).toBe(`${captionKind} 1: Pair`);
    },
  );

  it("reveals authored source while the caption is being edited and restores the widget afterward", () => {
    const view = createView("below");
    expect(view.dom.querySelector(".number-suite-caption-widget")).not.toBeNull();

    view.dispatch({ selection: { anchor: "Figure: ".length } });
    expect(view.dom.querySelector(".number-suite-caption-widget")).toBeNull();
    expect(view.dom.querySelector(".number-suite-caption-source-relocated")).toBeNull();
    expect(view.dom.textContent).toContain("Figure: Miao");

    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(view.dom.querySelector(".number-suite-caption-widget")?.textContent).toBe("Figure 1: Miao");
  });

  it("keeps the anchored caption visible when carrier DOM lookup fails", () => {
    const view = createView("below");
    const widget = view.dom.querySelector<HTMLElement>(".number-suite-caption-widget");
    expect(view.dom.querySelector("img:not(.cm-widgetBuffer), table, .math-block, pre")).toBeNull();
    expect(widget?.textContent).toBe("Figure 1: Miao");
    expect(widget?.style.inlineSize).toBe("");
    expect(widget?.style.marginInlineStart).toBe("");
  });

  it("coexists with an ordinary rendered table block", () => {
    const view = createCompositeTableView("cm-table-widget", false, false);
    expect(view.dom.querySelector(".cm-table-widget table")).not.toBeNull();
    expect(view.dom.querySelector(".number-suite-caption-widget")?.textContent)
      .toBe("Figure 1: Composite");
  });

  it.each([false, true])(
    "coexists with a highest-precedence Structural Tables block when replacementFirst=%s",
    (replacementFirst) => {
      const view = createCompositeTableView(
        "structural-tables-live-preview",
        true,
        replacementFirst,
      );
      expect(view.dom.querySelector(".structural-tables-live-preview")).not.toBeNull();
      expect(view.dom.querySelector(".number-suite-caption-widget")?.textContent)
        .toBe("Figure 1: Composite");
    },
  );
});
