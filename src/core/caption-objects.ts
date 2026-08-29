import {
  parseDocumentSemantics,
  scanSemanticSourceLines,
  type CaptionKind,
  type ParsedCaption,
  type SemanticSourceLine,
} from "./document-semantics";

export type CaptionSourcePlacement = "above" | "below";

export interface CaptionObject {
  readonly kind: CaptionKind;
  readonly firstLine: number;
  readonly lastLine: number;
  readonly from: number;
  readonly to: number;
  readonly visualFirstLine: number;
  readonly visualLastLine: number;
  readonly visualFrom: number;
  readonly visualTo: number;
  readonly suggestedTitle: string;
  readonly replacementText: string;
  readonly sourceTableIndex: number | null;
}

export interface BoundCaptionObject {
  readonly caption: ParsedCaption;
  readonly object: CaptionObject;
  readonly sourcePlacement: CaptionSourcePlacement;
}

export interface ImageText {
  readonly suggestedTitle: string;
  readonly replacementText: string;
}

const BLOCK_ID_SUFFIX = /[ \t]+\^[A-Za-z0-9-]+[ \t]*$/u;
const STANDALONE_BLOCK_ID = /^ {0,3}\^[A-Za-z0-9-]+[ \t]*$/u;
const WIKI_EMBED = /!\[\[([^\]\r\n]+)\]\]/gu;
const MARKDOWN_IMAGE = /!\[([^\]\r\n]*)\]\(([^\r\n)]+(?:\([^\r\n)]*\)[^\r\n)]*)*)\)/gu;
const IMAGE_EXTENSIONS = new Set([
  "apng", "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp",
]);

function withoutBlockId(text: string): string {
  return text.replace(BLOCK_ID_SUFFIX, "");
}

function basenameWithoutExtension(path: string): string {
  const normalized = path.replace(/\\/gu, "/").split("#", 1)[0] ?? "";
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dot = basename.lastIndexOf(".");
  return (dot > 0 ? basename.slice(0, dot) : basename).trim();
}

function imageExtension(path: string): string {
  const clean = (path.split("#", 1)[0] ?? "").split("?", 1)[0] ?? "";
  return clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
}

export function meaningfulImageReplacementText(value: string): string {
  const text = value.trim();
  if (text.length === 0 || /^\d+(?:x\d+)?$/u.test(text)) return "";
  if (/^[^/\\]+\.(?:apng|avif|bmp|gif|jpe?g|png|svg|webp)$/iu.test(text)) return "";
  return text;
}

function wikiImageText(body: string): ImageText | null {
  const parts = body.split("|");
  const target = parts[0]?.trim() ?? "";
  if (!IMAGE_EXTENSIONS.has(imageExtension(target))) return null;
  const alias = parts.length > 1 ? parts[parts.length - 1]?.trim() ?? "" : "";
  const aliasIsSize = /^\d+(?:x\d+)?$/u.test(alias);
  const replacementText = alias.length > 0 && !aliasIsSize ? alias : "";
  return {
    suggestedTitle: replacementText || basenameWithoutExtension(target),
    replacementText,
  };
}

function markdownImageText(alt: string, destination: string): ImageText | null {
  const target = destination.trim().replace(/^<|>$/gu, "").split(/[ \t]+["']/u, 1)[0] ?? "";
  if (!IMAGE_EXTENSIONS.has(imageExtension(target))) return null;
  const replacementText = alt.trim();
  return {
    suggestedTitle: replacementText || basenameWithoutExtension(target),
    replacementText,
  };
}

export function standaloneImageText(text: string): ImageText | null {
  const line = withoutBlockId(text);
  const wiki = /^ {0,3}!\[\[([^\]\r\n]+)\]\][ \t]*$/u.exec(line);
  if (wiki?.[1] != null) return wikiImageText(wiki[1]);
  const markdown = /^ {0,3}!\[([^\]\r\n]*)\]\((.+)\)[ \t]*$/u.exec(line);
  return markdown?.[1] == null || markdown[2] == null
    ? null
    : markdownImageText(markdown[1], markdown[2]);
}

export function imageTextAtLineOffset(text: string, offset: number): ImageText | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return null;
  for (const match of text.matchAll(WIKI_EMBED)) {
    if (match.index == null || match[1] == null) continue;
    if (offset >= match.index && offset <= match.index + match[0].length) {
      return wikiImageText(match[1]);
    }
  }
  for (const match of text.matchAll(MARKDOWN_IMAGE)) {
    if (match.index == null || match[1] == null || match[2] == null) continue;
    if (offset >= match.index && offset <= match.index + match[0].length) {
      return markdownImageText(match[1], match[2]);
    }
  }
  return null;
}

