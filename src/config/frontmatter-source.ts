import { getFrontMatterInfo, parseYaml } from "obsidian";

import { parseNoteOverrides, type NoteOverrides } from "./frontmatter";

export function parseNoteOverridesFromSource(source: string): NoteOverrides | null {
  try {
    const info = getFrontMatterInfo(source);
    return info.exists
      ? parseNoteOverrides(parseYaml(info.frontmatter))
      : parseNoteOverrides(null);
  } catch {
    return null;
  }
}

export function parseFrontmatterRecordFromSource(source: string): Record<string, unknown> | null {
  try {
    const info = getFrontMatterInfo(source);
    if (!info.exists) return {};
    const value: unknown = parseYaml(info.frontmatter);
    if (value == null) return {};
    return typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
