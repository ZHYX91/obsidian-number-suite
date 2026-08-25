import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/app/settings-tab.ts", import.meta.url), "utf8");
const definitions = readFileSync(
  new URL("../../src/ui/settings/definitions.ts", import.meta.url),
  "utf8",
);

describe("settings page hierarchy", () => {
  it("starts with the tablist and does not repeat the plugin or active-tab title", () => {
    expect(source).not.toContain('setName(t("settings.title")).setHeading()');
    for (const key of [
      "settings.general",
      "settings.headings",
      "settings.captions",
      "settings.references",
      "settings.notes",
      "settings.write",
    ]) {
      expect(source).not.toContain(`setName(t("${key}")).setHeading()`);
      expect(definitions).not.toContain(`heading: t("${key}")`);
    }
  });

  it("retains headings for genuine subgroups", () => {
    expect(source).toContain('setName(t("settings.captions.alignment"))');
    expect(source).toContain('setName(t("settings.views")).setHeading()');
    expect(definitions).toContain('heading: t("settings.views")');
    expect(source).toContain('setName(t("settings.appearance")).setHeading()');
    expect(source).toContain('setName(t("settings.batch")).setHeading()');
  });
});
