import { describe, expect, it } from "vitest";

import { applySettingsControlValue } from "../../src/app/settings-control-contract";
import { DEFAULT_SETTINGS, normalizePluginData, sanitizeSettings } from "../../src/config/settings";

describe("stored heading number recognition", () => {
  it("retains the previous default and existing settings", () => {
    expect(sanitizeSettings({}).concealScope).toBe("templates");
    expect(sanitizeSettings({ concealScope: "plugin" }).concealScope).toBe("plugin");
    expect(sanitizeSettings({ concealScope: "templates" }).concealScope).toBe("templates");
    expect(sanitizeSettings({ concealScope: "unknown" }).concealScope).toBe("templates");
  });

  it("accepts and reloads common concealment independently of write and cleanup settings", () => {
    const initial = { ...DEFAULT_SETTINGS, cleanupScope: "plugin" as const };
    const change = applySettingsControlValue(initial, "general.concealScope", "common");
    expect(change.impact).toBe("display");
    expect(change.settings.concealScope).toBe("common");
    expect(change.settings.cleanupScope).toBe("plugin");
    expect(normalizePluginData({ schemaVersion: 1, settings: change.settings })).toMatchObject({
      state: "writable",
      data: { settings: { concealScope: "common", cleanupScope: "plugin" } },
    });
  });
});
