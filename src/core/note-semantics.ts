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
const BLOCK_HTML_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "center", "details", "dialog",
  "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "header", "html", "iframe",
  "main", "nav", "ol", "pre", "script", "section", "style", "table", "textarea", "ul",
]);

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

function rawLines(source: string): Array<Omit<SourceLine, "available">> {
  const lines: Array<Omit<SourceLine, "available">> = [];
  let from = 0;
  let number = 0;
  while (from < source.length) {
    const newline = source.indexOf("\n", from);
    const rawTo = newline < 0 ? source.length : newline;
    const to = rawTo > from && source.charCodeAt(rawTo - 1) === 13 ? rawTo - 1 : rawTo;
    lines.push({ text: source.slice(from, to), from, to, number });
    number += 1;
    if (newline < 0) return lines;
    from = newline + 1;
  }
  if (source.length === 0 || source.endsWith("\n")) {
    lines.push({ text: "", from: source.length, to: source.length, number });
  }
  return lines;
}

function sourceLines(source: string): SourceLine[] {
  let inFrontmatter = false;
  let frontmatterFinished = false;
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;
  let inHtmlComment = false;
  let inObsidianComment = false;
  let rawHtmlTag: string | null = null;
  let genericHtmlBlock = false;
  return rawLines(source).map((line) => {
    const trimmed = line.text.trim();
    let available = true;
    if (line.number === 0 && line.text.replace(/^\uFEFF/u, "").trim() === "---") {
      inFrontmatter = true;
      available = false;
    } else if (inFrontmatter) {
      available = false;
      if (trimmed === "---" || trimmed === "...") {
        inFrontmatter = false;
        frontmatterFinished = true;
      }
    } else {
      if (!frontmatterFinished && line.number > 0) frontmatterFinished = true;
      if (fenceCharacter != null) {
        available = false;
        const closing = new RegExp(`^ {0,3}${fenceCharacter}{${fenceLength},}[ \\t]*$`, "u");
        if (closing.test(line.text)) {
          fenceCharacter = null;
          fenceLength = 0;
        }
      } else {
        const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line.text);
        if (fence?.[1] != null) {
          available = false;
          fenceCharacter = fence[1][0] as "`" | "~";
          fenceLength = fence[1].length;
        } else if (rawHtmlTag != null) {
          available = false;
          if (new RegExp(`</${rawHtmlTag}[ \\t]*>`, "iu").test(line.text)) rawHtmlTag = null;
        } else if (genericHtmlBlock) {
          available = false;
          if (trimmed.length === 0) genericHtmlBlock = false;
        } else if (inHtmlComment) {
          available = false;
          if (line.text.includes("-->")) inHtmlComment = false;
        } else if (inObsidianComment) {
          available = false;
          if (line.text.includes("%%")) inObsidianComment = false;
        } else {
          const htmlStart = line.text.indexOf("<!--");
          const obsidianStart = line.text.indexOf("%%");
          const htmlTag = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/>)/u.exec(line.text)?.[1]?.toLowerCase();
          if (htmlTag != null && BLOCK_HTML_TAGS.has(htmlTag)) {
            available = false;
            if (["script", "pre", "style", "textarea"].includes(htmlTag)) {
              if (!new RegExp(`</${htmlTag}[ \\t]*>`, "iu").test(line.text)) rawHtmlTag = htmlTag;
            } else {
              genericHtmlBlock = true;
            }
          } else if (htmlStart >= 0) {
            available = false;
            if (line.text.indexOf("-->", htmlStart + 4) < 0) inHtmlComment = true;
          } else if (obsidianStart >= 0) {
            available = false;
            if (line.text.indexOf("%%", obsidianStart + 2) < 0) inObsidianComment = true;
          }
        }
      }
    }
    return { ...line, available };
  });
}

function maskInlineCode(text: string): string {
  const characters = text.split("");
  for (let index = 0; index < text.length;) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let ticks = 1;
    while (text[index + ticks] === "`") ticks += 1;
    const closing = text.indexOf("`".repeat(ticks), index + ticks);
    if (closing < 0) break;
    for (let cursor = index; cursor < closing + ticks; cursor += 1) characters[cursor] = " ";
    index = closing + ticks;
  }
  return characters.join("");
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
    const masked = maskInlineCode(line.text);
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
