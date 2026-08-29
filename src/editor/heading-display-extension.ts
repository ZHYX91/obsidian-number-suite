import { syntaxTree } from "@codemirror/language";
import { StateEffect, type EditorState, type Extension, type Range } from "@codemirror/state";
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
} from "obsidian";

import { parseNoteOverrides, resolveNoteSettings, type NoteOverrides } from "../config/frontmatter";
import { createTranslator } from "../config/i18n";
import {
  centeredCaptionKinds,
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";
import type { NoteKind } from "../core/note-semantics";
import type { ParsedHeading } from "../core/types";
import { createDisplayPlan } from "../application/display-plan";
import { createSemanticDisplayPlan } from "../application/semantic-display-plan";
import {
  createVirtualNoteElement,
  createVirtualNumeralElement,
  createVirtualSemanticElement,
} from "../ui/virtual-numeral";

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
  ) {
    super();
  }

  override eq(other: NumeralWidget): boolean {
    return this.label === other.label
      && this.kind === other.kind
      && this.noteKind === other.noteKind
      && this.accessibleLabel === other.accessibleLabel
      && this.editHint === other.editHint;
  }

  override toDOM(view: EditorView): HTMLElement {
    if (this.kind === "heading") return createVirtualNumeralElement(view.dom.ownerDocument, this.label);
    if (this.kind === "caption" || this.kind === "reference") {
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
    return this.kind !== "note-reference" && this.kind !== "note-definition";
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

export class HeadingDisplayController {
  private readonly views = new Set<EditorView>();

  constructor(private readonly getSettings: () => NumberSuiteSettings) {}

  createExtension(): Extension {
    const views = this.views;
    const settingsProvider = this.getSettings;
    const displayPlugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      private overrides: NoteOverrides;
      private eventCompositionActive = false;
      private touchEditingActive = false;

      constructor(private readonly view: EditorView) {
        this.overrides = parseOverrides(view.state.doc.toString()) ?? parseNoteOverrides(null);
        views.add(view);
        this.decorations = this.buildDecorations();
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
      }

      destroy(): void {
        views.delete(this.view);
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
          if (item.semanticKind === "caption" || item.semanticKind === "reference") {
            ranges.push((item.semanticKind === "reference"
              ? Decoration.replace({ widget: new NumeralWidget(item.label, "reference"), inclusive: false })
              : Decoration.widget({ widget: new NumeralWidget(item.label, "caption"), side: -1 }))
              .range(item.from, item.to));
          } else if (item.semanticKind === "caption-alignment" && item.captionKind != null) {
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

    return [displayPlugin, compositionHandlers];
  }

  refreshAll(): void {
    for (const view of this.views) {
      view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
    }
  }
}
