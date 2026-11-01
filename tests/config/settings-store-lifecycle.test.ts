// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { SettingsPersistenceSession } from "../../src/config/settings-persistence-session";
import { normalizePluginData } from "../../src/config/settings";
import { settingsStoreScheduler } from "../../src/config/settings-store-queue";

describe("settings store across plugin lifecycles", () => {
  it("reserves a scheduled final save before the next instance reads", async () => {
    const host = {};
    const oldQueue = settingsStoreScheduler(host);
    const nextQueue = settingsStoreScheduler(host);
    let stored = normalizePluginData({ schemaVersion: 1, settings: {} });
    const loaded = await oldQueue(async () => stored);
    const session = new SettingsPersistenceSession(loaded, async (settings) => {
      stored = normalizePluginData({ schemaVersion: 1, settings });
    }, oldQueue);
    const settings = session.initialSettings(); settings.language = "zh";
    session.schedule(settings);
    const closing = session.close();
    const nextLoaded = nextQueue(async () => stored);
    await closing;
    const next = new SettingsPersistenceSession(await nextLoaded, vi.fn(), nextQueue);
    expect(next.initialSettings().language).toBe("zh");
    expect(() => session.schedule(settings)).toThrow("closed");
  });

  it("settles an in-flight failure and its already reserved final retry before a new load", async () => {
    const host = {};
    const schedule = settingsStoreScheduler(host);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const order: string[] = [];
    let attempts = 0;
    const session = new SettingsPersistenceSession(normalizePluginData(null), async () => {
      attempts += 1; order.push(`save-${attempts}`);
      if (attempts === 1) { await gate; throw new Error("disk full"); }
    }, schedule);
    const saving = session.save(session.initialSettings());
    const failed = expect(saving).rejects.toThrow("disk full");
    const closing = session.close();
    const load = settingsStoreScheduler(host)(async () => { order.push("load"); });
    release(); await failed; await closing; await load;
    expect(order).toEqual(["save-1", "save-2", "load"]);
    expect(session.status().state).toBe("saved");
  });

  it("keeps future schema read-only and lets storage queues continue after failures", async () => {
    const host = {};
    const schedule = settingsStoreScheduler(host);
    await expect(schedule(async () => { throw new Error("read failed"); })).rejects.toThrow("read failed");
    const future = { schemaVersion: 99, settings: {}, future: { keep: true } };
    const persist = vi.fn();
    const session = new SettingsPersistenceSession(normalizePluginData(await schedule(async () => future)), persist, schedule);
    await session.close();
    expect(persist).not.toHaveBeenCalled();
    expect(future).toEqual({ schemaVersion: 99, settings: {}, future: { keep: true } });
    expect(session.status().state).toBe("incompatible");
    await expect(settingsStoreScheduler({})(async () => 1)).resolves.toBe(1);
  });
});
