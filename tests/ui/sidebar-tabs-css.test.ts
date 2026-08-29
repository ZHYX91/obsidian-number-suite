import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(path.resolve(import.meta.dirname, "../../styles.css"), "utf8");

describe("sidebar tabs CSS", () => {
  it("uses an edge-to-edge equal-width tab bar", () => {
    expect(styles).toMatch(
      /\.number-suite-sidebar-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).not.toMatch(
      /\.number-suite-sidebar-tabs\s*\{[^}]*padding-inline:/s,
    );
  });

  it("keeps active, hover, and focus states visually distinct", () => {
    expect(styles).toMatch(
      /\.number-suite-sidebar-tab\.is-active\s*\{[^}]*box-shadow:\s*inset 0 -2px var\(--interactive-accent\);[^}]*font-weight:\s*var\(--font-semibold\);/s,
    );
    expect(styles).toMatch(
      /\.number-suite-sidebar-tab:hover\s*\{[^}]*background:\s*var\(--background-modifier-hover\);/s,
    );
    expect(styles).toMatch(
      /\.number-suite-sidebar-tab\.is-active:focus-visible\s*\{[^}]*var\(--background-modifier-border-focus\)/s,
    );
  });

  it("retains a 44-pixel coarse-pointer target", () => {
    expect(styles).toMatch(
      /@media \(pointer: coarse\)[\s\S]*?\.number-suite-sidebar-tab,[\s\S]*?min-height:\s*44px;/s,
    );
  });
});
