// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { TFile } from "obsidian";

import { createTranslator } from "../../src/config/i18n";
import type { UiLocale } from "../../src/config/language-options";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { NoteControlPane } from "../../src/ui/note-control-modal";
import { installDomFixture } from "./dom-fixture";

beforeEach(installDomFixture);

function renderDiagnostics(locale: UiLocale, frontmatter: Record<string, unknown>): HTMLElement {
  const host = document.createElement("div");
  const actions = { refreshDisplay() {}, runCurrent() {}, openBatch() {}, openGlobalSettings() {} };
  const pane = new NoteControlPane({} as never, host, () => ({ ...DEFAULT_SETTINGS, language: locale }),
    () => createTranslator(locale), actions);
  const file = new (TFile as unknown as new (path: string) => TFile)("Example.md");
  // Keep production parsing, diagnostics and summary rendering; unrelated controls use host components.
  Object.assign(pane, { file, frontmatter, renderOverrides() {}, renderActions() {} });
  try {
    (pane as unknown as { render(): void }).render();
    return host;
  } finally {
    pane.destroy();
  }
}

describe("current-note Properties diagnostics", () => {
  const examples = [
    {
      name: "invalid value",
      frontmatter: { "number-suite": ["heading.virtual=maybe"] },
      en: "Invalid number-suite item: heading.virtual=maybe",
      zh: "number-suite 列表项无效：heading.virtual=maybe",
      ja: "number-suite の項目が無効です: heading.virtual=maybe",
    },
    {
      name: "wrong property type",
      frontmatter: { "number-suite": "heading.virtual=true" },
      en: "number-suite must be a list of path=value text items",
      zh: "number-suite 必须是由 path=value 文本项组成的列表",
      ja: "number-suite は path=value 形式の文字列のリストにしてください",
    },
    {
      name: "unknown directive",
      frontmatter: { "number-suite": ["heading.unrecognized=true"] },
      en: "Unknown number-suite directive: heading.unrecognized",
      zh: "number-suite 指令未知：heading.unrecognized",
      ja: "number-suite の不明な指示: heading.unrecognized",
    },
  ];

  for (const locale of ["en", "zh", "ja"] as const) {
    it.each(examples)(`localizes the ${locale} detail for $name`, (example) => {
      const before = structuredClone(example.frontmatter);
      const host = renderDiagnostics(locale, example.frontmatter);
      expect(host.querySelector(".number-suite-note-control-error strong")?.textContent)
        .toBe(createTranslator(locale)("panel.properties.invalid"));
      expect(host.querySelector(".number-suite-note-control-error li")?.textContent).toBe(example[locale]);
      expect(example.frontmatter).toEqual(before);
    });
  }

  it("preserves raw values as text without interpreting HTML or replacement tokens", () => {
    const item = "heading.virtual=<img src=x onerror='alert(1)'> $& $` $' $$ {key}";
    const host = renderDiagnostics("en", { "number-suite": [item] });
    const detail = host.querySelector(".number-suite-note-control-error li");
    expect(detail?.textContent).toBe(`Invalid number-suite item: ${item}`);
    expect(detail?.children).toHaveLength(0);
    expect(host.querySelector("img, script")).toBeNull();
  });
});
