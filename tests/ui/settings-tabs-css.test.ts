import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("settings tab layout CSS", () => {
  it("uses compact tab padding when the settings strip is at most 600px wide", () => {
    expect(styles).toMatch(
      /@container \(max-width:\s*600px\)\s*\{\s*\.number-suite-settings \.number-suite-settings-tab-strip > \.number-suite-settings-tabs > button\.number-suite-settings-tab\s*\{[^}]*padding-inline:\s*8px/s,
    );
  });

  it("keeps the tab list on one horizontally scrollable baseline", () => {
    expect(styles).toMatch(
      /\.number-suite-settings-tabs\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*border-block-end:[^;}]+;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s,
    );
  });

  it("resets theme button chrome and uses only an active underline", () => {
    expect(styles).toMatch(
      /> button\.number-suite-settings-tab\s*\{[^}]*appearance:\s*none;[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-block-end:\s*2px solid transparent;[^}]*border-radius:\s*0;/s,
    );
    expect(styles).toMatch(
      /> button\.number-suite-settings-tab\.is-active,[\s\S]*?border-block-end-color:\s*var\(--interactive-accent\);/s,
    );
    expect(styles).toMatch(
      /> button\.number-suite-settings-tab\.is-active,[\s\S]*?font-weight:\s*var\(--font-semibold\);/s,
    );
  });

  it("scales with UI text and preserves a 44px coarse-pointer target", () => {
    expect(styles).toMatch(
      /> button\.number-suite-settings-tab\s*\{[^}]*block-size:\s*auto;[^}]*min-block-size:\s*34px;[^}]*padding:\s*7px 12px;/s,
    );
    expect(styles).not.toMatch(/\.number-suite-settings-tab[^}]*\bheight:\s*34px/s);
    expect(styles).toMatch(
      /@media \(pointer:\s*coarse\)[\s\S]*?> button\.number-suite-settings-tab\s*\{[^}]*min-block-size:\s*44px;/s,
    );
  });

  it("keeps a stable gap before the active settings panel", () => {
    expect(styles).toMatch(
      /\.number-suite-settings-panel\s*\{[^}]*margin-block-start:\s*var\(--size-4-5\);/s,
    );
  });
});
