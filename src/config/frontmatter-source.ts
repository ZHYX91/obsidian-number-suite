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

export function notePropertySourceIssues(frontmatter: string): NotePropertyIssue[] {
  const counts = new Map<string, number>();
  const issues: NotePropertyIssue[] = [];
  for (const line of frontmatter.split(/\r?\n/u)) {
    if (/^\s/u.test(line)) continue;
    for (const key of KNOWN_KEYS) {
      const pattern = escapePattern(key);
      if (new RegExp(`^${pattern}\\s*:`, "u").test(line)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (new RegExp(`^["']${pattern}["']\\s*:`, "u").test(line)) {
        issues.push({
          code: "source-ambiguous",
          field: "all",
          message: `Quoted Number Suite property key requires manual review: ${key}`,
        });
      }
    }
  }
  for (const [key, count] of counts) {
    if (count > 1) issues.push({
      code: "source-ambiguous",
      field: "all",
      message: `Duplicate Number Suite property key requires manual review: ${key}`,
    });
  }
  return issues;
}

export function parseNoteOverridesFromSource(source: string): NoteOverrides | null {
  try {
    const info = getFrontMatterInfo(source);
    return info.exists
      ? withNotePropertyIssues(parseNoteOverrides(parseYaml(info.frontmatter)), notePropertySourceIssues(info.frontmatter))
      : parseNoteOverrides(null);
  } catch {
    return null;
  }
}

export function parseFrontmatterRecordFromSource(source: string): Record<string, unknown> | null {
  try {
    const info = getFrontMatterInfo(source);
    if (!info.exists) return {};
    if (notePropertySourceIssues(info.frontmatter).length > 0) return null;
    const value: unknown = parseYaml(info.frontmatter);
    if (value == null) return {};
    return typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
