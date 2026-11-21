import type { HeadingCache } from "obsidian";
import { createHeadingMap } from "../application/heading-map";
import type { CaptionKind } from "../core/document-semantics";
import { createDisplayPlan } from "../application/display-plan";
import { invalidNoteOverrides, resolveNoteSettings } from "../config/frontmatter";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { numberCaptions, parseDocumentSemantics, withoutTrailingBlockId } from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";
import { analyzeInlineHtmlComments, scanMarkdownProtectedLines } from "../core/markdown-protection";

export interface ExtraOutlineHeading extends HeadingCache {
  __numberSuiteExtra?: "extended" | "caption";
  __numberSuiteCaption?: { kind: CaptionKind; ordinal: number; title: string };
}
export interface NativeOutlineProjection {
  readonly headings: ExtraOutlineHeading[];
  readonly numberLabels: ReadonlyMap<number, string>;
  readonly titleLabels?: ReadonlyMap<number, string>;
  readonly numberKinds?: ReadonlyMap<number, "virtual" | "stored">;
  readonly secondaryStoredNumbers?: ReadonlyMap<number, string>;
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
  if (settings.showOutlineCaptions) {
    for (const caption of numberCaptions(parseDocumentSemantics(source).captions)) {
      if (usedLines.has(caption.line)) continue;

      extras.push({
        heading: (captionTypeLabel?.(caption.kind) ?? caption.kind)
          + (settings.showCaptionNumbers ? " " + caption.number : "")
          + ": " + withoutTrailingBlockId(caption.content),
        // Higher than every supported heading: attached to the preceding
        // section, then popped before any following heading. Captions stay leaves.
        level: 10,
        position: {
          start: { line: caption.line, col: 0, offset: caption.lineFrom },
          end: { line: caption.line, col: caption.lineTo - caption.lineFrom, offset: caption.lineTo },
        },
        __numberSuiteExtra: "caption",
        __numberSuiteCaption: { kind: caption.kind, ordinal: caption.number, title: withoutTrailingBlockId(caption.content) },
      });
      usedLines.add(caption.line);
    }
  }
  const numbering = toNumberingOptions(settings, effective);
  const templateSources = cleanupTemplateSources(settings);
  const plan = createDisplayPlan(headings, {
    showVirtualNumbers: effective.showVirtualNumbers,
    concealStoredNumbers: effective.concealStoredNumbers, numbering,
    cleanupScope: settings.concealScope, templateSources,
    revealOnActiveLine: false, selections: [], composing: false,
  });
  const titleLabels = new Map<number, string>();
  const numberKinds = new Map<number, "virtual" | "stored">();
  const secondaryStoredNumbers = new Map<number, string>();
  const collect = (nodes: ReturnType<typeof createHeadingMap>): void => {
    for (const node of nodes) {
      titleLabels.set(node.line, node.title);
      if (settings.showOutlineNumbers && node.numberLabel != null) {
        numberLabels.set(node.line, node.numberLabel);
        if (node.numberKind != null) numberKinds.set(node.line, node.numberKind);
        if (node.storedNumberLabel) secondaryStoredNumbers.set(node.line, node.storedNumberLabel);
      }
      collect(node.children);
    }
  };
  collect(createHeadingMap(source, {
    headingDisplayPlan: plan, numbering, cleanupScope: settings.concealScope,
    templateSources, concealStoredNumbers: effective.concealStoredNumbers,
    recognizeStoredNumbers: !effective.disabled,
    styleStoredNumbers: settings.styleStoredHeadingNumbers && settings.showOutlineNumbers,
  }));
  return {
    headings: [...original, ...extras].sort(
      (a, b) => a.position.start.offset - b.position.start.offset,
    ),
    numberLabels, titleLabels, numberKinds, secondaryStoredNumbers,
  };
}
