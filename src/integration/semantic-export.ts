import { createDisplayPlan } from "../application/display-plan";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type NumberSuiteSettings,
} from "../config/settings";
import { parseNoteOverrides, resolveNoteSettings } from "../config/frontmatter";
import {
  blockTargetKey,
  numberCaptions,
  parseDocumentSemantics,
  resolveUniqueSemanticTitleTarget,
  scanSemanticSourceLines,
  type CaptionKind,
  type SemanticDocument,
} from "../core/document-semantics";
import { parseAtxHeadings } from "../core/heading-parser";
import { numberHeadings } from "../core/numbering-engine";
import {
  compileTemplate,
  renderCompiledTemplate,
  renderCurrentLevel,
  type TemplateNode,
} from "../core/template-compiler";
import type { Counters, HeadingLevel, NumberFormat, ParsedHeading } from "../core/types";

export const NUMBER_SUITE_INTEROP_SCHEMA_V2 = "number-suite.interop.v2" as const;

export interface NumberSuiteInteropRequestV2 {
  readonly schema: typeof NUMBER_SUITE_INTEROP_SCHEMA_V2;
  readonly authoredMarkdown: string;
  readonly frontmatter: unknown;
}

export interface NumberSuiteCounterSegmentV2 {
  readonly kind: "counter";
  readonly level: HeadingLevel;
  readonly numberFormat: NumberFormat;
}

export interface NumberSuiteLiteralSegmentV2 {
  readonly kind: "literal";
  readonly literal: string;
}

export type NumberSuiteDisplaySegmentV2 =
  | NumberSuiteCounterSegmentV2
  | NumberSuiteLiteralSegmentV2;

export interface NumberSuiteHeadingTargetV2 {
  readonly sourceStartUtf16: number;
  readonly sourceEndUtf16: number;
  readonly line: number;
  readonly level: HeadingLevel;
  readonly targetId: string | null;
  readonly authoredText: string;
  readonly enabled: boolean;
  readonly derivedNumber: string | null;
  readonly counters: readonly number[];
  readonly display: readonly NumberSuiteDisplaySegmentV2[];
}

export interface NumberSuiteCaptionTargetV2 {
  readonly sourceStartUtf16: number;
  readonly sourceEndUtf16: number;
  readonly line: number;
  readonly kind: CaptionKind;
  readonly targetId: string | null;
  readonly authoredText: string;
  readonly enabled: boolean;
  readonly derivedNumber: string | null;
}

export interface NumberSuiteReferenceV2 {
  readonly sourceStartUtf16: number;
  readonly sourceEndUtf16: number;
  readonly targetSourceStartUtf16: number;
  readonly targetSourceEndUtf16: number;
  readonly alias: string | null;
}

export interface NumberSuiteSemanticSnapshotV2 {
  readonly schema: typeof NUMBER_SUITE_INTEROP_SCHEMA_V2;
  readonly offsetEncoding: "utf16";
  readonly disabled: boolean;
  readonly headingTargets: readonly NumberSuiteHeadingTargetV2[];
  readonly captionTargets: readonly NumberSuiteCaptionTargetV2[];
  readonly references: readonly NumberSuiteReferenceV2[];
}

export interface NumberSuiteInteropApiV2 {
  readonly schema: typeof NUMBER_SUITE_INTEROP_SCHEMA_V2;
  exportSemanticSnapshot(
    request: NumberSuiteInteropRequestV2,
  ): NumberSuiteSemanticSnapshotV2;
}

const TRAILING_BLOCK_ID = /(?:^|[ \t])\^([A-Za-z0-9-]{1,128})[ \t]*$/u;

function targetAuthoredText(value: string): string {
  const match = TRAILING_BLOCK_ID.exec(value);
  return match?.[1] == null ? value.trim() : value.slice(0, match.index).trim();
}

function uniqueTargetIdForLine(
  source: string,
  line: number,
  semantics: SemanticDocument,
): string | null {
  const ownerKeys = [...semantics.blockOwners.entries()]
    .filter(([, ownerLine]) => ownerLine === line)
    .map(([key]) => key);
  if (ownerKeys.length !== 1) return null;
  const ownerKey = ownerKeys[0];
  if (ownerKey == null) return null;
  for (const sourceLine of scanSemanticSourceLines(source)) {
    const id = TRAILING_BLOCK_ID.exec(sourceLine.text)?.[1];
    if (id != null && blockTargetKey(id) === ownerKey) return id;
  }
  return null;
}

function displaySegments(
  heading: ParsedHeading,
  label: string,
  counters: Counters,
  template: string,
): NumberSuiteDisplaySegmentV2[] {
  const compiled = compileTemplate(template);
  if (compiled.diagnostics.length > 0) return [];
  let nodes: readonly TemplateNode[] = compiled.nodes;
  if (renderCompiledTemplate(compiled, counters) !== label) {
    const current = compiled.nodes.find((node) => node.kind === "counter" && node.level === heading.level);
    if (current == null || renderCurrentLevel(template, heading.level, counters) !== label) return [];
    nodes = [current];
  }
  const counterLevels = nodes
    .filter((node): node is Extract<TemplateNode, { kind: "counter" }> => node.kind === "counter")
    .map((node) => node.level);
  if (
    counterLevels.filter((level) => level === heading.level).length !== 1
    || counterLevels.some((level) => level > heading.level)
    || new Set(counterLevels).size !== counterLevels.length
  ) return [];
  return nodes.map((node) => node.kind === "literal"
    ? { kind: "literal", literal: node.value }
    : { kind: "counter", level: node.level, numberFormat: node.format });
}

