import { describe, expect, it } from "vitest";

import { createTranslator } from "../../src/config/i18n";
import { noteSchemeOptions } from "../../src/config/scheme-labels";
import { DEFAULT_SETTINGS, cloneSettings } from "../../src/config/settings";

describe("current note scheme options", () => {
  it("lists available built-in and custom schemes without an editable ID field", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.disabledBuiltInSchemeIds = ["legal"];
    settings.customSchemes = [{
      id: "custom-one",
      name: "My scheme",
      revision: 1,
      baseLevel: 1,
      templates: ["{1.arabic}", "", "", "", "", ""],
      exclusions: [],
    }];

    expect(noteSchemeOptions(settings, null, (key) => key)).toEqual(expect.arrayContaining([
      ["hierarchical", "scheme.hierarchical"],
      ["custom-one", "My scheme"],
    ]));
    expect(noteSchemeOptions(settings, null, (key) => key).map(([id]) => id)).not.toContain("legal");
  });

  it("keeps a removed or unavailable current value visible so it is not silently lost", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.disabledBuiltInSchemeIds = ["legal"];
    const t = createTranslator("en");
    expect(noteSchemeOptions(settings, "legal", t)).toContainEqual([
      "legal",
      `${t("scheme.legal")} (disabled)`,
    ]);
    expect(noteSchemeOptions(settings, "missing", (key, variables) => (
      `${key}:${variables?.["id"] ?? ""}`
    ))).toContainEqual(["missing", "panel.scheme.unavailable:missing"]);
  });
});
