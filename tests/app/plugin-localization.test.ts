// @vitest-environment happy-dom
import { MarkdownView, Notice, TFile, type App, type Command, type PluginManifest } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import type { PreviewModalOptions } from "../../src/ui/preview-modal";
const preview = vi.hoisted(() => ({ options: null as PreviewModalOptions | null }));
vi.mock("../../src/ui/preview-modal", () => ({
  ChangePreviewModal: class {
    constructor(options: PreviewModalOptions) { preview.options = options; }
    open(): void {}
  },
}));

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
  it("keeps the legacy outline command without enabling a disabled core plugin", async () => {
    const ensureSideLeaf = vi.fn();
    const revealLeaf = vi.fn();
    const core = { enabled: false };
    const app = {
      workspace: { getLeavesOfType: () => [], ensureSideLeaf, revealLeaf },
      internalPlugins: { getPluginById: () => core },
    } as unknown as App;
    const plugin = new NumberSuitePlugin(app, { id: "number-suite", name: "Number Suite" } as PluginManifest);
    const runtime = plugin as unknown as { openNativeOutline(): Promise<void> };
    const notices = (Notice as unknown as { messages: string[] }).messages;
    notices.length = 0;
    await runtime.openNativeOutline();
    expect(ensureSideLeaf).not.toHaveBeenCalled();
    expect(revealLeaf).not.toHaveBeenCalled();
    expect(core.enabled).toBe(false);
    expect(notices).toHaveLength(1);
    core.enabled = true;
    const leaf = {};
    ensureSideLeaf.mockResolvedValue(leaf);
    await runtime.openNativeOutline();
    expect(ensureSideLeaf).toHaveBeenCalledWith("outline", "right", { active: true, reveal: true });
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
  });

  it("invalidates the actual registered current-note command when the plugin unloads", async () => {
    const containerEl = document.createElement("div");
    document.body.append(containerEl);
    const file = new (TFile as unknown as new (path: string) => TFile)("note.md");
    const transaction = vi.fn();
    const editor = { getValue: () => "# A", offsetToPos: (ch: number) => ({ line: 0, ch }), transaction };
    const view = Object.assign(new MarkdownView({} as never), { file, editor, containerEl, getMode: () => "source" });
    const app = {
      vault: { getAbstractFileByPath: () => file },
      workspace: {
        getActiveViewOfType: () => view,
        getLeavesOfType: () => [],
        iterateAllLeaves: (callback: (leaf: { view: MarkdownView }) => void) => callback({ view }),
      },
    } as unknown as App;
    const plugin = new NumberSuitePlugin(app, { id: "number-suite", name: "Number Suite" } as PluginManifest);
    plugin.settings.selectedSchemeId = "hierarchical";
    const runtime = plugin as unknown as {
      registerCommands(): void;
      presentCurrentPreview(options: PreviewModalOptions): Promise<void>;
      localizedCommands: Array<{ command: Command }>;
    };
    vi.spyOn(runtime, "presentCurrentPreview").mockImplementation(async (options) => { preview.options = options; });
    runtime.registerCommands();
    const command = runtime.localizedCommands.find(({ command }) => command.id.endsWith(":write-numbers-current-note"))!.command;
    command.checkCallback!(false);
    const options = preview.options!;
    expect(options.signal?.aborted).toBe(false);
    const notices = (Notice as unknown as { messages: string[] }).messages;
    notices.length = 0;
    plugin.onunload();
    expect(options.signal?.aborted).toBe(true);
    await options.onConfirm(options.documents);
    expect(transaction).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    containerEl.remove();
  });

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

it.each(["Note.md", "file:/outside/Note.md"])("opens %s from its originating editor when two panes are open", async (path) => {
  const { NumberSuiteHeadingMapView } = await import("../../src/ui/heading-map-view");
  const file = new (TFile as unknown as new (path: string) => TFile)(path);
  const pane = () => {
    const view = Object.assign(new MarkdownView({} as never), { file, getState: () => ({ file: path }) });
    const leaf = { view };
    Object.assign(view, { leaf });
    return leaf;
  };
  const first = pane();
  const active = pane();
  const showFile = vi.fn();
  const map = Object.assign(Object.create(NumberSuiteHeadingMapView.prototype) as InstanceType<typeof NumberSuiteHeadingMapView>, { showFile });
  const app = { vault: { getAbstractFileByPath: () => path.startsWith("file:") ? null : file }, workspace: {
    getActiveFile: () => file, getActiveViewOfType: () => active.view,
    getLeavesOfType: (type: string) => type === "markdown" ? [first, active] : [{ view: map }],
    revealLeaf: async () => {},
  } } as unknown as App;
  const plugin = new NumberSuitePlugin(app, { id: "number-suite", name: "Number Suite" } as PluginManifest);
  const runtime = plugin as unknown as { registerCommands(): void; localizedCommands: Array<{ command: Command }> };
  runtime.registerCommands();
  runtime.localizedCommands.find(({ command }) => command.id.endsWith(":open-heading-mind-map"))!.command.checkCallback!(false);
  await Promise.resolve();
  expect(showFile).toHaveBeenCalledWith(file, active, false);
});
