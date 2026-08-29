import { syntaxTree } from "@codemirror/language";
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  editorInfoField,
  editorLivePreviewField,
  getFrontMatterInfo,
  parseYaml,
  type Editor,
} from "obsidian";

import { parseNoteOverrides, resolveNoteSettings, type NoteOverrides } from "../config/frontmatter";
import { createTranslator } from "../config/i18n";
import {
  centeredCaptionKinds,
  captionPlacements,
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";
import { meaningfulImageReplacementText } from "../core/caption-objects";
import type { CaptionKind } from "../core/document-semantics";
import type { NoteKind } from "../core/note-semantics";
import type { ParsedHeading } from "../core/types";
import { createDisplayPlan } from "../application/display-plan";
import {
  createSemanticDisplayPlan,
  imageTooltipContentAtOffset,
} from "../application/semantic-display-plan";
import {
  createVirtualNoteElement,
  createVirtualNumeralElement,
  createCaptionPillElement,
  createReferencePillElement,
  createVirtualSemanticElement,
} from "../ui/virtual-numeral";
import { applySemanticTooltip, clearSemanticTooltip } from "../ui/semantic-tooltip";

export const refreshHeadingDisplay = StateEffect.define<void>();

export type HeadingCompositionEvent = "start" | "end";
export type HeadingTouchEditingEvent = "prepare" | "finish";

export interface HeadingCompositionTransition {
  eventCompositionActive: boolean;
  requestRefresh: boolean;
}

export function transitionHeadingComposition(
  currentActive: boolean,
  event: HeadingCompositionEvent,
): HeadingCompositionTransition {
  if (event === "end") {
    return {
      eventCompositionActive: false,
      requestRefresh: currentActive,
    };
  }
  return {
    eventCompositionActive: true,
    requestRefresh: false,
  };
}

export function transitionHeadingTouchEditing(
  currentActive: boolean,
  event: HeadingTouchEditingEvent,
): HeadingCompositionTransition {
  const eventCompositionActive = event === "prepare";
  return {
    eventCompositionActive,
    requestRefresh: eventCompositionActive !== currentActive,
  };
}

export class NumeralWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly kind: "heading" | "caption" | "reference" | "note-reference" | "note-definition" = "heading",
    private readonly noteKind: NoteKind = "footnote",
    private readonly accessibleLabel = "",
    private readonly editHint = "",
    private readonly targetLine: number | null = null,
  ) {
    super();
  }

  override eq(other: NumeralWidget): boolean {
    return this.label === other.label
      && this.kind === other.kind
      && this.noteKind === other.noteKind
      && this.accessibleLabel === other.accessibleLabel
      && this.editHint === other.editHint
      && this.targetLine === other.targetLine;
  }

  override toDOM(view: EditorView): HTMLElement {
    if (this.kind === "heading") return createVirtualNumeralElement(view.dom.ownerDocument, this.label);
    if (this.kind === "reference") {
      const element = createReferencePillElement(view.dom.ownerDocument, this.label);
      const navigate = (): void => {
        if (this.targetLine == null || this.targetLine < 0 || this.targetLine >= view.state.doc.lines) return;
        const anchor = view.state.doc.line(this.targetLine + 1).from;
        view.dispatch({ selection: { anchor }, scrollIntoView: true });
        view.focus();
      };
      element.addEventListener("click", (event) => {
        event.preventDefault();
        navigate();
      });
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        navigate();
      });
      return element;
    }
    if (this.kind === "caption") {
      return createVirtualSemanticElement(view.dom.ownerDocument, this.label, this.kind);
    }
    return createVirtualNoteElement(
      view.dom.ownerDocument,
      this.label,
      this.noteKind,
      this.kind === "note-reference" ? "reference" : "definition",
      this.accessibleLabel,
      this.editHint,
    );
  }

  override ignoreEvent(): boolean {
    return this.kind !== "reference"
      && this.kind !== "note-reference"
      && this.kind !== "note-definition";
  }
}

class CaptionWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly editOffset: number,
    private readonly centered: boolean,
    private readonly tooltipTitle: string,
    private readonly tooltipBody: string,
    private readonly placement: "above" | "below",
    private readonly objectKind: CaptionKind | null,
    private readonly objectOffset: number | null,
  ) {
    super();
  }

  override eq(other: CaptionWidget): boolean {
    return this.label === other.label
      && this.editOffset === other.editOffset
      && this.centered === other.centered
      && this.tooltipTitle === other.tooltipTitle
      && this.tooltipBody === other.tooltipBody
      && this.placement === other.placement
      && this.objectKind === other.objectKind
      && this.objectOffset === other.objectOffset;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = view.dom.ownerDocument.createElement("span");
    wrapper.className = "number-suite-caption-widget";
    wrapper.dataset.numberSuiteCaptionPlacement = this.placement;
    if (this.objectKind != null) wrapper.dataset.numberSuiteCaptionObjectKind = this.objectKind;
    if (this.objectOffset != null) {
      wrapper.dataset.numberSuiteObjectSourceOffset = String(this.objectOffset);
    }
    if (this.centered) wrapper.classList.add("number-suite-caption-centered");
    wrapper.dataset.numberSuiteSourceOffset = String(this.editOffset);
    const pill = createCaptionPillElement(view.dom.ownerDocument, this.label);
    pill.dataset.numberSuiteSourceOffset = String(this.editOffset);
    if (this.tooltipTitle.length > 0 || this.tooltipBody.length > 0) {
      pill.dataset.numberSuiteTooltip = "true";
      pill.dataset.numberSuiteTooltipTitle = this.tooltipTitle;
      pill.dataset.numberSuiteTooltipBody = this.tooltipBody;
    }
    const edit = (): void => {
      if (this.editOffset < 0 || this.editOffset > view.state.doc.length) return;
      view.dispatch({ selection: { anchor: this.editOffset }, scrollIntoView: true });
      view.focus();
    };
    pill.addEventListener("click", (event) => {
      event.preventDefault();
      edit();
    });
    wrapper.append(pill);
    scheduleCaptionTrackMeasurement(view, wrapper, this.objectOffset);
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function captionCarrierSelector(kind: CaptionKind): string {
  if (kind === "Figure") {
    return "img:not(.cm-widgetBuffer), .image-embed, .internal-embed.image-embed";
  }
  if (kind === "Table") {
    return "table, .structural-tables-live-preview, .structural-tables-container";
  }
  if (kind === "Equation") return ".math-block, mjx-container[display='true']";
  return "pre, .HyperMD-codeblock";
}

function visibleCodeCarrier(
  target: HTMLElement,
  placement: "above" | "below",
): HTMLElement {
  const pre = target.matches("pre") ? target : target.querySelector<HTMLElement>("pre");
  if (pre != null) return pre;
  let edge = target.matches(".HyperMD-codeblock")
    ? target
    : target.querySelector<HTMLElement>(".HyperMD-codeblock") ?? target;
  let sibling = placement === "below" ? edge.nextElementSibling : edge.previousElementSibling;
  while (sibling?.matches(".HyperMD-codeblock") === true) {
    edge = sibling as HTMLElement;
    sibling = placement === "below" ? edge.nextElementSibling : edge.previousElementSibling;
  }
  return edge;
}

function visibleCaptionCarrier(
  kind: CaptionKind,
  target: HTMLElement,
  placement: "above" | "below",
): HTMLElement {
  if (kind === "Code") return visibleCodeCarrier(target, placement);
  const selector = kind === "Figure"
    ? "img:not(.cm-widgetBuffer)"
    : kind === "Table"
      ? "table"
      : "mjx-container[display='true']";
  return target.matches(selector)
    ? target
    : target.querySelector<HTMLElement>(selector) ?? target;
}

function usableCaptionCarrier(target: HTMLElement): boolean {
  const rect = target.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function firstUsableCaptionCarrier(
  kind: CaptionKind,
  root: HTMLElement,
  selector: string,
  placement: "above" | "below",
): HTMLElement | null {
  const candidates = root.matches(selector)
    ? [root, ...root.querySelectorAll<HTMLElement>(selector)]
    : [...root.querySelectorAll<HTMLElement>(selector)];
  const seen = new Set<HTMLElement>();
  for (const candidate of candidates) {
    const normalized = visibleCaptionCarrier(kind, candidate, placement);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (usableCaptionCarrier(normalized)) return normalized;
  }
  return null;
}

function targetNearSourcePosition(
  view: EditorView,
  sourceOffset: number,
  kind: CaptionKind,
  selector: string,
  placement: "above" | "below",
): HTMLElement | null {
  try {
    const point = view.domAtPos(sourceOffset);
    let node: Node | null = point.node;
    if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0) {
      node = node.childNodes[Math.min(point.offset, node.childNodes.length - 1)] ?? node;
    }
    const element = node.nodeType === Node.ELEMENT_NODE
      ? node as HTMLElement
      : node.parentElement;
    const sourceRoot = element?.closest<HTMLElement>(".cm-line, .cm-block-widget") ?? element;
    const direct = sourceRoot == null
      ? null
      : firstUsableCaptionCarrier(kind, sourceRoot, selector, placement);
    if (direct != null) return direct;
  } catch {
    // A replacement decoration may not expose a stable DOM position; use coordinates below.
  }

  let sourceY: number | null = null;
  try {
    sourceY = view.coordsAtPos(sourceOffset)?.top ?? null;
  } catch {
    sourceY = null;
  }
  if (sourceY == null) return null;
  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of view.contentDOM.querySelectorAll<HTMLElement>(selector)) {
    if (candidate.closest(".number-suite-caption-widget") != null) continue;
    const normalized = visibleCaptionCarrier(kind, candidate, placement);
    if (!usableCaptionCarrier(normalized)) continue;
    const rect = normalized.getBoundingClientRect();
    const distance = sourceY < rect.top
      ? rect.top - sourceY
      : sourceY > rect.bottom ? sourceY - rect.bottom : 0;
    if (distance < nearestDistance) {
      nearest = normalized;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function nearbyCaptionCarrier(
  view: EditorView,
  wrapper: HTMLElement,
  kind: CaptionKind,
  sourceOffset: number,
): HTMLElement | null {
  const selector = captionCarrierSelector(kind);
  const placement = wrapper.dataset.numberSuiteCaptionPlacement === "below" ? "below" : "above";
  const positioned = targetNearSourcePosition(view, sourceOffset, kind, selector, placement);
  if (positioned != null) return positioned;
  const block = wrapper.closest<HTMLElement>(".cm-block-widget") ?? wrapper;
  let sibling = placement === "below" ? block.previousElementSibling : block.nextElementSibling;
  for (let distance = 0; sibling != null && distance < 8; distance += 1) {
    if (sibling.querySelector(".number-suite-caption-widget") == null) {
      const target = firstUsableCaptionCarrier(kind, sibling as HTMLElement, selector, placement);
      if (target != null) return target;
    }
    sibling = placement === "below" ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return null;
}

export function scheduleCaptionTrackMeasurement(
  view: EditorView,
  wrapper: HTMLElement,
  sourceOffset: number | null,
): void {
  const objectKind = wrapper.dataset.numberSuiteCaptionObjectKind as CaptionKind | undefined;
  if (objectKind == null || sourceOffset == null) return;
  view.requestMeasure({
    key: wrapper,
    read: () => {
      const carrier = nearbyCaptionCarrier(view, wrapper, objectKind, sourceOffset);
      if (carrier == null || !wrapper.isConnected) return null;
      const contentRect = view.contentDOM.getBoundingClientRect();
      const carrierRect = carrier.getBoundingClientRect();
      const pill = wrapper.querySelector<HTMLElement>(".number-suite-caption-pill");
      if (pill == null) return null;
      const pillRect = pill.getBoundingClientRect();
      const track = captionTrackGeometry(contentRect, carrierRect);
      if (track == null) return null;
      const previousShift = Number(wrapper.dataset.numberSuiteCaptionBlockShift ?? "0");
      const shift = captionAttachmentShiftFromRects(
        wrapper.dataset.numberSuiteCaptionPlacement === "below" ? "below" : "above",
        pillRect,
        carrierRect,
        previousShift,
      );
      return { ...track, shift };
    },
    write: (measurement) => {
      if (measurement == null || !wrapper.isConnected) return;
      wrapper.style.inlineSize = `${measurement.width}px`;
      wrapper.style.marginInlineStart = `${measurement.offset}px`;
      wrapper.style.transform = `translateY(${measurement.shift}px)`;
      wrapper.dataset.numberSuiteCaptionBlockShift = String(measurement.shift);
      view.requestMeasure();
    },
  });
}

export function captionTrackGeometry(
  content: Readonly<Pick<DOMRect, "left" | "width">>,
  carrier: Readonly<Pick<DOMRect, "left" | "width">>,
): Readonly<{ offset: number; width: number }> | null {
  if (content.width <= 0 || carrier.width <= 0) return null;
  const offset = Math.max(0, carrier.left - content.left);
  const width = Math.min(carrier.width, Math.max(0, content.width - offset));
  return width <= 0 ? null : { offset, width };
}

export function captionAttachmentShift(
  placement: "above" | "below",
  unshiftedGap: number,
  desiredGap = 4,
): number {
  const excess = Math.max(0, unshiftedGap - desiredGap);
  return placement === "below" ? -excess : excess;
}

export function captionAttachmentShiftFromRects(
  placement: "above" | "below",
  pill: Readonly<Pick<DOMRect, "top" | "bottom">>,
  carrier: Readonly<Pick<DOMRect, "top" | "bottom">>,
  previousShift: number,
  desiredGap = 4,
): number {
  const shiftedGap = placement === "below"
    ? pill.top - carrier.bottom
    : carrier.top - pill.bottom;
  const unshiftedGap = placement === "below"
    ? shiftedGap - previousShift
    : shiftedGap + previousShift;
  return captionAttachmentShift(placement, unshiftedGap, desiredGap);
}

function scheduleCaptionTrackMeasurements(view: EditorView): void {
  for (const wrapper of view.dom.querySelectorAll<HTMLElement>(
    ".number-suite-caption-widget[data-number-suite-caption-object-kind]",
  )) {
    const sourceOffset = Number(wrapper.dataset.numberSuiteObjectSourceOffset);
    scheduleCaptionTrackMeasurement(view, wrapper, Number.isFinite(sourceOffset) ? sourceOffset : null);
  }
}

export function shouldShowNoteWidgets(
  settings: NumberSuiteSettings,
  livePreview: boolean,
): boolean {
  return settings.showNoteNumbers && livePreview && settings.noteDisplayMode === "formatted";
}

export function isHeadingCompositionActive(
  viewComposing: boolean,
  eventCompositionActive: boolean,
): boolean {
  return viewComposing || eventCompositionActive;
}

function syntaxConfirmsHeading(state: EditorState, heading: ParsedHeading): boolean {
  // CommonMark and Obsidian stop at H6. H7-H9 are Number Suite source
  // extensions already authenticated by the fence/comment-aware scanner.
  if (heading.level >= 7) return true;
  let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(
    heading.markerFrom,
    1,
  );
  for (let depth = 0; node != null && depth < 8; depth += 1) {
    if (syntaxNodeConfirmsHeading(node.name, heading.level)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

export function syntaxNodeConfirmsHeading(nodeName: string, level: number): boolean {
  if (nodeName === "ATXHeading" || nodeName === "HeaderMark" || nodeName === "HyperMD-header") {
    return true;
  }
  if (nodeName === `ATXHeading${level}` || nodeName === `HyperMD-header_H${level}`) {
    return true;
  }
  // Obsidian mobile 1.12 uses duplicated CSS-style node names such as
  // `HyperMD-header_HyperMD-header-2`, while newer desktop builds use `_H2`.
  return nodeName === `HyperMD-header_HyperMD-header-${level}`;
}

export function selectionTouchesHeadingLine(
  heading: ParsedHeading,
  selections: readonly Readonly<{ from: number; to: number }>[],
): boolean {
  return selections.some((selection) => (
    selection.from <= heading.lineTo && selection.to >= heading.lineFrom
  ));
}

export function captionBlockWidgetAnchor(
  state: EditorState,
  placement: "above" | "below",
  objectFrom: number,
  objectTo: number,
): Readonly<{ position: number; side: number }> {
  const above = placement === "above";
  const objectLine = state.doc.lineAt(above ? objectFrom : objectTo);
  return {
    position: above ? objectLine.from : objectLine.to,
    side: above ? -10_000 : 10_000,
  };
}

function parseOverrides(source: string): NoteOverrides | null {
  try {
    const info = getFrontMatterInfo(source);
    if (!info.exists) {
      return parseNoteOverrides(null);
    }
    return parseNoteOverrides(parseYaml(info.frontmatter));
  } catch {
    return null;
  }
}

function buildAnchoredCaptionDecorations(
  state: EditorState,
  settingsProvider: () => NumberSuiteSettings,
): DecorationSet {
  const settings = settingsProvider();
  const livePreview = state.field(editorLivePreviewField, false) ?? false;
  if (!livePreview || !settings.enableLivePreview) return Decoration.none;
  const source = state.doc.toString();
  const overrides = parseOverrides(source) ?? parseNoteOverrides(null);
  const effective = resolveNoteSettings(settings, overrides);
  if (effective.disabled) return Decoration.none;
  const selections = state.selection.ranges.map((range) => ({ from: range.from, to: range.to }));
  const semanticPlan = createSemanticDisplayPlan(source, [], {
    showCaptionNumbers: settings.showCaptionNumbers,
    centeredCaptionKinds: centeredCaptionKinds(settings),
    captionPlacements: captionPlacements(settings),
    showImageCaptionTooltips: settings.showImageCaptionTooltips,
    showCrossReferences: false,
    showNoteNumbers: false,
    noteSelections: selections,
    numbering: toNumberingOptions(settings, {
      schemeId: effective.schemeId,
      starts: effective.starts,
    }),
    templateSources: cleanupTemplateSources(settings),
    headingDisplayPlan: [],
    composing: false,
  });
  const ranges: Range<Decoration>[] = [];
  for (const item of semanticPlan) {
    if (
      item.kind !== "caption"
      || item.pillFrom == null
      || item.pillTo == null
      || item.displayLabel == null
      || item.sourcePlacement == null
      || item.displayPlacement == null
      || item.objectFrom == null
      || item.objectTo == null
    ) {
      continue;
    }
    const widget = new CaptionWidget(
      item.displayLabel,
      item.pillFrom,
      item.captionCentered === true,
      item.tooltipTitle ?? "",
      item.tooltipBody ?? "",
      item.displayPlacement,
      item.objectKind ?? null,
      item.objectFrom,
    );
    const anchor = captionBlockWidgetAnchor(
      state,
      item.displayPlacement,
      item.objectFrom,
      item.objectTo,
    );
    ranges.push(Decoration.line({
      attributes: { class: "number-suite-caption-source-relocated" },
    }).range(item.pillFrom));
    ranges.push(Decoration.replace({ inclusive: false }).range(item.pillFrom, item.pillTo));
    ranges.push(Decoration.widget({
      widget,
      side: anchor.side,
      block: true,
    }).range(anchor.position));
  }
  return Decoration.set(ranges, true);
}

export class HeadingDisplayController {
  private readonly views = new Set<EditorView>();
  private readonly contextMenuOffsets = new WeakMap<Editor, Readonly<{
    offset: number | null;
    source: string;
    filePath: string | null;
    token: object;
  }>>();

  constructor(private readonly getSettings: () => NumberSuiteSettings) {}

  createExtension(): Extension {
    const views = this.views;
    const settingsProvider = this.getSettings;
    const recordContextMenuOffset = (
      editor: Editor,
      offset: number | null,
      filePath: string | null,
      timerWindow: Window | null,
    ): void => this.recordContextMenuOffset(editor, offset, filePath, timerWindow);
    const anchoredCaptionField = StateField.define<DecorationSet>({
      create: (state) => buildAnchoredCaptionDecorations(state, settingsProvider),
      update: (value, transaction) => {
        const refreshed = transaction.effects.some((effect) => effect.is(refreshHeadingDisplay));
        const modeChanged = transaction.startState.field(editorLivePreviewField, false)
          !== transaction.state.field(editorLivePreviewField, false);
        if (
          !transaction.docChanged
          && transaction.selection == null
          && !refreshed
          && !modeChanged
        ) {
          return value;
        }
        return buildAnchoredCaptionDecorations(transaction.state, settingsProvider);
      },
      provide: (field) => EditorView.decorations.from(field),
    });
    const displayPlugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      private overrides: NoteOverrides;
      private eventCompositionActive = false;
      private touchEditingActive = false;
      private imageTooltipGeneration = 0;

      constructor(private readonly view: EditorView) {
        this.overrides = parseOverrides(view.state.doc.toString()) ?? parseNoteOverrides(null);
        views.add(view);
        this.decorations = this.buildDecorations();
        this.scheduleImageTooltips();
      }

      handleCompositionEvent(event: HeadingCompositionEvent): boolean {
        const transition = transitionHeadingComposition(this.eventCompositionActive, event);
        this.eventCompositionActive = transition.eventCompositionActive;
        return transition.requestRefresh;
      }

      handleTouchEditingEvent(event: HeadingTouchEditingEvent): boolean {
        const transition = transitionHeadingTouchEditing(this.touchEditingActive, event);
        this.touchEditingActive = transition.eventCompositionActive;
        return transition.requestRefresh;
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          const nextOverrides = parseOverrides(update.state.doc.toString());
          if (nextOverrides != null) {
            this.overrides = nextOverrides;
          }
        }
        const livePreviewChanged = update.startState.field(editorLivePreviewField, false)
          !== update.state.field(editorLivePreviewField, false);
        const previousFile = update.startState.field(editorInfoField, false)?.file ?? null;
        const currentFile = update.state.field(editorInfoField, false)?.file ?? null;
        const explicitlyRefreshed = update.transactions.some((transaction) => (
          transaction.effects.some((effect) => effect.is(refreshHeadingDisplay))
        ));
        if (
          update.docChanged
          || update.selectionSet
          || livePreviewChanged
          || previousFile !== currentFile
          || explicitlyRefreshed
        ) {
          this.decorations = this.buildDecorations();
        }
        if (update.docChanged || update.viewportChanged || update.geometryChanged || update.selectionSet) {
          this.scheduleImageTooltips();
        }
      }

      destroy(): void {
        this.imageTooltipGeneration += 1;
        for (const image of this.view.dom.querySelectorAll<HTMLElement>("img[data-number-suite-tooltip]")) {
          clearSemanticTooltip(image);
        }
        views.delete(this.view);
      }

      private scheduleImageTooltips(): void {
        const generation = ++this.imageTooltipGeneration;
        const timerWindow = this.view.dom.ownerDocument.defaultView;
        timerWindow?.setTimeout(() => {
          if (generation !== this.imageTooltipGeneration || !this.view.dom.isConnected) return;
          this.annotateImageTooltips();
        }, 0);
      }

      docViewUpdate(): void {
        scheduleCaptionTrackMeasurements(this.view);
      }

      private annotateImageTooltips(): void {
        const settings = settingsProvider();
        const source = this.view.state.doc.toString();
        for (const image of this.view.dom.querySelectorAll<HTMLImageElement>("img")) {
          clearSemanticTooltip(image);
          if (!settings.showImageCaptionTooltips) continue;
          let offset: number | null = null;
          try {
            const rect = image.getBoundingClientRect();
            offset = this.view.posAtCoords({
              x: rect.left + Math.min(rect.width / 2, 2),
              y: rect.top + Math.min(rect.height / 2, 2),
            });
            offset ??= this.view.posAtDOM(image);
          } catch {
            offset = null;
          }
          const tooltip = offset == null
            ? null
            : imageTooltipContentAtOffset(source, offset, settings.showCaptionNumbers);
          const fallback = meaningfulImageReplacementText(image.alt);
          if (tooltip != null) {
            applySemanticTooltip(image, tooltip.title, tooltip.body);
          } else if (fallback.length > 0 && !/^\d+(?:x\d+)?$/u.test(fallback)) {
            applySemanticTooltip(image, "", fallback);
          }
        }
      }

      private buildDecorations(): DecorationSet {
        const settings = settingsProvider();
        const livePreview = this.view.state.field(editorLivePreviewField, false) ?? false;
        if ((livePreview && !settings.enableLivePreview) || (!livePreview && !settings.enableSourceMode)) {
          return Decoration.none;
        }
        const effective = resolveNoteSettings(settings, this.overrides);
        if (effective.disabled) {
          return Decoration.none;
        }
        const source = this.view.state.doc.toString();
        const headings = parseAtxHeadings(source).filter((heading) => (
          syntaxConfirmsHeading(this.view.state, heading)
        ));
        const selections = this.view.state.selection.ranges.map((range) => ({
          from: range.from,
          to: range.to,
        }));
        const templateSources = cleanupTemplateSources(settings);
        const composing = isHeadingCompositionActive(
          this.view.composing,
          this.eventCompositionActive || this.touchEditingActive,
        );
        const numbering = toNumberingOptions(settings, {
          schemeId: effective.schemeId,
          starts: effective.starts,
        });
        const plan = createDisplayPlan(headings, {
          showVirtualNumbers: effective.showVirtualNumbers,
          concealStoredNumbers: effective.concealStoredNumbers,
          numbering,
          cleanupScope: effective.cleanupScope,
          templateSources,
          revealOnActiveLine: settings.revealOnActiveLine,
          selections,
          composing,
        });
        const semanticPlan = createSemanticDisplayPlan(source, headings, {
          showCaptionNumbers: settings.showCaptionNumbers,
          centeredCaptionKinds: centeredCaptionKinds(settings),
          captionPlacements: captionPlacements(settings),
          showImageCaptionTooltips: settings.showImageCaptionTooltips,
          showCrossReferences: settings.showCrossReferences,
          showNoteNumbers: shouldShowNoteWidgets(settings, livePreview),
          noteSelections: selections,
          numbering,
          templateSources,
          headingDisplayPlan: plan,
          composing,
        });
        const ranges: Range<Decoration>[] = [];
        const t = createTranslator(settings.language);
        const decorations = [
          ...plan.map((item) => ({ ...item, semanticKind: null })),
          ...semanticPlan.map((item) => ({ ...item, semanticKind: item.kind })),
        ].sort((left, right) => left.from - right.from || left.to - right.to);
        for (const item of decorations) {
          if (item.semanticKind === "caption") {
            if (item.pillFrom == null || item.pillTo == null || item.displayLabel == null) continue;
            const widget = new CaptionWidget(
              item.displayLabel,
              item.pillFrom,
              item.captionCentered === true,
              item.tooltipTitle ?? "",
              item.tooltipBody ?? "",
              item.displayPlacement ?? item.sourcePlacement ?? "above",
              item.objectKind ?? null,
              item.objectFrom ?? null,
            );
            const anchored = item.sourcePlacement != null
              && item.displayPlacement != null
              && item.objectFrom != null
              && item.objectTo != null;
            if (anchored) {
              continue;
            }
            if (!livePreview) {
              continue;
            } else {
              ranges.push(Decoration.line({
                attributes: { class: "number-suite-caption-line" },
              }).range(item.pillFrom));
              ranges.push(Decoration.replace({
                widget,
                inclusive: false,
              }).range(item.pillFrom, item.pillTo));
            }
          } else if (item.semanticKind === "reference") {
            ranges.push(Decoration.replace({
              widget: new NumeralWidget(
                item.label,
                "reference",
                "footnote",
                "",
                "",
                item.targetLine ?? null,
              ),
              inclusive: false,
            }).range(item.from, item.to));
          } else if (
            item.semanticKind === "caption-alignment"
            && item.captionKind != null
            && livePreview
          ) {
            ranges.push(Decoration.line({
              attributes: {
                class: "number-suite-caption-centered",
                "data-number-suite-caption-kind": item.captionKind,
              },
            }).range(item.from));
          } else if (item.semanticKind === "note-reference" || item.semanticKind === "note-definition") {
            const accessibleLabel = item.noteKind === "endnote"
              ? t("display.note.endnote", { number: item.label })
              : t("display.note.footnote", { number: item.label });
            ranges.push(Decoration.replace({
              widget: new NumeralWidget(
                item.label,
                item.semanticKind,
                item.noteKind,
                accessibleLabel,
                t("display.note.editHint"),
              ),
              inclusive: false,
            }).range(item.from, item.to));
          } else if (item.kind === "virtual") {
            ranges.push(Decoration.widget({
              widget: new NumeralWidget(item.label),
              side: -1,
            }).range(item.from));
          } else {
            ranges.push(Decoration.replace({ inclusive: false }).range(item.from, item.to));
          }
        }
        if (livePreview) {
          for (const heading of headings) {
            if (heading.level < 7) continue;
            ranges.push(Decoration.line({
              attributes: {
                class: `number-suite-extended-heading number-suite-extended-heading-h${heading.level}`,
                "data-number-suite-heading-level": String(heading.level),
              },
            }).range(heading.lineFrom));
            if (!composing && !selectionTouchesHeadingLine(heading, selections)) {
              ranges.push(Decoration.replace({ inclusive: false }).range(
                heading.markerFrom,
                heading.contentFrom,
              ));
            }
          }
        }
        return Decoration.set(ranges, true);
      }
    }, {
      decorations: (instance) => instance.decorations,
    });

    const compositionHandlers = EditorView.domEventHandlers({
      contextmenu: (event, view) => {
        const info = view.state.field(editorInfoField, false);
        const editor = info?.editor;
        if (editor == null) return false;
        const target = event.target;
        const targetElement = target != null && "nodeType" in target && target.nodeType === 1
          ? target as Element
          : null;
        const sourceOffset = targetElement != null
          ? Number(targetElement.closest<HTMLElement>("[data-number-suite-source-offset]")
            ?.dataset.numberSuiteSourceOffset)
          : Number.NaN;
        const offset = Number.isSafeInteger(sourceOffset)
          ? sourceOffset
          : view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (offset != null) {
          recordContextMenuOffset(
            editor,
            offset,
            info?.file?.path ?? null,
            view.dom.ownerDocument.defaultView,
          );
        }
        return false;
      },
      pointerdown: (_event, view) => {
        const timerWindow = view.dom.ownerDocument.defaultView;
        if (!timerWindow?.matchMedia?.("(pointer: coarse)").matches) return false;
        timerWindow.setTimeout(() => {
          const instance = view.plugin(displayPlugin);
          if (
            view.dom.isConnected
            && !view.composing
            && (instance?.handleTouchEditingEvent("prepare") ?? false)
          ) {
            // Let CodeMirror place the cursor first, then remove virtual widgets
            // before Android opens an IME composition session.
            view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
          }
        }, 0);
        return false;
      },
      compositionstart: (_event, view) => {
        // Do not dispatch from inside `compositionstart`: an extra CodeMirror
        // transaction here cancels the Android candidate window. The IME's own
        // first document update observes this event flag and removes decorations.
        view.plugin(displayPlugin)?.handleCompositionEvent("start");
        return false;
      },
      compositionend: (_event, view) => {
        const requestRefresh = view.plugin(displayPlugin)?.handleCompositionEvent("end") ?? false;
        const timerWindow = view.dom.ownerDocument.defaultView;
        if (requestRefresh) timerWindow?.setTimeout(() => {
          if (view.dom.isConnected) {
            // Restore virtual display once, after CodeMirror and the IME finish
            // their composition-end bookkeeping.
            view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
          }
        }, 0);
        return false;
      },
      blur: (_event, view) => {
        const requestRefresh = view.plugin(displayPlugin)?.handleTouchEditingEvent("finish") ?? false;
        const timerWindow = view.dom.ownerDocument.defaultView;
        if (requestRefresh) timerWindow?.setTimeout(() => {
          if (view.dom.isConnected && !view.composing) {
            view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
          }
        }, 0);
        return false;
      },
    });

    return [anchoredCaptionField, displayPlugin, compositionHandlers];
  }

  refreshAll(): void {
    for (const view of this.views) {
      view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
    }
  }

  recordContextMenuOffset(
    editor: Editor,
    offset: number | null,
    filePath: string | null,
    timerWindow: Window | null,
  ): void {
    if (offset != null && (
      !Number.isSafeInteger(offset) || offset < 0 || offset > editor.getValue().length
    )) {
      return;
    }
    const token = {};
    this.contextMenuOffsets.set(editor, {
      offset,
      source: editor.getValue(),
      filePath,
      token,
    });
    timerWindow?.setTimeout(() => {
      if (this.contextMenuOffsets.get(editor)?.token === token) {
        this.contextMenuOffsets.delete(editor);
      }
    }, 0);
  }

  consumeContextMenuOffset(editor: Editor, filePath: string | null): number | null | undefined {
    const context = this.contextMenuOffsets.get(editor) ?? null;
    if (context == null) return undefined;
    this.contextMenuOffsets.delete(editor);
    return context.source === editor.getValue()
      && context.filePath === filePath
      ? context.offset
      : null;
  }
}
