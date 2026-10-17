import { describe, expect, it } from "vitest";

import { createTranslator, resolvedUiLocale, translationCoverage, uiTextDirection } from "../../src/config/i18n";

describe("localized UI copy", () => {
  it("identifies the unfinished catalogs without a misleading locale count", () => {
    expect(translationCoverage("ja").translated).toBeLessThan(translationCoverage("ja").total);
    expect(translationCoverage("ar").translated).toBe(translationCoverage("ar").total);
    expect(resolvedUiLocale("auto", "zh-TW")).toBe("zh-TW");
    expect(uiTextDirection("ar")).toBe("rtl");
    expect(uiTextDirection("zh-TW")).toBe("ltr");
    expect(createTranslator("ja")("settings.language.partial")).toContain("英語");
  });

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
    expect(zh("settings.noteOverrides.guide.action")).not.toContain("path=value");
    expect(zh("settings.captions.guide.intro")).not.toContain("胶囊");
    expect(zh("settings.captions.guide.safety")).not.toContain("胶囊");
    expect(zh("settings.references.guide.intro")).toContain("可点击的引用标签");
    expect(zh("settings.scheme.desc")).toContain("不会自动切换");
    expect(en("settings.scheme.desc")).toContain("does not select");
  });
});
