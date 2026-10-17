// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createTranslator } from "../../src/config/i18n";
import { applyModalDirection } from "../../src/ui/modal-direction";

describe("Number Suite modal direction", () => {
  it("sets RTL only on the localized modal and keeps Markdown snippets direction-aware", () => {
    const modal = document.createElement("div");
    const code = document.createElement("code");
    code.textContent = "Figure: بنية النظام";
    const input = document.createElement("input");
    input.type = "text";
    modal.append(code, input);
    const sibling = document.createElement("div");
    document.body.append(modal, sibling);
    try {
      applyModalDirection(modal, createTranslator("ar"));
      expect(modal.dir).toBe("rtl");
      expect(code.dir).toBe("auto");
      expect(input.dir).toBe("auto");
      expect(sibling.hasAttribute("dir")).toBe(false);
      applyModalDirection(modal, createTranslator("en"));
      expect(modal.dir).toBe("ltr");
    } finally {
      modal.remove();
      sibling.remove();
    }
  });
  it("leaves inherited direction untouched for a test translator without direction metadata", () => {
    const modal = document.createElement("div");
    applyModalDirection(modal, (() => "label") as ReturnType<typeof createTranslator>);
    expect(modal.hasAttribute("dir")).toBe(false);
  });
});
