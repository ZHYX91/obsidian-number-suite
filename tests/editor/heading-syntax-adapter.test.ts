import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";

import {
  captionBlockWidgetAnchor,
  isHeadingCompositionActive,
  NumeralWidget,
  shouldShowNoteWidgets,
  syntaxNodeConfirmsHeading,
  selectionTouchesHeadingLine,
  transitionHeadingComposition,
  transitionHeadingTouchEditing,
} from "../../src/editor/heading-display-extension";
import { DEFAULT_SETTINGS } from "../../src/config/settings";

describe("syntaxNodeConfirmsHeading", () => {
  it("accepts the supported desktop and mobile heading node names", () => {
    expect(syntaxNodeConfirmsHeading("ATXHeading", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("ATXHeading2", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HeaderMark", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HyperMD-header", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_H2", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_HyperMD-header-2", 2)).toBe(true);
  });

  it("rejects mismatched levels and similarly named non-heading nodes", () => {
    expect(syntaxNodeConfirmsHeading("ATXHeading3", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_H3", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_HyperMD-header-3", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("formatting-header-2", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("HyperMD-codeblock", 2)).toBe(false);
  });
});

describe("selectionTouchesHeadingLine", () => {
  it("reveals an extended marker only while its source line is being edited", () => {
    const heading = {
      lineFrom: 10,
      lineTo: 30,
    } as Parameters<typeof selectionTouchesHeadingLine>[0];
    expect(selectionTouchesHeadingLine(heading, [{ from: 20, to: 20 }])).toBe(true);
    expect(selectionTouchesHeadingLine(heading, [{ from: 31, to: 31 }])).toBe(false);
  });
});

describe("captionBlockWidgetAnchor", () => {
  it("anchors above and below at outer line boundaries with stable widget ordering", () => {
    const state = EditorState.create({ doc: "Caption\n\n| A |\n| --- |\n| 1 |\nAfter" });
    const objectFrom = state.doc.line(3).from;
    const objectTo = state.doc.line(5).to;
    expect(captionBlockWidgetAnchor(state, "above", objectFrom, objectTo)).toEqual({
      position: state.doc.line(3).from,
      side: -10_000,
    });
    expect(captionBlockWidgetAnchor(state, "below", objectFrom, objectTo)).toEqual({
      position: state.doc.line(5).to,
      side: 10_000,
    });
  });
});

describe("Live Preview note widgets", () => {
  it("shows formatted notes only in Live Preview when that mode is selected", () => {
    expect(shouldShowNoteWidgets(DEFAULT_SETTINGS, true)).toBe(true);
    expect(shouldShowNoteWidgets(DEFAULT_SETTINGS, false)).toBe(false);
    expect(shouldShowNoteWidgets({ ...DEFAULT_SETTINGS, noteDisplayMode: "source" }, true)).toBe(false);
    expect(shouldShowNoteWidgets({ ...DEFAULT_SETTINGS, showNoteNumbers: false }, true)).toBe(false);
  });

  it("returns note-widget events to CodeMirror so a click can reveal source", () => {
    expect(new NumeralWidget("1", "note-reference").ignoreEvent()).toBe(false);
    expect(new NumeralWidget("[1]", "note-definition").ignoreEvent()).toBe(false);
    expect(new NumeralWidget("1", "heading").ignoreEvent()).toBe(true);
  });
});

describe("isHeadingCompositionActive", () => {
  it("suppresses decorations as soon as the DOM composition event starts", () => {
    expect(isHeadingCompositionActive(false, true)).toBe(true);
    expect(isHeadingCompositionActive(true, false)).toBe(true);
    expect(isHeadingCompositionActive(false, false)).toBe(false);
  });

  it("lets the IME own composition start and requests one refresh after composition end", () => {
    expect(transitionHeadingTouchEditing(false, "prepare")).toEqual({
      eventCompositionActive: true,
      requestRefresh: true,
    });
    expect(transitionHeadingComposition(true, "start")).toEqual({
      eventCompositionActive: true,
      requestRefresh: false,
    });
    expect(transitionHeadingComposition(true, "end")).toEqual({
      eventCompositionActive: false,
      requestRefresh: true,
    });
    expect(transitionHeadingComposition(false, "end")).toEqual({
      eventCompositionActive: false,
      requestRefresh: false,
    });
    expect(transitionHeadingTouchEditing(true, "finish")).toEqual({
      eventCompositionActive: false,
      requestRefresh: true,
    });
  });

  it("keeps decorations suppressed across consecutive touch IME compositions", () => {
    const touch = transitionHeadingTouchEditing(false, "prepare");
    const firstStart = transitionHeadingComposition(false, "start");
    const firstEnd = transitionHeadingComposition(firstStart.eventCompositionActive, "end");
    const secondStart = transitionHeadingComposition(firstEnd.eventCompositionActive, "start");

    expect(isHeadingCompositionActive(false, touch.eventCompositionActive)).toBe(true);
    expect(firstStart.requestRefresh).toBe(false);
    expect(firstEnd.requestRefresh).toBe(true);
    expect(isHeadingCompositionActive(false, touch.eventCompositionActive)).toBe(true);
    expect(secondStart.requestRefresh).toBe(false);
  });
});
