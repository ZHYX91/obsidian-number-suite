import { describe, expect, it } from "vitest";

import { SettingsSaveCoordinator } from "../../src/config/settings-save-coordinator";

describe("SettingsSaveCoordinator", () => {
  it("coalesces scheduled writes to the newest snapshot", async () => {
    const persisted: number[] = [];
    let scheduled: (() => void) | null = null;
    const timers = {
      setTimeout: (handler: () => void): ReturnType<typeof setTimeout> => {
        scheduled = handler;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (): void => {
        scheduled = null;
      },
    };
    const coordinator = new SettingsSaveCoordinator<number>(async (value) => {
      persisted.push(value);
    }, 50, timers);
    coordinator.schedule(1);
    coordinator.schedule(2);
    expect(coordinator.snapshot().state).toBe("scheduled");
    const runScheduled = scheduled as (() => void) | null;
    runScheduled?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(persisted).toEqual([2]);
    expect(coordinator.snapshot().state).toBe("saved");
  });

  it("retains failed data and exposes an explicit retry path", async () => {
    let attempts = 0;
    const coordinator = new SettingsSaveCoordinator<string>(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("disk full");
    });
    await expect(coordinator.save("latest")).rejects.toThrow("disk full");
    expect(coordinator.snapshot().state).toBe("pending");
    await coordinator.retry();
    expect(attempts).toBe(2);
    expect(coordinator.snapshot()).toEqual({ state: "saved", error: null });
  });
});
