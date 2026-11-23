// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Modal } from "obsidian";
import { ChangePreviewModal, ChangePreviewPane, type PreviewModalOptions, type PreviewDocument } from "../../src/ui/preview-modal";
import { BatchModal, type BatchPreview } from "../../src/ui/batch-modals";
import { changedTextParts } from "../../src/ui/preview-diff";
import { createTranslator } from "../../src/config/i18n";
import { installDomFixture } from "./dom-fixture";
import { planHeadingTransform } from "../../src/core/transform";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  Setting: class {
    readonly settingEl: HTMLElement;
    constructor(host: HTMLElement) { this.settingEl = host.createDiv(); }
    setName(value: string): this { this.settingEl.createDiv({ text: value }); return this; }
    setDesc(value: string): this { this.settingEl.createDiv({ text: value }); return this; }
    addDropdown(callback: (dropdown: unknown) => void): this {
      const select = this.settingEl.createEl("select");
      const control = {
        addOption(value: string, text: string) { select.createEl("option", { text, attr: { value } }); return control; },
        setValue(value: string) { select.value = value; return control; },
        onChange(handler: (value: string) => void) { select.addEventListener("change", () => handler(select.value)); return control; },
      };
      callback(control);
      return this;
    }
    addButton(callback: (button: unknown) => void): this {
      const element = this.settingEl.createEl("button");
      const control = {
        setButtonText(text: string) { element.textContent = text; return control; },
        setDisabled(value: boolean) { element.disabled = value; return control; },
        setCta() { return control; },
        setWarning() { return control; },
        onClick(handler: () => void) { element.addEventListener("click", handler); return control; },
      };
      callback(control);
      return this;
    }
  },
}));

function documentPlan(path: string, count: number): PreviewDocument {
  return { path, plan: { operation: "write", source: "", result: "", warnings: [],
    changes: Array.from({ length: count }, (_, line) => ({ from: line, to: line + 1, insert: "", line, level: 2,
      before: "## 标题 🧭", after: "## 1.2 标题 🧭", ruleId: "heading", confidence: null, provenance: "none" })) } };
}

