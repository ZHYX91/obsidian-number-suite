import type { HeadingNumberPillKind } from "../application/display-plan";
import type { Translate } from "../config/i18n";

export const VIRTUAL_NUMERAL_CLASS = "number-suite-virtual";
export const VIRTUAL_NUMERAL_SELECTOR = `.${VIRTUAL_NUMERAL_CLASS}`;

interface ObsidianWindow extends Window {
  createFragment(): DocumentFragment;
}

export function headingNumberHint(kind: HeadingNumberPillKind, t: Translate): string {
  if (kind === "virtual") return t("display.heading.virtualHint");
  if (kind === "manual") return t("display.heading.manualHint");
  return t("display.heading.storedHint");
}

export function headingNumberAccessibleLabel(label: string, hint: string): string {
  return `${label} — ${hint}`;
}

export function identifyHeadingNumberPill(element: HTMLElement, label: string, hint: string): void {
  element.title = hint;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", headingNumberAccessibleLabel(label, hint));
}

export function createVirtualNumeralElement(ownerDocument: Document, label: string, hint = ""): HTMLSpanElement {
  const fragment = (ownerDocument.win as ObsidianWindow).createFragment();
  const element = fragment.createSpan();
  element.className = `${VIRTUAL_NUMERAL_CLASS} number-suite-heading-number`;
  element.append(label);
  const semanticSeparator = element.createSpan();
  semanticSeparator.hidden = true;
  semanticSeparator.textContent = " ";
  if (hint) identifyHeadingNumberPill(element, label, hint);
  else element.setAttribute("aria-hidden", "true");
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
  element.className = `${VIRTUAL_NUMERAL_CLASS} number-suite-${kind}-number`;
  element.textContent = kind === "caption" ? ` ${label}` : `${label} `;
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("contenteditable", "false");
  return element;
}

export function createReferencePillElement(
  ownerDocument: Document,
  label: string,
): HTMLSpanElement {
  const fragment = (ownerDocument.win as ObsidianWindow).createFragment();
  const element = fragment.createSpan();
  element.className = "number-suite-reference-pill";
  element.textContent = label;
  element.setAttribute("role", "link");
  element.setAttribute("tabindex", "0");
  element.setAttribute("contenteditable", "false");
  return element;
}

export function createCaptionPillElement(
  ownerDocument: Document,
  label: string,
): HTMLSpanElement {
  const fragment = (ownerDocument.win as ObsidianWindow).createFragment();
  const element = fragment.createSpan();
  element.className = "number-suite-caption-pill";
  element.textContent = label;
  element.setAttribute("contenteditable", "false");
  return element;
}

export function createVirtualNoteElement(
  ownerDocument: Document,
  label: string,
  kind: NoteKind,
  position: "reference" | "definition",
  accessibleLabel = "",
  editHint = "",
): HTMLSpanElement {
  const fragment = (ownerDocument.win as ObsidianWindow).createFragment();
  const element = fragment.createSpan();
  element.className = `${VIRTUAL_NUMERAL_CLASS} number-suite-note-${position}`;
  element.dataset.numberSuiteNoteKind = kind;
  element.textContent = position === "reference" ? label : `[${label}]`;
  if (accessibleLabel.length > 0) {
    element.setAttribute("aria-label", accessibleLabel);
    element.setAttribute("title", editHint.length > 0
      ? `${accessibleLabel} — ${editHint}`
      : accessibleLabel);
  }
  element.setAttribute("contenteditable", "false");
  return element;
}
import type { NoteKind } from "../core/note-semantics";