function tableCells(text: string): string[] | null {
  if (!text.includes("|")) return null;
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let codeTicks = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === "`") {
      let run = 1;
      while (text[index + run] === "`") run += 1;
      current += "`".repeat(run);
      if (codeTicks === 0) codeTicks = run;
      else if (codeTicks === run) codeTicks = 0;
      index += run - 1;
      continue;
    }
    if (character === "|" && codeTicks === 0) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  if ((cells[0] ?? "").trim() === "") cells.shift();
  if ((cells[cells.length - 1] ?? "").trim() === "") cells.pop();
  return cells.length === 0 ? null : cells;
}

function tableDelimiterColumnCount(line: SemanticSourceLine): number | null {
  if (!line.available) return null;
  const cells = tableCells(line.text);
  if (cells == null) return null;
  const delimiterCells = cells.filter((cell) => cell.trim().length > 0);
  if (delimiterCells.length === 0) return null;
  return delimiterCells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()))
    ? delimiterCells.length
    : null;
}

function tableRowColumnCount(line: SemanticSourceLine | undefined): number | null {
  if (line == null || !line.available || line.text.trim().length === 0) return null;
  if (/^ {0,3}(?:Figure|Table|Equation|Code):[ \t]+/iu.test(line.text)) return null;
  return tableCells(line.text)?.length ?? null;
}

function includeFollowingBlockId(
  lines: readonly SemanticSourceLine[],
  lastLine: number,
): number {
  if (STANDALONE_BLOCK_ID.test(lines[lastLine + 1]?.text ?? "")) return lastLine + 1;
  return (lines[lastLine + 1]?.text.trim().length === 0
    && STANDALONE_BLOCK_ID.test(lines[lastLine + 2]?.text ?? ""))
    ? lastLine + 2
    : lastLine;
}

function imageObjects(lines: readonly SemanticSourceLine[]): CaptionObject[] {
  const output: CaptionObject[] = [];
  for (const line of lines) {
    if (!line.available) continue;
    const image = standaloneImageText(line.text);
    if (image == null) continue;
    const lastLine = includeFollowingBlockId(lines, line.number);
    output.push({
      kind: "Figure",
      firstLine: line.number,
      lastLine,
      from: line.from,
      to: lines[lastLine]?.to ?? line.to,
      visualFirstLine: line.number,
      visualLastLine: line.number,
      visualFrom: line.from,
      visualTo: line.to,
      suggestedTitle: image.suggestedTitle,
      replacementText: image.replacementText,
      sourceTableIndex: null,
    });
  }
  return output;
}

function tableObjects(lines: readonly SemanticSourceLine[]): CaptionObject[] {
  const output: CaptionObject[] = [];
  const consumed = new Set<number>();
  let sourceTableIndex = 0;
  for (let delimiter = 1; delimiter < lines.length; delimiter += 1) {
    if (consumed.has(delimiter)) continue;
    const delimiterLine = lines[delimiter];
    const headerLine = lines[delimiter - 1];
    if (delimiterLine == null || headerLine == null) continue;
    const columns = tableDelimiterColumnCount(delimiterLine);
    if (columns == null || tableRowColumnCount(headerLine) !== columns) continue;
    let first = delimiter - 1;
    while (first > 0 && tableRowColumnCount(lines[first - 1]) === columns) first -= 1;
    let last = delimiter;
    while (last + 1 < lines.length && tableRowColumnCount(lines[last + 1]) != null) last += 1;
    for (let line = first; line <= last; line += 1) consumed.add(line);
    const lastWithId = includeFollowingBlockId(lines, last);
    output.push({
      kind: "Table",
      firstLine: first,
      lastLine: lastWithId,
      from: lines[first]?.from ?? 0,
      to: lines[lastWithId]?.to ?? delimiterLine.to,
      visualFirstLine: first,
      visualLastLine: last,
      visualFrom: lines[first]?.from ?? 0,
      visualTo: lines[last]?.to ?? delimiterLine.to,
      suggestedTitle: "",
      replacementText: "",
      sourceTableIndex,
    });
    sourceTableIndex += 1;
  }
  return output;
}

function equationObjects(lines: readonly SemanticSourceLine[]): CaptionObject[] {
  const output: CaptionObject[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index];
    if (opening == null || !opening.available || !/^ {0,3}\$\$/u.test(opening.text)) continue;
    const trimmed = withoutBlockId(opening.text).trim();
    let last = index;
    if (!(trimmed.length > 4 && trimmed.endsWith("$$"))) {
      let closing = index + 1;
      while (closing < lines.length) {
        const line = lines[closing];
        if (line == null || !line.available) break;
        if (/^ {0,3}\$\$[ \t]*(?:\^[A-Za-z0-9-]+)?[ \t]*$/u.test(line.text)) {
          last = closing;
          break;
        }
        closing += 1;
      }
      if (last === index) continue;
    }
    const lastWithId = includeFollowingBlockId(lines, last);
    output.push({
      kind: "Equation",
      firstLine: index,
      lastLine: lastWithId,
      from: opening.from,
      to: lines[lastWithId]?.to ?? opening.to,
      visualFirstLine: index,
      visualLastLine: last,
      visualFrom: opening.from,
      visualTo: lines[last]?.to ?? opening.to,
      suggestedTitle: "",
      replacementText: "",
      sourceTableIndex: null,
    });
    index = lastWithId;
  }
  return output;
}

