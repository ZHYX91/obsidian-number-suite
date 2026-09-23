import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, type App } from "obsidian";

import { BatchController, type BatchPersistence } from "../../src/commands/batch";
import { DEFAULT_SETTINGS } from "../../src/config/settings";

beforeEach(() => {
  (Notice as unknown as { readonly messages: string[] }).messages.length = 0;
});

describe("batch recovery lifecycle", () => {
  it("shows a failure and leaves recovery untouched when the first load fails", async () => {
    const getLastBatch = vi.fn(() => null);
    const setLastBatch = vi.fn(async () => undefined);
    const persistence: BatchPersistence = {
      ensureLoaded: vi.fn(async () => { throw new Error("recovery unavailable"); }),
      getLastBatch,
      setLastBatch,
    };
    const controller = new BatchController({} as App, () => DEFAULT_SETTINGS, persistence);

    await controller.undo((key) => key);

    expect(getLastBatch).not.toHaveBeenCalled();
    expect(setLastBatch).not.toHaveBeenCalled();
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchFailed");
  });

  it("does not continue a pending first-load Undo after plugin unload", async () => {
    let finishLoad: (() => void) | undefined;
    const getLastBatch = vi.fn(() => null);
    const persistence: BatchPersistence = {
      ensureLoaded: () => new Promise<void>((resolve) => { finishLoad = resolve; }),
      getLastBatch,
      setLastBatch: vi.fn(async () => undefined),
    };
    const controller = new BatchController({} as App, () => DEFAULT_SETTINGS, persistence);

    const undo = controller.undo((key) => key);
    controller.dispose();
    finishLoad?.();
    await undo;

    expect(getLastBatch).not.toHaveBeenCalled();
    expect((Notice as unknown as { readonly messages: string[] }).messages).toEqual([]);
  });
});
