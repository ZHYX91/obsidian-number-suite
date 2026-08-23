import { describe, expect, it } from "vitest";

import { firstAvailableScheme } from "../../src/app/scheme-settings-renderer";
import { cloneSettings, DEFAULT_SETTINGS } from "../../src/config/settings";
import { BUILT_IN_SCHEME_IDS } from "../../src/core/types";

describe("scheme settings renderer", () => {
  it("restores the default scheme when deleting the last visible option", () => {
    const settings = cloneSettings({
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "custom-only",
      customSchemes: [{
        id: "custom-only",
        name: "Only custom scheme",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "", "", "", "", ""],
        exclusions: [],
      }],
      hiddenBuiltInSchemeIds: [...BUILT_IN_SCHEME_IDS],
    });

    expect(firstAvailableScheme(settings, "custom-only")).toBe("hierarchical-h2");
    expect(settings.hiddenBuiltInSchemeIds).not.toContain("hierarchical-h2");
  });
});