function codeObjects(lines: readonly SemanticSourceLine[]): CaptionObject[] {
  const output: CaptionObject[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index];
    if (opening == null || opening.available) continue;
    if (index > 0 && lines[index - 1]?.available === false) continue;
    const match = /^ {0,3}(`{3,}|~{3,})[^\r\n]*$/u.exec(opening.text);
    const run = match?.[1];
    if (run == null) continue;
    const character = run[0] ?? "`";
    const closingPattern = new RegExp(`^ {0,3}${character === "`" ? "`" : "~"}{${run.length},}[ \\t]*$`, "u");
    let last = index + 1;
    while (last < lines.length && !closingPattern.test(lines[last]?.text ?? "")) last += 1;
    if (last >= lines.length) continue;
    const lastWithId = includeFollowingBlockId(lines, last);
    output.push({
      kind: "Code",
      firstLine: index,
      lastLine: lastWithId,
      from: opening.from,
      to: lines[lastWithId]?.to ?? opening.to,
      visualFirstLine: index,
      visualLastLine: last,
      visualFrom: opening.from,
      visualTo: lines[last]?.to ?? opening.to,
      suggestedTitle: "",
      replacementText: "",
      sourceTableIndex: null,
    });
    index = lastWithId;
  }
  return output;
}

export function scanCaptionObjects(source: string): CaptionObject[] {
  const lines = scanSemanticSourceLines(source);
  return [
    ...imageObjects(lines),
    ...tableObjects(lines),
    ...equationObjects(lines),
    ...codeObjects(lines),
  ].sort((left, right) => left.from - right.from || left.to - right.to);
}

function adjacentCaption(
  object: CaptionObject,
  captionsByLine: ReadonlyMap<number, ParsedCaption>,
  lines: readonly SemanticSourceLine[],
  placement: CaptionSourcePlacement,
): ParsedCaption | null {
  const start = placement === "above" ? object.firstLine - 1 : object.lastLine + 1;
  const direction = placement === "above" ? -1 : 1;
  let blanks = 0;
  let standaloneBlockIds = 0;
  for (let index = start; index >= 0 && index < lines.length; index += direction) {
    const line = lines[index];
    if (line == null || !line.available) return null;
    if (line.text.trim().length === 0) {
      blanks += 1;
      if (blanks > 1) return null;
      continue;
    }
    if (STANDALONE_BLOCK_ID.test(line.text)) {
      standaloneBlockIds += 1;
      if (standaloneBlockIds > 1) return null;
      continue;
    }
    return captionsByLine.get(line.number) ?? null;
  }
  return null;
}

interface CaptionBindingCandidate {
  readonly caption: ParsedCaption;
  readonly object: CaptionObject;
  readonly sourcePlacement: CaptionSourcePlacement;
}

export function bindCaptionObjects(source: string): BoundCaptionObject[] {
  const lines = scanSemanticSourceLines(source);
  const captions = parseDocumentSemantics(source).captions;
  const captionsByLine = new Map(captions.map((caption) => [caption.line, caption]));
  const objects = scanCaptionObjects(source);
  const candidates: CaptionBindingCandidate[] = [];
  for (const object of objects) {
    for (const sourcePlacement of ["above", "below"] as const) {
      const caption = adjacentCaption(object, captionsByLine, lines, sourcePlacement);
      if (caption != null) candidates.push({ caption, object, sourcePlacement });
    }
  }
  const captionDegrees = new Map<number, number>();
  const objectDegrees = new Map<CaptionObject, number>();
  for (const candidate of candidates) {
    captionDegrees.set(candidate.caption.line, (captionDegrees.get(candidate.caption.line) ?? 0) + 1);
    objectDegrees.set(candidate.object, (objectDegrees.get(candidate.object) ?? 0) + 1);
  }
  return candidates
    .filter((candidate) => (
      captionDegrees.get(candidate.caption.line) === 1
      && objectDegrees.get(candidate.object) === 1
    ))
    .sort((left, right) => left.caption.line - right.caption.line);
}

export function captionObjectAtOffset(source: string, offset: number): CaptionObject | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) return null;
  return scanCaptionObjects(source).find((object) => offset >= object.from && offset <= object.to) ?? null;
}

export function imageTextAtOffset(source: string, offset: number): ImageText | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) return null;
  const line = scanSemanticSourceLines(source).find((candidate) => (
    candidate.available && offset >= candidate.from && offset <= candidate.to
  ));
  return line == null ? null : imageTextAtLineOffset(line.text, offset - line.from);
}
