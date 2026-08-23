import { describe, expect, it, vi } from "vitest";

import { openObsidianPluginSettings } from "../../src/adapters/obsidian/plugin-settings";

describe("Obsidian plugin settings adapter", () => {
  it("opens the requested plugin tab when the host surface is available", () => {
    const open = vi.fn();
    const openTabById = vi.fn();

    expect(openObsidianPluginSettings({ setting: { open, openTabById } }, "structured-numbering")).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(openTabById).toHaveBeenCalledWith("structured-numbering");
  });

  it("fails closed without the host surface", () => {
    expect(openObsidianPluginSettings({}, "structured-numbering")).toBe(false);
  });
});
