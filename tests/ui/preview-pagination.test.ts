// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";
import { ChangePreviewModal } from "../../src/ui/preview-modal";
import { createTranslator } from "../../src/config/i18n";
import { planHeadingTransform } from "../../src/core/transform";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";
import { installDomFixture } from "./dom-fixture";

beforeEach(installDomFixture);

describe("large preview feedback", () => {
  it("can reveal every change and warning with localized diagnostics", () => {
    const plan = planHeadingTransform(Array.from({ length: 501 }, (_, i) => `# Title ${i}`).join("\n"), "write", {
      numbering: { scheme: BUILT_IN_SCHEMES.hierarchical, missingLevelStrategy: "fill-one", starts: {} },
      writeMarkers: false, cleanupScope: "templates", templateSources: [], removeMultiplePrefixes: true, normalizeManualOnRenumber: true,
    });
    const warnings = Array.from({ length: 201 }, (_, line) => ({ line, heading: "Ambiguous", code: "ambiguous-prefix" as const, detail: "INTERNAL RULE" }));
    const modal = new ChangePreviewModal({ app: new App(), operation: "write", translate: createTranslator("zh"),
      documents: [{ path: "Changes.md", plan }, { path: "Warnings.md", plan: { ...plan, source: "# 3.14 Pi", result: "# 3.14 Pi", changes: [], warnings } }],
      onConfirm: async () => undefined });
    Object.assign(modal, { titleEl: document.createElement("h2"), modalEl: document.createElement("div") });
    modal.onOpen();
    expect(modal.contentEl.querySelectorAll(".number-suite-change")).toHaveLength(500);
    expect(modal.contentEl.querySelectorAll("li")).toHaveLength(200);
    modal.contentEl.querySelector<HTMLButtonElement>(".number-suite-preview-more")?.click();
    expect(modal.contentEl.querySelectorAll(".number-suite-change")).toHaveLength(501);
    [...modal.contentEl.querySelectorAll("button")].find((button) => button.textContent?.includes("继续查看警告"))?.click();
    expect(modal.contentEl.querySelectorAll("li")).toHaveLength(201);
    expect(modal.contentEl.textContent).toContain("已保留无法确定的序号前缀");
    expect(modal.contentEl.textContent).not.toContain("INTERNAL RULE");
  });
});
