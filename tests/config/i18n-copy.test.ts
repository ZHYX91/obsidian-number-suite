import { describe, expect, it } from "vitest";

import { createTranslator } from "../../src/config/i18n";

describe("localized UI copy", () => {
  it("keeps H1-H9 help and hide semantics aligned with the product", () => {
    const en = createTranslator("en");
    const zh = createTranslator("zh");

    expect(en("settings.scheme.placeholder.formats")).toContain("1–9");
    expect(zh("settings.scheme.placeholder.formats")).toContain("1–9");
    expect(en("settings.scheme.hide")).toBe("Hide");
    expect(zh("settings.scheme.hide")).toBe("隐藏");
    expect(en("settings.scheme.hidden")).toBe("Hidden built-in schemes");
    expect(zh("settings.scheme.hidden")).toBe("已隐藏的内置方案");
  });

  it("explains skipped headings, recovery limits, and document export", () => {
    const en = createTranslator("en");
    const zh = createTranslator("zh");
    expect(zh("settings.missing.desc")).toContain("四级标题");
    expect(zh("settings.backupLimit.desc")).toContain("不是笔记文件大小");
    expect(zh("settings.exportGuide.setup")).toContain("输入扩展");
    expect(en("settings.exportGuide.body")).toContain("optional Markdown extensions");
  });

  it("uses user-facing caption and marker terminology", () => {
    const en = createTranslator("en");
    const zh = createTranslator("zh");

    expect(en("caption.notice.inserted")).toBe("Added the caption.");
    expect(zh("caption.notice.inserted")).toBe("已添加题注。");
    expect(zh("caption.kind.figure")).toBe("图片题注");
    expect(zh("settings.markers")).toBe("写入 Number Suite 隐形标记");
    expect(zh("panel.loading")).toBe("正在读取当前笔记属性…");
  });
});
