// @vitest-environment happy-dom
import type { App, Command, PluginManifest } from "obsidian";
import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  ItemView: class {},
  Plugin: class {
    constructor(public app: App, public manifest: PluginManifest) {}
    addCommand(command: Command): Command {
      return { ...command, id: `${this.manifest.id}:${command.id}`, name: `${this.manifest.name}: ${command.name}` };
    }
    addRibbonIcon(_icon: string, label: string): HTMLElement {
      const button = document.createElement("button");
      button.setAttribute("aria-label", label);
      return button;
    }
  },
}));

import NumberSuitePlugin from "../../src/app/plugin";
import { createTranslator } from "../../src/config/i18n";
import { cloneSettings, normalizePluginData } from "../../src/config/settings";
import { SettingsPersistenceSession } from "../../src/config/settings-persistence-session";

describe("plugin localization lifecycle", () => {
  it("updates host command objects and ribbon through scheduled and immediate language saves", async () => {
    const plugin = new NumberSuitePlugin({ workspace: {
      getLeavesOfType: () => [], iterateAllLeaves: () => {},
    } } as unknown as App, { id: "number-suite", name: "Number Suite" } as PluginManifest);
    const chrome = plugin as unknown as {
      registerCommands(): void;
      addRibbon(): void;
      localizedCommands: Array<{ command: Command }>;
      ribbonEl: HTMLElement | null;
      settingsPersistence: SettingsPersistenceSession;
    };
    const persist = vi.fn(async () => {});
    chrome.settingsPersistence = new SettingsPersistenceSession(normalizePluginData(null), persist);
    plugin.settings.language = "en";
    chrome.registerCommands();
    chrome.addRibbon();
    const commands = chrome.localizedCommands.map(({ command }) => command);
    const originals = commands.map(({ id, name, callback, checkCallback }) => ({ id, name, callback, checkCallback }));
    expect(commands).toHaveLength(12);
    const chinese = cloneSettings(plugin.settings);
    chinese.language = "zh";
    plugin.scheduleSettings(chinese, "none");
    expect(commands.every((command, index) => command.name !== originals[index]?.name)).toBe(true);
    expect(chrome.ribbonEl?.getAttribute("aria-label")).toBe(createTranslator("zh")("panel.ribbon"));
    const english = cloneSettings(plugin.settings);
    english.language = "en";
    await plugin.saveSettings(english, "none");
    expect(commands.map(({ id, name, callback, checkCallback }) => ({ id, name, callback, checkCallback }))).toEqual(originals);
    commands.forEach((command, index) => expect(chrome.localizedCommands[index]?.command).toBe(command));
    expect(chrome.ribbonEl?.getAttribute("title")).toBe(createTranslator("en")("panel.ribbon"));
    expect(persist).toHaveBeenCalled();
    plugin.onunload();
    expect(chrome.localizedCommands).toHaveLength(0);
    expect(chrome.ribbonEl).toBeNull();
  });
});
