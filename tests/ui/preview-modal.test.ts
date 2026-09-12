import { describe, expect, it, vi } from "vitest";
import { App, Modal } from "obsidian";
import { ChangePreviewModal } from "../../src/ui/preview-modal";
import { createTranslator } from "../../src/config/i18n";

describe("preview dismissal", () => {
  it("blocks all close paths while applying and allows closing once settled", () => {
    const close = vi.spyOn(Modal.prototype, "close");
    const modal = new ChangePreviewModal({
      app: new App(), operation: "write", documents: [], translate: createTranslator("en"),
      onConfirm: async () => undefined,
    });
    Object.assign(modal, { applying: true });
    modal.close();
    expect(close).not.toHaveBeenCalled();
    Object.assign(modal, { applying: false });
    modal.close();
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();
  });
});
