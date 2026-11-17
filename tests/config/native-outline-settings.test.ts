import { describe, expect, it } from "vitest";
import { createTranslator } from "../../src/config/i18n";
import { UI_LOCALES } from "../../src/config/language-options";
import { DEFAULT_SETTINGS, sanitizeSettings, normalizePluginData } from "../../src/config/settings";
import { applySettingsControlValue, getSettingsControlValue } from "../../src/app/settings-control-contract";

const controls = [
  ["outline.showNumbers", "showOutlineNumbers"],
  ["outline.showExtendedHeadings", "showOutlineExtendedHeadings"],
  ["outline.showCaptions", "showOutlineCaptions"],
] as const;

describe("native Outline enhancement settings", () => {
  it("defaults all three controls on without changing the source display setting", () => {
    expect(DEFAULT_SETTINGS.showVirtualNumbers).toBe(false);
    for (const [key, field] of controls) {
      expect(DEFAULT_SETTINGS[field]).toBe(true);
      expect(getSettingsControlValue(DEFAULT_SETTINGS, key)).toBe(true);
      const disabled = applySettingsControlValue(DEFAULT_SETTINGS, key, false);
      expect(disabled.settings[field]).toBe(false);
      expect(disabled.impact).toBe("display");
      for (const [other, otherField] of controls) {
        if (other !== key) expect(disabled.settings[otherField]).toBe(true);
      }
      expect(disabled.settings.showVirtualNumbers).toBe(false);
    }
  });

  it("preserves explicit false settings when upgrading an existing data file", () => {
    const raw = Object.fromEntries(controls.map(([, field]) => [field, false]));
    const saved = normalizePluginData({ schemaVersion: 1, settings: raw });
    expect(saved.state).toBe("writable");
    if (saved.state === "writable") {
      for (const [, field] of controls) expect(saved.data.settings[field]).toBe(false);
    }
    for (const [, field] of controls) {
      expect(sanitizeSettings({ [field]: "false" })[field]).toBe(true);
    }
  });

  it("provides localized labels and descriptions in every supported language", () => {
    const en = createTranslator("en");
    for (const locale of UI_LOCALES) {
      const t = createTranslator(locale);
      for (const key of [
        "settings.tab.outline",
        "settings.outline.showNumbers",
        "settings.outline.showNumbers.desc",
        "settings.outline.showExtended",
        "settings.outline.showExtended.desc",
        "settings.outline.showCaptions",
        "settings.outline.showCaptions.desc",
      ] as const) {
        expect(t(key).trim()).not.toBe("");
        if (locale !== "en") expect(t(key)).not.toBe(en(key));
      }
    }
  });
});
