import { describe, expect, it } from "vitest";

import {
  applyNoteOverrideChange,
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

  it("lets the retained user draft win when both sides changed the same semantic field", () => {
    const acknowledged: Record<string, unknown> = {
      "number-suite": ["heading.scheme=hierarchical-h2"],
    };
    const desired = structuredClone(acknowledged);
    applyNoteOverrideChange(desired, { kind: "scheme", value: "legal" });
    const current: Record<string, unknown> = {
      "number-suite": ["heading.scheme=chinese-official"],
    };

    const parsed = parseNoteOverrides(rebaseNoteOverrideDraft(current, acknowledged, desired));
    expect(parsed.schemeId).toBe("legal");
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
