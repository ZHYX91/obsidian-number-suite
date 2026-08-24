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
});
