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
    const pane = { canClose: () => false };
    Object.assign(modal, { pane });
    modal.close();
    expect(close).not.toHaveBeenCalled();
    pane.canClose = () => true;
    modal.close();
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();
  });
});
