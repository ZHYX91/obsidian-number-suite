import { describe, expect, it } from "vitest";

import type { App, PluginManifest } from "obsidian";

import { RecoveryStore } from "../../src/adapters/obsidian/recovery-store";
import type { LastBatchSnapshot } from "../../src/config/settings";

const snapshot: LastBatchSnapshot = {
  createdAt: "2026-08-08T00:00:00.000Z",
  operation: "write",
  status: "applied",
  files: [{ path: "note.md", before: "# A", afterHash: "sha256:abc" }],
};

describe("RecoveryStore structural fallback", () => {
  it("falls back to recovery.json when pending JSON parses but is not a valid snapshot", async () => {
    const pending = ".obsidian/plugins/number-suite/recovery.pending.json";
    const permanent = ".obsidian/plugins/number-suite/recovery.json";
    const files = new Map<string, string>([
      [pending, JSON.stringify({})],
      [permanent, JSON.stringify(snapshot)],
    ]);
    const adapter = {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => files.get(path) ?? "",
    };
    const app = { vault: { adapter } } as unknown as App;
    const manifest = { dir: ".obsidian/plugins/number-suite" } as PluginManifest;

    await expect(new RecoveryStore(app, manifest).load()).resolves.toEqual(snapshot);
  });
});
