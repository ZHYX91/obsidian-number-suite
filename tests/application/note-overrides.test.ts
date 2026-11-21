import { describe, expect, it } from "vitest";

import {
  NOTE_OVERRIDE_KEYS,
  applyNoteOverrideChange,
  readNoteControlSnapshot,
} from "../../src/application/note-overrides";
import { parseNoteOverrides, resolveNoteSettings } from "../../src/config/frontmatter";
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

  it("uses saved conceal scope only during explicit note concealment", () => {
    const settings = { ...DEFAULT_SETTINGS, concealScope: "templates" as const, cleanupScope: "plugin" as const };
    const values: Record<string, unknown> = { "number-suite": ["heading.hide-stored=true"] };
    const effective = () => resolveNoteSettings(settings, parseNoteOverrides(values));
    expect(effective()).toMatchObject({ concealStoredNumbers: true, concealScope: "templates", cleanupScope: "plugin" });
    applyNoteOverrideChange(values, { kind: "conceal-scope", value: "common" });
    expect(effective()).toMatchObject({ concealStoredNumbers: true, concealScope: "common", cleanupScope: "plugin" });
    applyNoteOverrideChange(values, { kind: "conceal-stored", value: "off" });
    expect(effective()).toMatchObject({ concealStoredNumbers: false, concealScope: "templates" });
    applyNoteOverrideChange(values, { kind: "conceal-stored", value: "inherit" });
    expect(values).toEqual({ "number-suite": ["heading.hide-stored-scope=common"] });
    expect(resolveNoteSettings({ ...settings, concealStoredNumbers: true }, parseNoteOverrides(values)))
      .toMatchObject({ concealStoredNumbers: true, concealScope: "templates" });
    applyNoteOverrideChange(values, { kind: "conceal-stored", value: "on" });
    expect(effective().concealScope).toBe("common");
    applyNoteOverrideChange(values, { kind: "conceal-scope", value: null });
    expect(values).toEqual({ "number-suite": ["heading.hide-stored=true"] });
    expect(effective().concealScope).toBe("templates");
    expect(parseNoteOverrides({ "number-suite": ["heading.hide-stored-scope=inherit"] }).issues)
      .toMatchObject([{ code: "invalid-value", field: "heading.hide-stored-scope" }]);
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

  it("stores each skip scope independently and removes all three fields for a level", () => {
    const values = { "number-suite": ["heading.first-number.h2=4", "heading.skip-first.h2=1"], title: "keep" };
    expect(readNoteControlSnapshot(values, DEFAULT_SETTINGS)).toMatchObject({ skipFirst: { 2: 1 }, skipPerParent: {} });
    expect(applyNoteOverrideChange(values, { kind: "skip-per-parent", level: 2, value: 3 })).toBe(true);
    expect(readNoteControlSnapshot(values, DEFAULT_SETTINGS)).toMatchObject({
      valid: true, firstNumbers: { 2: 4 }, skipFirst: { 2: 1 }, skipPerParent: { 2: 3 },
    });
    expect(applyNoteOverrideChange(values, { kind: "skip-per-parent", level: 2, value: 3 })).toBe(false);
    applyNoteOverrideChange(values, { kind: "skip-first", level: 2, value: null });
    expect(values["number-suite"]).toEqual(["heading.first-number.h2=4", "heading.skip-per-parent.h2=3"]);
    applyNoteOverrideChange(values, { kind: "skip-first", level: 2, value: 1 });
    applyNoteOverrideChange(values, { kind: "skip-per-parent", level: 2, value: 0 });
    expect(values["number-suite"]).toEqual(["heading.first-number.h2=4", "heading.skip-first.h2=1"]);
    applyNoteOverrideChange(values, { kind: "skip-per-parent", level: 2, value: 3 });
    applyNoteOverrideChange(values, { kind: "skip-per-parent", level: 9, value: 2 });
    applyNoteOverrideChange(values, { kind: "remove-level-rule", level: 2 });
    expect(values).toEqual({ "number-suite": ["heading.skip-per-parent.h9=2"], title: "keep" });
  });

  it("rejects H1 for the per-parent scope without changing Properties", () => {
    const values = { title: "keep" };
    expect(() => applyNoteOverrideChange(values, { kind: "skip-per-parent", level: 1, value: 2 })).toThrow();
    expect(values).toEqual({ title: "keep" });
  });

  it.each([
    "heading.first-number.h0=2",
    "heading.first-number.h10=2",
    "heading.first-number.foo=2",
    "heading.skip-first.h0=2",
    "heading.skip-first.h10=2",
    "heading.skip-first.foo=2",
  ])("preserves %s when an unrelated control change is rejected", (directive) => {
    const values: Record<string, unknown> = {
      "number-suite": [directive],
      tags: ["keep"],
    };
    const before = structuredClone(values);

    expect(() => applyNoteOverrideChange(values, { kind: "show-virtual", value: "on" }))
      .toThrow(`Invalid number-suite item: ${directive}`);
    expect(values).toEqual(before);
    expect(readNoteControlSnapshot(values, DEFAULT_SETTINGS).valid).toBe(false);
  });

  it("preserves valid H1 and H9 overrides while changing an unrelated control", () => {
    const entries = [
      "heading.first-number.h1=2",
      "heading.first-number.h9=3",
      "heading.skip-first.h1=1",
      "heading.skip-first.h9=2",
    ];
    const values: Record<string, unknown> = { "number-suite": [...entries], tags: ["keep"] };

    expect(applyNoteOverrideChange(values, { kind: "show-virtual", value: "on" })).toBe(true);
    expect(values).toEqual({ "number-suite": ["heading.virtual=true", ...entries], tags: ["keep"] });
    expect(readNoteControlSnapshot(values, DEFAULT_SETTINGS).valid).toBe(true);
  });
});
