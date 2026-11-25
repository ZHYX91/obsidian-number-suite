import type { HeadingCache } from "obsidian";
import { createHeadingMap, type StoredHeadingNumberPill } from "../application/heading-map";
import type { CaptionKind } from "../core/document-semantics";
import { createDisplayPlan, type HeadingNumberPillKind } from "../application/display-plan";
import { invalidNoteOverrides, resolveNoteSettings } from "../config/frontmatter";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import {
  captionLevelForDisplay,
  displayTemplateSources,
  outlineHeadingFormat,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { numberHeadings } from "../core/numbering-engine";
import { numberCaptions, parseDocumentSemantics, withoutTrailingBlockId } from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";
import { analyzeInlineHtmlComments, scanMarkdownProtectedLines } from "../core/markdown-protection";

export interface ExtraOutlineHeading extends HeadingCache {
  __numberSuiteExtra?: "extended" | "caption";
  __numberSuiteCaption?: { kind: CaptionKind; ordinal: number; displayNumber: string; title: string };
}
export interface NativeOutlineProjection {
  readonly headings: ExtraOutlineHeading[];
  readonly numberLabels: ReadonlyMap<number, string>;
  readonly titleLabels?: ReadonlyMap<number, string>;
  readonly numberKinds?: ReadonlyMap<number, HeadingNumberPillKind>;
  readonly secondaryStoredNumbers?: ReadonlyMap<number, StoredHeadingNumberPill>;
}

/** Compare the visible titles when Obsidian retains authored inline comments in its cache. */
export function sameOutlineTitle(sourceTitle: string, cachedTitle: string): boolean {
  if (sourceTitle === cachedTitle) return true;
  const visible = (text: string): string => {
    const { ranges } = analyzeInlineHtmlComments(text);
    let title = "";
    let from = 0;
    for (const range of ranges) {
      title += text.slice(from, range.from);
      from = range.to;
    }
    return withoutTrailingBlockId(title + text.slice(from)).trim();
  };
  return visible(sourceTitle) === visible(cachedTitle);
}

export function createNativeOutlineProjection(
  source: string, native: readonly HeadingCache[], settings: NumberSuiteSettings,
  captionTypeLabel?: (kind: CaptionKind) => string,
): NativeOutlineProjection {
  const original = [...native];
  const numberLabels = new Map<number, string>();
  if (!settings.enhanceNativeOutline) {
    return { headings: original, numberLabels };
  }
  const effective = resolveNoteSettings(
    settings, parseNoteOverridesFromSource(source) ?? invalidNoteOverrides(),
  );
  if (effective.disabled || !effective.valid) return { headings: original, numberLabels };
  const lines = scanMarkdownProtectedLines(source);
  const headings = parseAtxHeadings(source, lines);
  const parsedByLine = new Map(headings.map((heading) => [heading.line, heading] as const));
  // A stale core cache must never be combined with a newer editor heading
  // at the same position. Until the cache catches up, retain native Outline.
  if (original.some((item) => {
    const heading = parsedByLine.get(item.position.start.line);
    if (heading != null) return heading.level !== item.level || !sameOutlineTitle(heading.content, item.heading);
    const line = lines[item.position.start.line];
    return line?.setextLevel !== item.level || !sameOutlineTitle(line.text, item.heading);
  })) return { headings: original, numberLabels };
  const usedLines = new Set(original.map((item) => item.position.start.line));
  const extras: ExtraOutlineHeading[] = [];
  if (settings.showOutlineExtendedHeadings) {
    for (const heading of headings) {
      if (heading.level < 7 || usedLines.has(heading.line)) continue;
      extras.push({
        heading: heading.content, level: heading.level,
        position: {
          start: { line: heading.line, col: 0, offset: heading.lineFrom },
          end: { line: heading.line, col: heading.lineTo - heading.lineFrom, offset: heading.lineTo },
        },
        __numberSuiteExtra: "extended",
      });
      usedLines.add(heading.line);
    }
  }
  const numbering = toNumberingOptions(settings, effective);
  if (settings.showOutlineCaptions) {
    const captions = parseDocumentSemantics(source).captions;
    const level = captionLevelForDisplay(settings);
    const scope = level == null || captions.length === 0 ? undefined : { level, headings: numberHeadings(headings, numbering) };
    for (const caption of numberCaptions(captions, scope)) {
      if (usedLines.has(caption.line)) continue;

      extras.push({
        heading: (captionTypeLabel?.(caption.kind) ?? caption.kind)
          + (settings.showCaptionNumbers ? " " + caption.displayNumber : "")
          + ": " + withoutTrailingBlockId(caption.content),
        // Higher than every supported heading: attached to the preceding
        // section, then popped before any following heading. Captions stay leaves.
        level: 10,
        position: {
          start: { line: caption.line, col: 0, offset: caption.lineFrom },
          end: { line: caption.line, col: caption.lineTo - caption.lineFrom, offset: caption.lineTo },
        },
        __numberSuiteExtra: "caption",
        __numberSuiteCaption: { kind: caption.kind, ordinal: caption.number, displayNumber: caption.displayNumber, title: withoutTrailingBlockId(caption.content) },
      });
      usedLines.add(caption.line);
    }
  }
  const templateSources = displayTemplateSources(settings);
  const plan = createDisplayPlan(headings, {
    showVirtualNumbers: effective.showVirtualNumbers,
    virtualNumberFormat: outlineHeadingFormat(settings),
    concealStoredNumbers: effective.concealStoredNumbers, numbering,
    storedHeadingNumberStyleScope: settings.showOutlineNumbers ? settings.storedHeadingNumberStyleScope : "off",
    cleanupScope: effective.concealScope, templateSources,
    revealOnActiveLine: false, selections: [], composing: false,
  });
  const titleLabels = new Map<number, string>();
  const numberKinds = new Map<number, HeadingNumberPillKind>();
  const secondaryStoredNumbers = new Map<number, StoredHeadingNumberPill>();
  const collect = (nodes: ReturnType<typeof createHeadingMap>): void => {
    for (const node of nodes) {
      titleLabels.set(node.line, node.title);
      if (settings.showOutlineNumbers && node.numberLabel != null) {
        numberLabels.set(node.line, node.numberLabel);
        if (node.numberKind != null) numberKinds.set(node.line, node.numberKind);
        if (node.storedNumber != null) secondaryStoredNumbers.set(node.line, node.storedNumber);
      }
      collect(node.children);
    }
  };
  collect(createHeadingMap(source, { headingDisplayPlan: plan }));
  return {
    headings: [...original, ...extras].sort(
      (a, b) => a.position.start.offset - b.position.start.offset,
    ),
    numberLabels, titleLabels, numberKinds, secondaryStoredNumbers,
  };
}
