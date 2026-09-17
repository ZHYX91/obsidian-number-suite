import { describe, expect, it, vi } from "vitest";

import {
  NoteSaveConflictError,
  NoteSaveCoordinator,
} from "../../src/application/note-save-coordinator";

describe("note save conflict lifecycle", () => {
  it("retains a stale draft until it is explicitly rebased onto the fresh Properties", async () => {
    const states: string[] = [];
    const save = vi.fn()
      .mockRejectedValueOnce(new NoteSaveConflictError({ external: true }))
      .mockResolvedValue(undefined);
    const queue = new NoteSaveCoordinator({}, save, (state) => states.push(state));
    queue.update({ kind: "show-virtual", value: "on" });

    await queue.flush();
    expect(queue.state).toBe("error");
    expect(queue.conflicted).toBe(true);
    expect(queue.pending).toBe(true);

    expect(queue.rebaseConflict((current, _acknowledged, desired) => ({
      ...current,
      ...desired,
    }))).toBe(true);
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toEqual({ external: true });
    expect(queue.state).toBe("saved");
    expect(queue.pending).toBe(false);
    expect(states).toContain("error");
  });
});
