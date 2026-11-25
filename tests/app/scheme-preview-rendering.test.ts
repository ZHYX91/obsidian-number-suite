// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { createTranslator } from "../../src/config/i18n";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import {
  SchemeSettingsRenderer,
  renderSchemeTemplatePreview,
} from "../../src/app/scheme-settings-renderer";
import { installDomFixture } from "../ui/dom-fixture";

beforeEach(installDomFixture);

function preview(template: string, language: "en" | "zh" | "ja" | "ar" = "en"): HTMLElement {
  const host = document.createElement("div");
  renderSchemeTemplatePreview(host, template, createTranslator(language));
  return host;
}

describe("scheme template previews use the first example counter", () => {
  it.each([
    ["{1.arabic}", "1", " "],
    ["{1.chinese_lower}", "一", " "],
    ["{1.letter_upper}.", "A.", " "],
    ["{1.letter_lower}.", "a.", " "],
    ["{1.roman_upper}.", "I.", " "],
    ["{1.circled}", "①", ""],
    ["{1.arabic}.{2.arabic}", "1.1", " "],
    ["{1.arabic}.{2.arabic}.{3.arabic}", "1.1.1", " "],
    ["{1.chinese_lower}、", "一、", ""],
    ...[" ", "   ", "\t", "\u00a0", "\u3000"].map(space => ["{1.chinese_lower}、" + space, "一、", space]),
  ])("shows %s as a heading-number badge %s, not a literal arrow", (template, number, separator) => {
    const host = preview(template);
    expect(host.querySelector(".number-suite-heading-number")?.textContent).toBe(number);
    expect(host.querySelector(".number-suite-scheme-example-heading")?.textContent).toBe("Heading");
    expect(host.querySelector(".number-suite-scheme-styled-preview")?.textContent).toBe(number! + "Heading");
    expect(host.textContent).not.toContain("→");
    expect(host.querySelector(".number-suite-scheme-write-preview > code")?.textContent).toBe(number! + separator + "Heading");
  });

  it("localizes the example heading while keeping the rendered number unchanged", () => {
    for (const [language, label] of [
      ["zh", "标题"],
      ["ja", "見出し"],
      ["ar", "عنوان"],
    ] as const) {
      const host = preview("{1.arabic}.{2.arabic}", language);
      expect(host.querySelector(".number-suite-scheme-example-number")?.textContent).toBe("1.1");
      expect(host.querySelector(".number-suite-scheme-example-heading")?.textContent).toBe(label);
    }
  });

  it("replaces previous live-preview nodes without duplicates", () => {
    const host = preview("{1.arabic}");
    const t = createTranslator("en");
    renderSchemeTemplatePreview(host, "{1.arabic}.{2.arabic}", t);
    expect(host.querySelectorAll(".number-suite-scheme-example-number")).toHaveLength(1);
    expect(host.querySelector(".number-suite-scheme-write-preview code")?.textContent).toBe("1.1 Heading");

    renderSchemeTemplatePreview(host, "", t);
    expect(host.textContent).toBe(t("settings.scheme.disabled"));
    expect(host.querySelector(".number-suite-heading-number")).toBeNull();

    renderSchemeTemplatePreview(host, "{broken}", t);
    expect(host.textContent).toBe("—");
    expect(host.classList.contains("number-suite-scheme-example")).toBe(false);
    renderSchemeTemplatePreview(host, "{1.chinese_lower}", t);
    expect(host.querySelector(".number-suite-scheme-write-preview code")?.textContent).toBe("一 Heading");
  });

  it("uses the same preview in built-in template rows and preserves unnumbered rows", () => {
    const t = createTranslator("zh");
    const renderer = new SchemeSettingsRenderer(
      () => DEFAULT_SETTINGS,
      () => undefined,
      t,
    );
    const root = document.createElement("div");
    (renderer as unknown as {
      renderReadOnlyTemplates: (element: HTMLElement, templates: readonly string[]) => void;
    }).renderReadOnlyTemplates(root, ["{1.arabic}", "{1.arabic}.{2.arabic}"]);

    const rows = root.querySelectorAll(".number-suite-readonly-template");
    expect(rows).toHaveLength(9);
    expect(rows[0]?.querySelector("code")?.textContent).toBe("{1.arabic}");
    expect(rows[0]?.querySelector(".number-suite-heading-number")?.textContent).toBe("1");
    expect(rows[1]?.querySelector(".number-suite-heading-number")?.textContent).toBe("1.1");
    expect(rows[1]?.querySelector(".number-suite-scheme-example-heading")?.textContent).toBe("标题");
    expect(rows[2]?.querySelector(".number-suite-readonly-disabled")?.textContent)
      .toBe(t("settings.scheme.disabled"));
    expect(root.textContent).not.toContain("→");
  });
});
