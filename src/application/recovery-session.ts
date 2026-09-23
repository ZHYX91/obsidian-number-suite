import type { LastBatchSnapshot } from "../config/settings";

export interface RecoveryPersistence {
  load(): Promise<LastBatchSnapshot | null>;
  save(snapshot: LastBatchSnapshot | null): Promise<void>;
}

export type RecoveryLoadState = "loaded" | "loading" | "unloaded";

export class RecoverySession {
  private snapshot: LastBatchSnapshot | null = null;
  private state: RecoveryLoadState = "unloaded";
  private loading: Promise<void> | null = null;

  constructor(private readonly persistence: RecoveryPersistence) {}

  get(): LastBatchSnapshot | null {
    return this.state === "loaded" ? this.snapshot : null;
  }

  status(): RecoveryLoadState {
    return this.state;
  }

  async ensureLoaded(): Promise<void> {
    if (this.state === "loaded") return;
    if (this.loading != null) return this.loading;

    this.state = "loading";
    const loading = this.persistence.load()
      .then((snapshot) => {
        this.snapshot = snapshot;
        this.state = "loaded";
      })
      .catch((error: unknown) => {
        this.state = "unloaded";
        throw error;
      })
      .finally(() => {
        if (this.loading === loading) this.loading = null;
      });
    this.loading = loading;
    return loading;
  }

  async save(snapshot: LastBatchSnapshot | null): Promise<void> {
    await this.ensureLoaded();
    await this.persistence.save(snapshot);
    this.snapshot = snapshot;
  }
}
