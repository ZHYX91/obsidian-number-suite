import {
  App,
  MarkdownView,
  normalizePath,
  TFile,
  type MarkdownPostProcessorContext,
  type WorkspaceLeaf,
} from "obsidian";

import { parseNoteOverrides, resolveNoteSettings } from "../config/frontmatter";
import { meaningfulImageReplacementText } from "../core/caption-objects";
import { createTranslator, type Translate } from "../config/i18n";
import {
  centeredCaptionKinds,
  captionPlacements,
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";
import { WORD_JOINER } from "../core/markers";
import { createDisplayPlan } from "../application/display-plan";
import {
  createSemanticDisplayPlan,
  type SemanticDisplayDecoration,
} from "../application/semantic-display-plan";
import type { DisplayDecorationPlan } from "../application/display-plan";
import type { ParsedHeading } from "../core/types";
import {
  createVirtualNumeralElement,
  createVirtualSemanticElement,
  VIRTUAL_NUMERAL_SELECTOR,
} from "../ui/virtual-numeral";
import { applySemanticTooltip, clearSemanticTooltip } from "../ui/semantic-tooltip";

const captionOrigins = new WeakMap<HTMLElement, Readonly<{
  parent: Node;
  anchor: Comment;
}>>();
const sharedCaptionOrigins = new WeakMap<HTMLElement, Readonly<{
  carrier: HTMLElement;
  anchor: Comment;
  separators: readonly ChildNode[];
  sourcePlacement: "above" | "below";
}>>();
const captionLayoutObservers = new WeakMap<HTMLElement, ResizeObserver>();

interface CachedReadingPlan {
  readonly headings: readonly ParsedHeading[];
  readonly displayPlan: readonly DisplayDecorationPlan[];
  readonly semanticPlan: readonly SemanticDisplayDecoration[];
}

interface ReadingPlanCacheEntry extends CachedReadingPlan {
  readonly source: string;
  readonly fingerprint: string;
}

interface RenderedHeading {
  readonly element: HTMLElement;
  readonly level: number;
  readonly extendedMarker: string | null;
}

function headingElements(container: HTMLElement): HTMLHeadingElement[] {
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

function leadingExtendedMarker(element: HTMLElement): string | null {
  const text = leadingTextNodes(element).map((node) => node.data).join("");
  return /^(?: {0,3})(#{7,9})[ \t]+/u.exec(text)?.[0] ?? null;
}

function renderedHeadingElements(container: HTMLElement): RenderedHeading[] {
  const native = headingElements(container).map((element) => ({
    element,
    level: Number(element.tagName.slice(1)),
    extendedMarker: null,
  }));
  const paragraphs: HTMLElement[] = [];
  if (container.matches("p")) paragraphs.push(container);
  paragraphs.push(...container.querySelectorAll<HTMLElement>("p"));
  const extended = paragraphs.flatMap((element): RenderedHeading[] => {
    const marker = leadingExtendedMarker(element);
    if (marker == null) return [];
    return [{
      element,
      level: marker.trimStart().match(/^#+/u)?.[0].length ?? 0,
      extendedMarker: marker,
    }];
  });
  return [...native, ...extended].sort((left, right) => {
    if (left.element === right.element) return 0;
    return left.element.compareDocumentPosition(right.element) & 4 ? -1 : 1;
  });
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
    anchor.textContent = anchor.dataset.numberSuiteReferenceOriginal ?? anchor.textContent;
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
        origin.anchor.before(caption);
        origin.anchor.remove();
      } else {
        origin.parent.appendChild(caption);
      }
      captionOrigins.delete(caption);
    }
    caption.classList.remove(
      "number-suite-caption-centered",
      "number-suite-caption-object-aligned",
      "number-suite-caption-pill",
    );
    captionLayoutObservers.get(caption)?.disconnect();
    captionLayoutObservers.delete(caption);
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

function captionRoots(container: HTMLElement): HTMLElement[] {
  const roots: HTMLElement[] = [];
  if (container.matches("p")) roots.push(container);
  roots.push(...container.querySelectorAll<HTMLElement>("p"));
  return roots;
}

function enhanceCaption(element: HTMLElement, kind: string, label: string): boolean {
  const view = element.ownerDocument.defaultView;
  const walker = element.ownerDocument.createTreeWalker(element, view?.NodeFilter.SHOW_TEXT ?? 4);
  let leading = "";
  let node = walker.nextNode() as Text | null;
  while (node != null && leading.length <= kind.length + 4) {
    const combined = leading + node.data;
    const trimmed = combined.trimStart();
    if (trimmed.startsWith(`${kind}:`)) {
      element.classList.add("number-suite-caption-pill");
      element.dataset.numberSuiteCaptionKind = kind;
      if (label.length === 0) return true;
      const absoluteColon = combined.indexOf(`${kind}:`) + kind.length;
      const localOffset = absoluteColon - leading.length;
      if (localOffset >= 0 && localOffset <= node.data.length) {
        const span = createVirtualSemanticElement(element.ownerDocument, label, "caption");
        const suffix = node.splitText(localOffset);
        suffix.parentNode?.insertBefore(span, suffix);
        return true;
      }
    }
    leading = combined;
    node = walker.nextNode() as Text | null;
  }
  return false;
}

interface RenderedCaptionObject {
  readonly root: HTMLElement;
  readonly alignmentTarget: HTMLElement;
  readonly hoverTarget: HTMLElement | null;
}

function captionObjectSelector(kind: string): string {
  if (kind === "Figure") return ".image-embed, .internal-embed.image-embed, img";
  if (kind === "Table") return "table";
  if (kind === "Equation") return ".math-block, mjx-container[display='true']";
  return kind === "Code" ? "pre" : ":not(*)";
}

function renderedCaptionObject(
  caption: HTMLElement,
  objectKind: string,
  captionKind: string,
  sourcePlacement: "above" | "below",
): RenderedCaptionObject | null {
  const selector = captionObjectSelector(objectKind);
  let sibling = sourcePlacement === "above"
    ? caption.nextElementSibling as HTMLElement | null
    : caption.previousElementSibling as HTMLElement | null;
  for (let distance = 0; sibling != null && distance < 5; distance += 1) {
    if (sibling.matches("[data-number-suite-caption-kind]")) return null;
    const target = sibling.matches(selector)
      ? sibling
      : sibling.querySelector<HTMLElement>(selector);
    if (target != null) {
      const hoverTarget = captionKind === "Figure" && objectKind === "Figure"
        ? (target.matches("img") ? target : target.querySelector<HTMLElement>("img"))
        : captionKind === "Figure" ? target : null;
      const alignmentTarget = target.matches(".image-embed, .internal-embed.image-embed")
        ? target.querySelector<HTMLElement>("img") ?? target
        : target;
      return { root: sibling, alignmentTarget, hoverTarget };
    }
    sibling = sourcePlacement === "above"
      ? sibling.nextElementSibling as HTMLElement | null
      : sibling.previousElementSibling as HTMLElement | null;
  }
  return null;
}

function captionSharesCarrierRoot(caption: HTMLElement, objectKind: string): boolean {
  const selector = captionObjectSelector(objectKind);
  return caption.matches(selector) || caption.querySelector(selector) != null;
}

interface SharedCaptionCandidate {
  readonly captionNodes: readonly ChildNode[];
  readonly carrierNodes: readonly ChildNode[];
  readonly separators: readonly ChildNode[];
}

function isLineBreak(node: ChildNode): boolean {
  return node.nodeType === 1 && (node as Element).tagName === "BR";
}

function nodeContainsSelector(node: ChildNode, selector: string): boolean {
  if (node.nodeType !== 1) return false;
  const element = node as Element;
  return element.matches(selector) || element.querySelector(selector) != null;
}

function sharedCaptionCandidate(
  root: HTMLElement,
  objectKind: string,
  captionKind: string,
  sourcePlacement: "above" | "below",
): SharedCaptionCandidate | null {
  if (objectKind !== "Figure" || !root.matches("p")) return null;
  const selector = captionObjectSelector(objectKind);
  const nodes = [...root.childNodes];
  const nodeIndexes = new Map(nodes.map((node, index) => [node, index]));
  const candidates = new Map<string, SharedCaptionCandidate>();
  for (let split = 1; split < nodes.length; split += 1) {
    let captionNodes = sourcePlacement === "above"
      ? nodes.slice(0, split)
      : nodes.slice(split);
    let carrierNodes = sourcePlacement === "above"
      ? nodes.slice(split)
      : nodes.slice(0, split);
    const separators: ChildNode[] = [];
    while (captionNodes.length > 0 && isLineBreak(
      sourcePlacement === "above" ? captionNodes[captionNodes.length - 1]! : captionNodes[0]!,
    )) {
      const separator = sourcePlacement === "above"
        ? captionNodes[captionNodes.length - 1]!
        : captionNodes[0]!;
      captionNodes = sourcePlacement === "above" ? captionNodes.slice(0, -1) : captionNodes.slice(1);
      separators.push(separator);
    }
    while (carrierNodes.length > 0 && isLineBreak(
      sourcePlacement === "above" ? carrierNodes[0]! : carrierNodes[carrierNodes.length - 1]!,
    )) {
      const separator = sourcePlacement === "above"
        ? carrierNodes[0]!
        : carrierNodes[carrierNodes.length - 1]!;
      carrierNodes = sourcePlacement === "above" ? carrierNodes.slice(1) : carrierNodes.slice(0, -1);
      separators.push(separator);
    }
    if (separators.length > 1) continue;
    if (captionNodes.some(isLineBreak) || carrierNodes.some(isLineBreak)) continue;
    if (captionNodes.some((node) => nodeContainsSelector(node, selector))) continue;
    const captionText = captionNodes.map((node) => node.textContent ?? "").join("");
    if (!new RegExp(`^\\s*${captionKind}:[^\\r\\n]*\\s*$`, "u").test(captionText)) continue;
    const carrierObjectNodes = carrierNodes.filter((node) => nodeContainsSelector(node, selector));
    if (carrierObjectNodes.length !== 1) continue;
    if (carrierNodes.some((node) => (
      !nodeContainsSelector(node, selector) && (node.textContent ?? "").trim().length > 0
    ))) {
      continue;
    }
    const orderedSeparators = [...separators].sort((left, right) => (
      (nodeIndexes.get(left) ?? 0) - (nodeIndexes.get(right) ?? 0)
    ));
    const key = [captionNodes, carrierNodes, orderedSeparators]
      .map((group) => group.map((node) => nodeIndexes.get(node)).join(","))
      .join("|");
    candidates.set(key, { captionNodes, carrierNodes, separators: orderedSeparators });
  }
  return candidates.size === 1 ? [...candidates.values()][0] ?? null : null;
}

function splitSharedCaptionRoot(
  root: HTMLElement,
  objectKind: string,
  captionKind: string,
  sourcePlacement: "above" | "below",
): HTMLElement | null {
  const candidate = sharedCaptionCandidate(root, objectKind, captionKind, sourcePlacement);
  if (candidate == null || root.parentNode == null) return null;
  const removed = new Set([...candidate.captionNodes, ...candidate.separators]);
  const firstRemoved = [...root.childNodes].find((node) => removed.has(node));
  if (firstRemoved == null) return null;
  const anchor = root.ownerDocument.createComment("number-suite-shared-caption-origin");
  root.insertBefore(anchor, firstRemoved);
  for (const separator of candidate.separators) separator.remove();
  const caption = root.ownerDocument.createElement("p");
  caption.append(...candidate.captionNodes);
  if (sourcePlacement === "above") root.before(caption);
  else root.after(caption);
  sharedCaptionOrigins.set(caption, {
    carrier: root,
    anchor,
    separators: candidate.separators,
    sourcePlacement,
  });
  return caption;
}

function alignRenderedCaption(caption: HTMLElement, target: HTMLElement): void {
  const view = caption.ownerDocument.defaultView;
  const update = (): void => {
    if (!caption.isConnected || !target.isConnected || caption.parentElement == null) return;
    const parentRect = caption.parentElement.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const captionRect = caption.getBoundingClientRect();
    if (targetRect.width <= 0 || captionRect.width <= 0) return;
    const targetOffset = Math.max(0, targetRect.left - parentRect.left);
    const centered = caption.classList.contains("number-suite-caption-centered");
    const offset = centered
      ? targetOffset + Math.max(0, (targetRect.width - captionRect.width) / 2)
      : targetOffset;
    caption.classList.add("number-suite-caption-object-aligned");
    caption.style.setProperty("--number-suite-caption-inline-offset", `${offset}px`);
  };
  view?.requestAnimationFrame(update);
  const Observer = view?.ResizeObserver;
  if (view == null || Observer == null) return;
  captionLayoutObservers.get(caption)?.disconnect();
  const observer = new Observer(() => view.requestAnimationFrame(update));
  observer.observe(target);
  observer.observe(caption);
  captionLayoutObservers.set(caption, observer);
}

function placeRenderedCaption(
  caption: HTMLElement,
  object: RenderedCaptionObject,
  displayPlacement: "above" | "below",
): void {
  caption.dataset.numberSuiteCaptionPlacement = displayPlacement;
  if (caption.parentNode == null) return;
  if (!captionOrigins.has(caption)) {
    const anchor = caption.ownerDocument.createComment("number-suite-caption-origin");
    caption.before(anchor);
    captionOrigins.set(caption, { parent: caption.parentNode, anchor });
  }
  object.root.classList.add("number-suite-caption-object");
  object.root.dataset.numberSuiteCaptionPlacement = displayPlacement;
  if (displayPlacement === "above") object.root.before(caption);
  else object.root.after(caption);
  alignRenderedCaption(caption, object.alignmentTarget);
}

function annotateUnboundImages(container: HTMLElement): void {
  const images: HTMLImageElement[] = [];
  if (container.matches("img")) {
    const rootImage = container.closest<HTMLImageElement>("img");
    if (rootImage != null) images.push(rootImage);
  }
  images.push(...container.querySelectorAll<HTMLImageElement>("img"));
  for (const image of images) {
    if (image.dataset.numberSuiteTooltip === "true") continue;
    const alt = meaningfulImageReplacementText(image.alt);
    if (alt.length > 0) applySemanticTooltip(image, "", alt);
  }
}

function alignCaption(element: HTMLElement, kind: string): boolean {
  if (!(element.textContent ?? "").trimStart().startsWith(`${kind}:`)) return false;
  element.dataset.numberSuiteCaptionKind = kind;
  element.classList.add("number-suite-caption-centered");
  return true;
}

function precedingAtText(anchor: HTMLElement): Text | null {
  let node: Node | null = anchor.previousSibling;
  while (node != null) {
    if (node.nodeType === 3 && (node as Text).data.endsWith("@")) return node as Text;
    if ((node.textContent ?? "").length > 0) return null;
    node = node.previousSibling;
  }
  return null;
}

function enhanceReference(
  container: HTMLElement,
  target: string,
  label: string,
  targetLine: number,
  targetKind: "heading" | "caption",
): boolean {
  const expected = `#${target}`;
  const anchors = container.querySelectorAll<HTMLElement>("a.internal-link");
  for (const anchor of anchors) {
    if (anchor.dataset.numberSuiteReference === "true") continue;
    const dataHref = anchor.getAttribute("data-href");
    const href = anchor.getAttribute("href");
    if ((dataHref != null && dataHref !== expected) || (dataHref == null && href !== expected)) continue;
    const text = precedingAtText(anchor);
    if (text == null) continue;
    text.deleteData(text.length - 1, 1);
    anchor.dataset.numberSuiteReferenceOriginal = anchor.textContent ?? "";
    anchor.dataset.numberSuiteReferenceAriaPresent = String(anchor.hasAttribute("aria-label"));
    anchor.dataset.numberSuiteReferenceAriaOriginal = anchor.getAttribute("aria-label") ?? "";
    anchor.dataset.numberSuiteReferenceAtRemoved = "true";
    anchor.dataset.numberSuiteReferenceLine = String(targetLine);
    anchor.dataset.numberSuiteReferenceKind = targetKind;
    anchor.textContent = label;
    anchor.classList.add("number-suite-reference-pill");
    anchor.setAttribute("aria-label", label);
    anchor.dataset.numberSuiteReference = "true";
    return true;
  }
  return false;
}

function noteReferenceRoots(container: HTMLElement): HTMLElement[] {
  const roots: HTMLElement[] = [];
  if (container.matches("sup.footnote-ref")) roots.push(container);
  roots.push(...container.querySelectorAll<HTMLElement>("sup.footnote-ref"));
  return roots;
}

function displayNoteLabel(original: string, label: string): string {
  const trimmed = original.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]") ? `[${label}]` : label;
}

function enhanceNoteReferences(
  container: HTMLElement,
  notes: readonly SemanticDisplayDecoration[],
  t: Translate,
): boolean {
  const roots = noteReferenceRoots(container);
  if (roots.length !== notes.length) return false;
  const targets = roots.map((root) => root.querySelector<HTMLElement>("a") ?? root);
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const note = notes[index];
    if (target == null || note?.noteKind == null) return false;
  }
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const note = notes[index];
    if (target == null || note?.noteKind == null) continue;
    const original = target.textContent ?? "";
    target.dataset.numberSuiteNoteOriginal = original;
    target.dataset.numberSuiteNoteKind = note.noteKind;
    target.dataset.numberSuiteNoteAriaPresent = String(target.hasAttribute("aria-label"));
    target.dataset.numberSuiteNoteAriaOriginal = target.getAttribute("aria-label") ?? "";
    target.textContent = displayNoteLabel(original, note.label);
    target.setAttribute("aria-label", note.noteKind === "endnote"
      ? t("display.note.endnote", { number: note.label })
      : t("display.note.footnote", { number: note.label }));
  }
  return true;
}

