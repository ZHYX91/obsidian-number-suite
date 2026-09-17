import { applyNoteOverrideChange, type NoteOverrideChange } from "./note-overrides";

export type NoteSaveState = "saved" | "pending" | "saving" | "error";

export class NoteSaveConflictError extends Error {
  readonly current: Record<string, unknown>;

  constructor(current: Record<string, unknown>) {
    super("Number Suite note Properties changed after the control was rendered.");
    this.name = "NoteSaveConflictError";
    this.current = structuredClone(current);
  }
}

export type NoteConflictMerge = (
  current: Record<string, unknown>,
  acknowledged: Record<string, unknown>,
  desired: Record<string, unknown>,
) => Record<string, unknown>;

/** One coordinator owns one file. Failed writes retain the user's desired state. */
export class NoteSaveCoordinator {
  private acknowledged: Record<string, unknown>;
  private desired: Record<string, unknown>;
  private running: Promise<void> | null = null;
  private failed = false;
  private conflict: Record<string, unknown> | null = null;
  private currentState: NoteSaveState = "saved";
  private readonly listeners = new Set<(state: NoteSaveState) => void>();

  constructor(
    initial: Record<string, unknown>,
    private readonly save: (expected: Record<string, unknown>, desired: Record<string, unknown>) => Promise<void>,
    changed: (state: NoteSaveState) => void,
  ) {
    this.acknowledged = structuredClone(initial);
    this.desired = structuredClone(initial);
    this.listeners.add(changed);
  }

  get snapshot(): Record<string, unknown> { return structuredClone(this.desired); }

  get state(): NoteSaveState { return this.currentState; }

  get pending(): boolean {
    return JSON.stringify(this.acknowledged) !== JSON.stringify(this.desired);
  }

  get conflicted(): boolean { return this.conflict != null; }

  subscribe(listener: (state: NoteSaveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(change: NoteOverrideChange): void {
    if ((change.kind === "first-number" || change.kind === "skip-first") && change.value != null
      && (!Number.isSafeInteger(change.value) || change.value < (change.kind === "first-number" ? 1 : 0))) {
      throw new RangeError("Invalid heading override number");
    }
    const next = this.snapshot;
    if (!applyNoteOverrideChange(next, change)) return;
    this.desired = next;
    this.emit(this.failed ? "error" : this.running != null ? "saving" : "pending");
  }

  /**
   * Rebase the retained draft after a stale-Properties conflict. The caller decides
   * how user-owned keys are replayed onto the fresh Properties record.
   */
  rebaseConflict(merge: NoteConflictMerge): boolean {
    if (this.conflict == null || this.running != null) return false;
    const current = structuredClone(this.conflict);
    const next = merge(current, structuredClone(this.acknowledged), structuredClone(this.desired));
    this.acknowledged = current;
    this.desired = structuredClone(next);
    this.conflict = null;
    this.failed = false;
    this.emit(this.pending ? "pending" : "saved");
    return true;
  }

  flush(): Promise<void> {
    if (this.running != null) return this.running;
    this.failed = false;
    this.running = Promise.resolve().then(() => this.drain()).finally(() => {
      this.running = null;
      if (this.pending && !this.failed) void this.flush();
    });
    return this.running;
  }

  private emit(state: NoteSaveState): void {
    this.currentState = state;
    for (const listener of this.listeners) listener(state);
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const next = this.snapshot;
      this.emit("saving");
      try {
        await this.save(structuredClone(this.acknowledged), next);
        this.acknowledged = next;
        this.conflict = null;
      } catch (error) {
        this.failed = true;
        this.conflict = error instanceof NoteSaveConflictError
          ? structuredClone(error.current)
          : null;
        this.emit("error");
        return;
      }
    }
    this.emit("saved");
  }
}
