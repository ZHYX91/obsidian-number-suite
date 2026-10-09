import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  getLanguage: () => "en",
  setIcon: () => undefined,
}));

import { createTranslator } from "../src/config/i18n";
import { renderExportGuide } from "../src/ui/settings/usage-guides";

type ElementOptions = { cls?: string; text?: string; href?: string };

class GuideElement {
  readonly children: GuideElement[] = [];
  readonly attributes = new Map<string, string>();
  constructor(readonly tag = "div", readonly text = "") {}

  createDiv(options?: ElementOptions): GuideElement { return this.createEl("div", options); }
  createEl(tag: string, options?: ElementOptions): GuideElement {
    const child = new GuideElement(tag, options?.text ?? "");
    if (options?.cls) child.attributes.set("class", options.cls);
    if (options?.href) child.attributes.set("href", options.href);
    this.children.push(child);
    return child;
  }
  createSpan(options?: ElementOptions): GuideElement { return this.createEl("span", options); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  descendants(): GuideElement[] { return this.children.flatMap(child => [child, ...child.descendants()]); }
}

describe("Word export settings help", () => {
  it.each(["en", "zh"] as const)("renders an accessible, optional community link in %s", language => {
    const container = new GuideElement();
    renderExportGuide(container as unknown as HTMLElement, createTranslator(language));
    const all = container.descendants();
    const note = all.find(element => element.attributes.get("role") === "note");
    const link = all.find(element => element.tag === "a");
    expect(note).toBeDefined();
    expect(note?.attributes.get("aria-labelledby")).toBe("number-suite-export-guide-title");
    expect(link?.attributes.get("href")).toBe("https://obsidian.md/plugins?id=docwen-assistant");
    expect(link?.attributes.get("target")).toBe("_blank");
    expect(link?.attributes.get("rel")).toBe("noopener noreferrer");
    const prose = all.filter(element => element.tag === "p").map(element => element.text).join(" ");
    expect(prose).toMatch(language === "zh" ? /输入扩展/u : /input extensions/u);
    expect(prose).toContain("DocWen");
  });
});