function orderedNoteDefinitions(
  plan: readonly SemanticDisplayDecoration[],
): SemanticDisplayDecoration[] {
  const definitions = new Map<string, SemanticDisplayDecoration>();
  for (const item of plan) {
    if (item.kind !== "note-definition" || item.noteKind == null || item.noteId == null) continue;
    definitions.set(`${item.noteKind}:${item.noteId.normalize("NFC").toLowerCase()}`, item);
  }
  const output: SemanticDisplayDecoration[] = [];
  const seen = new Set<string>();
  for (const item of plan) {
    if (item.kind !== "note-reference" || item.noteKind == null || item.noteId == null) continue;
    const key = `${item.noteKind}:${item.noteId.normalize("NFC").toLowerCase()}`;
    if (seen.has(key)) continue;
    const definition = definitions.get(key);
    if (definition == null) continue;
    seen.add(key);
    output.push(definition);
  }
  return output;
}

function enhanceNoteDefinitions(
  container: HTMLElement,
  plan: readonly SemanticDisplayDecoration[],
): boolean {
  const items = [...container.querySelectorAll<HTMLElement>("li.footnote-item, section.footnotes li")];
  if (items.length === 0) return false;
  const definitions = orderedNoteDefinitions(plan);
  if (items.length !== definitions.length) return false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const definition = definitions[index];
    if (item == null || definition?.noteKind == null) return false;
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const definition = definitions[index];
    if (item == null || definition?.noteKind == null || definition.noteNumber == null) continue;
    item.dataset.numberSuiteNoteValue = item.getAttribute("value") ?? "";
    item.dataset.numberSuiteNoteKind = definition.noteKind;
    item.dataset.numberSuiteNoteLabel = definition.label;
    item.setAttribute("value", String(definition.noteNumber));
  }
  return true;
}

