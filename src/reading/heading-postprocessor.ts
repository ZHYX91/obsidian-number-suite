import { App, normalizePath, TFile, type MarkdownPostProcessorContext } from "obsidian";

import { parseNoteOverrides, resolveNoteSettings } from "../config/frontmatter";
import { createTranslator, type Translate } from "../config/i18n";
import {
  centeredCaptionKinds,
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

interface CachedReadingPlan {
  readonly headings: readonly ParsedHeading[];
  readonly displayPlan: readonly DisplayDecorationPlan[];
  readonly semanticPlan: readonly SemanticDisplayDecoration[];
}

interface ReadingPlanCacheEntry extends CachedReadingPlan {
  readonly source: string;
  readonly fingerprint: string;
}

function headingElements(container: HTMLElement): HTMLHeadingElement[] {
  const output: HTMLHeadingElement[] = [];
  if (/^H[1-6]$/u.test(container.tagName)) {
    output.push(container as HTMLHeadingElement);
  }
  output.push(...container.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
  return output;
}

function cleanupHeading(element: HTMLHeadingElement): void {
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
    delete anchor.dataset.numberSuiteReference;
  }
  for (const caption of container.querySelectorAll<HTMLElement>(
    "[data-number-suite-caption-kind]",
  )) {
    caption.classList.remove("number-suite-caption-centered");
    delete caption.dataset.numberSuiteCaptionKind;
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
  for (const heading of headingElements(container)) cleanupHeading(heading);
}

function captionRoots(container: HTMLElement): HTMLElement[] {
  const roots: HTMLElement[] = [];
  if (container.matches("p")) roots.push(container);
  roots.push(...container.querySelectorAll<HTMLElement>("p"));
  return roots;
}

function insertCaptionNumber(element: HTMLElement, kind: string, label: string): boolean {
  const view = element.ownerDocument.defaultView;
  const walker = element.ownerDocument.createTreeWalker(element, view?.NodeFilter.SHOW_TEXT ?? 4);
  let leading = "";
  let node = walker.nextNode() as Text | null;
  while (node != null && leading.length <= kind.length + 4) {
    const combined = leading + node.data;
    const trimmed = combined.trimStart();
    if (trimmed.startsWith(`${kind}:`)) {
      const absoluteColon = combined.indexOf(`${kind}:`) + kind.length;
      const localOffset = absoluteColon - leading.length;
      if (localOffset >= 0 && localOffset <= node.data.length) {
        const span = createVirtualSemanticElement(element.ownerDocument, label, "caption");
        const suffix = node.splitText(localOffset);
        suffix.parentNode?.insertBefore(span, suffix);
        element.dataset.numberSuiteCaptionKind = kind;
        return true;
      }
    }
    leading = combined;
    node = walker.nextNode() as Text | null;
  }
  return false;
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

function enhanceReference(container: HTMLElement, target: string, label: string): boolean {
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
    const span = createVirtualSemanticElement(container.ownerDocument, label, "reference");
    span.dataset.numberSuiteOriginal = "@";
    text.parentNode?.insertBefore(span, anchor);
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

function prependVirtualNumber(element: HTMLHeadingElement, label: string): void {
  element.prepend(createVirtualNumeralElement(element.ownerDocument, label));
}

function leadingTextNodes(element: HTMLHeadingElement): Text[] {
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

function concealPrefix(element: HTMLHeadingElement, sourcePrefix: string): boolean {
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
    const rendered = headingElements(container);

    const settings = this.getSettings();
    if (!settings.enableReadingView) {
      return;
    }
    const effective = resolveNoteSettings(settings, parseNoteOverrides(context.frontmatter));
    const captionCentering = centeredCaptionKinds(settings);
    if (
      effective.disabled
      || (!effective.showVirtualNumbers
        && !effective.concealStoredNumbers
        && !settings.showCaptionNumbers
        && captionCentering.length === 0
        && !settings.showCrossReferences
        && !settings.showNoteNumbers)
    ) {
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
    if (
      rendered.length > 0
      && (
      rendered.length !== sectionHeadings.length
      || rendered.some((element, index) => {
        const sourceHeading = sectionHeadings[index];
        return sourceHeading == null || Number(element.tagName.slice(1)) !== sourceHeading.level;
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
      const element = rendered[index];
      const sourceHeading = sectionHeadings[index];
      if (element == null || sourceHeading == null) {
        continue;
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
        const root = roots[rootIndex];
        if (root != null && insertCaptionNumber(root, item.captionKind, item.label)) {
          rootIndex += 1;
          break;
        }
      }
    }
    for (const item of sectionSemantic) {
      if (item.kind === "reference" && item.target != null) {
        enhanceReference(container, item.target, item.label);
      }
    }
    if (settings.showNoteNumbers) {
      const t = createTranslator(settings.language);
      enhanceNoteReferences(
        container,
        sectionSemantic.filter((item) => item.kind === "note-reference"),
        t,
      );
      enhanceNoteDefinitions(container, semanticPlan);
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
