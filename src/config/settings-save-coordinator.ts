export type SettingsSaveState = "saved" | "scheduled" | "saving" | "pending";

export interface SettingsSaveStatus {
  readonly state: SettingsSaveState;
  readonly error: unknown;
}

interface TimerHost {
  setTimeout(handler: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const unavailableTimerHost: TimerHost = {
  setTimeout: () => {
    throw new Error("Number Suite settings saves require a browser window.");
  },
  clearTimeout: () => undefined,
};

const defaultTimerHost: TimerHost = typeof window === "undefined" ? unavailableTimerHost : window;

export class SettingsSaveCoordinator<T> {
  private readonly listeners = new Set<(status: SettingsSaveStatus) => void>();
  private pending: T | null = null;
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private status: SettingsSaveStatus = { state: "saved", error: null };

  constructor(
    private readonly persist: (snapshot: T) => Promise<void>,
    private readonly delayMs = 250,
    private readonly timers: TimerHost = defaultTimerHost,
  ) {}

  schedule(snapshot: T): void {
    this.pending = snapshot;
    this.cancelTimer();
    this.setStatus("scheduled", this.status.error);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.saveNow().catch(() => undefined);
    }, this.delayMs);
  }

  save(snapshot: T): Promise<void> {
    this.pending = snapshot;
    return this.saveNow();
  }

  retry(): Promise<void> {
    return this.pending == null ? Promise.resolve() : this.saveNow();
  }

  flush(): Promise<void> {
    this.cancelTimer();
    return this.pending == null ? this.queue : this.saveNow();
  }

  subscribe(listener: (status: SettingsSaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  snapshot(): SettingsSaveStatus {
    return this.status;
  }

  private saveNow(): Promise<void> {
    this.cancelTimer();
    const operation = this.queue.then(() => this.persistPending());
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async persistPending(): Promise<void> {
    const snapshot = this.pending;
    if (snapshot == null) return;
    this.pending = null;
    this.setStatus("saving", null);
    try {
      await this.persist(snapshot);
      this.setStatus(this.pending == null ? "saved" : "scheduled", null);
    } catch (error) {
      this.pending ??= snapshot;
      this.setStatus("pending", error);
      throw error;
    }
  }

  private cancelTimer(): void {
    if (this.timer != null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(state: SettingsSaveState, error: unknown): void {
    this.status = { state, error };
    for (const listener of this.listeners) listener(this.status);
  }
}
