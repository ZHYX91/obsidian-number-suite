import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(path.resolve(import.meta.dirname, "../../styles.css"), "utf8");
const source = readFileSync(
  path.resolve(import.meta.dirname, "../../src/ui/note-control-modal.ts"),
  "utf8",
);

describe("current-note pane visual hierarchy", () => {
  it("uses whitespace and subdued section labels instead of heavy dividers", () => {
    expect(styles).toMatch(
      /\.number-suite-note-control-section\s*\{[^}]*border-block-start:\s*0;[^}]*margin-block-start:\s*var\(--size-4-5\);/s,
    );
    expect(styles).toMatch(
      /\.number-suite-note-control-section h4\s*\{[^}]*color:\s*var\(--text-muted\);[^}]*font-size:\s*var\(--font-ui-small\);/s,
    );
  });

  it("groups summary rows on quiet surfaces and emphasizes the effective value", () => {
    expect(styles).toMatch(
      /\.number-suite-sidebar \.number-suite-note-control-summary\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*var\(--size-2-2\);/s,
    );
    expect(styles).toMatch(
      /\.number-suite-sidebar \.number-suite-note-control-summary-row:not\(\.is-heading\)\s*\{[^}]*background:\s*var\(--background-secondary\);[^}]*border-block-end:\s*0;[^}]*border-radius:\s*var\(--radius-s\);/s,
    );
    expect(styles).toMatch(
      /\.number-suite-sidebar \.number-suite-note-control-summary-value:last-child\s*\{[^}]*color:\s*var\(--text-normal\);[^}]*font-weight:\s*var\(--font-medium\);/s,
    );
  });

  it("keeps the sidebar helper compact without an accent stripe", () => {
    expect(styles).toMatch(
      /\.number-suite-note-overrides-guide\.is-panel\s*\{[^}]*background:\s*transparent;[^}]*border-inline-start:\s*0;[^}]*padding:\s*0;/s,
    );
  });

  it("uses an accessible reduced-motion-aware loading indicator", () => {
    expect(source).toMatch(/setAttribute\("role", "status"\)/u);
    expect(source).toMatch(/setAttribute\("aria-live", "polite"\)/u);
    expect(source).toContain("number-suite-note-control-loading-indicator");
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.number-suite-note-control-loading-indicator\s*\{[^}]*animation:\s*none;/s,
    );
  });
});
