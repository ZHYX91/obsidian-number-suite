import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(path.resolve(import.meta.dirname, "../../styles.css"), "utf8");

describe("outline visual controls", () => {
  it("removes mobile theme button chrome from the flat tree", () => {
    expect(styles).toMatch(
      /\.number-suite-outline-toggle,[\s\S]*?\.number-suite-outline-link\s*\{[^}]*appearance:\s*none;[^}]*background:\s*transparent !important;[^}]*border:\s*0 !important;[^}]*box-shadow:\s*none !important;/s,
    );
  });

  it("restores feedback only for hover and keyboard focus", () => {
    expect(styles).toMatch(
      /\.number-suite-outline-toggle:hover,[\s\S]*?\.number-suite-outline-link:hover\s*\{[^}]*background:\s*var\(--background-modifier-hover\) !important;/s,
    );
    expect(styles).toMatch(
      /\.number-suite-outline-toggle:focus-visible,[\s\S]*?\.number-suite-outline-link:focus-visible\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--background-modifier-border-focus\) !important;/s,
    );
  });
});
