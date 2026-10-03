import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/app/plugin.ts", import.meta.url), "utf8");

describe("plugin localization lifecycle", () => {
  it("tracks registered command objects and refreshes their labels when language changes", () => {
    expect(source).toContain("private readonly localizedCommands");
    expect(source).toContain("this.localizedCommands.push({ command: registered, key })");
    expect(source).toContain("command.name = `${this.manifest.name}: ${t(key)}`");
    expect(source).toContain("previousLanguage !== this.settings.language");
  });

  it("refreshes the ribbon label together with command names", () => {
    expect(source).toContain("this.ribbonEl = this.addRibbonIcon");
    expect(source).toContain('this.ribbonEl?.setAttribute("aria-label", t("panel.ribbon"))');
  });
});
