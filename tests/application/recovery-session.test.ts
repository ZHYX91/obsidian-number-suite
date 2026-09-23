import { describe, expect, it, vi } from "vitest";

import { RecoverySession } from "../../src/application/recovery-session";
import type { LastBatchSnapshot } from "../../src/config/settings";

const snapshot: LastBatchSnapshot = {
  createdAt: "2026-08-08T00:00:00.000Z",
  operation: "write",
  status: "applied",
  files: [{ path: "a.md", before: "# A", afterHash: "sha256:abc" }],
};

describe("RecoverySession", () => {
  it("does not read persistence until explicitly loaded", async () => {
    const load = vi.fn(async () => snapshot);
    const session = new RecoverySession({ load, save: vi.fn(async () => undefined) });

    expect(session.status()).toBe("unloaded");
    expect(session.get()).toBeNull();
    expect(load).not.toHaveBeenCalled();

    await session.ensureLoaded();
    expect(load).toHaveBeenCalledOnce();
    expect(session.status()).toBe("loaded");
    expect(session.get()).toBe(snapshot);
  });

  it("single-flights concurrent first loads", async () => {
    let release!: (value: LastBatchSnapshot | null) => void;
    const load = vi.fn(() => new Promise<LastBatchSnapshot | null>((resolve) => { release = resolve; }));
    const session = new RecoverySession({ load, save: vi.fn(async () => undefined) });

    const first = session.ensureLoaded();
    const second = session.ensureLoaded();
    expect(session.status()).toBe("loading");
    expect(load).toHaveBeenCalledOnce();

    release(snapshot);
    await Promise.all([first, second]);
    expect(session.get()).toBe(snapshot);
  });

  it("loads existing state before the first save and then updates the cached snapshot", async () => {
    const load = vi.fn(async () => snapshot);
    const save = vi.fn(async (_next: LastBatchSnapshot | null) => undefined);
    const session = new RecoverySession({ load, save });
    const next = { ...snapshot, createdAt: "2026-09-23T00:00:00.000Z" };

    await session.save(next);

    expect(load).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(next);
    expect(session.get()).toBe(next);
  });

  it("returns to unloaded after a failed load so a later attempt can retry", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(snapshot);
    const session = new RecoverySession({ load, save: vi.fn(async () => undefined) });

    await expect(session.ensureLoaded()).rejects.toThrow("transient");
    expect(session.status()).toBe("unloaded");
    await session.ensureLoaded();
    expect(load).toHaveBeenCalledTimes(2);
    expect(session.get()).toBe(snapshot);
  });
});
