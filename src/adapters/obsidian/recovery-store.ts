import { normalizePath, type App, type PluginManifest } from "obsidian";

import { sanitizeLastBatch, type LastBatchSnapshot } from "../../config/settings";

export class RecoveryStore {
  private readonly path: string;
  private readonly temporaryPath: string;

  constructor(private readonly app: App, manifest: PluginManifest) {
    if (manifest.dir == null) throw new Error("Structured Numbering plugin directory is unavailable.");
    this.path = normalizePath(`${manifest.dir}/recovery.json`);
    this.temporaryPath = normalizePath(`${manifest.dir}/recovery.pending.json`);
  }

  async load(): Promise<LastBatchSnapshot | null> {
    for (const path of [this.temporaryPath, this.path]) {
      if (!await this.app.vault.adapter.exists(path)) continue;
      try {
        return sanitizeLastBatch(JSON.parse(await this.app.vault.adapter.read(path)));
      } catch (error) {
        console.error(`Structured Numbering: could not read ${path}`, error);
      }
    }
    return null;
  }

  async save(snapshot: LastBatchSnapshot | null): Promise<void> {
    if (snapshot == null) {
      await this.removeIfPresent(this.temporaryPath);
      await this.removeIfPresent(this.path);
      return;
    }
    await this.app.vault.adapter.write(this.temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    await this.removeIfPresent(this.path);
    await this.app.vault.adapter.rename(this.temporaryPath, this.path);
  }

  private async removeIfPresent(path: string): Promise<void> {
    if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
  }
}