function prependVirtualNumber(element: HTMLElement, label: string): void {
  element.prepend(createVirtualNumeralElement(element.ownerDocument, label));
}

function leadingTextNodes(element: HTMLElement): Text[] {
  const view = element.ownerDocument.defaultView;
  const showText = view?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = element.ownerDocument.createTreeWalker(element, showText);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current != null) {
    const parent = current.parentElement;
    if (
      parent == null
      || (!parent.classList.contains("number-suite-virtual")
        && !parent.classList.contains("number-suite-concealed"))
    ) {
      nodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function concealPrefix(element: HTMLElement, sourcePrefix: string): boolean {
  const nodes = leadingTextNodes(element);
  const fullText = nodes.map((node) => node.data).join("");
  const withoutMarkers = sourcePrefix.replace(new RegExp(WORD_JOINER, "gu"), "");
  const expected = fullText.startsWith(sourcePrefix)
    ? sourcePrefix
    : fullText.startsWith(withoutMarkers) ? withoutMarkers : null;
  if (expected == null || expected.length === 0) {
    return false;
  }
  let remaining = expected.length;
  for (const node of nodes) {
    if (remaining <= 0) {
      break;
    }
    if (node.data.length === 0) {
      continue;
    }
    const take = Math.min(remaining, node.data.length);
    if (take < node.data.length) {
      node.splitText(take);
    }
    const parent = node.parentElement;
    if (parent == null) {
      return false;
    }
    const span = parent.createSpan({ cls: "number-suite-concealed" });
    span.setAttribute("aria-hidden", "true");
    parent.insertBefore(span, node);
    span.appendChild(node);
    remaining -= take;
  }
  return remaining === 0;
}

export class HeadingReadingProcessor {
  private readonly cache = new Map<string, ReadingPlanCacheEntry>();
  private readonly containerRequests = new WeakMap<HTMLElement, number>();
  private generation = 0;
  private readonly interactiveContainers = new WeakSet<HTMLElement>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => NumberSuiteSettings,
  ) {}

  invalidate(): void {
    this.cache.clear();
    this.generation += 1;
  }

  async process(container: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    const request = (this.containerRequests.get(container) ?? 0) + 1;
    const generation = this.generation;
    this.containerRequests.set(container, request);
    cleanupNumberSuiteReadingDom(container);
    const settings = this.getSettings();
    if (!settings.enableReadingView) {
      return;
    }
    const effective = resolveNoteSettings(settings, parseNoteOverrides(context.frontmatter));
    const captionCentering = centeredCaptionKinds(settings);
    if (effective.disabled) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(normalizePath(context.sourcePath));
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      return;
    }
    const source = await this.app.vault.cachedRead(file);
    if (
      this.generation !== generation
      || this.containerRequests.get(container) !== request
      || !container.isConnected
    ) {
      return;
    }
    const fingerprint = JSON.stringify({ settings, effective });
    let cached = this.cache.get(file.path);
    if (cached == null || cached.fingerprint !== fingerprint || cached.source !== source) {
      cached = {
        source,
        fingerprint,
        ...this.buildPlan(source, settings, effective),
      };
      this.cache.set(file.path, cached);
    }
    const { headings, displayPlan, semanticPlan } = cached;
    const section = context.getSectionInfo(container);
    if (section == null || !container.isConnected) {
      return;
    }
    const sectionHeadings = headings.filter((heading) => (
      heading.line >= section.lineStart && heading.line <= section.lineEnd
    ));
    const rendered = renderedHeadingElements(container);
    const hasExtendedHeadings = sectionHeadings.some((heading) => heading.level >= 7);
    const hasSectionCaption = semanticPlan.some((item) => (
      item.kind === "caption"
      && item.line >= section.lineStart
      && item.line <= section.lineEnd
    ));
    if (
      !hasExtendedHeadings
      && !hasSectionCaption
      && !effective.showVirtualNumbers
      && !effective.concealStoredNumbers
      && !settings.showCaptionNumbers
      && captionCentering.length === 0
      && !settings.showCrossReferences
      && !settings.showNoteNumbers
      && !settings.showImageCaptionTooltips
    ) {
      return;
    }
    if (
      rendered.length > 0
      && (
      rendered.length !== sectionHeadings.length
      || rendered.some((item, index) => {
        const sourceHeading = sectionHeadings[index];
        return sourceHeading == null || item.level !== sourceHeading.level;
      })
      )
    ) {
      return;
    }
    const planByLine = new Map<number, DisplayDecorationPlan[]>();
    for (const item of displayPlan) {
      const items = planByLine.get(item.line) ?? [];
      items.push(item);
      planByLine.set(item.line, items);
    }
    for (let index = 0; index < rendered.length; index += 1) {
      const renderedHeading = rendered[index];
      const sourceHeading = sectionHeadings[index];
      if (renderedHeading == null || sourceHeading == null) {
        continue;
      }
      const element = renderedHeading.element;
      if (renderedHeading.extendedMarker != null) {
        if (!concealPrefix(element, renderedHeading.extendedMarker)) continue;
        element.classList.add(
          "number-suite-extended-heading",
          `number-suite-extended-heading-h${sourceHeading.level}`,
        );
        element.dataset.numberSuiteHeadingLevel = String(sourceHeading.level);
      }
      const items = planByLine.get(sourceHeading.line) ?? [];
      const conceal = items.find((item) => item.kind === "conceal");
      const virtual = items.find((item) => item.kind === "virtual");
      let concealed = false;
      if (conceal != null) {
        const prefix = conceal.sourceText ?? source.slice(conceal.from, conceal.to);
        if (concealPrefix(element, prefix)) {
          concealed = true;
        }
      }
      if (virtual != null && (conceal == null || concealed)) {
        prependVirtualNumber(element, virtual.label);
      }
      if (virtual != null && concealed) {
        element.setAttribute("data-number-suite-mode", "show-conceal");
      } else if (virtual != null) {
        element.setAttribute("data-number-suite-mode", "show");
      } else if (concealed) {
        element.setAttribute("data-number-suite-mode", "conceal");
      }
    }
    const sectionSemantic = semanticPlan.filter((item) => (
      item.line >= section.lineStart && item.line <= section.lineEnd
    ));
    const roots = captionRoots(container);
    let alignmentRootIndex = 0;
    for (const item of sectionSemantic) {
      if (item.kind !== "caption-alignment" || item.captionKind == null) continue;
      for (; alignmentRootIndex < roots.length; alignmentRootIndex += 1) {
        const root = roots[alignmentRootIndex];
        if (root != null && alignCaption(root, item.captionKind)) {
          alignmentRootIndex += 1;
          break;
        }
      }
    }
    let rootIndex = 0;
    for (const item of sectionSemantic) {
      if (item.kind !== "caption" || item.captionKind == null) continue;
      for (; rootIndex < roots.length; rootIndex += 1) {
        let root = roots[rootIndex];
        if (root != null && item.objectKind != null && captionSharesCarrierRoot(root, item.objectKind)) {
          const centered = root.classList.contains("number-suite-caption-centered");
          const splitCaption = item.sourcePlacement == null
            ? null
            : splitSharedCaptionRoot(
                root,
                item.objectKind,
                item.captionKind,
                item.sourcePlacement,
              );
          if (splitCaption == null) {
            root.classList.remove("number-suite-caption-centered");
            delete root.dataset.numberSuiteCaptionKind;
            if (item.sourcePlacement === "below") continue;
            rootIndex += 1;
            break;
          }
          root.classList.remove("number-suite-caption-centered");
          delete root.dataset.numberSuiteCaptionKind;
          if (centered) splitCaption.classList.add("number-suite-caption-centered");
          if (item.sourcePlacement === "below") {
            roots.splice(rootIndex + 1, 0, splitCaption);
            continue;
          }
          roots.splice(rootIndex, 1, splitCaption, root);
          root = splitCaption;
        }
        if (root != null && enhanceCaption(root, item.captionKind, item.label)) {
          if (item.displayPlacement != null) {
            root.dataset.numberSuiteCaptionPlacement = item.displayPlacement;
          }
          if (settings.showImageCaptionTooltips && (item.tooltipTitle != null || item.tooltipBody != null)) {
            applySemanticTooltip(root, item.tooltipTitle ?? "", item.tooltipBody ?? "");
          }
          if (item.sourcePlacement != null && item.displayPlacement != null && item.objectKind != null) {
            const object = renderedCaptionObject(
              root,
              item.objectKind,
              item.captionKind,
              item.sourcePlacement,
            );
            if (object != null) {
              placeRenderedCaption(root, object, item.displayPlacement);
              if (settings.showImageCaptionTooltips && object.hoverTarget != null) {
                applySemanticTooltip(
                  object.hoverTarget,
                  item.tooltipTitle ?? "",
                  item.tooltipBody ?? meaningfulImageReplacementText(
                    (object.hoverTarget as HTMLImageElement).alt ?? "",
                  ),
                );
              }
            }
          }
          rootIndex += 1;
          break;
        }
      }
    }
    for (const item of sectionSemantic) {
      if (
        item.kind === "reference"
        && item.target != null
        && item.targetLine != null
        && item.targetKind != null
      ) {
        enhanceReference(container, item.target, item.label, item.targetLine, item.targetKind);
      }
    }
    this.ensureReferenceNavigation(container, file);
    if (settings.showNoteNumbers) {
      const t = createTranslator(settings.language);
      enhanceNoteReferences(
        container,
        sectionSemantic.filter((item) => item.kind === "note-reference"),
        t,
      );
      enhanceNoteDefinitions(container, semanticPlan);
    }
    if (settings.showImageCaptionTooltips) annotateUnboundImages(container);
  }

  private ensureReferenceNavigation(container: HTMLElement, file: TFile): void {
    if (this.interactiveContainers.has(container)) return;
    this.interactiveContainers.add(container);
    container.addEventListener("click", (event) => {
      const target = event.target;
      if (target == null || !("nodeType" in target) || target.nodeType !== 1) return;
      const anchor = (target as Element).closest<HTMLElement>(
        "a.number-suite-reference-pill[data-number-suite-reference-line]",
      );
      if (anchor == null || !container.contains(anchor)) return;
      const line = Number(anchor.dataset.numberSuiteReferenceLine);
      if (!Number.isSafeInteger(line) || line < 0) return;
      event.preventDefault();
      void this.navigateToLine(file, line);
    });
  }

  private async navigateToLine(file: TFile, line: number): Promise<void> {
    let target: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (target == null && leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
        target = leaf;
      }
    });
    target ??= this.app.workspace.getLeaf("tab");
    if (!(target.view instanceof MarkdownView) || target.view.file?.path !== file.path) {
      await target.openFile(file, { active: true, eState: { line } });
    }
    target.setEphemeralState({ line });
    await this.app.workspace.revealLeaf(target);
    if (target.view instanceof MarkdownView && target.view.getMode() === "source") {
      const position = { line, ch: 0 };
      target.view.editor.setCursor(position);
      target.view.editor.scrollIntoView({ from: position, to: position }, true);
      target.view.editor.focus();
    }
  }

  private buildPlan(
    source: string,
    settings: NumberSuiteSettings,
    effective: ReturnType<typeof resolveNoteSettings>,
  ): CachedReadingPlan {
    const headings = parseAtxHeadings(source);
    const displayPlan = createDisplayPlan(headings, {
      showVirtualNumbers: effective.showVirtualNumbers,
      concealStoredNumbers: effective.concealStoredNumbers,
      numbering: toNumberingOptions(settings, {
        schemeId: effective.schemeId,
        starts: effective.starts,
      }),
      cleanupScope: effective.cleanupScope,
      templateSources: cleanupTemplateSources(settings),
      revealOnActiveLine: false,
      selections: [],
      composing: false,
    });
    const numbering = toNumberingOptions(settings, {
      schemeId: effective.schemeId,
      starts: effective.starts,
    });
    const templateSources = cleanupTemplateSources(settings);
    return {
      headings,
      displayPlan,
      semanticPlan: createSemanticDisplayPlan(source, headings, {
        showCaptionNumbers: settings.showCaptionNumbers,
        centeredCaptionKinds: centeredCaptionKinds(settings),
        captionPlacements: captionPlacements(settings),
        showImageCaptionTooltips: settings.showImageCaptionTooltips,
        showCrossReferences: settings.showCrossReferences,
        showNoteNumbers: settings.showNoteNumbers,
        noteSelections: [],
        numbering,
        templateSources,
        headingDisplayPlan: displayPlan,
        composing: false,
      }),
    };
  }
}
