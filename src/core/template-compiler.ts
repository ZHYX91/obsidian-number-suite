import { formatCounter, NUMBER_FORMAT_PATTERNS } from "./number-formats";
import type { Counters, NumberFormat } from "./types";

export const NUMBER_FORMATS = [
  "arabic",
  "arabic_full",
  "chinese_lower",
  "chinese_upper",
  "circled",
  "letter_upper",
  "letter_lower",
  "roman_upper",
  "roman_lower",
] as const satisfies readonly NumberFormat[];

export type TemplateNode =
  | Readonly<{ kind: "literal"; value: string }>
  | Readonly<{ kind: "counter"; level: 1 | 2 | 3 | 4 | 5 | 6; format: NumberFormat }>;

export interface TemplateDiagnostic {
  readonly from: number;
  readonly to: number;
  readonly code: "unclosed-token" | "unexpected-closing-brace" | "invalid-token";
}

export interface CompiledTemplate {
  readonly source: string;
  readonly nodes: readonly TemplateNode[];
  readonly diagnostics: readonly TemplateDiagnostic[];
}

function counterNode(content: string): TemplateNode | null {
  const match = /^([1-6])\.([a-z_]+)$/u.exec(content);
  if (match == null || !NUMBER_FORMATS.includes(match[2] as NumberFormat)) return null;
  return {
    kind: "counter",
    level: Number(match[1]) as 1 | 2 | 3 | 4 | 5 | 6,
    format: match[2] as NumberFormat,
  };
}

export function compileTemplate(source: string): CompiledTemplate {
  const nodes: TemplateNode[] = [];
  const diagnostics: TemplateDiagnostic[] = [];
  let literal = "";
  const flushLiteral = (): void => {
    if (literal.length > 0) {
      nodes.push({ kind: "literal", value: literal });
      literal = "";
    }
  };
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character === "}") {
      diagnostics.push({ from: index, to: index + 1, code: "unexpected-closing-brace" });
      literal += character;
      index += 1;
      continue;
    }
    if (character !== "{") {
      literal += character;
      index += 1;
      continue;
    }
    const closing = source.indexOf("}", index + 1);
    if (closing < 0) {
      diagnostics.push({ from: index, to: source.length, code: "unclosed-token" });
      literal += source.slice(index);
      break;
    }
    const node = counterNode(source.slice(index + 1, closing));
    if (node == null) {
      diagnostics.push({ from: index, to: closing + 1, code: "invalid-token" });
      literal += source.slice(index, closing + 1);
    } else {
      flushLiteral();
      nodes.push(node);
    }
    index = closing + 1;
  }
  flushLiteral();
  return { source, nodes, diagnostics };
}

export function renderCompiledTemplate(template: CompiledTemplate, counters: Counters): string {
  return template.nodes.map((node) => node.kind === "literal"
    ? node.value
    : formatCounter(counters[node.level - 1] ?? 0, node.format)).join("");
}

export function renderTemplate(source: string, counters: Counters): string {
  const compiled = compileTemplate(source);
  return compiled.diagnostics.length === 0 ? renderCompiledTemplate(compiled, counters) : source;
}

export function renderCurrentLevel(source: string, level: number, counters: Counters): string {
  const compiled = compileTemplate(source);
  if (compiled.diagnostics.length > 0) return source;
  const countersInTemplate = compiled.nodes.filter((node) => node.kind === "counter");
  const current = countersInTemplate.find((node) => node.kind === "counter" && node.level === level);
  if (current?.kind !== "counter") return String(counters[level - 1] ?? 0);
  if (countersInTemplate.length === 1) return renderCompiledTemplate(compiled, counters);
  return formatCounter(counters[level - 1] ?? 0, current.format);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function templatePrefixPattern(source: string): RegExp | null {
  const compiled = compileTemplate(source);
  if (compiled.diagnostics.length > 0 || !compiled.nodes.some((node) => node.kind === "counter")) return null;
  const body = compiled.nodes.map((node) => node.kind === "literal"
    ? escapeRegex(node.value)
    : NUMBER_FORMAT_PATTERNS[node.format]).join("");
  return new RegExp(`^(${body})([ \\t]+)`, "u");
}
