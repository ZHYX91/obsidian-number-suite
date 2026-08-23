import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("settings guide", () => {
  it("uses the shared visual hierarchy and accessible note structure", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/scheme-settings-renderer.ts"),
      "utf8",
    );
    const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

    expect(source).toContain('guide.setAttribute("role", "note")');
    expect(source).toContain('setIcon(icon, "info")');
    expect(source).toContain("structured-numbering-settings-guide-heading");
    expect(source).toContain("structured-numbering-settings-guide-body");
    expect(source).toContain("structured-numbering-settings-guide-example");
    expect(styles).toMatch(
      /\.structured-numbering-settings-guide\s*\{[^}]*border-inline-start:\s*3px solid var\(--interactive-accent\);[^}]*box-shadow:\s*none;[^}]*padding:\s*12px 14px;/s,
    );
    expect(styles).toMatch(
      /\.structured-numbering-settings-guide-body\s*\{[^}]*max-inline-size:\s*68ch;/s,
    );
  });
});
