import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizePluginData,
  sanitizeSettings,
} from "../../src/config/settings";
import {
  applySettingsControlValue,
  getSettingsControlValue,
} from "../../src/app/settings-control-contract";

describe("native Wiki link enhancement setting", () => {
  it("is off by default, including for existing saved settings without the new field", () => {
    expect(DEFAULT_SETTINGS.enhanceNativeWikiHeadingLinks).toBe(false);
    const data = normalizePluginData({
      schemaVersion: 1,
      settings: { showCrossReferences: true },
    });
    expect(data.state).toBe("writable");
    if (data.state === "writable") {
      expect(data.data.settings.enhanceNativeWikiHeadingLinks).toBe(false);
    }
  });

  it("preserves both explicit true and explicit false across sanitization", () => {
    expect(sanitizeSettings({ enhanceNativeWikiHeadingLinks: true }).enhanceNativeWikiHeadingLinks).toBe(true);
    expect(sanitizeSettings({ enhanceNativeWikiHeadingLinks: false }).enhanceNativeWikiHeadingLinks).toBe(false);
    expect(sanitizeSettings({ enhanceNativeWikiHeadingLinks: "yes" }).enhanceNativeWikiHeadingLinks).toBe(false);
  });

  it("has an independent UI control and refreshes only display consumers", () => {
    const key = "references.enhanceNativeWikiHeadingLinks";
    const enabled = applySettingsControlValue(DEFAULT_SETTINGS, key, true);
    expect(enabled.settings.enhanceNativeWikiHeadingLinks).toBe(true);
    expect(enabled.settings.showCrossReferences).toBe(DEFAULT_SETTINGS.showCrossReferences);
    expect(enabled.impact).toBe("display");
    expect(getSettingsControlValue(enabled.settings, key)).toBe(true);
    const disabled = applySettingsControlValue(enabled.settings, key, false);
    expect(disabled.settings.enhanceNativeWikiHeadingLinks).toBe(false);
  });
});
