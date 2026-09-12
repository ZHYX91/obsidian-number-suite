import { describe, expect, it, vi } from "vitest";
import { NoteSaveCoordinator } from "../../src/application/note-save-coordinator";

describe("note save coordinator", () => {
  it("saves the latest number and another override while an earlier write is pending", async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const saved: Record<string, unknown>[] = [];
    const queue = new NoteSaveCoordinator({ title: "keep" }, async (expected, next) => {
      if (saved.length === 0) await gate;
      else expect(expected).toEqual(saved[saved.length - 1]);
      saved.push(next);
    }, vi.fn());
    queue.update({ kind: "first-number", level: 1, value: 2 });
    const pending = queue.flush();
    await Promise.resolve();
    queue.update({ kind: "first-number", level: 1, value: 23 });
    queue.update({ kind: "show-virtual", value: "off" });
    release();
    await pending;
    expect(saved).toHaveLength(2);
    expect(saved[1]).toEqual({ title: "keep", "number-suite": expect.arrayContaining([
      "heading.first-number.h1=23", "heading.virtual=false",
    ]) });
    expect(queue.pending).toBe(false);
  });

  it("retains the draft and expected version after failure and retries explicitly", async () => {
    const states: string[] = [];
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const queue = new NoteSaveCoordinator({}, save, (state) => states.push(state));
    queue.update({ kind: "skip-first", level: 2, value: 3 });
    await queue.flush();
    expect(queue.pending).toBe(true);
    expect(states[states.length - 1]).toBe("error");
    const draft = queue.snapshot;
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({}, draft);
    expect(states[states.length - 1]).toBe("saved");
  });

  it("coalesces edits before flushing and isolates a different file's coordinator", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const first = new NoteSaveCoordinator({}, save, vi.fn());
    const other = new NoteSaveCoordinator({}, vi.fn(), vi.fn());
    for (const value of [1, 12, 123]) first.update({ kind: "first-number", level: 1, value });
    await first.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(first.snapshot["number-suite"]).toEqual(["heading.first-number.h1=123"]);
    expect(other.snapshot).toEqual({});
    expect(() => first.update({ kind: "first-number", level: 1, value: -1 })).toThrow();
  });
});
