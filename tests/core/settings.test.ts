import { describe, expect, it } from "vitest";

import { parseNoteOverrides, resolveNoteSettings } from "../../src/config/frontmatter";
import type { HeadingExclusionRule } from "../../src/core/types";
import {
  DEFAULT_SETTINGS,
  centeredCaptionKinds,
  cleanupTemplateSources,
  sanitizeLastBatch,
  normalizePluginData,
  sanitizeSettings,
} from "../../src/config/settings";

describe("settings", () => {
  it("falls back safely from malformed persisted data", () => {
    const settings = sanitizeSettings({
      showVirtualNumbers: "yes",
      virtualOpacity: -2,
      centerFigureCaptions: "yes",
      noteDisplayMode: "numbers",
      excludedFolders: ["/Private/", "Private", 12],
    });
    expect(settings.showVirtualNumbers).toBe(DEFAULT_SETTINGS.showVirtualNumbers);
    expect(settings.virtualOpacity).toBe(0.15);
    expect(settings.centerFigureCaptions).toBe(true);
    expect(settings.noteDisplayMode).toBe("formatted");
    expect(settings.excludedFolders).toEqual(["Private"]);
    expect(normalizePluginData(null)).toEqual({
      state: "writable",
      data: { schemaVersion: 1, settings: DEFAULT_SETTINGS },
    });
  });

  it("sanitizes independent caption alignment and Live Preview note display settings", () => {
    const settings = sanitizeSettings({
      centerFigureCaptions: false,
      centerTableCaptions: true,
      centerEquationCaptions: false,
      centerCodeCaptions: true,
      noteDisplayMode: "source",
      figureCaptionPlacement: "below",
      tableCaptionPlacement: "sideways",
      showImageCaptionTooltips: false,
    });
    expect(centeredCaptionKinds(settings)).toEqual(["Table", "Code"]);
    expect(settings.noteDisplayMode).toBe("source");
    expect(settings.figureCaptionPlacement).toBe("below");
    expect(settings.tableCaptionPlacement).toBe("above");
    expect(settings.showImageCaptionTooltips).toBe(false);
  });

  it("normalizes schema 1 and explicitly leaves unsupported unversioned data at defaults", () => {
    expect(normalizePluginData({ showVirtualNumbers: true })).toEqual({
      state: "writable",
      data: { schemaVersion: 1, settings: DEFAULT_SETTINGS },
    });
    expect(normalizePluginData({ settings: { showVirtualNumbers: true } })).toEqual({
      state: "writable",
      data: { schemaVersion: 1, settings: DEFAULT_SETTINGS },
    });
    const current = normalizePluginData({
      schemaVersion: 1,
      settings: { showVirtualNumbers: true },
    });
    expect(current).toMatchObject({
      state: "writable",
      data: { schemaVersion: 1, settings: { showVirtualNumbers: true } },
    });
    expect(current.state).toBe("writable");
    if (current.state === "writable") expect(normalizePluginData(current.data)).toEqual(current);
  });

  it("classifies future schemas as incompatible without mutating their data", () => {
    const stored = {
      schemaVersion: 2,
      settings: {
        showVirtualNumbers: true,
        futureField: { enabled: true },
      },
      futureEnvelopeField: ["keep-me"],
    };
    const before = structuredClone(stored);

    expect(normalizePluginData(stored)).toEqual({
      state: "incompatible",
      schemaVersion: 2,
      settings: DEFAULT_SETTINGS,
    });
    expect(stored).toEqual(before);
  });

  it("keeps settings normalization pure, idempotent, and deeply detached", () => {
    const stored = {
      excludedFolders: ["Private"],
      customSchemes: [{
        id: "custom-guide",
        name: "Guide",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "", "", "", "", ""],
        exclusions: [{ title: "Appendix", scope: "subtree" }],
      }],
    };
    const before = structuredClone(stored);
    const first = sanitizeSettings(stored);
    const second = sanitizeSettings(first);

    expect(second).toEqual(first);
    first.excludedFolders.push("Archive");
    const custom = first.customSchemes[0];
    if (custom != null) {
      (custom.templates as string[]).push("future mutation");
      (custom.exclusions as HeadingExclusionRule[]).push({ title: "Notes", scope: "heading" });
    }
    expect(stored).toEqual(before);
  });

  it("parses and resolves independent per-note overrides", () => {
    const overrides = parseNoteOverrides({
      "number-suite-show-virtual": true,
      "number-suite-conceal-stored": true,
      "number-suite-scheme": "legal",
      "number-suite-clean-scope": "common",
      "number-suite-start": { h2: 3, h7: 9 },
    });
    expect(resolveNoteSettings(DEFAULT_SETTINGS, overrides)).toMatchObject({
      disabled: false,
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      schemeId: "legal",
      cleanupScope: DEFAULT_SETTINGS.cleanupScope,
      starts: { 2: 3, 7: 9 },
    });
  });

  it("pads legacy six-level custom templates without enabling H7-H9", () => {
    const configured = sanitizeSettings({
      customSchemes: [{
        id: "custom-legacy",
        name: "Legacy",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "{2.arabic}", "", "", "", ""],
      }],
    });
    expect(configured.customSchemes[0]?.templates).toHaveLength(9);
    expect(configured.customSchemes[0]?.templates.slice(6)).toEqual(["", "", ""]);
  });

  it("ignores properties that are not part of the new project contract", () => {
    expect(parseNoteOverrides({
      "unrelated-display-mode": "off",
      "unrelated-clean-confidence": "medium",
    })).toMatchObject({
      disabled: false,
      showVirtualNumbers: null,
      concealStoredNumbers: null,
    });
    expect(parseNoteOverrides({ "number-suite-ignore": true }).disabled).toBe(true);
  });

  it("parses the Properties-friendly number-suite directive list", () => {
    const overrides = parseNoteOverrides({
      "number-suite": [
        "heading.virtual=true",
        "heading.hide-stored=false",
        "heading.scheme=hierarchical-h2",
        "heading.first-number.h2=3",
        "heading.skip-first.h1=1",
        "heading.skip-first.h2=2",
      ],
    });
    expect(overrides).toMatchObject({
      showVirtualNumbers: true,
      concealStoredNumbers: false,
      schemeId: "hierarchical-h2",
      starts: { 2: 3 },
      skipFirst: { 1: 1, 2: 2 },
      issues: [],
    });
  });

  it("blocks duplicate, unknown, invalid, and conflicting directives", () => {
    expect(parseNoteOverrides({
      "number-suite": ["heading.virtual=true", "heading.virtual=false", "future=value"],
    }).issues.map(({ code }) => code)).toEqual(["duplicate-directive", "unknown-directive"]);
    expect(parseNoteOverrides({
      "number-suite": ["heading.skip-first.h2=-1"],
    }).issues[0]?.code).toBe("invalid-value");
    expect(parseNoteOverrides({
      "number-suite": ["heading.virtual=true"],
      "number-suite-show-virtual": false,
    }).issues[0]?.code).toBe("conflict");
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

  it("migrates unsafe custom and cleanup-history templates out of persisted settings", () => {
    const configured = sanitizeSettings({
      selectedSchemeId: "custom-unsafe",
      customSchemes: [{
        id: "custom-unsafe",
        name: "Unsafe",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.letter_lower}", "", "", "", "", ""],
        exclusions: [],
      }],
      cleanupHistory: [{
        schemeId: "custom-unsafe",
        schemeName: "Unsafe",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.roman_lower}", "", "", "", "", ""],
      }],
    });

    expect(configured.selectedSchemeId).toBe(DEFAULT_SETTINGS.selectedSchemeId);
    expect(configured.customSchemes).toEqual([]);
    expect(configured.cleanupHistory).toEqual([]);
    expect(cleanupTemplateSources(configured).some((source) => source.schemeId === "custom-unsafe"))
      .toBe(false);
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
