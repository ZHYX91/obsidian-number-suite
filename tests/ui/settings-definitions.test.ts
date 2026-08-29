// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { App } from "obsidian";

import { NumberSuiteSettingTab } from "../../src/app/settings-tab";
import { cloneSettings, DEFAULT_SETTINGS } from "../../src/config/settings";

function createHost() {
  const host = {
    settings: cloneSettings(DEFAULT_SETTINGS),
    saveSettings: vi.fn(async (next) => {
      host.settings = cloneSettings(next);
    }),
    scheduleSettings: vi.fn((next) => {
      host.settings = cloneSettings(next);
    }),
    settingsSaveStatus: () => ({ state: "saved" as const, error: null }),
    subscribeSettingsSaveStatus: vi.fn(() => () => undefined),
    retrySettingsSave: vi.fn(async () => undefined),
  };
  return host;
}

describe("Obsidian 1.13 settings definitions", () => {
  it("retains seven native pages while the host falls back to the custom tablist", () => {
    const host = createHost();
    const tab = new NumberSuiteSettingTab(new App(), host as never);
    expect(tab.getSettingDefinitions()).toEqual([]);
    const definitions = tab.getDeclarativeSettingDefinitions();

    expect(definitions.map((definition) => "type" in definition ? definition.type : undefined)).toEqual([
      "page",
      "page",
      "page",
      "page",
      "page",
      "page",
      "page",
    ]);
    expect(definitions.map((definition) => "name" in definition ? definition.name : "")).toEqual([
      "General",
      "Heading numbering",
      "Captions",
      "Cross references",
      "Footnotes & endnotes",
      "Write and cleanup",
      "Display and batch",
    ]);
    const serialized = JSON.stringify(definitions);
    expect(serialized).toContain('"key":"general.showVirtualNumbers"');
    expect(serialized).toContain('"key":"general.concealStoredNumbers"');
    expect(serialized).toContain('"key":"captions.showCaptionNumbers"');
    expect(serialized).toContain('"key":"captions.centerFigure"');
    expect(serialized).toContain('"key":"captions.centerTable"');
    expect(serialized).toContain('"key":"captions.centerEquation"');
    expect(serialized).toContain('"key":"captions.centerCode"');
    expect(serialized).toContain('"key":"captions.figurePlacement"');
    expect(serialized).toContain('"key":"captions.tablePlacement"');
    expect(serialized).toContain('"key":"captions.equationPlacement"');
    expect(serialized).toContain('"key":"captions.codePlacement"');
    expect(serialized).toContain('"key":"captions.showImageCaptionTooltips"');
    expect(serialized).toContain('"key":"references.showCrossReferences"');
    expect(serialized).toContain('"key":"notes.showNoteNumbers"');
    expect(serialized).toContain('"key":"notes.displayMode"');
    expect(serialized).not.toContain('"key":"general.displayMode"');
    expect(tab.containerEl.querySelector("[role=tablist]")).toBeNull();
  });

  it("persists native control changes through the plugin host", async () => {
    const host = createHost();
    const tab = new NumberSuiteSettingTab(new App(), host as never);

    expect(tab.getControlValue("general.language")).toBe("auto");
    expect(tab.getControlValue("general.showVirtualNumbers")).toBe(false);
    await tab.setControlValue("general.language", "zh");
    await tab.setControlValue("general.showVirtualNumbers", true);
    await tab.setControlValue("general.concealStoredNumbers", true);
    await tab.setControlValue("captions.showCaptionNumbers", false);
    await tab.setControlValue("captions.centerFigure", false);
    await tab.setControlValue("captions.centerTable", true);
    await tab.setControlValue("captions.centerEquation", false);
    await tab.setControlValue("captions.centerCode", true);
    await tab.setControlValue("captions.figurePlacement", "below");
    await tab.setControlValue("captions.tablePlacement", "below");
    await tab.setControlValue("captions.equationPlacement", "below");
    await tab.setControlValue("captions.codePlacement", "below");
    await tab.setControlValue("captions.showImageCaptionTooltips", false);
    await tab.setControlValue("references.showCrossReferences", false);
    await tab.setControlValue("notes.showNoteNumbers", false);
    await tab.setControlValue("notes.displayMode", "source");
    await tab.setControlValue("views.excludedFolders", "Private, /Archive/, Private");

    expect(host.settings.language).toBe("zh");
    expect(host.settings.showVirtualNumbers).toBe(true);
    expect(host.settings.concealStoredNumbers).toBe(true);
    expect(host.settings.showCaptionNumbers).toBe(false);
    expect(host.settings.centerFigureCaptions).toBe(false);
    expect(host.settings.centerTableCaptions).toBe(true);
    expect(host.settings.centerEquationCaptions).toBe(false);
    expect(host.settings.centerCodeCaptions).toBe(true);
    expect(host.settings.figureCaptionPlacement).toBe("below");
    expect(host.settings.tableCaptionPlacement).toBe("below");
    expect(host.settings.equationCaptionPlacement).toBe("below");
    expect(host.settings.codeCaptionPlacement).toBe("below");
    expect(host.settings.showImageCaptionTooltips).toBe(false);
    expect(host.settings.showCrossReferences).toBe(false);
    expect(host.settings.showNoteNumbers).toBe(false);
    expect(host.settings.noteDisplayMode).toBe("source");
    expect(host.settings.excludedFolders).toEqual(["Private", "Archive"]);
    expect(host.saveSettings).toHaveBeenCalledTimes(16);
    expect(host.scheduleSettings).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid values instead of silently persisting them", async () => {
    const host = createHost();
    const tab = new NumberSuiteSettingTab(new App(), host as never);

    await expect(tab.setControlValue("general.language", "automatic")).rejects.toThrow(
      "Invalid value",
    );
    await expect(tab.setControlValue("views.virtualOpacity", 2)).rejects.toThrow("Invalid value");
    await expect(tab.setControlValue("notes.displayMode", "numbers")).rejects.toThrow("Invalid value");
    await expect(tab.setControlValue("captions.figurePlacement", "sideways"))
      .rejects.toThrow("Invalid value");
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(host.scheduleSettings).not.toHaveBeenCalled();
  });
});
