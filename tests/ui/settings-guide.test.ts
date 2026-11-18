// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createTranslator } from "../../src/config/i18n";
import { renderSameFileReferenceGuide } from "../../src/ui/settings/reference-guide";
import { collapseSettingsGuides } from "../../src/ui/settings/guide-disclosure";
import { installDomFixture } from "./dom-fixture";

describe("settings guide", () => {
  it.each(["en", "zh"] as const)("shows real reference examples and instructions in %s", (locale) => {
    installDomFixture();
    const panel = document.createElement("div");
    const t = createTranslator(locale);
    renderSameFileReferenceGuide(panel, t);
    collapseSettingsGuides(panel, new Set());

    const details = panel.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toBe(t("settings.references.guide.title"));
    expect(panel.querySelector(":scope > p")?.textContent).toBe(t("settings.references.guide.intro"));
    expect([...panel.querySelectorAll("pre code")].map((node) => node.textContent)).toEqual([
      t("settings.references.guide.heading.source"), t("settings.references.guide.caption.source"),
    ]);
    expect(details?.textContent).toContain(t("settings.references.guide.requirements.sameFile"));
  });

  it("documents footnote and endnote syntax in both settings paths", () => {
    const guide = readFileSync(
      resolve(process.cwd(), "src/ui/settings/note-guide.ts"),
      "utf8",
    );
    const imperative = readFileSync(resolve(process.cwd(), "src/app/settings-tab.ts"), "utf8");
    const declarative = readFileSync(resolve(process.cwd(), "src/ui/settings/definitions.ts"), "utf8");
    const messages = readFileSync(resolve(process.cwd(), "src/config/i18n.ts"), "utf8");

    expect(guide).toContain('guide.setAttribute("role", "note")');
    expect(guide).toContain('setIcon(icon, "info")');
    expect(guide).toContain("settings.notes.guide.footnote.source");
    expect(guide).toContain("settings.notes.guide.endnote.source");
    expect(imperative).toContain("renderNoteNumberingGuide(container, t)");
    expect(declarative).toContain("renderNoteNumberingGuide(container, t)");
    expect(messages).toContain("[^detail]: 脚注内容。");
    expect(messages).toContain("[^endnote:later]: Endnote text.");
  });

  it("explains optional current-note Properties in settings while keeping the note panel compact", () => {
    const guide = readFileSync(
      resolve(process.cwd(), "src/ui/settings/note-overrides-guide.ts"),
      "utf8",
    );
    const imperative = readFileSync(resolve(process.cwd(), "src/app/settings-tab.ts"), "utf8");
    const declarative = readFileSync(resolve(process.cwd(), "src/ui/settings/definitions.ts"), "utf8");
    const panel = readFileSync(resolve(process.cwd(), "src/ui/note-control-modal.ts"), "utf8");
    const messages = readFileSync(resolve(process.cwd(), "src/config/i18n.ts"), "utf8");

    expect(guide).toContain('guide.setAttribute("role", "note")');
    expect(guide).toContain('setIcon(icon, "info")');
    expect(imperative).toContain('renderNoteOverridesGuide(container, t, "settings")');
    expect(declarative).toContain('renderNoteOverridesGuide(container, t, "settings")');
    expect(panel).not.toContain('renderNoteOverridesGuide(section, this.t, "panel")');
    expect(messages).toContain("Most notes do not need Number Suite Properties.");
    expect(messages).toContain("大多数笔记都不需要添加 Number Suite 属性");
    expect(messages).toContain("unrelated Properties stay as they are.");
    expect(messages).toContain("其他属性不变。");
  });

  it("explains heading display, caption syntax, file operations, and batches in both settings paths", () => {
    const guide = readFileSync(
      resolve(process.cwd(), "src/ui/settings/usage-guides.ts"),
      "utf8",
    );
    const imperative = readFileSync(resolve(process.cwd(), "src/app/settings-tab.ts"), "utf8");
    const declarative = readFileSync(resolve(process.cwd(), "src/ui/settings/definitions.ts"), "utf8");
    const messages = readFileSync(resolve(process.cwd(), "src/config/i18n.ts"), "utf8");

    expect(guide).toContain('guide.setAttribute("role", "note")');
    expect(guide).toContain('setIcon(icon, "info")');
    for (const renderer of [
      "renderHeadingDisplayGuide",
      "renderCaptionNumberingGuide",
      "renderFileOperationsGuide",
      "renderBatchOperationsGuide",
    ]) {
      expect(imperative).toContain(`${renderer}(container, t)`);
      expect(declarative).toContain(`${renderer}(container, t)`);
    }
    expect(messages).toContain("Figure: Architecture\\n\\n![[architecture.png]]");
    expect(messages).toContain("Figure: 系统架构\\n\\n![[architecture.png]]");
    expect(messages).toContain("Open current note controls");
    expect(messages).toContain("打开当前笔记控制面板");
    expect(messages).toContain("Undo the most recent batch");
    expect(messages).toContain("撤销最近一次批量处理");
    expect(messages).toContain("may break links or embeds that point to them");
    expect(messages).toContain("可能让指向这些标题的链接或嵌入失效");
  });
});
