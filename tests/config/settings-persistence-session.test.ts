import { describe, expect, it, vi } from "vitest";

import { SettingsPersistenceSession } from "../../src/config/settings-persistence-session";
import {
  DEFAULT_SETTINGS,
  normalizePluginData,
} from "../../src/config/settings";

describe("SettingsPersistenceSession", () => {
  it("loads and saves schema 1 using detached snapshots", async () => {
    const persist = vi.fn(async () => undefined);
    const session = new SettingsPersistenceSession(normalizePluginData({
      schemaVersion: 1,
      settings: {
        showVirtualNumbers: true,
        excludedFolders: ["Private"],
      },
    }), persist);
    const settings = session.initialSettings();

    expect(settings.showVirtualNumbers).toBe(true);
    settings.excludedFolders.push("Archive");
    const saving = session.save(settings);
    settings.excludedFolders.push("Late mutation");
    await saving;

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      showVirtualNumbers: true,
      excludedFolders: ["Private", "Archive"],
    }));
    expect(session.status()).toEqual({ state: "saved", error: null });
  });

  it("keeps a future-schema startup read-only and never overwrites unknown fields", async () => {
    const stored = {
      schemaVersion: 2,
      settings: {
        showVirtualNumbers: true,
        futureSetting: { mode: "new" },
      },
      futureEnvelopeField: { keep: true },
    };
    const before = structuredClone(stored);
    const persist = vi.fn(async () => undefined);
    const session = new SettingsPersistenceSession(normalizePluginData(stored), persist);
    const listener = vi.fn();

    expect(session.initialSettings()).toEqual(DEFAULT_SETTINGS);
    expect(session.status()).toEqual({
      state: "incompatible",
      error: null,
      schemaVersion: 2,
    });
    session.subscribe(listener);
    expect(listener).toHaveBeenCalledWith(session.status());
    expect(() => session.schedule(session.initialSettings())).toThrow("schema 2");
    await expect(session.save(session.initialSettings())).rejects.toThrow("schema 2");
    await session.flush();

    expect(persist).not.toHaveBeenCalled();
    expect(stored).toEqual(before);
  });
});
