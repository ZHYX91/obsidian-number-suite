import { describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import { RecoveryStore } from "../../src/adapters/obsidian/recovery-store";
import { RecoverySession } from "../../src/application/recovery-session";
import type { LastBatchSnapshot } from "../../src/config/settings";

const snapshot: LastBatchSnapshot = {
  createdAt: "2026-09-23T00:00:00.000Z",
  operation: "write",
  status: "applied",
  files: [{ path: "note.md", before: "# Original", afterHash: "sha256:abc" }],
};

function harness() {
  const permanent = ".obsidian/plugins/number-suite/recovery.json";
  const files = new Map([[permanent, JSON.stringify(snapshot)]]);
  let failRead = true;
  const read = vi.fn(async (path: string) => {
    if (failRead) throw new Error("Transient storage read failure");
    return files.get(path) ?? "";
  });
  const adapter = {
    exists: async (path: string) => files.has(path),
    read,
    write: async (path: string, value: string) => { files.set(path, value); },
    remove: async (path: string) => { files.delete(path); },
    rename: async (from: string, to: string) => {
      files.set(to, files.get(from) ?? "");
      files.delete(from);
    },
  };
  const store = new RecoveryStore(
    { vault: { adapter } } as unknown as App,
    { dir: ".obsidian/plugins/number-suite" } as PluginManifest,
  );
  return { session: new RecoverySession(store), files, permanent, read, recover: () => { failRead = false; } };
}

describe("RecoverySession with the real RecoveryStore", () => {
  it("retries a transient adapter read and recovers the existing snapshot", async () => {
    const test = harness();
    await test.session.ensureLoaded().catch(() => undefined);
    test.recover();
    await test.session.ensureLoaded();
    expect(test.session.get()).toEqual(snapshot);
    expect(test.read).toHaveBeenCalledTimes(2);
  });

  it("does not replace recovery while the existing snapshot could not be read", async () => {
    const test = harness();
    const next = { ...snapshot, createdAt: "2026-09-23T01:00:00.000Z" };
    await test.session.save(next).catch(() => undefined);
    expect(JSON.parse(test.files.get(test.permanent) ?? "null")).toEqual(snapshot);
  });
});
