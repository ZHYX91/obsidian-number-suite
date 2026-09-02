import { describe, expect, it } from "vitest";

import {
  NOTE_OVERRIDE_KEYS,
  applyNoteOverrideChange,
  readNoteControlSnapshot,
} from "../../src/application/note-overrides";
import { DEFAULT_SETTINGS } from "../../src/config/settings";

describe("current note overrides", () => {
  it("leaves an untouched note fully inherited without creating properties", () => {
    const values: Record<string, unknown> = {};
    const snapshot = readNoteControlSnapshot(values, DEFAULT_SETTINGS);

    expect(snapshot).toMatchObject({
      showVirtual: "inherit",
      concealStored: "inherit",
      schemeId: null,
      ignore: false,
      effectiveShowVirtual: DEFAULT_SETTINGS.showVirtualNumbers,
      effectiveConcealStored: DEFAULT_SETTINGS.concealStoredNumbers,
      effectiveSchemeId: DEFAULT_SETTINGS.selectedSchemeId,
      hasAnyOverride: false,
    });
    expect(applyNoteOverrideChange(values, { kind: "reset" })).toBe(false);
    expect(values).toEqual({});
  });

  it("stores the two display choices independently, including explicit false", () => {
    const values: Record<string, unknown> = {};
    expect(applyNoteOverrideChange(values, { kind: "show-virtual", value: "on" })).toBe(true);
    expect(applyNoteOverrideChange(values, { kind: "conceal-stored", value: "off" })).toBe(true);

    expect(values).toEqual({
      "number-suite": ["heading.virtual=true", "heading.hide-stored=false"],
    });
    expect(readNoteControlSnapshot(values, DEFAULT_SETTINGS)).toMatchObject({
      showVirtual: "on",
      concealStored: "off",
      effectiveShowVirtual: true,
      effectiveConcealStored: false,
    });
  });

  it("deletes a property when its control returns to follow global", () => {
    const values = {
      "number-suite-show-virtual": false,
      unrelated: "kept",
    } as Record<string, unknown>;

    expect(applyNoteOverrideChange(values, { kind: "show-virtual", value: "inherit" })).toBe(true);
    expect(values).toEqual({ unrelated: "kept" });
  });

  it("writes explicit ignore once and treats an identical request as a no-op", () => {
    const values: Record<string, unknown> = {};
    expect(applyNoteOverrideChange(values, { kind: "ignore", value: true })).toBe(true);
    expect(applyNoteOverrideChange(values, { kind: "ignore", value: true })).toBe(false);
    expect(values).toEqual({ "number-suite": ["disabled=true"] });
  });

  it("uses only selectable scheme IDs and restores inheritance by deletion", () => {
    const values: Record<string, unknown> = {};
    applyNoteOverrideChange(values, { kind: "scheme", value: "legal" });
    expect(values).toEqual({ "number-suite": ["heading.scheme=legal"] });
    applyNoteOverrideChange(values, { kind: "scheme", value: null });
    expect(values).toEqual({});
  });

  it("fails closed when a stored scheme is unavailable", () => {
    const snapshot = readNoteControlSnapshot(
      { "number-suite-scheme": "missing-scheme" },
      DEFAULT_SETTINGS,
    );
    expect(snapshot.schemeId).toBe("missing-scheme");
    expect(snapshot.effectiveSchemeId).toBe(DEFAULT_SETTINGS.selectedSchemeId);
    expect(snapshot.valid).toBe(false);
  });

  it("uses an available custom scheme as the effective note scheme", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      customSchemes: [{
        id: "custom-one",
        name: "Custom one",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "", "", "", "", ""],
        exclusions: [],
      }],
    };
    const snapshot = readNoteControlSnapshot(
      { "number-suite-scheme": "custom-one" },
      settings,
    );
    expect(snapshot.effectiveSchemeId).toBe("custom-one");
  });

  it("reset removes every plugin override and preserves unrelated Properties", () => {
    const values: Record<string, unknown> = Object.fromEntries(
      NOTE_OVERRIDE_KEYS.map((key) => [key, true]),
    );
    values["tags"] = ["keep"];

    expect(applyNoteOverrideChange(values, { kind: "reset" })).toBe(true);
    expect(values).toEqual({ tags: ["keep"] });
  });

  it("writes first-number and skip-first separately and migrates legacy fields", () => {
    const values: Record<string, unknown> = {
      "number-suite-start": { h2: 3 },
      "number-suite-clean-scope": "common",
      tags: ["keep"],
    };
    expect(applyNoteOverrideChange(values, { kind: "skip-first", level: 2, value: 2 })).toBe(true);
    expect(values).toEqual({
      "number-suite": ["heading.first-number.h2=3", "heading.skip-first.h2=2"],
      tags: ["keep"],
    });
  });

  it("can migrate equivalent legacy values without changing their meaning", () => {
    const values: Record<string, unknown> = {
      "number-suite-show-virtual": true,
      "number-suite-conceal-stored": false,
      "number-suite-scheme": "legal",
    };
    expect(applyNoteOverrideChange(values, { kind: "migrate" })).toBe(true);
    expect(values).toEqual({
      "number-suite": [
        "heading.virtual=true",
        "heading.hide-stored=false",
        "heading.scheme=legal",
      ],
    });
  });
});
