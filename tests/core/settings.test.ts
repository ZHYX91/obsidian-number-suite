import { describe, expect, it } from "vitest";

import { parseNoteOverrides, resolveNoteSettings } from "../../src/config/frontmatter";
import {
  DEFAULT_SETTINGS,
  cleanupTemplateSources,
  sanitizeLastBatch,
  sanitizePluginData,
  sanitizeSettings,
} from "../../src/config/settings";

describe("settings", () => {
  it("falls back safely from malformed persisted data", () => {
    const settings = sanitizeSettings({
      showVirtualNumbers: "yes",
      virtualOpacity: -2,
      excludedFolders: ["/Private/", "Private", 12],
    });
    expect(settings.showVirtualNumbers).toBe(DEFAULT_SETTINGS.showVirtualNumbers);
    expect(settings.virtualOpacity).toBe(0.15);
    expect(settings.excludedFolders).toEqual(["Private"]);
    expect(sanitizePluginData(null)).toEqual({ schemaVersion: 1, settings: DEFAULT_SETTINGS });
  });

  it("accepts only the versioned persisted-data envelope", () => {
    expect(sanitizePluginData({ showVirtualNumbers: true }).settings.showVirtualNumbers).toBe(false);
    expect(sanitizePluginData({ settings: { showVirtualNumbers: true } }).settings.showVirtualNumbers).toBe(false);
    expect(sanitizePluginData({ schemaVersion: 2, settings: { showVirtualNumbers: true } })
      .settings.showVirtualNumbers).toBe(false);
    expect(sanitizePluginData({ schemaVersion: 1, settings: { showVirtualNumbers: true } })
      .settings.showVirtualNumbers).toBe(true);
  });

  it("parses and resolves independent per-note overrides", () => {
    const overrides = parseNoteOverrides({
      "structured-numbering-show-virtual": true,
      "structured-numbering-conceal-stored": true,
      "structured-numbering-scheme": "legal",
      "structured-numbering-clean-scope": "common",
      "structured-numbering-start": { h2: 3, h7: 9 },
    });
    expect(resolveNoteSettings(DEFAULT_SETTINGS, overrides)).toMatchObject({
      disabled: false,
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      schemeId: "legal",
      cleanupScope: "common",
      starts: { 2: 3 },
    });
  });

  it("ignores properties that are not part of the new project contract", () => {
    expect(parseNoteOverrides({
      "unrelated-display-mode": "off",
      "unrelated-clean-confidence": "medium",
    })).toMatchObject({
      disabled: false,
      showVirtualNumbers: null,
      concealStoredNumbers: null,
      cleanupScope: null,
    });
    expect(parseNoteOverrides({ "structured-numbering-ignore": true }).disabled).toBe(true);
  });

  it("keeps current and retired custom templates available to cleanup", () => {
    const configured = sanitizeSettings({
      selectedSchemeId: "custom-guide",
      customSchemes: [{
        id: "custom-guide",
        name: "Guide",
        revision: 2,
        baseLevel: 1,
        templates: ["Part {1.arabic}", "", "", "", "", ""],
      }],
      cleanupHistory: [{
        schemeId: "custom-guide",
        schemeName: "Guide",
        revision: 1,
        baseLevel: 1,
        templates: ["Old {1.roman_upper}", "", "", "", "", ""],
      }],
    });
    const sources = cleanupTemplateSources(configured);
    expect(sources.some((source) => source.schemeId === "custom-guide" && source.revision === 2)).toBe(true);
    expect(sources.some((source) => source.schemeId === "custom-guide" && source.revision === 1)).toBe(true);
  });

  it("sanitizes exact custom-scheme exclusions", () => {
    const configured = sanitizeSettings({
      customSchemes: [{
        id: "custom-guide",
        name: "Guide",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "", "", "", "", ""],
        exclusions: [
          { title: "  References  ", scope: "heading" },
          { title: "References", scope: "subtree" },
          { title: "Appendix", scope: "invalid" },
          { title: "", scope: "heading" },
        ],
      }],
    });
    expect(configured.customSchemes[0]?.exclusions).toEqual([
      { title: "References", scope: "heading" },
      { title: "Appendix", scope: "subtree" },
    ]);
  });

  it("retains all explicit cleanup-template history", () => {
    const cleanupHistory = Array.from({ length: 101 }, (_unused, index) => ({
      schemeId: "custom-guide",
      schemeName: "Guide",
      revision: index + 1,
      baseLevel: 1,
      templates: [`Part ${index + 1} {1.arabic}`, "", "", "", "", ""],
    }));
    const configured = sanitizeSettings({ cleanupHistory });
    expect(configured.cleanupHistory).toHaveLength(101);
    expect(cleanupTemplateSources(configured).some((source) => source.revision === 1)).toBe(true);
  });

  it("rejects custom schemes with invalid cross-level template semantics", () => {
    expect(sanitizeSettings({
      selectedSchemeId: "custom-invalid",
      customSchemes: [{
        id: "custom-invalid",
        name: "Invalid",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}.{2.arabic}", "Part {1.arabic}", "", "", "", ""],
        exclusions: [],
      }],
    })).toMatchObject({
      selectedSchemeId: DEFAULT_SETTINGS.selectedSchemeId,
      customSchemes: [],
    });
  });

  it("never hides the selected built-in scheme during sanitization", () => {
    const configured = sanitizeSettings({
      selectedSchemeId: "legal",
      hiddenBuiltInSchemeIds: ["legal", "legal", "hierarchical"],
    });
    expect(configured.hiddenBuiltInSchemeIds).toEqual(["hierarchical"]);
  });

  it("accepts only hash-bound recovery snapshots", () => {
    expect(sanitizeLastBatch({
      createdAt: "2026-08-23T00:00:00.000Z",
      operation: "write",
      status: "applied",
      files: [{ path: "note.md", before: "# A", afterHash: "sha256:abc" }],
    })?.files[0]).toEqual({
      path: "note.md",
      before: "# A",
      afterHash: "sha256:abc",
    });
    expect(sanitizeLastBatch({
      createdAt: "2026-08-23T00:00:00.000Z",
      operation: "write",
      status: "applied",
      files: [{ path: "note.md", before: "# A", after: "# 1 A" }],
    })).toBeNull();
  });
});
