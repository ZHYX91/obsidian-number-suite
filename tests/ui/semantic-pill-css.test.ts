import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("semantic pill CSS", () => {
  const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

  it("distinguishes heading numerals, caption targets, and references", () => {
    expect(styles).toContain(".number-suite-heading-number");
    expect(styles).toContain(".number-suite-caption-pill");
    expect(styles).toContain(".number-suite-reference-pill");
    expect(styles).toMatch(/\.number-suite-caption-pill\s*\{[^}]*background:/su);
    expect(styles).toMatch(/\.number-suite-reference-pill\s*\{[^}]*border:/su);
    expect(styles).toMatch(/\.number-suite-reference-pill:focus-visible/su);
  });

  it("allows long captions and references to wrap", () => {
    expect(styles).toMatch(/\.number-suite-caption-pill\s*\{[^}]*overflow-wrap:\s*anywhere/su);
    expect(styles).toMatch(/\.number-suite-reference-pill\s*\{[^}]*overflow-wrap:\s*anywhere/su);
    expect(styles).not.toMatch(/\.number-suite-caption-pill\s*\{[^}]*white-space:\s*nowrap/su);
  });

  it("supports relocated captions and structured semantic tooltips", () => {
    expect(styles).toContain(".cm-line.number-suite-caption-source-relocated");
    expect(styles).toContain("[data-number-suite-caption-placement=\"below\"]");
    expect(styles).toMatch(/\.number-suite-caption-widget\.number-suite-caption-centered\s*\{[^}]*justify-content:\s*center/su);
    expect(styles).toMatch(/\.number-suite-caption-widget\[data-number-suite-caption-placement="above"\]\s*\{[^}]*padding-block-end:/su);
    expect(styles).toMatch(/\.number-suite-caption-widget\[data-number-suite-caption-placement="below"\]\s*\{[^}]*padding-block-start:/su);
    expect(styles).not.toMatch(/\.number-suite-caption-widget\[data-number-suite-caption-placement="(?:above|below)"\]\s*\{[^}]*margin-block/su);
    expect(styles).toContain(".number-suite-semantic-tooltip-title");
    expect(styles).toContain(".number-suite-semantic-tooltip-body");
  });
});
