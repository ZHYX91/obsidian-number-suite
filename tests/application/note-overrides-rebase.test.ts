import { describe, expect, it } from "vitest";

import {
  applyNoteOverrideChange,
  NoteOverrideFieldConflictError,
  rebaseNoteOverrideDraft,
} from "../../src/application/note-overrides";
import { parseNoteOverrides } from "../../src/config/frontmatter";

describe("note override conflict rebasing", () => {
  it("replays only fields changed in the pane and preserves concurrent edits to other fields", () => {
    const acknowledged: Record<string, unknown> = {
      title: "Keep",
      "number-suite": ["heading.virtual=true", "heading.scheme=hierarchical-h2"],
    };
    const desired = structuredClone(acknowledged);
    applyNoteOverrideChange(desired, { kind: "show-virtual", value: "off" });

    const current: Record<string, unknown> = {
      title: "Keep",
      owner: "external",
      "number-suite": [
        "heading.virtual=true",
        "heading.scheme=legal",
        "heading.skip-first.h2=2",
      ],
    };
    const rebased = rebaseNoteOverrideDraft(current, acknowledged, desired);
    const parsed = parseNoteOverrides(rebased);

    expect(rebased.owner).toBe("external");
    expect(parsed.showVirtualNumbers).toBe(false);
    expect(parsed.schemeId).toBe("legal");
    expect(parsed.skipFirst[2]).toBe(2);
  });

  it("requires an explicit decision before replacing divergent edits to the same field", () => {
    const acknowledged: Record<string, unknown> = {
      "number-suite": ["heading.scheme=hierarchical-h2"],
    };
    const desired = structuredClone(acknowledged);
    applyNoteOverrideChange(desired, { kind: "scheme", value: "legal" });
    const current: Record<string, unknown> = {
      "number-suite": ["heading.scheme=chinese-official"],
    };

    expect(() => rebaseNoteOverrideDraft(current, acknowledged, desired)).toThrow(NoteOverrideFieldConflictError);
    const parsed = parseNoteOverrides(rebaseNoteOverrideDraft(current, acknowledged, desired, true));
    expect(parsed.schemeId).toBe("legal");
  });

  it("accepts convergent edits and preserves an unrelated concurrent counter", () => {
    const current = { "number-suite": ["heading.first-number.h1=3", "heading.skip-first.h2=4"] };
    const base = { "number-suite": ["heading.first-number.h1=2"] };
    const draft = { "number-suite": ["heading.first-number.h1=3"] };
    expect(parseNoteOverrides(rebaseNoteOverrideDraft(current, base, draft)).skipFirst[2]).toBe(4);
    expect(current["number-suite"]).toHaveLength(2);
  });

  it("detects reset conflicts and does not mutate invalid or concurrent Properties", () => {
    const current = { "number-suite": ["heading.first-number.h1=7"] };
    const base = { "number-suite": ["heading.first-number.h1=2"] };
    expect(() => rebaseNoteOverrideDraft(current, base, {})).toThrow(NoteOverrideFieldConflictError);
    expect(current["number-suite"]).toEqual(["heading.first-number.h1=7"]);
    expect(() => rebaseNoteOverrideDraft({ "number-suite": ["invalid"] }, base, {})).toThrow();
  });

  it("can finish an explicit legacy migration against fresh concurrent values", () => {
    const acknowledged: Record<string, unknown> = {
      "number-suite-show-virtual": true,
    };
    const desired = structuredClone(acknowledged);
    applyNoteOverrideChange(desired, { kind: "migrate" });
    const current: Record<string, unknown> = {
      "number-suite-show-virtual": true,
      "number-suite-start": { h2: 3 },
    };

    const rebased = rebaseNoteOverrideDraft(current, acknowledged, desired);
    const parsed = parseNoteOverrides(rebased);
    expect(parsed.showVirtualNumbers).toBe(true);
    expect(parsed.starts[2]).toBe(3);
    expect(parsed.legacyKeysPresent).toEqual([]);
  });
});
