import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/app/plugin.ts", import.meta.url), "utf8");

describe("plugin window appearance lifecycle", () => {
  it("applies configured appearance to windows opened after plugin startup", () => {
    expect(source).toContain('this.app.workspace.on("window-open"');
    expect(source).toContain("this.applyAppearanceToDocument(window.document)");
    expect(source).toContain("private applyAppearanceToDocument(ownerDocument: Document)");
  });
});