describe("batch setup and confirmation", () => {
  const t = createTranslator("zh");
  beforeEach(() => { installDomFixture(); document.body.replaceChildren(); });

  function workflow(prepare: ConstructorParameters<typeof BatchModal>[3]) {
    const owner = new AbortController();
    const modal = new BatchModal(new App(), t, owner.signal, prepare);
    const title = document.body.createEl("h2");
    Object.assign(modal, { titleEl: title, modalEl: document.body.createDiv() });
    modal.modalEl.appendChild(modal.contentEl);
    modal.onOpen();
    const button = (text: string): HTMLButtonElement => {
      const found = [...modal.contentEl.querySelectorAll("button")].find((item) => item.textContent === text);
      if (!found) throw new Error(`Missing button: ${text}`);
      return found;
    };
    const select = () => modal.contentEl.querySelector("select")!;
    const choose = () => {
      button(t("batch.scope.root")).click();
      select().value = "write";
      select().dispatchEvent(new Event("change"));
    };
    return { modal, owner, button, select, choose, title };
  }

  it("keeps explicit selections on Back, recounts a fresh plan and disables zero-file Apply", async () => {
    const changed = documentPlan("changed.md", 2);
    changed.plan.result = "# Changed";
    const warning = documentPlan("warning.md", 0);
    warning.plan.warnings = [{ line: 0, heading: "", code: "empty-heading", detail: "" }];
    const apply = vi.fn(async () => undefined);
    const make = (documents: PreviewDocument[]): BatchPreview => ({
      app: new App(), translate: t, operation: "write", checkedCount: 3, documents, onConfirm: apply,
    });
    const prepare = vi.fn().mockResolvedValueOnce(make([changed, warning])).mockResolvedValueOnce(make([warning]));
    const { modal, button, choose, select, title } = workflow(prepare);
    expect(button(t("batch.preview")).disabled).toBe(true);
    expect(button(t("batch.scope.root")).getAttribute("aria-pressed")).toBe("false");
    choose();
    button(t("batch.preview")).click();
    await vi.waitFor(() => expect(modal.contentEl.querySelectorAll("details")).toHaveLength(2));
    expect(document.activeElement).toBe(title);
    expect(title.textContent).toBe(t("preview.title.write"));
    expect(modal.contentEl.querySelector("bdi")?.textContent).toBe(t("batch.scope.root"));
    expect(modal.contentEl.querySelector(".number-suite-preview-summary")?.textContent)
      .toBe(t("batch.summary", { checked: 3, files: 1, changes: 2, warnings: 1 }));
    expect(button(t("batch.confirm", { files: 1 })).disabled).toBe(false);
    button(t("batch.back")).click();
    expect(select().value).toBe("write");
    expect(button(t("batch.scope.root")).getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(button(t("batch.scope.title")));
    button(t("batch.preview")).click();
    await vi.waitFor(() => expect(modal.contentEl.querySelectorAll("details")).toHaveLength(1));
    expect(button(t("batch.confirm", { files: 0 })).disabled).toBe(true);
    button(t("batch.confirm", { files: 0 })).click();
    button(t("batch.back")).click();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(apply).not.toHaveBeenCalled();
    modal.onClose();
  });

  it("discards an in-flight scan on dismissal and ignores a second preview click", async () => {
    let finish!: (preview: BatchPreview) => void;
    const prepare = vi.fn<ConstructorParameters<typeof BatchModal>[3]>(() => new Promise((resolve) => { finish = resolve; }));
    const { choose, button, modal } = workflow(prepare);
    choose();
    const preview = button(t("batch.preview"));
    preview.click();
    preview.click();
    expect(prepare).toHaveBeenCalledOnce();
    modal.onClose();
    expect(prepare.mock.calls[0]?.[2].aborted).toBe(true);
    finish({ app: new App(), operation: "write", translate: t, checkedCount: 0, documents: [], onConfirm: vi.fn() });
    await Promise.resolve();
    expect(modal.contentEl.childElementCount).toBe(0);
  });

  it.each([["en", "Apply to notes (1)"], ["ar", "تطبيق على الملاحظات (1)"]] as const)(
    "updates the %s confirmation when cleanup recognition adds a writable note", async (locale, label) => {
      const translate = createTranslator(locale);
      const changed = documentPlan("file.md", 1);
      changed.plan.result = "# Changed";
      const apply = vi.fn(async () => undefined);
      const host = document.body.createDiv();
      const pane = new ChangePreviewPane({ app: new App(), operation: "remove", documents: [],
        translate, cleanupScope: "plugin", onCleanupScopeChange: () => [changed], onConfirm: apply },
      host, document.body.createEl("h2"), host, vi.fn(), { scope: "Research/", checked: 1, onBack: vi.fn() });
      pane.onOpen();
      const confirm = () => host.querySelector<HTMLButtonElement>(".number-suite-preview-actions button:last-child")!;
      expect(confirm().disabled).toBe(true);
      const select = host.querySelector("select")!;
      select.value = "common";
      select.dispatchEvent(new Event("change"));
      await vi.waitFor(() => expect(confirm().textContent).toBe(label));
      expect(host.dir).toBe(translate.direction);
      expect(host.querySelector(".number-suite-preview-summary")?.textContent)
        .toBe(translate("batch.summary", { checked: 1, files: 1, changes: 1, warnings: 0 }));
      const button = confirm();
      button.click();
      button.click();
      expect(apply).toHaveBeenCalledExactlyOnceWith([changed]);
      pane.onClose();
    });
});

describe("file-grouped heading preview", () => {
  beforeEach(() => { installDomFixture(); document.body.replaceChildren(); });
  it("keeps stale previews open with disabled Apply and separate scroll content/actions", async () => {
    const host = document.createElement("div");
    const close = vi.fn();
    const apply = vi.fn(async () => false);
    const pane = new ChangePreviewPane({ app: {} as never, operation: "write",
      documents: [documentPlan("fixed.md", 1)], translate: createTranslator("en"), onConfirm: apply },
    host, document.createElement("h3"), host, close);
    pane.onOpen();
    expect(host.querySelector(".number-suite-preview-documents .number-suite-change")).not.toBeNull();
    const confirm = () => [...host.querySelectorAll<HTMLButtonElement>(".number-suite-preview-actions button")]
      .find((button) => button.textContent === createTranslator("en")("preview.confirm"))!;
    confirm().click();
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe(createTranslator("en")("notice.stalePreview")));
    expect(confirm().disabled).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(host.querySelectorAll(".number-suite-change")).toHaveLength(1);
    pane.close();
    pane.close();
    expect(close).toHaveBeenCalledOnce();
  });
  it("keeps a retryable batch refusal in the dialog and closes after a successful retry", async () => {
    const host = document.createElement("div");
    const close = vi.fn();
    const translate = createTranslator("en");
    const message = translate("notice.batchBusy");
    const apply = vi.fn<PreviewModalOptions["onConfirm"]>()
      .mockResolvedValueOnce({ message, stale: false }).mockResolvedValueOnce(true);
    const changed = documentPlan("fixed.md", 1);
    changed.plan = { ...changed.plan, source: "# Title", result: "# 1 Title" };
    const pane = new ChangePreviewPane({ app: {} as never, operation: "write",
      documents: [changed], translate, onConfirm: apply },
    host, document.createElement("h3"), host, close, { scope: "Vault", checked: 1, onBack: vi.fn() });
    const confirm = () => [...host.querySelectorAll("button")].find((button) =>
      button.textContent === translate("batch.confirm", { files: 1 }))!;
    pane.onOpen();
    confirm().click();
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe(message));
    expect(close).not.toHaveBeenCalled();
    expect(confirm().disabled).toBe(false);
    confirm().click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it("explains counter overflow from the real transform plan without any write preview", () => {
    const plan = planHeadingTransform("# First\n# Overflow", "write", {
      numbering: { scheme: BUILT_IN_SCHEMES.hierarchical, starts: { 1: Number.MAX_SAFE_INTEGER }, missingLevelStrategy: "fill-one" },
      writeMarkers: false, cleanupScope: "templates", templateSources: [],
      removeMultiplePrefixes: true, normalizeManualOnRenumber: true,
    });
    const modal = new ChangePreviewModal({ app: {} as never, operation: "write",
      documents: [{ path: "overflow.md", plan }], translate: createTranslator("en"),
      onConfirm: async () => undefined });
    Object.assign(modal, { titleEl: document.createElement("h2"), modalEl: document.createElement("div") });
    modal.onOpen();
    expect(modal.contentEl.querySelectorAll(".number-suite-change")).toHaveLength(0);
    expect(modal.contentEl.querySelector(".number-suite-warning-list")?.textContent)
      .toContain("Numbering stopped: a counter exceeds the exact integer range.");
    expect(modal.contentEl.querySelector(".number-suite-preview-summary")?.textContent)
      .toContain("0 changes");
    modal.onClose();
  });

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