function headingTargets(
  source: string,
  headings: readonly ParsedHeading[],
  semantics: SemanticDocument,
  settings: NumberSuiteSettings,
  frontmatter: unknown,
): NumberSuiteHeadingTargetV2[] {
  const overrides = parseNoteOverrides(frontmatter);
  const effective = resolveNoteSettings(settings, overrides);
  const numbering = toNumberingOptions(settings, {
    schemeId: effective.schemeId,
    starts: effective.starts,
  });
  const numbered = numberHeadings(headings, numbering);
  const decorations = createDisplayPlan(headings, {
    showVirtualNumbers: effective.showVirtualNumbers,
    concealStoredNumbers: effective.concealStoredNumbers,
    numbering,
    cleanupScope: effective.cleanupScope,
    templateSources: cleanupTemplateSources(settings),
    revealOnActiveLine: false,
    selections: [],
    composing: false,
  });
  return numbered.map((item) => {
    const virtual = decorations.find((entry) => entry.line === item.heading.line && entry.kind === "virtual");
    const concealed = decorations.find((entry) => entry.line === item.heading.line && entry.kind === "conceal");
    const visibleContent = concealed?.sourceText == null
      ? item.heading.content
      : item.heading.content.slice(concealed.sourceText.length).trimStart();
    const authoredText = targetAuthoredText(visibleContent);
    // The v2 consumer contract can insert a virtual list label without
    // rewriting authored Markdown. Replacing a stored prefix needs a future
    // source-edit carrier, so it is deliberately not exported as enabled.
    const candidate = virtual != null && concealed == null && item.label != null;
    const display = candidate
      ? displaySegments(
        item.heading,
        item.label ?? "",
        item.counters,
        numbering.scheme.templates[item.heading.level - 1] ?? "",
      )
      : [];
    const enabled = candidate && display.length > 0;
    return {
      sourceStartUtf16: item.heading.lineFrom,
      sourceEndUtf16: item.heading.lineTo,
      line: item.heading.line,
      level: item.heading.level,
      targetId: uniqueTargetIdForLine(source, item.heading.line, semantics),
      authoredText,
      enabled,
      derivedNumber: enabled ? item.label : null,
      counters: [...item.counters],
      display: enabled ? display : [],
    };
  });
}

function captionTargets(
  source: string,
  semantics: SemanticDocument,
  settings: NumberSuiteSettings,
): NumberSuiteCaptionTargetV2[] {
  return numberCaptions(semantics.captions).map((caption) => {
    const authoredText = targetAuthoredText(caption.content);
    const enabled = settings.showCaptionNumbers;
    return {
      sourceStartUtf16: caption.lineFrom,
      sourceEndUtf16: caption.lineTo,
      line: caption.line,
      kind: caption.kind,
      targetId: uniqueTargetIdForLine(source, caption.line, semantics),
      authoredText,
      enabled,
      derivedNumber: enabled ? String(caption.number) : null,
    };
  });
}

function semanticReferences(
  semantics: SemanticDocument,
  parsedHeadings: readonly ParsedHeading[],
  headings: readonly NumberSuiteHeadingTargetV2[],
  captions: readonly NumberSuiteCaptionTargetV2[],
): NumberSuiteReferenceV2[] {
  const targetByLine = new Map<number, NumberSuiteHeadingTargetV2 | NumberSuiteCaptionTargetV2>();
  for (const target of [...headings, ...captions]) {
    targetByLine.set(target.line, target);
  }
  const output: NumberSuiteReferenceV2[] = [];
  for (const reference of semantics.references) {
    const targetLine = reference.kind === "title"
      ? resolveUniqueSemanticTitleTarget(reference.target, parsedHeadings, semantics.captions)?.line
      : semantics.blockOwners.get(blockTargetKey(reference.target));
    const target = targetLine == null ? null : targetByLine.get(targetLine) ?? null;
    if (target == null) continue;
    output.push({
      sourceStartUtf16: reference.from,
      sourceEndUtf16: reference.to,
      targetSourceStartUtf16: target.sourceStartUtf16,
      targetSourceEndUtf16: target.sourceEndUtf16,
      alias: reference.alias,
    });
  }
  return output;
}

export function exportSemanticSnapshotV2(
  settings: NumberSuiteSettings,
  request: NumberSuiteInteropRequestV2,
): NumberSuiteSemanticSnapshotV2 {
  if (request.schema !== NUMBER_SUITE_INTEROP_SCHEMA_V2) {
    throw new Error("Unsupported Number Suite interoperability schema.");
  }
  const overrides = parseNoteOverrides(request.frontmatter);
  const disabled = resolveNoteSettings(settings, overrides).disabled;
  if (disabled) {
    return {
      schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
      offsetEncoding: "utf16",
      disabled: true,
      headingTargets: [],
      captionTargets: [],
      references: [],
    };
  }
  const semantics = parseDocumentSemantics(request.authoredMarkdown);
  const parsedHeadings = parseAtxHeadings(request.authoredMarkdown);
  const headings = headingTargets(
    request.authoredMarkdown,
    parsedHeadings,
    semantics,
    settings,
    request.frontmatter,
  );
  const captions = captionTargets(request.authoredMarkdown, semantics, settings);
  return {
    schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
    offsetEncoding: "utf16",
    disabled,
    headingTargets: headings,
    captionTargets: captions,
    references: semanticReferences(semantics, parsedHeadings, headings, captions),
  };
}

export function createNumberSuiteInteropApiV2(
  settings: () => NumberSuiteSettings,
): NumberSuiteInteropApiV2 {
  return {
    schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
    exportSemanticSnapshot: (request) => exportSemanticSnapshotV2(settings(), request),
  };
}
