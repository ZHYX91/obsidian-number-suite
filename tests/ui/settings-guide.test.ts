import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("settings guide", () => {
  it("uses the shared visual hierarchy and accessible note structure", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/scheme-settings-renderer.ts"),
      "utf8",
    );
    const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

    expect(source).toContain('guide.setAttribute("role", "note")');
    expect(source).toContain('setIcon(icon, "info")');
    expect(source).toContain("number-suite-settings-guide-heading");
    expect(source).toContain("number-suite-settings-guide-body");
    expect(source).toContain("number-suite-settings-guide-example");
    expect(styles).toMatch(
      /\.number-suite-settings-guide\s*\{[^}]*border-inline-start:\s*3px solid var\(--interactive-accent\);[^}]*box-shadow:\s*none;[^}]*padding:\s*12px 14px;/s,
    );
    expect(styles).toMatch(
      /\.number-suite-settings-guide-body\s*\{[^}]*max-inline-size:\s*68ch;/s,
    );
  });

  it("renders same-file reference prerequisites, examples, and failure behavior in both settings paths", () => {
    const guide = readFileSync(
      resolve(process.cwd(), "src/ui/settings/reference-guide.ts"),
      "utf8",
    );
    const imperative = readFileSync(resolve(process.cwd(), "src/app/settings-tab.ts"), "utf8");
    const declarative = readFileSync(resolve(process.cwd(), "src/ui/settings/definitions.ts"), "utf8");
    const messages = readFileSync(resolve(process.cwd(), "src/config/i18n.ts"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

    expect(guide).toContain('guide.setAttribute("role", "note")');
    expect(guide).toContain('setIcon(icon, "info")');
    expect(guide).toContain("settings.references.guide.heading.source");
    expect(guide).toContain("settings.references.guide.caption.source");
    expect(guide).toContain("settings.references.guide.requirements.sameFile");
    expect(guide).toContain("settings.references.guide.unchanged.body");
    expect(imperative).toContain("renderSameFileReferenceGuide(container, t)");
    expect(declarative).toContain("renderSameFileReferenceGuide(container, t)");
    expect(messages).toContain("请参见 @[[#安装|安装章节]]");
    expect(messages).toContain("See @[[#Installation|installation section]]");
    expect(styles).toContain(".number-suite-reference-guide-example");
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

  it("explains optional current-note Properties at the settings and point-of-change surfaces", () => {
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
    expect(panel).toContain('renderNoteOverridesGuide(section, this.t, "panel")');
    expect(messages).toContain("Current-note Properties are optional");
    expect(messages).toContain("当前笔记 Properties 并非必需");
    expect(messages).toContain("Other Properties remain unchanged.");
    expect(messages).toContain("其他 Properties 保持不变。");
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
    expect(messages).toContain("may break heading links, embeds, or external anchors");
    expect(messages).toContain("可能使标题链接、嵌入或外部锚点失效");
  });
});
