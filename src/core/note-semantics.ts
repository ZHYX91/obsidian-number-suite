import {
  maskInlineProtectedSyntax,
  scanMarkdownProtectedLines,
} from "./markdown-protection";

export type NoteKind = "footnote" | "endnote";

export interface ParsedNoteDefinition {
  readonly kind: NoteKind;
  readonly id: string;
  readonly key: string;
  readonly sourceLabelKey: string;
  readonly line: number;
  readonly from: number;
  readonly to: number;
}

export type ParsedNoteReference = ParsedNoteDefinition;

export interface DocumentNoteSemantics {
  readonly definitions: readonly ParsedNoteDefinition[];
  readonly references: readonly ParsedNoteReference[];
  readonly containerLines: ReadonlySet<number>;
}

export interface NumberedNoteDefinition extends ParsedNoteDefinition {
  readonly number: number;
}

export interface NumberedNoteReference extends ParsedNoteReference {
  readonly number: number;
}

export interface NumberedDocumentNotes {
  readonly definitions: readonly NumberedNoteDefinition[];
  readonly references: readonly NumberedNoteReference[];
}

interface SourceLine {
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly number: number;
  readonly available: boolean;
}

interface NoteIdentity {
  readonly kind: NoteKind;
  readonly id: string;
  readonly key: string;
  readonly sourceLabelKey: string;
}

const DEFINITION = /^ {0,3}\[\^([^\]\r\n]+)\]:/u;
const REFERENCE = /\[\^([^\]\r\n]+)\]/gu;

function normalizeLabel(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

function noteIdentity(label: string): NoteIdentity | null {
  const normalized = label.normalize("NFC").trim();
  if (normalized.length === 0) return null;
  const typed = /^(footnote|endnote):(.*)$/iu.exec(normalized);
  const kind: NoteKind = typed?.[1]?.toLowerCase() === "endnote"
    ? "endnote"
    : "footnote";
  const id = (typed?.[2] ?? normalized).trim();
  if (id.length === 0) return null;
  return {
    kind,
    id,
    key: `${kind}:${normalizeLabel(id)}`,
    sourceLabelKey: normalizeLabel(normalized),
  };
}

function sourceLines(source: string): SourceLine[] {
  return scanMarkdownProtectedLines(source).map((line) => ({
    text: line.commentMaskedText,
    from: line.from,
    to: line.to,
    number: line.number,
    available: line.available,
  }));
}

function definitionContainerLines(lines: readonly SourceLine[]): Set<number> {
  const result = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line == null || !line.available || DEFINITION.exec(line.text) == null) continue;
    result.add(line.number);
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const continuation = lines[cursor];
      if (continuation == null) break;
      if (continuation.text.trim().length === 0) {
        result.add(continuation.number);
        continue;
      }
      if (/^(?: {2,}|\t)/u.test(continuation.text)) {
        result.add(continuation.number);
        continue;
      }
      break;
    }
  }
  return result;
}

export function noteContainerLines(source: string): ReadonlySet<number> {
  return definitionContainerLines(sourceLines(source));
}

export function parseDocumentNotes(source: string): DocumentNoteSemantics {
  const lines = sourceLines(source);
  const containerLines = definitionContainerLines(lines);
  const definitions: ParsedNoteDefinition[] = [];
  const references: ParsedNoteReference[] = [];
  for (const line of lines) {
    if (!line.available) continue;
    const definition = DEFINITION.exec(line.text);
    if (definition?.[1] != null) {
      const identity = noteIdentity(definition[1]);
      if (identity != null) {
        const markerOffset = line.text.indexOf("[^");
        definitions.push({
          ...identity,
          line: line.number,
          from: line.from + markerOffset,
          to: line.from + markerOffset + definition[0].lastIndexOf(":"),
        });
      }
      continue;
    }
    if (containerLines.has(line.number)) continue;
    const masked = maskInlineProtectedSyntax(line.text);
    for (const match of masked.matchAll(REFERENCE)) {
      if (match.index == null || match[1] == null) continue;
      if (match.index > 0 && line.text[match.index - 1] === "\\") continue;
      const identity = noteIdentity(match[1]);
      if (identity == null) continue;
      references.push({
        ...identity,
        line: line.number,
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
      });
    }
  }
  return { definitions, references, containerLines };
}

export function numberDocumentNotes(semantics: DocumentNoteSemantics): NumberedDocumentNotes {
  const definitionsByLabel = new Map<string, ParsedNoteDefinition[]>();
  const canonicalDefinitionCounts = new Map<string, number>();
  for (const definition of semantics.definitions) {
    const definitions = definitionsByLabel.get(definition.sourceLabelKey) ?? [];
    definitions.push(definition);
    definitionsByLabel.set(definition.sourceLabelKey, definitions);
    canonicalDefinitionCounts.set(definition.key, (canonicalDefinitionCounts.get(definition.key) ?? 0) + 1);
  }
  const counters: Record<NoteKind, number> = { footnote: 0, endnote: 0 };
  const assignments = new Map<string, number>();
  const references: NumberedNoteReference[] = [];
  const usedDefinitions = new Map<string, NumberedNoteDefinition>();
  for (const reference of semantics.references) {
    const candidates = definitionsByLabel.get(reference.sourceLabelKey) ?? [];
    const definition = candidates.length === 1 ? candidates[0] : null;
    if (definition == null || (canonicalDefinitionCounts.get(reference.key) ?? 0) !== 1) continue;
    let number = assignments.get(reference.key);
    if (number == null) {
      number = counters[reference.kind] + 1;
      counters[reference.kind] = number;
      assignments.set(reference.key, number);
      usedDefinitions.set(reference.key, { ...definition, number });
    }
    references.push({ ...reference, number });
  }
  return { definitions: [...usedDefinitions.values()], references };
}
