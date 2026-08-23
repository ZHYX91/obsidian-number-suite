import { describe, expect, it } from "vitest";

import type { App, PluginManifest } from "obsidian";

import { RecoveryStore } from "../../src/adapters/obsidian/recovery-store";
import type { LastBatchSnapshot } from "../../src/config/settings";

function harness(initial: Readonly<Record<string, string>> = {}) {
  const files = new Map(Object.entries(initial));
  const adapter = {
    exists: async (path: string) => files.has(path),
    read: async (path: string) => {
      const value = files.get(path);
      if (value == null) throw new Error("missing");
      return value;
    },
    write: async (path: string, value: string) => { files.set(path, value); },
    remove: async (path: string) => { files.delete(path); },
    rename: async (from: string, to: string) => {
      const value = files.get(from);
      if (value == null) throw new Error("missing");
      files.delete(from);
      files.set(to, value);
    },
  };
  const app = { vault: { adapter } } as unknown as App;
  const manifest = { dir: ".obsidian/plugins/structured-numbering" } as PluginManifest;
  return { files, store: new RecoveryStore(app, manifest) };
}

const snapshot: LastBatchSnapshot = {
  createdAt: "2026-08-08T00:00:00.000Z",
  operation: "write",
  status: "applied",
  files: [{ path: "note.md", before: "# A", afterHash: "sha256:abc" }],
};

describe("RecoveryStore", () => {
  it("promotes the pending file and removes both paths when cleared", async () => {
    const { files, store } = harness();
    await store.save(snapshot);
    expect(files.has(".obsidian/plugins/structured-numbering/recovery.json")).toBe(true);
    expect(files.has(".obsidian/plugins/structured-numbering/recovery.pending.json")).toBe(false);
    await expect(store.load()).resolves.toEqual(snapshot);
    await store.save(null);
    expect(files.size).toBe(0);
  });

  it("recovers a valid pending snapshot left by an interrupted promotion", async () => {
    const path = ".obsidian/plugins/structured-numbering/recovery.pending.json";
    const { store } = harness({ [path]: JSON.stringify(snapshot) });
    await expect(store.load()).resolves.toEqual(snapshot);
  });

  it("prefers the newer pending snapshot when an interrupted promotion leaves both files", async () => {
    const permanentPath = ".obsidian/plugins/structured-numbering/recovery.json";
    const pendingPath = ".obsidian/plugins/structured-numbering/recovery.pending.json";
    const older = { ...snapshot, createdAt: "2026-08-07T00:00:00.000Z" };
    const { store } = harness({
      [permanentPath]: JSON.stringify(older),
      [pendingPath]: JSON.stringify(snapshot),
    });
    await expect(store.load()).resolves.toEqual(snapshot);
  });

  it("falls back to the permanent snapshot when the pending file is invalid", async () => {
    const permanentPath = ".obsidian/plugins/structured-numbering/recovery.json";
    const pendingPath = ".obsidian/plugins/structured-numbering/recovery.pending.json";
    const { store } = harness({
      [permanentPath]: JSON.stringify(snapshot),
      [pendingPath]: "not json",
    });
    await expect(store.load()).resolves.toEqual(snapshot);
  });
});
