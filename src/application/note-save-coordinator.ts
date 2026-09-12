import { applyNoteOverrideChange, type NoteOverrideChange } from "./note-overrides";

export type NoteSaveState = "saved" | "pending" | "saving" | "error";

/** One coordinator owns one file. Failed writes retain the user's desired state. */
export class NoteSaveCoordinator {
  private acknowledged: Record<string, unknown>;
  private desired: Record<string, unknown>;
  private running: Promise<void> | null = null;
  private failed = false;

  constructor(
    initial: Record<string, unknown>,
    private readonly save: (expected: Record<string, unknown>, desired: Record<string, unknown>) => Promise<void>,
    private readonly changed: (state: NoteSaveState) => void,
  ) {
    this.acknowledged = structuredClone(initial);
    this.desired = structuredClone(initial);
  }

  get snapshot(): Record<string, unknown> { return structuredClone(this.desired); }

  get pending(): boolean {
    return JSON.stringify(this.acknowledged) !== JSON.stringify(this.desired);
  }

  update(change: NoteOverrideChange): void {
    if ((change.kind === "first-number" || change.kind === "skip-first") && change.value != null
      && (!Number.isSafeInteger(change.value) || change.value < (change.kind === "first-number" ? 1 : 0))) {
      throw new RangeError("Invalid heading override number");
    }
    const next = this.snapshot;
    if (!applyNoteOverrideChange(next, change)) return;
    this.desired = next;
    this.changed(this.failed ? "error" : this.running != null ? "saving" : "pending");
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

  private async drain(): Promise<void> {
    while (this.pending) {
      const next = this.snapshot;
      this.changed("saving");
      try {
        await this.save(structuredClone(this.acknowledged), next);
        this.acknowledged = next;
      } catch {
        this.failed = true;
        this.changed("error");
        return;
      }
    }
    this.changed("saved");
  }
}
