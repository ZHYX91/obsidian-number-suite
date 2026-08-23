export const VIRTUAL_NUMERAL_CLASS = "structured-numbering-virtual";
export const VIRTUAL_NUMERAL_SELECTOR = `.${VIRTUAL_NUMERAL_CLASS}`;

interface ObsidianWindow extends Window {
  createFragment(): DocumentFragment;
}

export function createVirtualNumeralElement(ownerDocument: Document, label: string): HTMLSpanElement {
  const fragment = (ownerDocument.win as ObsidianWindow).createFragment();
  const element = fragment.createSpan();
  element.className = VIRTUAL_NUMERAL_CLASS;
  element.append(label);
  const semanticSeparator = element.createSpan();
  semanticSeparator.hidden = true;
  semanticSeparator.textContent = " ";
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("contenteditable", "false");
  return element;
}

export function createVirtualSemanticElement(
  ownerDocument: Document,
  label: string,
  kind: "caption" | "reference",
): HTMLSpanElement {
  const fragment = (ownerDocument.win as ObsidianWindow).createFragment();
  const element = fragment.createSpan();
  element.className = `${VIRTUAL_NUMERAL_CLASS} structured-numbering-${kind}-number`;
  element.textContent = kind === "caption" ? ` ${label}` : `${label} `;
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("contenteditable", "false");
  return element;
}

export function createVirtualNoteElement(
  ownerDocument: Document,
  label: string,
  kind: NoteKind,
  position: "reference" | "definition",
): HTMLSpanElement {
  const fragment = (ownerDocument.win as ObsidianWindow).createFragment();
  const element = fragment.createSpan();
  element.className = `${VIRTUAL_NUMERAL_CLASS} structured-numbering-note-${position}`;
  element.dataset.structuredNumberingNoteKind = kind;
  element.textContent = position === "reference" ? label : `[${label}]`;
  element.setAttribute("contenteditable", "false");
  return element;
}
import type { NoteKind } from "../core/note-semantics";
