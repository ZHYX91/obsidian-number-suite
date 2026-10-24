// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "obsidian";
import { ChangePreviewModal, type PreviewDocument } from "../../src/ui/preview-modal";
import { changedTextParts } from "../../src/ui/preview-diff";
import { createTranslator } from "../../src/config/i18n";
import { installDomFixture } from "./dom-fixture";

function documentPlan(path: string, count: number): PreviewDocument {
  return { path, plan: { operation: "write", source: "", result: "", warnings: [],
    changes: Array.from({ length: count }, (_, line) => ({ from: line, to: line + 1, insert: "", line, level: 2,
      before: "## 标题 🧭", after: "## 1.2 标题 🧭", ruleId: "heading", confidence: null, provenance: "none" })) } };
}

describe("file-grouped heading preview", () => {
  beforeEach(() => { installDomFixture(); document.body.replaceChildren(); });
  it("shows per-file counts, lazily opens files and pages the selected file", () => {
    const modal = new ChangePreviewModal({ app: {} as never, operation: "write",
      documents: [documentPlan("first.md", 1), documentPlan("second.md", 501)],
      translate: createTranslator("en"), onConfirm: async () => undefined });
    Object.assign(modal, { titleEl: document.createElement("h2"), modalEl: document.createElement("div") });
    document.body.append(modal.contentEl);
    modal.onOpen();
    const groups = modal.contentEl.querySelectorAll<HTMLDetailsElement>("details");
    expect(groups[0]?.open).toBe(true);
    expect(groups[1]?.open).toBe(false);
    expect(groups[1]?.querySelector("summary")?.textContent).toContain("501 changes");
    expect(modal.contentEl.querySelectorAll(".number-suite-change")).toHaveLength(1);
    groups[1]!.open = true;
    groups[1]!.dispatchEvent(new Event("toggle"));
    expect(groups[1]!.querySelectorAll(".number-suite-change")).toHaveLength(500);
    groups[1]!.querySelector<HTMLButtonElement>(".number-suite-preview-more")!.click();
    expect(groups[1]!.querySelectorAll(".number-suite-change")).toHaveLength(501);
    expect(document.activeElement).toBe(groups[1]!.querySelector("summary"));
    groups[1]!.open = false;
    groups[1]!.dispatchEvent(new Event("toggle"));
    expect(groups[1]!.querySelectorAll(".number-suite-change")).toHaveLength(0);
    const before = groups[0]!.querySelector(".number-suite-diff-before");
    const after = groups[0]!.querySelector(".number-suite-diff-after");
    expect(before?.textContent).toContain("Before: ## 标题 🧭");
    expect(after?.textContent).toContain("After: ## 1.2 标题 🧭");
    expect(after?.querySelector("mark")?.textContent).toBe("1.2 ");
    expect(before?.querySelector("mark")).toBeNull();
    modal.onClose();
  });

  it("closes an applying preview on owner abort and releases its listener", () => {
    const owner = new AbortController();
    const removed = vi.spyOn(owner.signal, "removeEventListener");
    const close = vi.spyOn(Modal.prototype, "close").mockImplementation(function(this: Modal) { this.onClose(); });
    const modal = new ChangePreviewModal({ app: {} as never, operation: "write", documents: [],
      signal: owner.signal, translate: createTranslator("en"), onConfirm: async () => undefined });
    Object.assign(modal, { titleEl: document.createElement("h2"), modalEl: document.createElement("div") });
    modal.onOpen();
    Object.assign(modal, { applying: true });
    owner.abort();
    expect(close).toHaveBeenCalledOnce();
    expect(modal.contentEl.childElementCount).toBe(0);
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    close.mockRestore();
  });

  it("does not split emoji or mark unchanged heading text", () => {
    expect(changedTextParts("## 🧭 A", "## 🧪 A")).toEqual({ prefix: "## ", before: "🧭", after: "🧪", suffix: " A" });
    expect(changedTextParts("## 12 Name", "## 13 Name")).toEqual({ prefix: "## 1", before: "2", after: "3", suffix: " Name" });
    expect(changedTextParts("same", "same")).toEqual({ prefix: "same", before: "", after: "", suffix: "" });
  });
});
