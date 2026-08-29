// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  createCaptionPillElement,
  createReferencePillElement,
  createVirtualNoteElement,
  createVirtualNumeralElement,
} from "../../src/ui/virtual-numeral";

describe("virtual numeral element", () => {
  it("shares one accessible DOM contract without a visible trailing text gap", () => {
    window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
      const span = document.createElement("span");
      this.appendChild(span);
      return span;
    };
    Object.defineProperty(document, "win", { configurable: true, value: window });
    Object.assign(window, { createFragment: () => document.createDocumentFragment() });
    const element = createVirtualNumeralElement(document, "1.2");
    expect(element.className).toBe("number-suite-virtual number-suite-heading-number");
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.getAttribute("contenteditable")).toBe("false");
    expect(element.firstChild?.textContent).toBe("1.2");
    expect(element.lastElementChild).toMatchObject({ hidden: true, textContent: " " });
    expect(element.textContent).toBe("1.2 ");
  });

  it("creates a keyboard-focusable cross-reference pill", () => {
    window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
      const span = document.createElement("span");
      this.appendChild(span);
      return span;
    };
    Object.defineProperty(document, "win", { configurable: true, value: window });
    Object.assign(window, { createFragment: () => document.createDocumentFragment() });
    const element = createReferencePillElement(document, "Figure 1: Miao");
    expect(element.className).toBe("number-suite-reference-pill");
    expect(element.textContent).toBe("Figure 1: Miao");
    expect(element.getAttribute("role")).toBe("link");
    expect(element.getAttribute("tabindex")).toBe("0");
    expect(element.getAttribute("aria-hidden")).toBeNull();
  });

  it("creates one full caption pill", () => {
    window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
      const span = document.createElement("span");
      this.appendChild(span);
      return span;
    };
    Object.defineProperty(document, "win", { configurable: true, value: window });
    Object.assign(window, { createFragment: () => document.createDocumentFragment() });
    const element = createCaptionPillElement(document, "Figure 1: Miao");
    expect(element.className).toBe("number-suite-caption-pill");
    expect(element.textContent).toBe("Figure 1: Miao");
    expect(element.getAttribute("contenteditable")).toBe("false");
  });

  it("marks typed note references and definitions without mutating source text", () => {
    window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
      const span = document.createElement("span");
      this.appendChild(span);
      return span;
    };
    Object.defineProperty(document, "win", { configurable: true, value: window });
    Object.assign(window, { createFragment: () => document.createDocumentFragment() });
    const reference = createVirtualNoteElement(
      document,
      "E2",
      "endnote",
      "reference",
      "Endnote E2",
      "Click to edit the source marker",
    );
    const definition = createVirtualNoteElement(document, "E2", "endnote", "definition");
    expect(reference.classList.contains("number-suite-note-reference")).toBe(true);
    expect(reference.dataset.numberSuiteNoteKind).toBe("endnote");
    expect(reference.textContent).toBe("E2");
    expect(reference.getAttribute("aria-label")).toBe("Endnote E2");
    expect(reference.getAttribute("title")).toContain("Click to edit");
    expect(definition.textContent).toBe("[E2]");
  });
});
