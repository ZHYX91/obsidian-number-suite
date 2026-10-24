import { VIRTUAL_NUMERAL_SELECTOR } from "../ui/virtual-numeral";
import { clearSemanticTooltip } from "../ui/semantic-tooltip";

export const captionOrigins = new WeakMap<HTMLElement, Readonly<{
  parent: Node;
  anchor: Comment;
  node: HTMLElement;
  objectRoot: HTMLElement;
}>>();
export const sharedCaptionOrigins = new WeakMap<HTMLElement, Readonly<{
  carrier: HTMLElement;
  anchor: Comment;
  separators: readonly ChildNode[];
  sourcePlacement: "above" | "below";
}>>();
export const captionLayoutCleanup = new WeakMap<HTMLElement, () => void>();
export const captionTargetLayoutCleanup = new WeakMap<HTMLElement, () => void>();
export const referenceOriginalNodes = new WeakMap<HTMLElement, readonly ChildNode[]>();

export function headingElements(container: HTMLElement): HTMLHeadingElement[] {
  const output: HTMLHeadingElement[] = [];
  if (/^H[1-6]$/u.test(container.tagName)) {
    output.push(container as HTMLHeadingElement);
  }
  output.push(...container.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
  return output;
}

function cleanupHeading(element: HTMLElement): void {
  for (const virtual of element.querySelectorAll<HTMLElement>(VIRTUAL_NUMERAL_SELECTOR)) {
    const original = virtual.dataset.numberSuiteOriginal;
    if (original != null) virtual.replaceWith(original);
    else virtual.remove();
  }
  for (const concealed of element.querySelectorAll<HTMLElement>(".number-suite-concealed")) {
    concealed.replaceWith(...concealed.childNodes);
  }
  element.normalize();
  element.removeAttribute("data-number-suite-mode");
  element.removeAttribute("data-number-suite-heading-level");
  element.classList.remove(
    "number-suite-extended-heading",
    "number-suite-extended-heading-h7",
    "number-suite-extended-heading-h8",
    "number-suite-extended-heading-h9",
  );
}

function cleanupSemantic(container: HTMLElement): void {
  for (const virtual of container.querySelectorAll<HTMLElement>(
    ".number-suite-caption-number, .number-suite-reference-number",
  )) {
    const original = virtual.dataset.numberSuiteOriginal;
    if (original != null) virtual.replaceWith(original);
    else virtual.remove();
  }
  for (const anchor of container.querySelectorAll<HTMLElement>("[data-number-suite-reference]")) {
    const originalNodes = referenceOriginalNodes.get(anchor);
    if (originalNodes != null) anchor.replaceChildren(...originalNodes);
    else anchor.textContent = anchor.dataset.numberSuiteReferenceOriginal ?? anchor.textContent;
    referenceOriginalNodes.delete(anchor);
    if (anchor.dataset.numberSuiteReferenceAriaPresent === "true") {
      anchor.setAttribute("aria-label", anchor.dataset.numberSuiteReferenceAriaOriginal ?? "");
    } else {
      anchor.removeAttribute("aria-label");
    }
    if (anchor.dataset.numberSuiteReferenceAtRemoved === "true") anchor.before("@");
    anchor.classList.remove("number-suite-reference-pill");
    delete anchor.dataset.numberSuiteReference;
    delete anchor.dataset.numberSuiteReferenceOriginal;
    delete anchor.dataset.numberSuiteReferenceAriaPresent;
    delete anchor.dataset.numberSuiteReferenceAriaOriginal;
    delete anchor.dataset.numberSuiteReferenceAtRemoved;
    delete anchor.dataset.numberSuiteReferenceLine;
    delete anchor.dataset.numberSuiteReferenceKind;
  }
  const captions: HTMLElement[] = [];
  if (container.matches("[data-number-suite-caption-kind]")) captions.push(container);
  captions.push(...container.querySelectorAll<HTMLElement>("[data-number-suite-caption-kind]"));
  for (const caption of captions) {
    const origin = captionOrigins.get(caption);
    if (origin != null) {
      if (origin.anchor.parentNode != null) {
        origin.anchor.before(origin.node);
        origin.anchor.remove();
      } else {
        origin.parent.appendChild(origin.node);
      }
      captionOrigins.delete(caption);
      origin.objectRoot.classList.remove("number-suite-caption-object");
      delete origin.objectRoot.dataset.numberSuiteCaptionPlacement;
    }
    caption.classList.remove(
      "number-suite-caption-centered",
      "number-suite-caption-object-aligned",
      "number-suite-caption-pill",
    );
    captionLayoutCleanup.get(caption)?.();
    captionLayoutCleanup.delete(caption);
    caption.style.removeProperty("--number-suite-caption-inline-offset");
    delete caption.dataset.numberSuiteCaptionKind;
    delete caption.dataset.numberSuiteCaptionPlacement;
    const sharedOrigin = sharedCaptionOrigins.get(caption);
    if (sharedOrigin != null && sharedOrigin.anchor.parentNode === sharedOrigin.carrier) {
      const captionNodes = [...caption.childNodes];
      if (sharedOrigin.sourcePlacement === "above") {
        sharedOrigin.anchor.before(...captionNodes, ...sharedOrigin.separators);
      } else {
        sharedOrigin.anchor.before(...sharedOrigin.separators, ...captionNodes);
      }
      sharedOrigin.anchor.remove();
      caption.remove();
      sharedCaptionOrigins.delete(caption);
    }
  }
  const captionObjects: HTMLElement[] = [];
  if (container.matches(".number-suite-caption-object")) captionObjects.push(container);
  captionObjects.push(...container.querySelectorAll<HTMLElement>(".number-suite-caption-object"));
  for (const object of captionObjects) {
    captionTargetLayoutCleanup.get(object)?.();
    object.classList.remove("number-suite-caption-object");
    delete object.dataset.numberSuiteCaptionPlacement;
  }
  if (container.matches("[data-number-suite-tooltip]")) clearSemanticTooltip(container);
  for (const element of container.querySelectorAll<HTMLElement>("[data-number-suite-tooltip]")) {
    clearSemanticTooltip(element);
  }
  for (const element of container.querySelectorAll<HTMLElement>("[data-number-suite-note-original]")) {
    element.textContent = element.dataset.numberSuiteNoteOriginal ?? "";
    if (element.dataset.numberSuiteNoteAriaPresent === "true") {
      element.setAttribute("aria-label", element.dataset.numberSuiteNoteAriaOriginal ?? "");
    } else {
      element.removeAttribute("aria-label");
    }
    delete element.dataset.numberSuiteNoteOriginal;
    delete element.dataset.numberSuiteNoteKind;
    delete element.dataset.numberSuiteNoteAriaOriginal;
    delete element.dataset.numberSuiteNoteAriaPresent;
  }
  for (const item of container.querySelectorAll<HTMLElement>("[data-number-suite-note-value]")) {
    const original = item.dataset.numberSuiteNoteValue;
    if (original == null || original === "") item.removeAttribute("value");
    else item.setAttribute("value", original);
    delete item.dataset.numberSuiteNoteValue;
    delete item.dataset.numberSuiteNoteKind;
    delete item.dataset.numberSuiteNoteLabel;
  }
  container.normalize();
}

export function cleanupNumberSuiteReadingDom(container: HTMLElement): void {
  cleanupSemantic(container);
  const headings = new Set<HTMLElement>([
    ...headingElements(container),
    ...container.querySelectorAll<HTMLElement>(".number-suite-extended-heading"),
  ]);
  if (container.classList.contains("number-suite-extended-heading")) headings.add(container);
  for (const heading of headings) cleanupHeading(heading);
}
