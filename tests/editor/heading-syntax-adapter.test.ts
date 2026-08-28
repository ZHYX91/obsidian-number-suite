import { describe, expect, it } from "vitest";

import {
  isHeadingCompositionActive,
  NumeralWidget,
  shouldShowNoteWidgets,
  syntaxNodeConfirmsHeading,
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
});
