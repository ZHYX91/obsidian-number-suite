import {
  cloneSettings,
  type NormalizedPluginData,
  type NumberSuiteSettings,
} from "./settings";
import {
  SettingsSaveCoordinator,
  type SettingsSaveStatus,
} from "./settings-save-coordinator";

export class SettingsPersistenceSession {
  private readonly coordinator: SettingsSaveCoordinator<NumberSuiteSettings> | null;
  private readonly initial: NumberSuiteSettings;
  private readonly incompatibleSchemaVersion: number | null;

  constructor(
    loaded: NormalizedPluginData,
    persist: (snapshot: NumberSuiteSettings) => Promise<void>,
  ) {
    if (loaded.state === "incompatible") {
      this.initial = cloneSettings(loaded.settings);
      this.incompatibleSchemaVersion = loaded.schemaVersion;
      this.coordinator = null;
      return;
    }
    this.initial = cloneSettings(loaded.data.settings);
    this.incompatibleSchemaVersion = null;
    this.coordinator = new SettingsSaveCoordinator(persist);
  }

  initialSettings(): NumberSuiteSettings {
    return cloneSettings(this.initial);
  }

  assertWritable(): void {
    if (this.incompatibleSchemaVersion == null) return;
    throw new Error(
      `Number Suite settings schema ${this.incompatibleSchemaVersion} is newer than this plugin and is read-only.`,
    );
  }

  schedule(settings: NumberSuiteSettings): void {
    this.writableCoordinator().schedule(cloneSettings(settings));
  }

  async save(settings: NumberSuiteSettings): Promise<void> {
    await this.writableCoordinator().save(cloneSettings(settings));
  }

  async retry(): Promise<void> {
    await this.writableCoordinator().retry();
  }

  flush(): Promise<void> {
    return this.coordinator?.flush() ?? Promise.resolve();
  }

  status(): SettingsSaveStatus {
    return this.incompatibleSchemaVersion == null
      ? this.coordinator?.snapshot() ?? { state: "saved", error: null }
      : {
        state: "incompatible",
        error: null,
        schemaVersion: this.incompatibleSchemaVersion,
      };
  }

  subscribe(listener: (status: SettingsSaveStatus) => void): () => void {
    if (this.incompatibleSchemaVersion == null) {
      return this.coordinator?.subscribe(listener) ?? (() => undefined);
    }
    listener(this.status());
    return () => undefined;
  }

  private writableCoordinator(): SettingsSaveCoordinator<NumberSuiteSettings> {
    this.assertWritable();
    if (this.coordinator == null) {
      throw new Error("Number Suite settings persistence is unavailable.");
    }
    return this.coordinator;
  }
}
