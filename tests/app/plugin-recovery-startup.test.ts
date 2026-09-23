import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/app/plugin.ts", import.meta.url), "utf8");

describe("plugin recovery startup boundary", () => {
  it("constructs a lazy recovery session without awaiting recovery storage during onload", () => {
    expect(source).toContain("new RecoverySession(new RecoveryStore(this.app, this.manifest))");
    expect(source).not.toContain("await this.recoveryStore.load()");
    expect(source).not.toContain("this.lastBatch = await");
  });

  it("lets BatchController own the first recovery load at mutation and undo boundaries", () => {
    const batch = readFileSync(new URL("../../src/commands/batch.ts", import.meta.url), "utf8");
    expect(batch).toContain("await this.persistence.ensureLoaded()");
    expect(batch.indexOf("await this.persistence.ensureLoaded()")).toBeLessThan(
      batch.indexOf("const snapshot = this.persistence.getLastBatch()"),
    );
  });
});
