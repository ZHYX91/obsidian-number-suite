export interface DisplayPreferences {
  showVirtualNumbers: boolean;
  concealStoredNumbers: boolean;
}

export const BUILT_IN_SCHEME_IDS = [
  "hierarchical",
  "hierarchical-h2",
  "chinese-official",
  "legal",
] as const;
export type BuiltInSchemeId = (typeof BUILT_IN_SCHEME_IDS)[number];
export type SchemeId = string;

export const CONFIDENCES = ["low", "medium", "high", "certain"] as const;
export type Confidence = (typeof CONFIDENCES)[number];
export type CleanupScope = "plugin" | "templates" | "common";
export type MissingLevelStrategy = "fill-one" | "current-only" | "skip";
export type NumberStyle =
  | "hierarchical"
  | "arabic"
  | "chinese"
  | "circled"
  | "bracketed"
  | "letter"
  | "roman"
  | "legal";

export type NumberFormat =
  | "arabic"
  | "arabic_full"
  | "chinese_lower"
  | "chinese_upper"
  | "circled"
  | "letter_upper"
  | "letter_lower"
  | "roman_upper"
  | "roman_lower";

export type Counters = [number, number, number, number, number, number];

export type HeadingExclusionScope = "heading" | "subtree";

export interface HeadingContentSpan {
  visibleFrom: number;
  visibleTo: number;
  sourceFrom: number;
  sourceTo: number;
}

export interface HeadingExclusionRule {
  title: string;
  scope: HeadingExclusionScope;
}

export interface ParsedHeading {
  line: number;
  level: number;
  lineFrom: number;
  lineTo: number;
  markerFrom: number;
  contentFrom: number;
  contentTo: number;
  content: string;
  contentSpans: readonly HeadingContentSpan[];
}

export interface HeadingNumberMatch {
  fullPrefix: string;
  numberCore: string;
  separator: string;
  from: number;
  to: number;
  style: NumberStyle;
  confidence: Confidence;
  provenance: "plugin" | "template" | "manual" | "unknown";
  ruleId: string;
  schemeId?: string;
  schemeRevision?: number;
}

export interface NumberingScheme {
  id: string;
  baseLevel: number;
  templates: readonly string[];
  exclusions: readonly HeadingExclusionRule[];
}

export interface CustomNumberingScheme extends NumberingScheme {
  name: string;
  revision: number;
}

export interface CleanupTemplateHistory {
  schemeId: string;
  schemeName: string;
  revision: number;
  baseLevel: number;
  templates: readonly string[];
}

export interface CleanupTemplateSource {
  schemeId: string;
  schemeName: string;
  revision: number;
  templates: readonly string[];
}

export interface NumberingOptions {
  scheme: NumberingScheme;
  missingLevelStrategy: MissingLevelStrategy;
  starts: Readonly<Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>>;
}

export interface NumberedHeading {
  heading: ParsedHeading;
  label: string | null;
  counters: Counters;
  warning: string | null;
  exclusion: HeadingExclusionScope | null;
}

export type TransformOperation = "write" | "remove" | "renumber" | "strip-markers";

export interface PlannedChange {
  from: number;
  to: number;
  insert: string;
  line: number;
  level: number;
  before: string;
  after: string;
  ruleId: string;
  confidence: Confidence | null;
  provenance: "plugin" | "template" | "manual" | "none";
}

export interface PlanWarning {
  line: number;
  heading: string;
  code:
    | "ambiguous-prefix"
    | "empty-heading"
    | "missing-parent"
    | "unsupported-prefix";
  detail: string;
}

export interface TransformPlan {
  operation: TransformOperation;
  source: string;
  changes: readonly PlannedChange[];
  warnings: readonly PlanWarning[];
  result: string;
}
