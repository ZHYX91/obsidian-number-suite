import { getFrontMatterInfo, parseYaml } from "obsidian";

import {
  LEGACY_NOTE_OVERRIDE_KEYS,
  NUMBER_SUITE_PROPERTY,
  parseNoteOverrides,
  withNotePropertyIssues,
  type NoteOverrides,
  type NotePropertyIssue,
} from "./frontmatter";

const KNOWN_KEYS = [NUMBER_SUITE_PROPERTY, ...LEGACY_NOTE_OVERRIDE_KEYS] as const;

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const knownKeyPattern = KNOWN_KEYS.map(escapePattern).join("|");
const plainKey = new RegExp(`^(${knownKeyPattern})[ \\t]*:(?=[ \\t]|$)`, "u");
const quotedKey = new RegExp(`^(["'])(${knownKeyPattern})\\1[ \\t]*:(?=[ \\t]|$)`, "u");

export function notePropertySourceIssues(frontmatter: string): NotePropertyIssue[] {
  const counts = new Map<string, number>();
  const issues: NotePropertyIssue[] = [];
  for (const line of frontmatter.split(/\r\n|\r|\n/u)) {
    const key = plainKey.exec(line)?.[1];
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
    const quoted = quotedKey.exec(line)?.[2];
    if (quoted !== undefined) {
      issues.push({
        code: "source-ambiguous",
        field: "all",
        message: `Quoted Number Suite property key requires manual review: ${quoted}`,
        details: { kind: "source-quoted-key", key: quoted },
      });
    }
  }
  for (const [key, count] of counts) {
    if (count > 1) issues.push({
      code: "source-ambiguous",
      field: "all",
      message: `Duplicate Number Suite property key requires manual review: ${key}`,
      details: { kind: "source-duplicate-key", key },
    });
  }
  return issues;
}

function readProperties(source: string): { record: Record<string, unknown>; issues: NotePropertyIssue[] } | null {
  try {
    const info = getFrontMatterInfo(source);
    if (!info.exists) return { record: {}, issues: [] };
    const value: unknown = parseYaml(info.frontmatter);
    if (value == null) {
      // Both an empty document and an explicit YAML null can parse to null.
      const empty = info.frontmatter.split(/\r\n|\r|\n/u).every((line) => /^\s*(?:#.*)?$/u.test(line));
      return empty ? { record: {}, issues: [] } : null;
    }
    if (Object.prototype.toString.call(value) !== "[object Object]") return null;
    return { record: value as Record<string, unknown>, issues: notePropertySourceIssues(info.frontmatter) };
  } catch {
    return null;
  }
}

export function parseNoteOverridesFromSource(source: string): NoteOverrides | null {
  const properties = readProperties(source);
  return properties == null ? null : withNotePropertyIssues(parseNoteOverrides(properties.record), properties.issues);
}

export function parseFrontmatterRecordFromSource(source: string): Record<string, unknown> | null {
  const properties = readProperties(source);
  return properties?.issues.length === 0 ? properties.record : null;
}
